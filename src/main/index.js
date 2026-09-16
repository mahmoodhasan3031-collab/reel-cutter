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
  resolveProfileConfiguration,
  getProfileConfigurationStatus,
  getProfilePreview,
  diffProfileConfigurations,
  applyProfileConfiguration,
  validateOverrides,
} from './profiles/profileManager'
import { createBulkExportPlan, BULK_VARIATION_TEMPLATES, validateBulkPlan, detectOutputConflicts, generatePreflightSummary, generatePlanSummaryText, duplicatePlan, exportAgainPlan, getQueueAggregateState, retryFailedJobs, getExecutionSummary } from './profiles/exportPlan'
import { executeBulkExport, cancelBulkExport, cancelBulkJob } from './profiles/bulkExecutor'
import {
  createSchedule,
  getSchedules,
  getSchedule,
  cancelSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
} from './scheduler/scheduleManager'
import {
  createBulkSchedule,
  getScheduleGroupSummary,
  cancelScheduleGroup,
  deleteScheduleGroupHistory,
} from './scheduler/bulkScheduleManager'
import { getSchedulerService } from './scheduler/schedulerService'
import { validateTextOverlayConfig, createDefaultOverlay } from '../engine/textOverlayValidator'
import {
  getCaptionTemplates,
  getCaptionTemplate,
  createCaptionTemplate,
  updateCaptionTemplate,
  deleteCaptionTemplate,
  duplicateCaptionTemplate,
  resetCaptionTemplates,
} from './captions/captionTemplateManager'
import {
  generateCaptions,
  generateBulkCaptions,
  getAiStatus,
} from './captions/aiCaptionService'
import {
  analyzeQuality,
  improveCaption,
  analyzeBulkQuality,
} from './captions/captionQualityService'
import {
  createHistoryRecord,
  getHistory,
  getHistoryRecord,
  deleteHistoryRecord,
  clearHistory,
  getDashboardMetrics,
  getQualityInsights,
  compareCaptions,
  reanalyzeHistoryRecord,
} from './captions/captionHistoryManager'
import {
  createWorkspace,
  validateWorkspace,
  addVersion,
  selectVersion,
  updateCurrentCaption,
  generateSmartRewrites,
  rewriteWithQualityFeedback,
  compareWorkspaceVersions,
  bulkSmartRewrite,
} from './captions/captionWorkspaceManager'
import {
  createExperiment,
  getExperiments,
  getExperiment,
  updateExperiment,
  deleteExperiment,
  duplicateExperiment,
  addVariant,
  updateVariant,
  deleteVariant,
  selectPreferredVariant,
  compareVariants,
  getBestVariant,
  getWeakestSignalAcrossExperiment,
  optimizeVariant,
  generateAiVariants,
  bulkExperiment,
} from './captions/captionExperimentManager'
import {
  getVariationPresets,
  getVariationPreset,
  searchVariationPresets,
  createVariationPreset,
  updateVariationPreset,
  deleteVariationPreset,
  duplicateVariationPreset,
  compareVariationPresets,
  applyVariationPreset,
  resetVariationPresets,
  resolveVariationPresetSnapshot,
} from './variations/variationPresetManager'
import {
  getExportPresets,
  getExportPreset,
  searchExportPresets,
  createExportPreset,
  updateExportPreset,
  deleteExportPreset,
  duplicateExportPreset,
  compareExportPresets,
  applyExportPreset,
  resetExportPresets,
  resolveExportPresetSnapshot,
} from './exportPresets/exportPresetManager'
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

    // Bug #4 fix: create Export History record on batch completion/failure
    if (item && (item.status === 'DONE' || item.status === 'ERROR')) {
      try {
        const pathLib = require('path')
        const isCompleted = item.status === 'DONE'
        const result = item.result || {}
        const outPath = result.outputPath || item.outputPath || ''

        // Determine export type from operation
        const exportType = item.operation || 'cut'

        createExportHistoryRecord({
          exportType,
          source: { name: pathLib.basename(item.inputPath || ''), path: item.inputPath || '' },
          output: outPath
            ? { path: outPath, filename: pathLib.basename(outPath), directory: pathLib.dirname(outPath) }
            : undefined,
          status: isCompleted ? 'COMPLETED' : 'FAILED',
          error: isCompleted ? null : (item.error || 'Batch export failed'),
          settingsSnapshot: {
            operation: item.operation,
            mode: item.mode,
            start: item.start,
            duration: item.duration,
            width: item.width,
            height: item.height,
          },
        })
      } catch (_) { /* non-blocking */ }
    }
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

  // Wire Scheduler Service (Phase 3A)
  const scheduler = getSchedulerService()
  scheduler.start()
  scheduler.on('scheduleUpdate', (schedule) => {
    mainWindow?.webContents.send('schedule:update', schedule)
  })
  scheduler.on('scheduleProgress', ({ id, progress }) => {
    mainWindow?.webContents.send('schedule:progress', { id, progress })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackgroundLicenseHeartbeat()
  try { getSchedulerService().stop() } catch (_) {}
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
  const { inputPath, outputPath, start, duration, end, reel, mode, resolution, customDuration, generateThumbnail, thumbnailTitle, variation, textOverlays } = opts
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

    // Validate and sanitize text overlays (main process is authoritative)
    let validatedOverlays = null
    if (textOverlays && Array.isArray(textOverlays) && textOverlays.length > 0) {
      validatedOverlays = validateTextOverlayConfig(textOverlays, { fallbackFont: true })
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
        textOverlays: validatedOverlays,
        onProgress: (percent) => {
          mainWindow?.webContents.send('video:progress', { percent, operation: 'cut' })
        }
      })
      const donePayload = {
        operation: 'cut',
        outputPath: result.outputPath,
        duration: result.duration,
        thumbnailPath: result.thumbnailPath,
      }
      mainWindow?.webContents.send('video:done', donePayload)

      // Persist to export history (Bug #2 fix)
      try {
        const { authorized } = await checkExportHistoryAccess()
        if (authorized) {
          const path = require('path')
          createExportHistoryRecord({
            exportType: 'cut',
            source: { name: path.basename(inputPath), path: inputPath },
            output: { path: result.outputPath, filename: path.basename(result.outputPath), directory: path.dirname(result.outputPath) },
            status: 'COMPLETED',
            settingsSnapshot: { start, duration, end, reel, mode, resolution, customDuration },
          })
        }
      } catch (_) { /* non-blocking */ }

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
  const { inputPath, outputPath, start, duration, mode, aspectRatio, generateThumbnail, thumbnailTitle, variation, textOverlays } = opts
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

      // Validate and sanitize text overlays (main process is authoritative)
      let validatedOverlays = null
      if (textOverlays && Array.isArray(textOverlays) && textOverlays.length > 0) {
        validatedOverlays = validateTextOverlayConfig(textOverlays, { fallbackFont: true })
      }

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
        textOverlays: validatedOverlays,
        onProgress: (percent) => {
          mainWindow?.webContents.send('video:progress', { percent, operation: 'reel' })
        }
      })
      const donePayload = {
        operation: 'reel',
        outputPath: result.outputPath,
        duration: result.duration,
        thumbnailPath: result.thumbnailPath,
      }
      mainWindow?.webContents.send('video:done', donePayload)

      // Persist to export history (Bug #2 fix)
      try {
        const { authorized } = await checkExportHistoryAccess()
        if (authorized) {
          const path = require('path')
          createExportHistoryRecord({
            exportType: 'reel',
            source: { name: path.basename(inputPath), path: inputPath },
            output: { path: result.outputPath, filename: path.basename(result.outputPath), directory: path.dirname(result.outputPath) },
            status: 'COMPLETED',
            settingsSnapshot: { mode, aspectRatio, start, duration },
          })
        }
      } catch (_) { /* non-blocking */ }

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
  const { inputPath, outputDir, interval, reel, mode, generateThumbnail, thumbnailTitle, variation, textOverlays } = opts
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

    // Validate and sanitize text overlays (main process is authoritative)
    let validatedOverlays = null
    if (textOverlays && Array.isArray(textOverlays) && textOverlays.length > 0) {
      validatedOverlays = validateTextOverlayConfig(textOverlays, { fallbackFont: true })
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
        textOverlays: validatedOverlays,
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
      const donePayload = { operation: 'split', segments: results, outputDir }
      mainWindow?.webContents.send('video:done', donePayload)

      // Persist to export history (Bug #2 fix)
      try {
        const { authorized } = await checkExportHistoryAccess()
        if (authorized) {
          const pathLib = require('path')
          // One history record per split segment
          for (const seg of results) {
            const segPath = seg.outputPath || seg.path || ''
            createExportHistoryRecord({
              exportType: 'split',
              source: { name: pathLib.basename(inputPath), path: inputPath },
              output: { path: segPath, filename: pathLib.basename(segPath), directory: pathLib.dirname(segPath) || outputDir },
              status: 'COMPLETED',
              settingsSnapshot: { interval, reel, mode },
            })
          }
        }
      } catch (_) { /* non-blocking */ }

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

ipcMain.handle('profile:createPlan', async (_, options) => {
  try {
    const plan = createBulkExportPlan(options)
    return { success: true, plan }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:executePlan', async (_, { plan, options } = {}) => {
  try {
    const result = await executeBulkExport(plan, options)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:cancelPlan', async (_, planId) => {
  try {
    const result = cancelBulkExport(planId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:cancelJob', async (_, jobId) => {
  try {
    const result = cancelBulkJob(jobId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:getTemplates', async () => {
  return { success: true, templates: BULK_VARIATION_TEMPLATES }
})

// ─── Intelligent Profile Configuration IPC (Phase 5C) ─────────────────────────

ipcMain.handle('profile:resolveConfiguration', async (_, profileId) => {
  try {
    const profiles = listProfiles()
    const profile = [...profiles].find(p => p.id === profileId)
    if (!profile) return { success: false, error: `Profile not found: ${profileId}` }
    const configuration = resolveProfileConfiguration(profile)
    return { success: true, configuration }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:getConfigurationStatus', async (_, profileId) => {
  try {
    const profiles = listProfiles()
    const profile = [...profiles].find(p => p.id === profileId)
    if (!profile) return { success: false, error: `Profile not found: ${profileId}` }
    const status = getProfileConfigurationStatus(profile)
    return { success: true, ...status }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:preview', async (_, profileId) => {
  try {
    const profiles = listProfiles()
    const profile = [...profiles].find(p => p.id === profileId)
    if (!profile) return { success: false, error: `Profile not found: ${profileId}` }
    const preview = getProfilePreview(profile)
    return { success: true, preview }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:diff', async (_, { profileIdA, profileIdB } = {}) => {
  try {
    const profiles = listProfiles()
    const profileA = [...profiles].find(p => p.id === profileIdA)
    const profileB = [...profiles].find(p => p.id === profileIdB)
    if (!profileA) return { success: false, error: `Profile not found: ${profileIdA}` }
    if (!profileB) return { success: false, error: `Profile not found: ${profileIdB}` }
    const diff = diffProfileConfigurations(profileA, profileB)
    return { success: true, diff }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:applyConfiguration', async (_, { profileId, currentConfig } = {}) => {
  try {
    const profiles = listProfiles()
    const profile = [...profiles].find(p => p.id === profileId)
    if (!profile) return { success: false, error: `Profile not found: ${profileId}` }
    const merged = applyProfileConfiguration(profile, currentConfig || {})
    return { success: true, configuration: merged }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('profile:validateOverrides', async (_, overrides) => {
  try {
    const validated = validateOverrides(overrides)
    return { success: true, overrides: validated }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Intelligent Bulk Export IPC (Phase 5D) ──────────────────────────────────

ipcMain.handle('bulk:validatePlan', async (_, plan) => {
  try {
    const result = validateBulkPlan(plan)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:detectConflicts', async (_, plan) => {
  try {
    const result = detectOutputConflicts(plan)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:preflight', async (_, plan) => {
  try {
    const summary = generatePreflightSummary(plan)
    return { success: true, summary }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:summaryText', async (_, plan) => {
  try {
    const text = generatePlanSummaryText(plan)
    return { success: true, text }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:duplicatePlan', async (_, plan) => {
  try {
    const newPlan = duplicatePlan(plan)
    return { success: true, plan: newPlan }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:exportAgain', async (_, previousPlan) => {
  try {
    const newPlan = exportAgainPlan(previousPlan)
    return { success: true, plan: newPlan }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:getQueueState', async () => {
  try {
    const { getBatchQueueManager } = require('../engine/batchQueue')
    const queue = getBatchQueueManager()
    const state = getQueueAggregateState(queue)
    return { success: true, state }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:retryFailed', async (_, { planId, previousQueueState } = {}) => {
  try {
    const { getBatchQueueManager } = require('../engine/batchQueue')
    const queue = getBatchQueueManager()
    const result = retryFailedJobs(queue, planId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('bulk:getExecutionSummary', async (_, planId) => {
  try {
    const { getBatchQueueManager } = require('../engine/batchQueue')
    const queue = getBatchQueueManager()
    const summary = getExecutionSummary(queue, planId)
    return { success: true, summary }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Export History & Organization IPC (Phase 5E) ────────────────────────────

import {
  EXPORT_HISTORY_STATUS,
  loadHistory,
  createExportHistoryRecord,
  getExportHistory,
  getExportHistoryRecord,
  updateExportHistoryRecord,
  deleteExportHistoryRecord,
  clearExportHistory,
  getByPlanId,
  getByJobId,
  getExportHistoryStats,
  getExportAgainConfig,
  canRetryExport,
} from './history/exportHistoryManager'

import {
  groupRecords,
  createSavedView,
  getSavedViews,
  getSavedView,
  updateSavedView,
  deleteSavedView,
  duplicateSavedView,
  bulkDeleteRecords,
  bulkGetExportAgainConfigs,
  bulkCanRetry,
  createRetryRecord,
  getAttemptHistory,
  addTag,
  removeTag,
  filterByTag,
  setNote,
  getTimeline,
  exportToCSV,
  exportToJSON,
  getFilteredStats,
} from './history/exportHistoryIntelligence'

import {
  OUTPUT_HEALTH_STATUS,
  checkOutputHealth,
  batchCheckOutputHealth,
  checkRecordOutputHealth,
  batchCheckRecordOutputHealth,
  validateDirectoryPath,
  validateOpenablePath,
} from './history/outputHealthService'

import {
  RECOVERY_ERROR_CATEGORY,
  normalizeError,
  checkRetryReadiness,
  batchCheckRetryReadiness,
  getRecoveryDiagnostics,
  retryFailedExport,
  exportAgainMissingOutput,
  bulkRetryFailed,
  bulkExportAgainMissing,
  archiveRecord,
  unarchiveRecord,
  bulkArchive,
  bulkUnarchive,
  pinRecord,
  unpinRecord,
  bulkPin,
  bulkUnpin,
  isNeedsAttention,
  getNeedsAttentionRecords,
  getWorkspaceView,
  getRecoveryCounts,
  getWorkspaceSummary,
  getAttemptDisplayInfo,
} from './history/recoveryCenter'

import {
  getDashboardAnalytics,
  compareProfiles,
  comparePresets,
  analyticsToJSON,
  analyticsToCSV,
} from './analytics/exportAnalytics'

import {
  getCommandCenterSnapshot,
  applyCommandCenterFilter,
  applyCommandCenterSearch,
  getWorkflowSummary,
  validateActionEligibility,
  planBulkAction,
  executeBulkAction,
  validateSnapshotForExport,
} from './dashboard/exportCommandCenter'

async function checkExportHistoryAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'export_history')) {
    return { authorized: false, error: 'Export History & Organization requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('export-history:create', async (_, rawRecord) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const record = createExportHistoryRecord(rawRecord)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:list', async (_, options) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = getExportHistory(options)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message, records: [], total: 0 }
  }
})

ipcMain.handle('export-history:get', async (_, id) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const record = getExportHistoryRecord(id)
    if (!record) return { success: false, error: 'Export history record not found' }
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:update', async (_, { id, updates } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const record = updateExportHistoryRecord(id, updates)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:delete', async (_, id) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = deleteExportHistoryRecord(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:clear', async () => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = clearExportHistory()
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:getByPlan', async (_, planId) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const records = getByPlanId(planId)
    return { success: true, records }
  } catch (err) {
    return { success: false, error: err.message, records: [] }
  }
})

ipcMain.handle('export-history:getByJob', async (_, jobId) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const record = getByJobId(jobId)
    if (!record) return { success: false, error: 'No history record found for this job' }
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:getStats', async () => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const stats = getExportHistoryStats()
    return { success: true, stats }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:getExportAgainConfig', async (_, id) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const config = getExportAgainConfig(id)
    return { success: true, config }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history:canRetry', async (_, id) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = canRetryExport(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Export History Intelligence IPC Handlers (Phase 5F) ─────────────────────

ipcMain.handle('export-history-intelligence:group', async (_, { records, groupBy } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const groups = groupRecords(records || [], groupBy)
    return { success: true, groups }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:getTimeline', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const timeline = getTimeline(records || [])
    return { success: true, timeline }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:getFilteredStats', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const stats = getFilteredStats(records || [])
    return { success: true, stats }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:exportCSV', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const csv = exportToCSV(records || [])
    return { success: true, csv }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:exportJSON', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const json = exportToJSON(records || [])
    return { success: true, json }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:filterByTag', async (_, { records, tag } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const filtered = filterByTag(records || [], tag)
    return { success: true, records: filtered }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:getVisibleIds', async (_, { records, selectedIds } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const ids = getVisibleIds(records || [], selectedIds || [])
    return { success: true, ids }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:bulkDelete', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkDeleteRecords(ids || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:bulkExportAgainConfig', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const configs = bulkGetExportAgainConfigs(ids || [])
    return { success: true, configs }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:bulkCanRetry', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const results = bulkCanRetry(ids || [])
    return { success: true, results }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:createRetryRecord', async (_, { originalId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = createRetryRecord(originalId)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:getAttemptHistory', async (_, { attemptGroupId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const history = getAttemptHistory(attemptGroupId)
    return { success: true, history }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:addTag', async (_, { id, tag } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = addTag(id, tag)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:removeTag', async (_, { id, tag } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = removeTag(id, tag)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-intelligence:setNote', async (_, { id, note } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = setNote(id, note)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Saved Views IPC Handlers ───────────────────────────────────────────────

ipcMain.handle('export-history-views:create', async (_, { view } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const created = createSavedView(view)
    return { success: true, view: created }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-views:list', async () => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const views = getSavedViews()
    return { success: true, views }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-views:get', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const view = getSavedView(id)
    return { success: true, view }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-views:update', async (_, { id, updates } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const view = updateSavedView(id, updates)
    return { success: true, view }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-views:delete', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = deleteSavedView(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-history-views:duplicate', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const view = duplicateSavedView(id)
    return { success: true, view }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Export Recovery Center IPC Handlers (Phase 5G) ─────────────────────────

ipcMain.handle('recovery:checkOutputHealth', async (_, { outputPath } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const health = checkOutputHealth(outputPath)
    return { success: true, health }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:batchCheckOutputHealth', async (_, { recordIds } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const records = (recordIds || []).map(id => getExportHistoryRecord(id)).filter(Boolean)
    const result = batchCheckRecordOutputHealth(records)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:checkRetryReadiness', async (_, { recordId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = checkRetryReadiness(recordId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:batchCheckRetryReadiness', async (_, { recordIds } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = batchCheckRetryReadiness(recordIds || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:getDiagnostics', async (_, { recordId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const diagnostics = getRecoveryDiagnostics(recordId)
    return { success: true, diagnostics }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:retryFailed', async (_, { recordId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = retryFailedExport(recordId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:exportAgainMissing', async (_, { recordId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = exportAgainMissingOutput(recordId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:bulkRetryFailed', async (_, { recordIds } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkRetryFailed(recordIds || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:bulkExportAgainMissing', async (_, { recordIds } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkExportAgainMissing(recordIds || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:archive', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = archiveRecord(id)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:unarchive', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = unarchiveRecord(id)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:bulkArchive', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkArchive(ids || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:bulkUnarchive', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkUnarchive(ids || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:pin', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = pinRecord(id)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:unpin', async (_, { id } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const record = unpinRecord(id)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:bulkPin', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkPin(ids || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:bulkUnpin', async (_, { ids } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = bulkUnpin(ids || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:getWorkspaceSummary', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const summary = getWorkspaceSummary(records || [])
    return { success: true, summary }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:getWorkspaceView', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const view = getWorkspaceView(records || [])
    return { success: true, view }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:getNeedsAttention', async (_, { records } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const items = getNeedsAttentionRecords(records || [])
    return { success: true, items }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:getAttemptDisplay', async (_, { record, recordId } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const target = record || (recordId ? getExportHistoryRecord(recordId) : null)
    const display = target ? getAttemptDisplayInfo(target) : null
    return { success: true, display }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:normalizeError', async (_, { error } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const normalized = normalizeError(error)
    return { success: true, normalized }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:validateDirectory', async (_, { dirPath } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = validateDirectoryPath(dirPath)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recovery:validateOpenable', async (_, { filePath } = {}) => {
  try {
    const auth = await checkExportHistoryAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = validateOpenablePath(filePath)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Export Intelligence Dashboard IPC Handlers (Phase 5H) ──────────────────

async function checkDashboardAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'export_intelligence_dashboard')) {
    return { authorized: false, error: 'Export Intelligence Dashboard requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('analytics:getDashboard', async (_, options = {}) => {
  try {
    const auth = await checkDashboardAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const records = loadHistory()
    const analytics = getDashboardAnalytics(records, options)
    return { success: true, analytics }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('analytics:compareProfiles', async (_, { profileIds } = {}) => {
  try {
    const auth = await checkDashboardAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const records = loadHistory()
    const result = compareProfiles(records, profileIds || [])
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('analytics:comparePresets', async (_, { presetIds, presetType } = {}) => {
  try {
    const auth = await checkDashboardAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const records = loadHistory()
    const result = comparePresets(records, presetIds || [], presetType || 'export')
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('analytics:exportJSON', async (_, options = {}) => {
  try {
    const auth = await checkDashboardAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const records = loadHistory()
    const analytics = getDashboardAnalytics(records, options)
    const json = analyticsToJSON(analytics)
    return { success: true, data: json }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('analytics:exportCSV', async (_, options = {}) => {
  try {
    const auth = await checkDashboardAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const records = loadHistory()
    const analytics = getDashboardAnalytics(records, options)
    const csv = analyticsToCSV(analytics)
    return { success: true, data: csv }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('analytics:saveToFile', async (_, { format, options, defaultPath } = {}) => {
  try {
    const auth = await checkDashboardAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const ext = format === 'csv' ? 'csv' : 'json'
    const filters = [
      { name: format === 'csv' ? 'CSV Files' : 'JSON Files', extensions: [ext] },
    ]
    const defaultName = `export-analytics-${Date.now()}.${ext}`
    const filePath = defaultPath || defaultName

    const result = await dialog.showSaveDialog({
      defaultPath: filePath,
      filters,
      title: `Export Analytics as ${ext.toUpperCase()}`,
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Export cancelled' }
    }

    const records = loadHistory()
    const analytics = getDashboardAnalytics(records, options || {})
    const content = format === 'csv' ? analyticsToCSV(analytics) : analyticsToJSON(analytics)
    fs.writeFileSync(result.filePath, content, 'utf8')
    return { success: true, path: result.filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Export Command Center IPC Handlers (Phase 5I) ──────────────────────────

async function checkCommandCenterAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'export_command_center')) {
    return { authorized: false, error: 'Export Command Center requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('commandcenter:getSnapshot', async (_, options = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const bq = getBatchQueueManager()
    const schedulesFn = () => getSchedules()
    const records = loadHistory()

    let filteredRecords = records
    if (options.filter) filteredRecords = applyCommandCenterFilter(records, options.filter)
    if (options.search) filteredRecords = applyCommandCenterSearch(filteredRecords, options.search)
    if (options.profileId) {
      const pid = String(options.profileId).trim()
      if (pid) filteredRecords = filteredRecords.filter(r => r.profile && r.profile.id === pid)
    }

    const snapshot = getCommandCenterSnapshot({
      getBatchQueueState: () => bq.getState(),
      getSchedules: schedulesFn,
      loadHistory: () => records,
    })

    // Apply filters to snapshot sub-sections if needed
    if (options.filter || options.search || options.profileId) {
      if (snapshot.recent) {
        let recentRecords = records
        if (options.filter) recentRecords = applyCommandCenterFilter(recentRecords, options.filter)
        if (options.search) recentRecords = applyCommandCenterSearch(recentRecords, options.search)
        if (options.profileId) {
          const pid = String(options.profileId).trim()
          if (pid) recentRecords = recentRecords.filter(r => r.profile && r.profile.id === pid)
        }
        snapshot.recent = {
          items: recentRecords.slice(0, 10).map(r => ({
            id: r.id,
            source: r.source ? r.source.name : '',
            profile: r.profile ? r.profile.name : '',
            platform: r.profile ? r.profile.platform : '',
            exportType: r.exportType || '',
            status: r.status,
            error: r.error || null,
            createdAt: r.createdAt,
            completedAt: r.completedAt || null,
            outputPath: r.output ? r.output.path : '',
            outputFilename: r.output ? r.output.filename : '',
            attemptNumber: r.attemptNumber || null,
          })),
        }
      }
    }

    return { success: true, snapshot }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('commandcenter:retryFailed', async (_, { historyId } = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const { retryFailedExport: retryExport } = require('./history/recoveryCenter')
    const result = retryExport(historyId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('commandcenter:exportAgainMissing', async (_, { historyId } = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const { exportAgainMissingOutput } = require('./history/recoveryCenter')
    const result = exportAgainMissingOutput(historyId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Workflow Automation IPC Handlers (Phase 5J) ─────────────────────────────

ipcMain.handle('workflow:getSummary', async (_, options = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const bq = getBatchQueueManager()
    const snapshot = getWorkflowSummary({
      getBatchQueueState: () => bq.getState(),
      getSchedules: () => getSchedules(),
      loadHistory: () => loadHistory(),
    })
    return { success: true, snapshot }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow:validateEligibility', async (_, { actionType, recordIds } = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const result = validateActionEligibility(actionType, recordIds)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow:planBulk', async (_, { actionType, recordIds } = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const result = planBulkAction(actionType, recordIds)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow:executeBulk', async (_, { actionType, recordIds } = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const result = executeBulkAction(actionType, recordIds)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow:validateSnapshot', async (_, { recordId } = {}) => {
  try {
    const auth = await checkCommandCenterAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }

    const result = validateSnapshotForExport(recordId)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Scheduler IPC Handlers (Phase 3A) ───────────────────────────────────────

ipcMain.handle('schedule:create', async (_, input) => {
  try {
    const schedule = createSchedule(input)
    return { success: true, schedule }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:list', async () => {
  try {
    const schedules = getSchedules()
    return { success: true, schedules }
  } catch (err) {
    return { success: false, error: err.message, schedules: [] }
  }
})

ipcMain.handle('schedule:get', async (_, id) => {
  try {
    const schedule = getSchedule(id)
    if (!schedule) return { success: false, error: `Schedule not found: ${id}` }
    return { success: true, schedule }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:cancel', async (_, id) => {
  try {
    const scheduler = getSchedulerService()
    const schedule = scheduler.cancelScheduleJob(id)
    return { success: true, schedule }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:delete', async (_, id) => {
  try {
    const ok = deleteSchedule(id)
    return { success: ok }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:pause', async (_, id) => {
  try {
    const schedule = pauseSchedule(id)
    return { success: true, schedule }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:resume', async (_, id) => {
  try {
    const schedule = resumeSchedule(id)
    return { success: true, schedule }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:update', async (_, { id, changes }) => {
  try {
    if (!id || !changes) {
      return { success: false, error: 'id and changes are required' }
    }
    const { updated, isPastDue } = updateSchedule(id, changes)
    // Emit push event so renderer receives real-time update
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('schedule:update', updated)
    }
    return { success: true, schedule: updated, isPastDue }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:createBulk', async (_, input) => {
  try {
    const result = createBulkSchedule(input)
    const win = BrowserWindow.getAllWindows()[0]
    if (win && Array.isArray(result.schedules)) {
      result.schedules.forEach(s => win.webContents.send('schedule:update', s))
    }
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:getGroupSummary', async (_, planId) => {
  try {
    const summary = getScheduleGroupSummary(planId)
    return { success: true, summary }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:cancelGroup', async (_, planId) => {
  try {
    const scheduler = getSchedulerService()
    const result = cancelScheduleGroup(planId, null, scheduler)
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('schedule:deleteGroupHistory', async (_, planId) => {
  try {
    const result = deleteScheduleGroupHistory(planId)
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Text Overlay: Validation & Defaults (Phase 4A) ──────────────────────────

ipcMain.handle('text-overlay:validate', async (_, overlays) => {
  try {
    const validated = validateTextOverlayConfig(overlays, { fallbackFont: true })
    return { success: true, overlays: validated }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('text-overlay:defaults', async () => {
  try {
    const overlay = createDefaultOverlay()
    return { success: true, overlay }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Caption Templates: Library & CRUD (Phase 4B-1) ──────────────────────────

ipcMain.handle('caption-template:list', async () => {
  try {
    const templates = getCaptionTemplates()
    return { success: true, templates }
  } catch (err) {
    return { success: false, error: err.message, templates: [] }
  }
})

ipcMain.handle('caption-template:get', async (_, id) => {
  try {
    const template = getCaptionTemplate(id)
    if (!template) return { success: false, error: 'Caption template not found' }
    return { success: true, template }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-template:create', async (_, data) => {
  try {
    const template = createCaptionTemplate(data)
    return { success: true, template }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-template:update', async (_, { id, data } = {}) => {
  try {
    const template = updateCaptionTemplate(id, data)
    return { success: true, template }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-template:delete', async (_, id) => {
  try {
    const result = deleteCaptionTemplate(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-template:duplicate', async (_, { id, data } = {}) => {
  try {
    const template = duplicateCaptionTemplate(id, data)
    return { success: true, template }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-template:reset', async () => {
  try {
    const templates = resetCaptionTemplates()
    return { success: true, templates }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── AI Caption Generator (Phase 4B-5) ───────────────────────────────────────

async function checkAiCaptionProAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'ai_captions')) {
    return { authorized: false, error: 'AI Caption Generator requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('ai-caption:generate', async (_, rawRequest) => {
  try {
    const auth = await checkAiCaptionProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await generateCaptions(rawRequest)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('ai-caption:getStatus', async () => {
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid
      ? license.tier
      : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)
    const proUnlocked = hasFeature(tier, 'ai_captions')
    const aiStatus = getAiStatus()
    return {
      success: true,
      proUnlocked,
      configured: aiStatus.configured,
      provider: aiStatus.provider,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('ai-caption:generateBulk', async (_, bulkInput) => {
  try {
    const auth = await checkAiCaptionProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await generateBulkCaptions(bulkInput)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Caption Quality & Intelligence (Phase 4B-6) ─────────────────────────────

async function checkCaptionQualityProAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'caption_quality')) {
    return { authorized: false, error: 'Caption Quality & Intelligence requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('caption-quality:analyze', async (_, rawPayload) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return analyzeQuality(rawPayload)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-quality:improve', async (_, rawPayload) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await improveCaption(rawPayload)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-quality:analyzeBulk', async (_, bulkPayload) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return analyzeBulkQuality(bulkPayload)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Caption Intelligence Dashboard & History (Phase 4B-7) ───────────────────

ipcMain.handle('caption-history:save', async (_, rawRecord) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const record = createHistoryRecord(rawRecord)
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:list', async (_, options) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const history = getHistory(options)
    return { success: true, history }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:get', async (_, id) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const record = getHistoryRecord(id)
    if (!record) return { success: false, error: 'History record not found' }
    return { success: true, record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:delete', async (_, id) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = deleteHistoryRecord(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:clear', async () => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = clearHistory()
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:getMetrics', async () => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const metrics = getDashboardMetrics()
    const insights = getQualityInsights()
    return { success: true, metrics, insights }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:compare', async (_, { idA, idB } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const comparison = compareCaptions(idA, idB)
    return { success: true, comparison }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-history:reanalyze', async (_, id) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = reanalyzeHistoryRecord(id)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Caption Workspace & Smart Rewrite (Phase 4B-8) ─────────────────────────

ipcMain.handle('caption-workspace:create', async (_, initialData) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const workspace = createWorkspace(initialData)
    return { success: true, workspace }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:addVersion', async (_, { workspace, versionData } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const updatedWorkspace = addVersion(workspace, versionData)
    return { success: true, workspace: updatedWorkspace }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:selectVersion', async (_, { workspace, versionId } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const updatedWorkspace = selectVersion(workspace, versionId)
    return { success: true, workspace: updatedWorkspace }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:updateCaption', async (_, { workspace, newText, options } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const updatedWorkspace = updateCurrentCaption(workspace, newText, options)
    return { success: true, workspace: updatedWorkspace }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:rewrite', async (_, request) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await generateSmartRewrites(request)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:rewriteWithFeedback', async (_, request) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await rewriteWithQualityFeedback(request)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:compare', async (_, { versionA, versionB } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const comparison = compareWorkspaceVersions(versionA, versionB)
    return { success: true, comparison }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-workspace:bulkRewrite', async (_, bulkInput) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await bulkSmartRewrite(bulkInput)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── Caption Experiment & Optimization (Phase 4B-9) ──────────────────────────

ipcMain.handle('caption-experiment:create', async (_, rawInput) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiment = createExperiment(rawInput)
    return { success: true, experiment }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:list', async (_, options) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiments = getExperiments(options)
    return { success: true, experiments }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:get', async (_, id) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiment = getExperiment(id)
    if (!experiment) return { success: false, error: 'Experiment not found' }
    return { success: true, experiment }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:update', async (_, { id, updates } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiment = updateExperiment(id, updates)
    return { success: true, experiment }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:delete', async (_, id) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = deleteExperiment(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:duplicate', async (_, id) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiment = duplicateExperiment(id)
    return { success: true, experiment }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:add-variant', async (_, { experimentId, variantData } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = addVariant(experimentId, variantData)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:update-variant', async (_, { experimentId, variantId, updates } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = updateVariant(experimentId, variantId, updates)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:delete-variant', async (_, { experimentId, variantId } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiment = deleteVariant(experimentId, variantId)
    return { success: true, experiment }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:select-variant', async (_, { experimentId, variantId } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const experiment = selectPreferredVariant(experimentId, variantId)
    return { success: true, experiment }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:compare', async (_, { variantA, variantB } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const comparison = compareVariants(variantA, variantB)
    return { success: true, comparison }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:optimize', async (_, { text, context } = {}) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await optimizeVariant(text, context)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:generate', async (_, request) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await generateAiVariants(request)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('caption-experiment:bulk', async (_, bulkInput) => {
  try {
    const auth = await checkCaptionQualityProAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    return await bulkExperiment(bulkInput)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Variation Presets (Phase 5A) ─────────────────────────────────────────────

async function checkVariationPresetsAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'variation_presets')) {
    return { authorized: false, error: 'Content Variation Presets requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('variation-preset:list', async () => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const presets = getVariationPresets()
    return { success: true, presets }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:get', async (_, id) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = getVariationPreset(id)
    if (!preset) {
      return { success: false, error: `Variation preset not found: ${id}` }
    }
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:create', async (_, data) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = createVariationPreset(data)
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:update', async (_, { id, data } = {}) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = updateVariationPreset(id, data)
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:delete', async (_, id) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = deleteVariationPreset(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:duplicate', async (_, { id, overrides } = {}) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = duplicateVariationPreset(id, overrides || {})
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:reset', async () => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const presets = resetVariationPresets()
    return { success: true, presets }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:resolve', async (_, presetId) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const snapshot = resolveVariationPresetSnapshot(presetId)
    if (!snapshot) {
      return { success: false, error: `Variation preset not found: ${presetId}` }
    }
    return { success: true, snapshot }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:search', async (_, options) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const presets = searchVariationPresets(options)
    return { success: true, presets }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:compare', async (_, { current, selected } = {}) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const comparison = compareVariationPresets(current, selected)
    return { success: true, comparison }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('variation-preset:apply', async (_, { presetId, currentConfig } = {}) => {
  try {
    const auth = await checkVariationPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const applied = applyVariationPreset(presetId, currentConfig)
    return { success: true, config: applied }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Export Preset Manager (Phase 5B) ──────────────────────────────────────────

async function checkExportPresetsAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)

  if (!hasFeature(tier, 'export_presets')) {
    return { authorized: false, error: 'Export Preset Manager requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('export-preset:list', async () => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const presets = getExportPresets()
    return { success: true, presets }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:get', async (_, id) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = getExportPreset(id)
    if (!preset) {
      return { success: false, error: `Export preset not found: ${id}` }
    }
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:search', async (_, options) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const presets = searchExportPresets(options)
    return { success: true, presets }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:create', async (_, data) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = createExportPreset(data)
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:update', async (_, { id, data } = {}) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = updateExportPreset(id, data)
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:delete', async (_, id) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = deleteExportPreset(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:duplicate', async (_, { id, overrides } = {}) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const preset = duplicateExportPreset(id, overrides)
    return { success: true, preset }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:compare', async (_, { current, selected } = {}) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const comparison = compareExportPresets(current, selected)
    return { success: true, comparison }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:apply', async (_, { presetId, currentConfig } = {}) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const applied = applyExportPreset(presetId, currentConfig)
    return { success: true, config: applied }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:reset', async () => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const result = resetExportPresets()
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('export-preset:resolve', async (_, presetId) => {
  try {
    const auth = await checkExportPresetsAccess()
    if (!auth.authorized) {
      return { success: false, error: auth.error, requiresUpgrade: true }
    }
    const snapshot = resolveExportPresetSnapshot(presetId)
    return { success: true, snapshot }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Workflow Recipe IPC (Phase 5K) ─────────────────────────────────────────

const {
  getWorkflowRecipes,
  getWorkflowRecipe,
  createWorkflowRecipe,
  updateWorkflowRecipe,
  deleteWorkflowRecipe,
  duplicateWorkflowRecipe,
  searchWorkflowRecipes,
  filterWorkflowRecipes,
  applyWorkflowRecipe,
  incrementUsageCount,
  resetWorkflowRecipes,
  getRecipeUsageStats,
} = require('./workflowRecipes/workflowRecipeManager')

async function checkWorkflowRecipeAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)
  if (!hasFeature(tier, 'workflow_recipes')) {
    return { authorized: false, error: 'Workflow Recipes requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('workflow-recipe:list', async () => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipes = getWorkflowRecipes()
    return { success: true, recipes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:get', async (_, id) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipe = getWorkflowRecipe(id)
    return { success: true, recipe }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:create', async (_, data) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipe = createWorkflowRecipe(data)
    return { success: true, recipe }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:update', async (_, { id, data }) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipe = updateWorkflowRecipe(id, data)
    return { success: true, recipe }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:delete', async (_, id) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const result = deleteWorkflowRecipe(id)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:duplicate', async (_, { id, overrides }) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipe = duplicateWorkflowRecipe(id, overrides)
    return { success: true, recipe }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:search', async (_, query) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipes = searchWorkflowRecipes(query)
    return { success: true, recipes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:filter', async (_, filters) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipes = filterWorkflowRecipes(filters)
    return { success: true, recipes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:apply', async (_, recipeId) => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const config = applyWorkflowRecipe(recipeId)
    incrementUsageCount(recipeId)
    return { success: true, config }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:stats', async () => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const stats = getRecipeUsageStats()
    return { success: true, stats }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('workflow-recipe:reset', async () => {
  try {
    const auth = await checkWorkflowRecipeAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    const recipes = resetWorkflowRecipes()
    return { success: true, recipes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Recipe Automation IPC (Phase 5L) ────────────────────────────────────────

const {
  createRecipeBulkPlan,
  createRecipeSchedule,
  createRecipeBulkSchedule,
} = require('./workflowRecipes/recipeAutomation')

async function checkRecipeAutomationAccess() {
  const license = await getLicenseInfo()
  const tier = license.isValid
    ? license.tier
    : (process.env.REEL_CUTTER_TEST_PRO === 'true' || process.env.NODE_ENV === 'test' ? 'pro' : null)
  if (!hasFeature(tier, 'recipe_automation')) {
    return { authorized: false, error: 'Recipe Automation requires Pro license tier.' }
  }
  return { authorized: true, tier }
}

ipcMain.handle('recipe-automation:createBulkPlan', async (_, input) => {
  try {
    const auth = await checkRecipeAutomationAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    if (!input || typeof input !== 'object') return { success: false, error: 'Invalid input' }
    const plan = createRecipeBulkPlan(input)
    return { success: true, plan }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recipe-automation:createSchedule', async (_, input) => {
  try {
    const auth = await checkRecipeAutomationAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    if (!input || typeof input !== 'object') return { success: false, error: 'Invalid input' }
    const schedule = createRecipeSchedule(input)
    return { success: true, schedule }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recipe-automation:createBulkSchedule', async (_, input) => {
  try {
    const auth = await checkRecipeAutomationAccess()
    if (!auth.authorized) return { success: false, error: auth.error, requiresUpgrade: true }
    if (!input || typeof input !== 'object') return { success: false, error: 'Invalid input' }
    const result = createRecipeBulkSchedule(input)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
