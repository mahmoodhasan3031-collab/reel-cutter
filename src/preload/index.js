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
  createBulkExportPlan: (options) => ipcRenderer.invoke('profile:createPlan', options),
  executeBulkExport: (options) => ipcRenderer.invoke('profile:executePlan', options),
  cancelBulkExport: (planId) => ipcRenderer.invoke('profile:cancelPlan', planId),
  cancelBulkJob: (jobId) => ipcRenderer.invoke('profile:cancelJob', jobId),
  getBulkVariationTemplates: () => ipcRenderer.invoke('profile:getTemplates'),

  // ── Intelligent Profile Configuration (Phase 5C) ──────────────────────────
  resolveProfileConfiguration: (profileId) => ipcRenderer.invoke('profile:resolveConfiguration', profileId),
  getProfileConfigurationStatus: (profileId) => ipcRenderer.invoke('profile:getConfigurationStatus', profileId),
  previewProfile: (profileId) => ipcRenderer.invoke('profile:preview', profileId),
  diffProfiles: (profileIdA, profileIdB) => ipcRenderer.invoke('profile:diff', { profileIdA, profileIdB }),
  applyProfileConfiguration: (profileId, currentConfig) => ipcRenderer.invoke('profile:applyConfiguration', { profileId, currentConfig }),
  validateProfileOverrides: (overrides) => ipcRenderer.invoke('profile:validateOverrides', overrides),

  // ── Intelligent Bulk Export (Phase 5D) ──────────────────────────────────────
  validateBulkPlan: (plan) => ipcRenderer.invoke('bulk:validatePlan', plan),
  detectBulkConflicts: (plan) => ipcRenderer.invoke('bulk:detectConflicts', plan),
  getBulkPreflight: (plan) => ipcRenderer.invoke('bulk:preflight', plan),
  getBulkSummaryText: (plan) => ipcRenderer.invoke('bulk:summaryText', plan),
  duplicateBulkPlan: (plan) => ipcRenderer.invoke('bulk:duplicatePlan', plan),
  exportAgainBulk: (previousPlan) => ipcRenderer.invoke('bulk:exportAgain', previousPlan),
  getBulkQueueState: () => ipcRenderer.invoke('bulk:getQueueState'),
  retryBulkFailed: (planId, previousQueueState) => ipcRenderer.invoke('bulk:retryFailed', { planId, previousQueueState }),
  getBulkExecutionSummary: (planId) => ipcRenderer.invoke('bulk:getExecutionSummary', planId),

  // ── Scheduler (Phase 3A / 3B / 3C) ────────────────────────────────────────
  createSchedule: (data) => ipcRenderer.invoke('schedule:create', data),
  createBulkSchedule: (data) => ipcRenderer.invoke('schedule:createBulk', data),
  getSchedules: () => ipcRenderer.invoke('schedule:list'),
  getSchedule: (id) => ipcRenderer.invoke('schedule:get', id),
  cancelSchedule: (id) => ipcRenderer.invoke('schedule:cancel', id),
  deleteSchedule: (id) => ipcRenderer.invoke('schedule:delete', id),
  pauseSchedule: (id) => ipcRenderer.invoke('schedule:pause', id),
  resumeSchedule: (id) => ipcRenderer.invoke('schedule:resume', id),
  updateSchedule: (id, changes) => ipcRenderer.invoke('schedule:update', { id, changes }),
  getScheduleGroupSummary: (planId) => ipcRenderer.invoke('schedule:getGroupSummary', planId),
  cancelScheduleGroup: (planId) => ipcRenderer.invoke('schedule:cancelGroup', planId),
  deleteScheduleGroupHistory: (planId) => ipcRenderer.invoke('schedule:deleteGroupHistory', planId),
  onScheduleUpdate: (cb) => ipcRenderer.on('schedule:update', (_, data) => cb(data)),
  onScheduleProgress: (cb) => ipcRenderer.on('schedule:progress', (_, data) => cb(data)),

  // ── Text Overlay (Phase 4A) ────────────────────────────────────────────────
  validateTextOverlays: (overlays) => ipcRenderer.invoke('text-overlay:validate', overlays),
  getTextOverlayDefaults: () => ipcRenderer.invoke('text-overlay:defaults'),

  // ── Caption Templates (Phase 4B-1) ─────────────────────────────────────────
  getCaptionTemplates: () => ipcRenderer.invoke('caption-template:list'),
  getCaptionTemplate: (id) => ipcRenderer.invoke('caption-template:get', id),
  createCaptionTemplate: (data) => ipcRenderer.invoke('caption-template:create', data),
  updateCaptionTemplate: (id, data) => ipcRenderer.invoke('caption-template:update', { id, data }),
  deleteCaptionTemplate: (id) => ipcRenderer.invoke('caption-template:delete', id),
  duplicateCaptionTemplate: (id, data) => ipcRenderer.invoke('caption-template:duplicate', { id, data }),
  resetCaptionTemplates: () => ipcRenderer.invoke('caption-template:reset'),

  // ── AI Caption Generator (Phase 4B-5) ──────────────────────────────────────
  generateAiCaptions: (request) => ipcRenderer.invoke('ai-caption:generate', request),
  getAiCaptionStatus: () => ipcRenderer.invoke('ai-caption:getStatus'),
  generateBulkAiCaptions: (data) => ipcRenderer.invoke('ai-caption:generateBulk', data),

  // ── Caption Quality & Intelligence (Phase 4B-6) ───────────────────────────
  analyzeCaptionQuality: (payload) => ipcRenderer.invoke('caption-quality:analyze', payload),
  improveCaptionQuality: (payload) => ipcRenderer.invoke('caption-quality:improve', payload),
  analyzeBulkCaptionQuality: (payload) => ipcRenderer.invoke('caption-quality:analyzeBulk', payload),

  // ── Caption Intelligence Dashboard & History (Phase 4B-7) ─────────────────
  saveCaptionHistory: (record) => ipcRenderer.invoke('caption-history:save', record),
  getCaptionHistory: (options) => ipcRenderer.invoke('caption-history:list', options),
  getCaptionHistoryRecord: (id) => ipcRenderer.invoke('caption-history:get', id),
  deleteCaptionHistoryRecord: (id) => ipcRenderer.invoke('caption-history:delete', id),
  clearCaptionHistory: () => ipcRenderer.invoke('caption-history:clear'),
  getCaptionDashboardMetrics: () => ipcRenderer.invoke('caption-history:getMetrics'),
  compareCaptionHistory: (idA, idB) => ipcRenderer.invoke('caption-history:compare', { idA, idB }),
  reanalyzeCaptionHistory: (id) => ipcRenderer.invoke('caption-history:reanalyze', id),

  // ── Caption Workspace & Smart Rewrite (Phase 4B-8) ─────────────────────────
  createCaptionWorkspace: (data) => ipcRenderer.invoke('caption-workspace:create', data),
  addWorkspaceVersion: (ws, vd) => ipcRenderer.invoke('caption-workspace:addVersion', { workspace: ws, versionData: vd }),
  selectWorkspaceVersion: (ws, versionId) => ipcRenderer.invoke('caption-workspace:selectVersion', { workspace: ws, versionId }),
  updateWorkspaceCaption: (ws, text, opts) => ipcRenderer.invoke('caption-workspace:updateCaption', { workspace: ws, newText: text, options: opts }),
  generateSmartRewrites: (request) => ipcRenderer.invoke('caption-workspace:rewrite', request),
  rewriteWithQualityFeedback: (request) => ipcRenderer.invoke('caption-workspace:rewriteWithFeedback', request),
  compareWorkspaceVersions: (vA, vB) => ipcRenderer.invoke('caption-workspace:compare', { versionA: vA, versionB: vB }),
  bulkSmartRewrite: (input) => ipcRenderer.invoke('caption-workspace:bulkRewrite', input),

  // ── Caption Experiment & Optimization (Phase 4B-9) ─────────────────────────
  createCaptionExperiment: (data) => ipcRenderer.invoke('caption-experiment:create', data),
  getCaptionExperiments: (options) => ipcRenderer.invoke('caption-experiment:list', options),
  getCaptionExperiment: (id) => ipcRenderer.invoke('caption-experiment:get', id),
  updateCaptionExperiment: (id, updates) => ipcRenderer.invoke('caption-experiment:update', { id, updates }),
  deleteCaptionExperiment: (id) => ipcRenderer.invoke('caption-experiment:delete', id),
  duplicateCaptionExperiment: (id) => ipcRenderer.invoke('caption-experiment:duplicate', id),
  addCaptionExperimentVariant: (experimentId, variantData) => ipcRenderer.invoke('caption-experiment:add-variant', { experimentId, variantData }),
  updateCaptionExperimentVariant: (experimentId, variantId, updates) => ipcRenderer.invoke('caption-experiment:update-variant', { experimentId, variantId, updates }),
  deleteCaptionExperimentVariant: (experimentId, variantId) => ipcRenderer.invoke('caption-experiment:delete-variant', { experimentId, variantId }),
  selectCaptionExperimentVariant: (experimentId, variantId) => ipcRenderer.invoke('caption-experiment:select-variant', { experimentId, variantId }),
  compareCaptionExperimentVariants: (variantA, variantB) => ipcRenderer.invoke('caption-experiment:compare', { variantA, variantB }),
  optimizeCaptionExperimentVariant: (text, context) => ipcRenderer.invoke('caption-experiment:optimize', { text, context }),
  generateCaptionExperimentVariants: (request) => ipcRenderer.invoke('caption-experiment:generate', request),
  bulkCaptionExperiment: (input) => ipcRenderer.invoke('caption-experiment:bulk', input),

  // ── Content Variation Presets (Phase 5A) ────────────────────────────────────
  getVariationPresets: () => ipcRenderer.invoke('variation-preset:list'),
  getVariationPreset: (id) => ipcRenderer.invoke('variation-preset:get', id),
  searchVariationPresets: (options) => ipcRenderer.invoke('variation-preset:search', options),
  createVariationPreset: (data) => ipcRenderer.invoke('variation-preset:create', data),
  updateVariationPreset: (id, data) => ipcRenderer.invoke('variation-preset:update', { id, data }),
  deleteVariationPreset: (id) => ipcRenderer.invoke('variation-preset:delete', id),
  duplicateVariationPreset: (id, overrides) => ipcRenderer.invoke('variation-preset:duplicate', { id, overrides }),
  compareVariationPresets: (current, selected) => ipcRenderer.invoke('variation-preset:compare', { current, selected }),
  applyVariationPreset: (presetId, currentConfig) => ipcRenderer.invoke('variation-preset:apply', { presetId, currentConfig }),
  resetVariationPresets: () => ipcRenderer.invoke('variation-preset:reset'),
  resolveVariationPreset: (presetId) => ipcRenderer.invoke('variation-preset:resolve', presetId),

  // ── Export Preset Manager (Phase 5B) ────────────────────────────────────────
  getExportPresets: () => ipcRenderer.invoke('export-preset:list'),
  getExportPreset: (id) => ipcRenderer.invoke('export-preset:get', id),
  searchExportPresets: (options) => ipcRenderer.invoke('export-preset:search', options),
  createExportPreset: (data) => ipcRenderer.invoke('export-preset:create', data),
  updateExportPreset: (id, data) => ipcRenderer.invoke('export-preset:update', { id, data }),
  deleteExportPreset: (id) => ipcRenderer.invoke('export-preset:delete', id),
  duplicateExportPreset: (id, overrides) => ipcRenderer.invoke('export-preset:duplicate', { id, overrides }),
  compareExportPresets: (current, selected) => ipcRenderer.invoke('export-preset:compare', { current, selected }),
  applyExportPreset: (presetId, currentConfig) => ipcRenderer.invoke('export-preset:apply', { presetId, currentConfig }),
  resetExportPresets: () => ipcRenderer.invoke('export-preset:reset'),
  resolveExportPreset: (presetId) => ipcRenderer.invoke('export-preset:resolve', presetId),

  // ── Export History & Organization (Phase 5E) ───────────────────────────────
  createExportHistoryRecord: (record) => ipcRenderer.invoke('export-history:create', record),
  getExportHistory: (options) => ipcRenderer.invoke('export-history:list', options),
  getExportHistoryRecord: (id) => ipcRenderer.invoke('export-history:get', id),
  updateExportHistoryRecord: (id, updates) => ipcRenderer.invoke('export-history:update', { id, updates }),
  deleteExportHistoryRecord: (id) => ipcRenderer.invoke('export-history:delete', id),
  clearExportHistory: () => ipcRenderer.invoke('export-history:clear'),
  getExportHistoryByPlan: (planId) => ipcRenderer.invoke('export-history:getByPlan', planId),
  getExportHistoryByJob: (jobId) => ipcRenderer.invoke('export-history:getByJob', jobId),
  getExportHistoryStats: () => ipcRenderer.invoke('export-history:getStats'),
  getExportAgainConfig: (id) => ipcRenderer.invoke('export-history:getExportAgainConfig', id),
  canRetryExport: (id) => ipcRenderer.invoke('export-history:canRetry', id),

  // ── Export History Intelligence (Phase 5F) ───────────────────────────────
  groupExportHistory: (records, groupBy) => ipcRenderer.invoke('export-history-intelligence:group', { records, groupBy }),
  getExportHistoryTimeline: (records) => ipcRenderer.invoke('export-history-intelligence:getTimeline', { records }),
  getExportHistoryFilteredStats: (records) => ipcRenderer.invoke('export-history-intelligence:getFilteredStats', { records }),
  exportHistoryToCSV: (records) => ipcRenderer.invoke('export-history-intelligence:exportCSV', { records }),
  exportHistoryToJSON: (records) => ipcRenderer.invoke('export-history-intelligence:exportJSON', { records }),
  filterExportHistoryByTag: (records, tag) => ipcRenderer.invoke('export-history-intelligence:filterByTag', { records, tag }),
  getExportHistoryVisibleIds: (records, selectedIds) => ipcRenderer.invoke('export-history-intelligence:getVisibleIds', { records, selectedIds }),
  bulkDeleteExportHistory: (ids) => ipcRenderer.invoke('export-history-intelligence:bulkDelete', { ids }),
  bulkGetExportAgainConfigs: (ids) => ipcRenderer.invoke('export-history-intelligence:bulkExportAgainConfig', { ids }),
  bulkCanRetryExportHistory: (ids) => ipcRenderer.invoke('export-history-intelligence:bulkCanRetry', { ids }),
  createExportHistoryRetryRecord: (originalId) => ipcRenderer.invoke('export-history-intelligence:createRetryRecord', { originalId }),
  getExportHistoryAttemptHistory: (attemptGroupId) => ipcRenderer.invoke('export-history-intelligence:getAttemptHistory', { attemptGroupId }),
  addExportHistoryTag: (id, tag) => ipcRenderer.invoke('export-history-intelligence:addTag', { id, tag }),
  removeExportHistoryTag: (id, tag) => ipcRenderer.invoke('export-history-intelligence:removeTag', { id, tag }),
  setExportHistoryNote: (id, note) => ipcRenderer.invoke('export-history-intelligence:setNote', { id, note }),

  // ── Saved Views (Phase 5F) ───────────────────────────────────────────────
  createExportHistoryView: (view) => ipcRenderer.invoke('export-history-views:create', { view }),
  getExportHistoryViews: () => ipcRenderer.invoke('export-history-views:list'),
  getExportHistoryView: (id) => ipcRenderer.invoke('export-history-views:get', { id }),
  updateExportHistoryView: (id, updates) => ipcRenderer.invoke('export-history-views:update', { id, updates }),
  deleteExportHistoryView: (id) => ipcRenderer.invoke('export-history-views:delete', { id }),
  duplicateExportHistoryView: (id) => ipcRenderer.invoke('export-history-views:duplicate', { id }),

  // ── Export Recovery Center (Phase 5G) ────────────────────────────────────
  checkOutputHealth: (outputPath) => ipcRenderer.invoke('recovery:checkOutputHealth', { outputPath }),
  batchCheckOutputHealth: (recordIds) => ipcRenderer.invoke('recovery:batchCheckOutputHealth', { recordIds }),
  checkRecoveryRetryReadiness: (recordId) => ipcRenderer.invoke('recovery:checkRetryReadiness', { recordId }),
  batchCheckRecoveryRetryReadiness: (recordIds) => ipcRenderer.invoke('recovery:batchCheckRetryReadiness', { recordIds }),
  getRecoveryDiagnostics: (recordId) => ipcRenderer.invoke('recovery:getDiagnostics', { recordId }),
  retryFailedExport: (recordId) => ipcRenderer.invoke('recovery:retryFailed', { recordId }),
  exportAgainMissingOutput: (recordId) => ipcRenderer.invoke('recovery:exportAgainMissing', { recordId }),
  bulkRetryFailed: (recordIds) => ipcRenderer.invoke('recovery:bulkRetryFailed', { recordIds }),
  bulkExportAgainMissing: (recordIds) => ipcRenderer.invoke('recovery:bulkExportAgainMissing', { recordIds }),
  archiveExportRecord: (id) => ipcRenderer.invoke('recovery:archive', { id }),
  unarchiveExportRecord: (id) => ipcRenderer.invoke('recovery:unarchive', { id }),
  bulkArchiveExports: (ids) => ipcRenderer.invoke('recovery:bulkArchive', { ids }),
  bulkUnarchiveExports: (ids) => ipcRenderer.invoke('recovery:bulkUnarchive', { ids }),
  pinExportRecord: (id) => ipcRenderer.invoke('recovery:pin', { id }),
  unpinExportRecord: (id) => ipcRenderer.invoke('recovery:unpin', { id }),
  bulkPinExports: (ids) => ipcRenderer.invoke('recovery:bulkPin', { ids }),
  bulkUnpinExports: (ids) => ipcRenderer.invoke('recovery:bulkUnpin', { ids }),
  getRecoveryWorkspaceSummary: (records) => ipcRenderer.invoke('recovery:getWorkspaceSummary', { records }),
  getRecoveryWorkspaceView: (records) => ipcRenderer.invoke('recovery:getWorkspaceView', { records }),
  getRecoveryNeedsAttention: (records) => ipcRenderer.invoke('recovery:getNeedsAttention', { records }),
  getRecoveryAttemptDisplay: (record, recordId) => ipcRenderer.invoke('recovery:getAttemptDisplay', { record, recordId }),
  normalizeRecoveryError: (error) => ipcRenderer.invoke('recovery:normalizeError', { error }),
  validateRecoveryDirectory: (dirPath) => ipcRenderer.invoke('recovery:validateDirectory', { dirPath }),
  validateRecoveryOpenable: (filePath) => ipcRenderer.invoke('recovery:validateOpenable', { filePath }),

  // ── Export Intelligence Dashboard (Phase 5H) ──────────────────────────────
  getAnalyticsDashboard: (options) => ipcRenderer.invoke('analytics:getDashboard', options),
  compareAnalyticsProfiles: (profileIds) => ipcRenderer.invoke('analytics:compareProfiles', { profileIds }),
  compareAnalyticsPresets: (presetIds, presetType) => ipcRenderer.invoke('analytics:comparePresets', { presetIds, presetType }),
  exportAnalyticsJSON: (options) => ipcRenderer.invoke('analytics:exportJSON', options),
  exportAnalyticsCSV: (options) => ipcRenderer.invoke('analytics:exportCSV', options),
  saveAnalyticsToFile: (format, options, defaultPath) => ipcRenderer.invoke('analytics:saveToFile', { format, options, defaultPath }),

  // ── Export Command Center (Phase 5I) ───────────────────────────────────────
  getCommandCenterSnapshot: (options) => ipcRenderer.invoke('commandcenter:getSnapshot', options),
  retryCommandCenterFailed: (historyId) => ipcRenderer.invoke('commandcenter:retryFailed', { historyId }),
  exportAgainCommandCenterMissing: (historyId) => ipcRenderer.invoke('commandcenter:exportAgainMissing', { historyId }),

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
