const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── File / Directory Pickers ───────────────────────────────────────────────
  selectFile: () => ipcRenderer.invoke('video:selectFile'),
  selectDir: () => ipcRenderer.invoke('video:selectDir'),
  saveFile: (defaultName) => ipcRenderer.invoke('video:saveFile', defaultName),

  // ── Video Operations ───────────────────────────────────────────────────────
  probe: (filePath) => ipcRenderer.invoke('video:probe', filePath),
  cut: (opts) => ipcRenderer.invoke('video:cut', opts),
  reel: (opts) => ipcRenderer.invoke('video:reel', opts),
  split: (opts) => ipcRenderer.invoke('video:split', opts),

  // ── Pro Video Features (Tier Gated) ───────────────────────────────────────
  generateAiThumbnails: (opts) => ipcRenderer.invoke('video:aiThumbnails', opts),
  smartCrop: (opts) => ipcRenderer.invoke('video:smartCrop', opts),
  batchQueue: (opts) => ipcRenderer.invoke('video:batchQueue', opts),

  // ── Licensing & Feature Gating ─────────────────────────────────────────────
  checkLicense: () => ipcRenderer.invoke('license:check'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  getLicenseInfo: () => ipcRenderer.invoke('license:getInfo'),
  hasFeature: (featureName) => ipcRenderer.invoke('license:hasFeature', featureName),

  // ── Push Events (Main → Renderer) ─────────────────────────────────────────
  onProgress: (cb) => ipcRenderer.on('video:progress', (_, data) => cb(data)),
  onDone: (cb) => ipcRenderer.on('video:done', (_, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('video:error', (_, data) => cb(data)),
  onSegment: (cb) => ipcRenderer.on('video:segment', (_, data) => cb(data)),

  // ── Cleanup ───────────────────────────────────────────────────────────────
  off: (channel) => ipcRenderer.removeAllListeners(channel),

  // ── Window Controls (frameless) ───────────────────────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  closeApp: () => ipcRenderer.send('window:close'),

  // ── Shell ─────────────────────────────────────────────────────────────────
  showInFolder: (filePath) => ipcRenderer.send('shell:showItemInFolder', filePath),
});
