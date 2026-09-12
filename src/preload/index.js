const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── File / Directory Pickers ───────────────────────────────────────────────
  selectFile: () => ipcRenderer.invoke('video:selectFile'),
  selectFiles: () => ipcRenderer.invoke('video:selectFiles'),
  selectDir: () => ipcRenderer.invoke('video:selectDir'),
  saveFile: (defaultName) => ipcRenderer.invoke('video:saveFile', defaultName),

  // ── Video Operations ───────────────────────────────────────────────────────
  probe: (filePath) => ipcRenderer.invoke('video:probe', filePath),
  cut: (opts) => ipcRenderer.invoke('video:cut', opts),
  reel: (opts) => ipcRenderer.invoke('video:reel', opts),
  split: (opts) => ipcRenderer.invoke('video:split', opts),
  applyContentVariation: (opts) => ipcRenderer.invoke('video:variation', opts),
  variation: (opts) => ipcRenderer.invoke('video:variation', opts),

  // ── Pro Video Features (Tier Gated) ───────────────────────────────────────
  generateThumbnail: (opts) => ipcRenderer.invoke('video:generateThumbnail', opts),
  readImageBase64: (filePath) => ipcRenderer.invoke('video:readImageBase64', filePath),
  generateAiThumbnails: (opts) => ipcRenderer.invoke('video:aiThumbnails', opts),
  smartCrop: (opts) => ipcRenderer.invoke('video:smartCrop', opts),
  batchQueue: (opts) => ipcRenderer.invoke('video:batchQueue', opts),
  batchAdd: (items) => ipcRenderer.invoke('batch:add', items),
  batchUpdateItem: (id, updates) => ipcRenderer.invoke('batch:updateItem', { id, updates }),
  batchRemove: (id) => ipcRenderer.invoke('batch:remove', id),
  batchClearCompleted: () => ipcRenderer.invoke('batch:clearCompleted'),
  batchStart: (opts) => ipcRenderer.invoke('batch:start', opts),
  batchPause: () => ipcRenderer.invoke('batch:pause'),
  batchCancelItem: (id) => ipcRenderer.invoke('batch:cancelItem', id),
  batchCancelAll: () => ipcRenderer.invoke('batch:cancelAll'),
  batchGetState: () => ipcRenderer.invoke('batch:getState'),
  batchSetConcurrency: (concurrency) => ipcRenderer.invoke('batch:setConcurrency', concurrency),

  // ── Licensing & Feature Gating ─────────────────────────────────────────────
  checkLicense: () => ipcRenderer.invoke('license:check'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  getLicenseInfo: () => ipcRenderer.invoke('license:getInfo'),
  hasFeature: (featureName) => ipcRenderer.invoke('license:hasFeature', featureName),
  notifyOnline: () => ipcRenderer.invoke('license:networkOnline'),
  onLicenseStatusChanged: (cb) => ipcRenderer.on('license:statusChanged', (_, data) => cb(data)),

  // ── Page Profiles (Phase 2A) ───────────────────────────────────────────────
  getProfiles: () => ipcRenderer.invoke('profile:list'),
  createProfile: (data) => ipcRenderer.invoke('profile:create', data),
  updateProfile: (id, updates) => ipcRenderer.invoke('profile:update', { id, updates }),
  deleteProfile: (id) => ipcRenderer.invoke('profile:delete', id),
  duplicateProfile: (id) => ipcRenderer.invoke('profile:duplicate', id),
  setSelectedProfile: (id) => ipcRenderer.invoke('profile:setSelected', id),

  // ── Auto-Updater ───────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:getStatus'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  // ── Push Events (Main → Renderer) ─────────────────────────────────────────
  onProgress: (cb) => ipcRenderer.on('video:progress', (_, data) => cb(data)),
  onDone: (cb) => ipcRenderer.on('video:done', (_, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('video:error', (_, data) => cb(data)),
  onSegment: (cb) => ipcRenderer.on('video:segment', (_, data) => cb(data)),
  onBatchItemUpdate: (cb) => ipcRenderer.on('batch:itemUpdate', (_, data) => cb(data)),
  onBatchQueueUpdate: (cb) => ipcRenderer.on('batch:queueUpdate', (_, data) => cb(data)),
  onBatchQueueDone: (cb) => ipcRenderer.on('batch:queueDone', (_, data) => cb(data)),
  onUpdateStatus: (cb) => ipcRenderer.on('updater:status', (_, data) => cb(data)),

  // ── Cleanup ───────────────────────────────────────────────────────────────
  off: (channel) => ipcRenderer.removeAllListeners(channel),

  // ── Window Controls (frameless) ───────────────────────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  closeApp: () => ipcRenderer.send('window:close'),

  // ── Shell ─────────────────────────────────────────────────────────────────
  showInFolder: (filePath) => ipcRenderer.send('shell:showItemInFolder', filePath),
});
