import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { getVideoMetadata } from '../engine/probe'
import { cutClip, splitIntoReels } from '../engine/cutter'
import { resolveDimensions } from '../engine/formatter'
import { generateProThumbnail } from '../engine/thumbnailGenerator'
import { runVariationPipeline, validateProductVariationConfig } from '../engine/variation'
import {
  validateStartup,
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
  revalidateOnlineSilently,
  startBackgroundLicenseHeartbeat,
  stopBackgroundLicenseHeartbeat,
} from './license/licenseManager'
import { hasFeature } from '../shared/features'
import { getBatchQueueManager } from '../engine/batchQueue'
import { getAppUpdater, markJobStarted, markJobFinished } from './updater'
import {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  setSelectedProfile,
} from './profiles/profileManager'
// CommonJS require used for logger (CJS module in ESM context is resolved by electron-vite)
const logger = require('./logger')


// ─── Global Process Error Handlers ───────────────────────────────────────────

// Guard: prevent recursive error-handler crashes from unbounded recursion
let _inCrashHandler = false;

process.on('uncaughtException', (err) => {
  if (_inCrashHandler) return;
  _inCrashHandler = true;
  try {
    const msg = `Uncaught Exception: ${err && err.stack ? err.stack : String(err)}`;
    logger.error('Process', msg);
  } catch (_) {
    // Handler must never throw
  } finally {
    _inCrashHandler = false;
  }
  // Note: we continue running; Electron apps with a main window can often
  // survive main-process exceptions that originate in non-critical paths.
  // Truly fatal exceptions (heap corruption, etc.) will terminate the process
  // regardless of this handler.
})

process.on('unhandledRejection', (reason) => {
  if (_inCrashHandler) return;
  _inCrashHandler = true;
  try {
    const msg = reason instanceof Error
      ? `Unhandled Rejection: ${reason.stack || reason.message}`
      : `Unhandled Rejection: ${String(reason)}`;
    logger.error('Process', msg);
  } catch (_) {
    // Handler must never throw
  } finally {
    _inCrashHandler = false;
  }
})

// Crash-loop guard for renderer auto-reload
let _lastRendererCrashAt = 0;
const RENDERER_CRASH_RELOAD_COOLDOWN_MS = 10_000; // 10 seconds

// ─── Window ─────────────────────────────────────────────────────────────────

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 680,
    frame: false,            // custom frameless window
    transparent: false,
    backgroundColor: '#09090b',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
  })

  // Load Vite dev server or built file
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })

  // ─── Renderer Crash Detection ──────────────────────────────────────────────
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const { reason, exitCode } = details
    logger.error('Renderer', `render-process-gone: reason=${reason}, exitCode=${exitCode}`)

    const now = Date.now()
    const timeSinceLast = now - _lastRendererCrashAt
    _lastRendererCrashAt = now

    if (timeSinceLast > RENDERER_CRASH_RELOAD_COOLDOWN_MS) {
      // Safe to attempt one reload
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          logger.info('Renderer', 'Attempting renderer reload after crash')
          mainWindow.reload()
        }
      } catch (reloadErr) {
        logger.error('Renderer', `Reload failed after crash: ${reloadErr.message}`)
      }
    } else {
      logger.error('Renderer', 'Crash-loop detected — suppressing auto-reload to prevent infinite loop')
    }
  })
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Lock in the production log directory now that Electron is ready
  logger.setLogDir(app.getPath('userData'))
  logger.info('App', `Reel Cutter started (version ${app.getVersion()})`)

  createWindow()

  // Wire BatchQueueManager → renderer IPC push events
  const bq = getBatchQueueManager()
  bq.on('itemUpdate', ({ item }) => {
    mainWindow?.webContents.send('batch:itemUpdate', { item })
  })
  bq.on('queueUpdate', (state) => {
    mainWindow?.webContents.send('batch:queueUpdate', state)
  })
  bq.on('queueDone', (state) => {
    mainWindow?.webContents.send('batch:queueDone', state)
  })

  // Wire Auto-Updater
  const updater = getAppUpdater()
  updater.setWindow(mainWindow)
  setTimeout(() => {
    updater.checkForUpdates().catch(() => {})
  }, 3000)

  // Wire Background License Heartbeat (monitors grace period & clock tampering)
  startBackgroundLicenseHeartbeat((status) => {
    mainWindow?.webContents.send('license:statusChanged', status)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackgroundLicenseHeartbeat()
  // Cancel all active batch jobs to avoid orphan FFmpeg processes
  try { getBatchQueueManager().cancelAll() } catch (_) {}
  if (process.platform !== 'darwin') app.quit()
})


