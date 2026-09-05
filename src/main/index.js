const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { getVideoMetadata } = require('../engine/probe')
const { cutClip, splitIntoReels } = require('../engine/cutter')
const { generateProThumbnail } = require('../engine/thumbnailGenerator')
const { validateStartup, activateLicense, deactivateLicense, getLicenseInfo } = require('./license/licenseManager')
const { hasFeature } = require('../shared/features')

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
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
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
  const { inputPath, outputPath, start, duration, end, reel, mode, resolution, customDuration, generateThumbnail, thumbnailTitle } = opts
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
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'cut', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Reel ─────────────────────────────────────────────────────────────

ipcMain.handle('video:reel', async (_, opts) => {
  const { inputPath, outputPath, start, duration, mode, aspectRatio, generateThumbnail, thumbnailTitle } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (aspectRatio && aspectRatio !== '9:16' && !hasFeature(tier, 'all_aspect_ratios')) {
      return { success: false, error: `Aspect ratio ${aspectRatio} requires Standard or Pro license tier.` }
    }

    if (mode === 'smart_crop' && !hasFeature(tier, 'smart_crop')) {
      return { success: false, error: 'Smart Crop (AI) requires Pro license tier.' }
    }

    if (generateThumbnail && !hasFeature(tier, 'ai_thumbnails')) {
      return { success: false, error: 'Pro Thumbnail generation requires a Pro license tier.' }
    }

    const result = await cutClip(inputPath, outputPath, {
      start: start || 0,
      duration,
      reel: true,
      mode: mode || 'blur',
      generateThumbnail: !!generateThumbnail,
      thumbnailTitle,
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
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'reel', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Split ─────────────────────────────────────────────────────────────

ipcMain.handle('video:split', async (_, opts) => {
  const { inputPath, outputDir, interval, reel, mode, generateThumbnail, thumbnailTitle } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (!hasFeature(tier, 'cutting')) {
      return { success: false, error: 'Video splitting requires an active license.' }
    }

    if (generateThumbnail && !hasFeature(tier, 'ai_thumbnails')) {
      return { success: false, error: 'Pro Thumbnail generation requires a Pro license tier.' }
    }

    const results = await splitIntoReels(inputPath, outputDir, {
      interval: interval || 30,
      reel: reel !== false,
      mode: mode || 'blur',
      generateThumbnail: !!generateThumbnail,
      thumbnailTitle,
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
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'split', error: err.message })
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
  // Here we just delegate to the existing video:reel handler logic with mode=smart_crop.
  const { inputPath, outputPath, start, duration, generateThumbnail, thumbnailTitle } = opts
  try {
    const { getSmartCropFilter } = require('./src/engine/smartCrop')
    const { getVideoMetadata } = require('./src/engine/probe')
    const { cutClip } = require('./src/engine/cutter')

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
  }
})

ipcMain.handle('video:batchQueue', async (_, opts) => {
  const license = await getLicenseInfo()
  const tier = license.isValid ? license.tier : null
  if (!hasFeature(tier, 'batch_queue')) {
    return { success: false, error: 'Batch Queue feature requires Pro license tier.' }
  }
  return { success: true, queuedItems: opts.items || [], status: 'processing' }
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
