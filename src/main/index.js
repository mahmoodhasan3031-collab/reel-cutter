const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { getVideoMetadata } = require('../engine/probe')
const { cutClip, splitIntoReels } = require('../engine/cutter')

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
  const { inputPath, outputPath, start, duration, end, reel, mode } = opts
  try {
    const result = await cutClip(inputPath, outputPath, {
      start,
      duration,
      end,
      reel: reel || false,
      mode: mode || 'blur',
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
  const { inputPath, outputPath, start, duration, mode } = opts
  try {
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

// ─── Open in Explorer ─────────────────────────────────────────────────────────

ipcMain.on('shell:showItemInFolder', (_, filePath) => {
  shell.showItemInFolder(filePath)
})