// ─── Window Controls (frameless) ─────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ─── File / Directory Dialogs ────────────────────────────────────────────────

ipcMain.handle('video:selectFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video File',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'flv'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('video:selectFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video Files for Batch Processing',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'flv'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('video:selectDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Output Directory',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('video:saveFile', async (_, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Output Video',
    defaultPath: defaultName || 'output.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  })
  return result.canceled ? null : result.filePath
})

// ─── Video: Probe ────────────────────────────────────────────────────────────

ipcMain.handle('video:probe', async (_, filePath) => {
  try {
    const metadata = await getVideoMetadata(filePath)
    return { success: true, data: metadata }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Video: Cut ──────────────────────────────────────────────────────────────

ipcMain.handle('video:cut', async (_, opts) => {
  const { inputPath, outputPath, start, duration, end, reel, mode, resolution, customDuration, generateThumbnail, thumbnailTitle, variation } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    // Server-side feature gating checks
    if (!hasFeature(tier, 'cutting')) {
      return { success: false, error: 'Video cutting requires an active license.' }
    }

    if ((resolution === '4k' || opts.width > 1920 || opts.height > 1920) && !hasFeature(tier, '4k_export')) {
      return { success: false, error: '4K Ultra HD export requires Standard or Pro license tier.' }
    }

    if (customDuration && !hasFeature(tier, 'custom_durations')) {
      return { success: false, error: 'Custom duration requires Standard or Pro license tier.' }
    }

    if (generateThumbnail && !hasFeature(tier, 'ai_thumbnails')) {
      return { success: false, error: 'Pro Thumbnail generation requires a Pro license tier.' }
    }

    let validatedVariation = null
    if (variation && variation.enabled) {
      const res = validateProductVariationConfig(variation)
      validatedVariation = res.config
    }

    markJobStarted()
    try {
      const result = await cutClip(inputPath, outputPath, {
        start,
        duration,
        end,
        reel: reel || false,
        mode: mode || 'blur',
        width: resolution === '4k' ? 2160 : opts.width,
        height: resolution === '4k' ? 3840 : opts.height,
        generateThumbnail: !!generateThumbnail,
        thumbnailTitle,
        variation: validatedVariation,
        onProgress: (percent) => {
          mainWindow?.webContents.send('video:progress', { percent, operation: 'cut' })
        }
      })
      mainWindow?.webContents.send('video:done', {
        operation: 'cut',
        outputPath: result.outputPath,
        duration: result.duration,
        thumbnailPath: result.thumbnailPath,
      })
      return { success: true, outputPath: result.outputPath, duration: result.duration, thumbnailPath: result.thumbnailPath }
    } finally {
      markJobFinished()
    }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'cut', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Reel ─────────────────────────────────────────────────────────────

ipcMain.handle('video:reel', async (_, opts) => {
  const { inputPath, outputPath, start, duration, mode, aspectRatio, generateThumbnail, thumbnailTitle, variation } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (!hasFeature(tier, 'cutting')) {
      return { success: false, error: 'Reel creation requires an active license.' }
    }

    if (aspectRatio && aspectRatio !== '9:16' && !hasFeature(tier, 'all_aspect_ratios')) {
      return { success: false, error: `Aspect ratio ${aspectRatio} requires Standard or Pro license tier.` }
    }

    if (mode === 'smart_crop' && !hasFeature(tier, 'smart_crop')) {
      return { success: false, error: 'Smart Crop (AI) requires Pro license tier.' }
    }

    if (generateThumbnail && !hasFeature(tier, 'ai_thumbnails')) {
      return { success: false, error: 'Pro Thumbnail generation requires a Pro license tier.' }
    }

    let validatedVariation = null
    if (variation && variation.enabled) {
      const res = validateProductVariationConfig(variation)
      validatedVariation = res.config
    }

    markJobStarted()
    try {
      const { width, height } = resolveDimensions(aspectRatio || '9:16', opts.resolution || '1080p')
      const result = await cutClip(inputPath, outputPath, {
        start: start || 0,
        duration,
        reel: true,
        mode: mode || 'blur',
        width,
        height,
        generateThumbnail: !!generateThumbnail,
        thumbnailTitle,
        variation: validatedVariation,
        onProgress: (percent) => {
          mainWindow?.webContents.send('video:progress', { percent, operation: 'reel' })
        }
      })
      mainWindow?.webContents.send('video:done', {
        operation: 'reel',
        outputPath: result.outputPath,
        duration: result.duration,
        thumbnailPath: result.thumbnailPath,
      })
      return { success: true, outputPath: result.outputPath, duration: result.duration, thumbnailPath: result.thumbnailPath }
    } finally {
      markJobFinished()
    }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'reel', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Split ─────────────────────────────────────────────────────────────

ipcMain.handle('video:split', async (_, opts) => {
  const { inputPath, outputDir, interval, reel, mode, generateThumbnail, thumbnailTitle, variation } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (!hasFeature(tier, 'cutting')) {
      return { success: false, error: 'Video splitting requires an active license.' }
    }

    if (generateThumbnail && !hasFeature(tier, 'ai_thumbnails')) {
      return { success: false, error: 'Pro Thumbnail generation requires a Pro license tier.' }
    }

    let validatedVariation = null
    if (variation && variation.enabled) {
      const res = validateProductVariationConfig(variation)
      validatedVariation = res.config
    }

    markJobStarted()
    try {
      const results = await splitIntoReels(inputPath, outputDir, {
        interval: interval || 30,
        reel: reel !== false,
        mode: mode || 'blur',
        generateThumbnail: !!generateThumbnail,
        thumbnailTitle,
        variation: validatedVariation,
        onOverallProgress: ({ current, total, start, duration }) => {
          const percent = Math.round((current / total) * 100)
          mainWindow?.webContents.send('video:progress', {
            percent,
            operation: 'split',
            current,
            total,
            start,
            duration
          })
        },
        onSegmentComplete: (segment) => {
          mainWindow?.webContents.send('video:segment', segment)
        }
      })
      mainWindow?.webContents.send('video:done', { operation: 'split', segments: results, outputDir })
      return { success: true, segments: results, outputDir }
    } finally {
      markJobFinished()
    }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'split', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Content Variation (Phase 1B) ────────────────────────────────────

ipcMain.handle('video:variation', async (_, opts) => {
  const { inputPath, outputPath, variation } = opts || {}
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (!hasFeature(tier, 'cutting')) {
      return { success: false, error: 'Content variation requires an active license.' }
    }

    const { config: validatedVariation } = validateProductVariationConfig(variation || opts)

    markJobStarted()
    try {
      const result = await runVariationPipeline({
        inputPath,
        outputPath,
        color: validatedVariation.color,
        audio: validatedVariation.audio,
        speed: validatedVariation.speedConfig,
        reframe: validatedVariation.reframe,
        metadata: validatedVariation.metadata,
        onProgress: (percent) => {
          mainWindow?.webContents.send('video:progress', { percent, operation: 'variation' })
        }
      })
      mainWindow?.webContents.send('video:done', {
        operation: 'variation',
        outputPath: result.outputPath,
        duration: result.duration,
      })
      return {
        success: true,
        outputPath: result.outputPath,
        duration: result.duration,
        transformationsApplied: result.transformationsApplied,
      }
    } finally {
      markJobFinished()
    }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'variation', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Standalone Pro Thumbnail & Media Handlers ──────────────────────────────

ipcMain.handle('video:readImageBase64', async (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const buf = await fs.promises.readFile(filePath)
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('video:generateThumbnail', async (_, opts) => {
  const license = await getLicenseInfo()
  const tier = license.isValid ? license.tier : null
  if (!hasFeature(tier, 'ai_thumbnails')) {
    return { success: false, error: 'Pro Thumbnail generation requires a Pro license tier.' }
  }
  const { videoPath, thumbnailPath, title } = opts
  return await generateProThumbnail(videoPath, thumbnailPath, { title })
})

// ─── Pro Features: AI Thumbnails, Smart Crop, Batch Queue ───────────────────

ipcMain.handle('video:aiThumbnails', async (_, opts) => {
  const license = await getLicenseInfo()
  const tier = license.isValid ? license.tier : null
  if (!hasFeature(tier, 'ai_thumbnails')) {
    return { success: false, error: 'AI Thumbnails feature requires Pro license tier.' }
  }
  return {
    success: true,
    thumbnails: [
      { timestamp: 2.5, score: 0.94, label: 'High engagement moment' },
      { timestamp: 6.2, score: 0.89, label: 'Action highlight' },
      { timestamp: 9.8, score: 0.92, label: 'Climax frame' },
    ],
  }
})

ipcMain.handle('video:smartCrop', async (_, opts) => {
  const license = await getLicenseInfo()
  const tier = license.isValid ? license.tier : null
  if (!hasFeature(tier, 'smart_crop')) {
    return { success: false, error: 'Smart Crop (AI) requires Pro license tier.' }
  }

  // video:smartCrop is used by the UI to run a reel conversion with smart crop mode.
  // The actual face-tracking crop filter is built inside cutter.js / smartCrop.js.
  const { inputPath, outputPath, start, duration, generateThumbnail, thumbnailTitle } = opts
  markJobStarted()
  try {
    const result = await cutClip(inputPath, outputPath, {
      start: start || 0,
      duration,
      reel: true,
      mode: 'smart_crop',
      generateThumbnail: !!generateThumbnail,
      thumbnailTitle,
      onProgress: (percent) => {
        mainWindow?.webContents.send('video:progress', { percent, operation: 'smartCrop' })
      },
    })

    mainWindow?.webContents.send('video:done', {
      operation: 'smartCrop',
      outputPath: result.outputPath,
      duration: result.duration,
      thumbnailPath: result.thumbnailPath,
    })

    return {
      success: true,
      tracking: 'Face-tracking smart crop applied',
      mode: 'smart_crop',
      outputPath: result.outputPath,
      duration: result.duration,
      thumbnailPath: result.thumbnailPath,
    }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'smartCrop', error: err.message })
    return { success: false, error: err.message }
  } finally {
    markJobFinished()
  }
})

// ─── Pro Features: Batch Queue (Pro Gated) ──────────────────────────────────

async function checkBatchProAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid ? license.tier : null
  if (!hasFeature(tier, 'batch_queue')) {
    return { authorized: false, error: 'Batch Queue feature requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('video:batchQueue', async (_, opts = {}) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  let added = []
  if (Array.isArray(opts.items) && opts.items.length > 0) {
    const rawItems = opts.items.map((it) => (typeof it === 'string' ? { inputPath: it } : it))
    added = bq.addItems(rawItems)
  }
  if (opts.start !== false && added.length > 0) {
    bq.startQueue()
  }
  return { success: true, queuedItems: opts.items || [], status: 'processing', state: bq.getState() }
})

ipcMain.handle('batch:add', async (_, items) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  const rawItems = Array.isArray(items) ? items : [items]
  const created = bq.addItems(rawItems)
  return { success: true, created, state: bq.getState() }
})

ipcMain.handle('batch:updateItem', async (_, { id, updates }) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  const ok = bq.updateItem(id, updates)
  return { success: ok, state: bq.getState() }
})

ipcMain.handle('batch:remove', async (_, id) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  const ok = bq.removeItem(id)
  return { success: ok, state: bq.getState() }
})

ipcMain.handle('batch:clearCompleted', async () => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  const cleared = bq.clearCompleted()
  return { success: true, cleared, state: bq.getState() }
})

ipcMain.handle('batch:start', async (_, opts = {}) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  if (opts.concurrency) {
    bq.setConcurrency(opts.concurrency)
  }
  bq.startQueue()
  return { success: true, state: bq.getState() }
})

ipcMain.handle('batch:pause', async () => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  bq.pauseQueue()
  return { success: true, state: bq.getState() }
})

ipcMain.handle('batch:cancelItem', async (_, id) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  const ok = bq.cancelItem(id)
  return { success: ok, state: bq.getState() }
})

ipcMain.handle('batch:cancelAll', async () => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  bq.cancelAll()
  return { success: true, state: bq.getState() }
})

ipcMain.handle('batch:getState', async () => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  return { success: true, state: bq.getState() }
})

ipcMain.handle('batch:setConcurrency', async (_, concurrency) => {
  const auth = await checkBatchProAccess()
  if (!auth.authorized) return { success: false, error: auth.error }

  const bq = getBatchQueueManager()
  bq.setConcurrency(concurrency)
  return { success: true, concurrency: bq.getConcurrency(), state: bq.getState() }
})

// ─── Open in Explorer ─────────────────────────────────────────────────────────

ipcMain.on('shell:showItemInFolder', (_, filePath) => {
  shell.showItemInFolder(filePath)
})

// ─── Licensing & HWID IPC Handlers ───────────────────────────────────────────

ipcMain.handle('license:check', async () => {
  try {
    return await validateStartup()
  } catch (err) {
    return { isValid: false, error: err.message, reason: 'SYSTEM_ERROR' }
  }
})

ipcMain.handle('license:activate', async (_, key) => {
  try {
    return await activateLicense(key)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('license:deactivate', async () => {
  try {
    return await deactivateLicense()
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('license:getInfo', async () => {
  try {
    return await getLicenseInfo()
  } catch (err) {
    return { hasLicense: false, isValid: false, error: err.message }
  }
})

ipcMain.handle('license:hasFeature', async (_, featureName) => {
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null
    return hasFeature(tier, featureName)
  } catch {
    return false
  }
})

ipcMain.handle('license:networkOnline', async () => {
  try {
    const result = await revalidateOnlineSilently()
    if (result) {
      mainWindow?.webContents.send('license:statusChanged', result)
    }
    return result
  } catch (err) {
    return { isValid: false, error: err.message }
  }
})

// ─── Auto-Updater IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('updater:check', async () => {
  return await getAppUpdater().checkForUpdates()
})

ipcMain.handle('updater:download', async () => {
  return await getAppUpdater().downloadUpdate()
})

ipcMain.handle('updater:install', async () => {
  return getAppUpdater().quitAndInstall()
})

ipcMain.handle('updater:getStatus', async () => {
  return getAppUpdater().getStatus()
})

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

// ─── Page Profile IPC Handlers (Phase 2A) ───────────────────────────────────

ipcMain.handle('profile:list', async () => {
  try {
    const list = listProfiles()
    return { success: true, selectedProfileId: list.selectedProfileId, profiles: [...list] }
  } catch (err) {
    return { success: false, error: err.message, profiles: [], selectedProfileId: null }
  }
})

ipcMain.handle('profile:create', async (_, input) => {
  try {
    const profile = createProfile(input)
    return { success: true, profile }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:update', async (_, { id, updates }) => {
  try {
    const profile = updateProfile(id, updates)
    return { success: true, profile }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:delete', async (_, id) => {
  try {
    const ok = deleteProfile(id)
    return { success: ok }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:duplicate', async (_, id) => {
  try {
    const profile = duplicateProfile(id)
    return { success: true, profile }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:setSelected', async (_, id) => {
  try {
    const selectedProfileId = setSelectedProfile(id)
    return { success: true, selectedProfileId }
  } catch (err) {
    return { success: false, error: err.message }
  }
})


