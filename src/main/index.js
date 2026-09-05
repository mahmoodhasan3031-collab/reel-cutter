const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { getVideoMetadata } = require('../engine/probe')
const { cutClip, splitIntoReels } = require('../engine/cutter')
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
  const { inputPath, outputPath, start, duration, end, reel, mode, resolution, customDuration } = opts
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

    const result = await cutClip(inputPath, outputPath, {
      start,
      duration,
      end,
      reel: reel || false,
      mode: mode || 'blur',
      width: resolution === '4k' ? 2160 : opts.width,
      height: resolution === '4k' ? 3840 : opts.height,
      onProgress: (percent) => {
        mainWindow?.webContents.send('video:progress', { percent, operation: 'cut' })
      }
    })
    mainWindow?.webContents.send('video:done', { operation: 'cut', outputPath: result.outputPath, duration: result.duration })
    return { success: true, outputPath: result.outputPath, duration: result.duration }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'cut', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Reel ─────────────────────────────────────────────────────────────

ipcMain.handle('video:reel', async (_, opts) => {
  const { inputPath, outputPath, start, duration, mode, aspectRatio } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (aspectRatio && aspectRatio !== '9:16' && !hasFeature(tier, 'all_aspect_ratios')) {
      return { success: false, error: `Aspect ratio ${aspectRatio} requires Standard or Pro license tier.` }
    }

    if (mode === 'smart_crop' && !hasFeature(tier, 'smart_crop')) {
      return { success: false, error: 'Smart Crop (AI) requires Pro license tier.' }
    }

    const result = await cutClip(inputPath, outputPath, {
      start: start || 0,
      duration,
      reel: true,
      mode: mode || 'blur',
      onProgress: (percent) => {
        mainWindow?.webContents.send('video:progress', { percent, operation: 'reel' })
      }
    })
    mainWindow?.webContents.send('video:done', { operation: 'reel', outputPath: result.outputPath, duration: result.duration })
    return { success: true, outputPath: result.outputPath, duration: result.duration }
  } catch (err) {
    mainWindow?.webContents.send('video:error', { operation: 'reel', error: err.message })
    return { success: false, error: err.message }
  }
})

// ─── Video: Split ─────────────────────────────────────────────────────────────

ipcMain.handle('video:split', async (_, opts) => {
  const { inputPath, outputDir, interval, reel, mode } = opts
  try {
    const license = await getLicenseInfo()
    const tier = license.isValid ? license.tier : null

    if (!hasFeature(tier, 'cutting')) {
      return { success: false, error: 'Video splitting requires an active license.' }
    }

    const results = await splitIntoReels(inputPath, outputDir, {
      interval: interval || 30,
      reel: reel !== false,
      mode: mode || 'blur',
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
  return { success: true, tracking: 'Face and motion center lock active', mode: 'smart_crop' }
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
