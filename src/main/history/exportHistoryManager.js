'use strict';

/**
 * Export History Manager — Phase 5E
 *
 * Persistent local history store for completed export executions.
 * Manages atomic persistence, recovery from corruption, 1000-record FIFO limit,
 * CRUD operations, search, sort, filtering, statistics, and export-again support.
 *
 * Storage location: %APPDATA%/Reel Cutter/export-history.json
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILENAME = 'export-history.json';
const MAX_HISTORY_LIMIT = 1000;

const EXPORT_HISTORY_STATUS = {
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  SKIPPED: 'SKIPPED',
};

let _counter = 0;
function generateHistoryId() {
  return `exh_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Resolves the path to export-history.json.
 * @param {string} [customDir]
 * @returns {string}
 */
function getHistoryFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, HISTORY_FILENAME);
  }
  try {
    const { app } = require('electron');
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, HISTORY_FILENAME);
  } catch {
    return path.join(process.cwd(), HISTORY_FILENAME);
  }
}

/**
 * Validates and normalizes a raw history record input.
 * Throws descriptive errors for invalid input.
 * @param {Object} raw
 * @returns {Object} Normalized record fields
 */
function validateExportHistoryInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Export history record must be a valid object');
  }

  // Source
  const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const sourceName = typeof source.name === 'string' ? source.name.trim().slice(0, 300) : '';
  const sourcePath = typeof source.path === 'string' ? source.path.trim().slice(0, 1000) : '';

  if (!sourceName && !sourcePath) {
    throw new Error('Export history record requires at least source name or source path');
  }

  // Export type
  const validExportTypes = ['cut', 'reel', 'split', null];
  const exportType = raw.exportType && validExportTypes.includes(raw.exportType) ? raw.exportType : null;

  // Profile
  const profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  const profileId = typeof profile.id === 'string' ? profile.id.trim().slice(0, 100) : null;
  const profileName = typeof profile.name === 'string' ? profile.name.trim().slice(0, 100) : null;
  const platform = typeof profile.platform === 'string' ? profile.platform.trim().slice(0, 50) : null;

  // Presets
  const exportPreset = raw.exportPreset && typeof raw.exportPreset === 'object' ? raw.exportPreset : {};
  const exportPresetId = typeof exportPreset.id === 'string' ? exportPreset.id.trim().slice(0, 100) : null;
  const exportPresetName = typeof exportPreset.name === 'string' ? exportPreset.name.trim().slice(0, 100) : null;

  const variationPreset = raw.variationPreset && typeof raw.variationPreset === 'object' ? raw.variationPreset : {};
  const variationPresetId = typeof variationPreset.id === 'string' ? variationPreset.id.trim().slice(0, 100) : null;
  const variationPresetName = typeof variationPreset.name === 'string' ? variationPreset.name.trim().slice(0, 100) : null;

  const captionTemplate = raw.captionTemplate && typeof raw.captionTemplate === 'object' ? raw.captionTemplate : {};
  const captionTemplateId = typeof captionTemplate.id === 'string' ? captionTemplate.id.trim().slice(0, 100) : null;
  const captionTemplateName = typeof captionTemplate.name === 'string' ? captionTemplate.name.trim().slice(0, 100) : null;

  // Output
  const output = raw.output && typeof raw.output === 'object' ? raw.output : {};
  const outputPath = typeof output.path === 'string' ? output.path.trim().slice(0, 1000) : '';
  const outputDirectory = typeof output.directory === 'string' ? output.directory.trim().slice(0, 1000) : '';
  const outputFilename = typeof output.filename === 'string' ? output.filename.trim().slice(0, 300) : '';

  // Status
  const validStatuses = Object.values(EXPORT_HISTORY_STATUS);
  const status = validStatuses.includes(raw.status) ? raw.status : EXPORT_HISTORY_STATUS.COMPLETED;

  // Error
  const error = typeof raw.error === 'string' ? raw.error.trim().slice(0, 500) : null;

  // Plan/Job relationships
  const planId = typeof raw.planId === 'string' ? raw.planId.trim().slice(0, 100) : null;
  const jobId = typeof raw.jobId === 'string' ? raw.jobId.trim().slice(0, 100) : null;

  // Settings snapshot — deep clone for immutability
  const settingsSnapshot = raw.settingsSnapshot && typeof raw.settingsSnapshot === 'object'
    ? JSON.parse(JSON.stringify(raw.settingsSnapshot))
    : null;

  // Phase 5F fields — pass through with light validation
  const tags = Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string').slice(0, 10) : undefined;
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 500) : undefined;
  const attemptGroupId = typeof raw.attemptGroupId === 'string' ? raw.attemptGroupId.trim().slice(0, 100) : undefined;
  const parentHistoryId = typeof raw.parentHistoryId === 'string' ? raw.parentHistoryId.trim().slice(0, 100) : undefined;
  const attemptNumber = typeof raw.attemptNumber === 'number' ? raw.attemptNumber : undefined;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined;

  const result = {
    source: { name: sourceName, path: sourcePath },
    exportType,
    profile: { id: profileId, name: profileName, platform },
    exportPreset: { id: exportPresetId, name: exportPresetName },
    variationPreset: { id: variationPresetId, name: variationPresetName },
    captionTemplate: { id: captionTemplateId, name: captionTemplateName },
    output: { path: outputPath, directory: outputDirectory, filename: outputFilename },
    status,
    error,
    planId,
    jobId,
    settingsSnapshot,
  };

  if (tags !== undefined) result.tags = tags;
  if (note !== undefined) result.note = note;
  if (attemptGroupId !== undefined) result.attemptGroupId = attemptGroupId;
  if (parentHistoryId !== undefined) result.parentHistoryId = parentHistoryId;
  if (attemptNumber !== undefined) result.attemptNumber = attemptNumber;
  if (updatedAt !== undefined) result.updatedAt = updatedAt;

  return result;
}

/**
 * Loads export history from disk with automatic error recovery.
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function loadHistory(customDir) {
  const filePath = getHistoryFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const candidateList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
      ? parsed.records
      : [];

    const validList = [];
    for (const item of candidateList) {
      if (!item || typeof item !== 'object' || !item.id) continue;
      try {
        const validated = validateExportHistoryInput(item);
        validList.push({
          id: String(item.id),
          createdAt: item.createdAt || new Date().toISOString(),
          completedAt: item.completedAt || item.createdAt || new Date().toISOString(),
          ...validated,
        });
      } catch (err) {
        // Skip corrupt individual record without throwing
      }
    }
    return validList;
  } catch (err) {
    // Recover safely from corrupt JSON by returning empty valid state
    return [];
  }
}

/**
 * Atomically saves export history records to disk.
 * @param {Array<Object>} records
 * @param {string} [customDir]
 */
function saveHistory(records, customDir) {
  const filePath = getHistoryFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Enforce FIFO limit — remove oldest records first
  const trimmed = records.slice(0, MAX_HISTORY_LIMIT);

  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: trimmed,
    },
    null,
    2
  );

  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tempPath, payload, 'utf8');
    try {
      fs.renameSync(tempPath, filePath);
    } catch (renameErr) {
      // Fallback if atomic rename fails on Windows lock
      fs.writeFileSync(filePath, payload, 'utf8');
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  } catch (writeErr) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    throw writeErr;
  }
}

/**
 * Validates output path for safety (path traversal, source overwrite).
 * @param {string} outputPath
 * @param {string} [sourcePath]
 * @returns {{ valid: boolean, error?: string }}
 */
function validateOutputPath(outputPath, sourcePath) {
  if (!outputPath || typeof outputPath !== 'string') {
    return { valid: false, error: 'Output path is required' };
  }

  // Path traversal check
  const segments = outputPath.replace(/\\/g, '/').split('/');
  if (segments.includes('..')) {
    return { valid: false, error: 'Output path contains traversal sequences' };
  }

  // Source overwrite check
  if (sourcePath) {
    try {
      const resolvedOutput = path.resolve(outputPath);
      const resolvedSource = path.resolve(sourcePath);
      if (resolvedOutput.toLowerCase() === resolvedSource.toLowerCase()) {
        return { valid: false, error: 'Output path matches source file' };
      }
    } catch (_) {}
  }

  return { valid: true };
}

// ── Public CRUD Operations ──────────────────────────────────────────────────

/**
 * Creates and persists a new export history record.
 * @param {Object} rawInput
 * @param {string} [customDir]
 * @returns {Object} Created history record (deep clone)
 */
function createExportHistoryRecord(rawInput, customDir) {
  const validated = validateExportHistoryInput(rawInput);
  const existing = loadHistory(customDir);

  const now = new Date().toISOString();
  const record = {
    id: generateHistoryId(),
    createdAt: now,
    completedAt: rawInput.completedAt || now,
    ...validated,
  };

  // Preserve Phase 5F fields if present
  if (rawInput.tags !== undefined) record.tags = rawInput.tags;
  if (rawInput.note !== undefined) record.note = rawInput.note;
  if (rawInput.attemptGroupId !== undefined) record.attemptGroupId = rawInput.attemptGroupId;
  if (rawInput.parentHistoryId !== undefined) record.parentHistoryId = rawInput.parentHistoryId;
  if (rawInput.attemptNumber !== undefined) record.attemptNumber = rawInput.attemptNumber;
  if (rawInput.updatedAt !== undefined) record.updatedAt = rawInput.updatedAt;

  // Prepend to list (newest first)
  const updated = [record, ...existing];

  // Enforce MAX_HISTORY_LIMIT
  if (updated.length > MAX_HISTORY_LIMIT) {
    updated.splice(MAX_HISTORY_LIMIT);
  }

  saveHistory(updated, customDir);
  return JSON.parse(JSON.stringify(record));
}

/**
 * Retrieves export history with optional filtering, searching, and sorting.
 * @param {Object} [options]
 * @param {string} [options.search] — searches source name, profile name, platform, preset names, output filename
 * @param {string} [options.status] — COMPLETED, FAILED, CANCELLED, SKIPPED
 * @param {string} [options.exportType] — cut, reel, split
 * @param {string} [options.platform] — platform filter
 * @param {string} [options.profileId] — profile ID filter
 * @param {string} [options.exportPresetId] — export preset ID filter
 * @param {string} [options.variationPresetId] — variation preset ID filter
 * @param {string} [options.captionTemplateId] — caption template ID filter
 * @param {string} [options.planId] — bulk plan ID filter
 * @param {string} [options.dateFrom] — ISO date string (inclusive lower bound)
 * @param {string} [options.dateTo] — ISO date string (inclusive upper bound)
 * @param {'newest'|'oldest'|'source_name'|'profile_name'|'status'} [options.sort='newest']
 * @param {number} [options.offset=0] — pagination offset
 * @param {number} [options.limit=50] — pagination limit
 * @param {string} [customDir]
 * @returns {{ records: Array<Object>, total: number }}
 */
function getExportHistory(options = {}, customDir) {
  if (typeof options === 'string') {
    const tmp = options;
    options = (customDir && typeof customDir === 'object') ? customDir : {};
    customDir = tmp;
  }
  let list = loadHistory(customDir);
  const totalBeforeFilters = list.length;

  // Filter: Search
  if (options.search && typeof options.search === 'string') {
    const q = options.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.source && r.source.name && r.source.name.toLowerCase().includes(q)) ||
          (r.profile && r.profile.name && r.profile.name.toLowerCase().includes(q)) ||
          (r.profile && r.profile.platform && r.profile.platform.toLowerCase().includes(q)) ||
          (r.exportPreset && r.exportPreset.name && r.exportPreset.name.toLowerCase().includes(q)) ||
          (r.variationPreset && r.variationPreset.name && r.variationPreset.name.toLowerCase().includes(q)) ||
          (r.captionTemplate && r.captionTemplate.name && r.captionTemplate.name.toLowerCase().includes(q)) ||
          (r.output && r.output.filename && r.output.filename.toLowerCase().includes(q))
      );
    }
  }

  // Filter: Status
  if (options.status && typeof options.status === 'string') {
    const s = options.status.trim().toUpperCase();
    const validStatuses = Object.values(EXPORT_HISTORY_STATUS);
    if (validStatuses.includes(s)) {
      list = list.filter((r) => r.status === s);
    }
  }

  // Filter: Export type
  if (options.exportType && typeof options.exportType === 'string') {
    const et = options.exportType.trim().toLowerCase();
    if (['cut', 'reel', 'split'].includes(et)) {
      list = list.filter((r) => r.exportType === et);
    }
  }

  // Filter: Platform
  if (options.platform && typeof options.platform === 'string') {
    const p = options.platform.trim().toLowerCase();
    if (p) {
      list = list.filter((r) => r.profile && r.profile.platform && r.profile.platform.toLowerCase() === p);
    }
  }

  // Filter: Profile ID
  if (options.profileId && typeof options.profileId === 'string') {
    const pid = options.profileId.trim();
    if (pid) {
      list = list.filter((r) => r.profile && r.profile.id === pid);
    }
  }

  // Filter: Export preset ID
  if (options.exportPresetId && typeof options.exportPresetId === 'string') {
    const epid = options.exportPresetId.trim();
    if (epid) {
      list = list.filter((r) => r.exportPreset && r.exportPreset.id === epid);
    }
  }

  // Filter: Variation preset ID
  if (options.variationPresetId && typeof options.variationPresetId === 'string') {
    const vpid = options.variationPresetId.trim();
    if (vpid) {
      list = list.filter((r) => r.variationPreset && r.variationPreset.id === vpid);
    }
  }

  // Filter: Caption template ID
  if (options.captionTemplateId && typeof options.captionTemplateId === 'string') {
    const ctid = options.captionTemplateId.trim();
    if (ctid) {
      list = list.filter((r) => r.captionTemplate && r.captionTemplate.id === ctid);
    }
  }

  // Filter: Plan ID
  if (options.planId && typeof options.planId === 'string') {
    const pid = options.planId.trim();
    if (pid) {
      list = list.filter((r) => r.planId === pid);
    }
  }

  // Filter: Date range
  if (options.dateFrom && typeof options.dateFrom === 'string') {
    const from = new Date(options.dateFrom).getTime();
    if (!isNaN(from)) {
      list = list.filter((r) => new Date(r.createdAt).getTime() >= from);
    }
  }
  if (options.dateTo && typeof options.dateTo === 'string') {
    const to = new Date(options.dateTo).getTime();
    if (!isNaN(to)) {
      list = list.filter((r) => new Date(r.createdAt).getTime() <= to);
    }
  }

  const total = list.length;

  // Sort
  const sortMode = (options.sort || 'newest').toString().toLowerCase();
  list.sort((a, b) => {
    if (sortMode === 'oldest' || sortMode === 'date_asc') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortMode === 'source_name' || sortMode === 'source') {
      const aName = (a.source && a.source.name) || '';
      const bName = (b.source && b.source.name) || '';
      return aName.localeCompare(bName);
    }
    if (sortMode === 'profile_name' || sortMode === 'profile') {
      const aName = (a.profile && a.profileName) || '';
      const bName = (b.profile && b.profileName) || '';
      return aName.localeCompare(bName);
    }
    if (sortMode === 'status') {
      return (a.status || '').localeCompare(b.status || '');
    }
    // Default 'newest' / 'date_desc'
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Pagination
  const offset = Math.max(0, parseInt(options.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 50));
  const paginated = list.slice(offset, offset + limit);

  return {
    records: JSON.parse(JSON.stringify(paginated)),
    total,
    offset,
    limit,
  };
}

/**
 * Gets a single export history record by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getExportHistoryRecord(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('History record id is required and must be a string');
  }
  const list = loadHistory(customDir);
  const found = list.find((r) => r.id === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * Updates a specific history record by ID.
 * @param {string} id
 * @param {Object} updates — limited fields allowed
 * @param {string} [customDir]
 * @returns {Object} Updated record
 */
function updateExportHistoryRecord(id, updates, customDir) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('History record id is required');
  }
  if (!updates || typeof updates !== 'object') {
    throw new Error('Updates must be a valid object');
  }

  const list = loadHistory(customDir);
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) {
    throw new Error(`History record not found: ${id}`);
  }

  // Only allow safe fields to be updated
  const allowedFields = ['error', 'status', 'completedAt'];
  const record = list[idx];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      record[field] = updates[field];
    }
  }

  record.updatedAt = new Date().toISOString();

  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(record));
}

/**
 * Deletes a history record by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ success: boolean, id: string }}
 */
function deleteExportHistoryRecord(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('History record id is required and must be a string');
  }
  const list = loadHistory(customDir);
  const initialLen = list.length;
  const filtered = list.filter((r) => r.id !== id);
  if (filtered.length === initialLen) {
    throw new Error(`History record not found: ${id}`);
  }
  saveHistory(filtered, customDir);
  return { success: true, id };
}

/**
 * Clears all history records.
 * @param {string} [customDir]
 * @returns {{ success: boolean, count: number }}
 */
function clearExportHistory(customDir) {
  const list = loadHistory(customDir);
  const count = list.length;
  saveHistory([], customDir);
  return { success: true, count };
}

// ── Relationships & Queries ─────────────────────────────────────────────────

/**
 * Gets all history records for a given bulk plan ID.
 * @param {string} planId
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function getByPlanId(planId, customDir) {
  if (typeof planId !== 'string' || !planId.trim()) {
    throw new Error('planId is required');
  }
  const list = loadHistory(customDir);
  const matched = list.filter((r) => r.planId === planId);
  return JSON.parse(JSON.stringify(matched));
}

/**
 * Gets a history record by job ID.
 * @param {string} jobId
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getByJobId(jobId, customDir) {
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('jobId is required');
  }
  const list = loadHistory(customDir);
  const found = list.find((r) => r.jobId === jobId);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

// ── Statistics ──────────────────────────────────────────────────────────────

/**
 * Computes export history statistics.
 * @param {string} [customDir]
 * @returns {Object} Statistics
 */
function getExportHistoryStats(customDir) {
  const list = loadHistory(customDir);
  const total = list.length;

  if (total === 0) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      successRate: 0,
      byProfile: {},
      byPlatform: {},
      byExportPreset: {},
      byExportType: {},
    };
  }

  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let skipped = 0;
  const byProfile = {};
  const byPlatform = {};
  const byExportPreset = {};
  const byExportType = {};

  for (const r of list) {
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) failed++;
    else if (r.status === EXPORT_HISTORY_STATUS.CANCELLED) cancelled++;
    else if (r.status === EXPORT_HISTORY_STATUS.SKIPPED) skipped++;

    // Profile distribution
    const profileName = r.profile && r.profile.name ? r.profile.name : 'Unknown';
    byProfile[profileName] = (byProfile[profileName] || 0) + 1;

    // Platform distribution
    const platform = r.profile && r.profile.platform ? r.profile.platform : 'Unknown';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;

    // Export preset distribution
    const presetName = r.exportPreset && r.exportPreset.name ? r.exportPreset.name : 'None';
    byExportPreset[presetName] = (byExportPreset[presetName] || 0) + 1;

    // Export type distribution
    const exportType = r.exportType || 'Unknown';
    byExportType[exportType] = (byExportType[exportType] || 0) + 1;
  }

  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    failed,
    cancelled,
    skipped,
    successRate,
    byProfile,
    byPlatform,
    byExportPreset,
    byExportType,
  };
}

// ── Export Again & Retry ────────────────────────────────────────────────────

/**
 * Creates an "export again" configuration from a history record.
 * Returns the stored configuration snapshot without mutating the record.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object} configuration suitable for re-export
 */
function getExportAgainConfig(id, customDir) {
  const record = getExportHistoryRecord(id, customDir);
  if (!record) {
    throw new Error(`History record not found: ${id}`);
  }

  // Export again is only safe for completed records
  if (record.status !== EXPORT_HISTORY_STATUS.COMPLETED) {
    throw new Error(`Export again is only available for completed records. Current status: ${record.status}`);
  }

  if (!record.output || !record.output.path) {
    throw new Error('Export again requires a valid output path from the original record');
  }

  return {
    sourceFile: record.source ? record.source.path : null,
    sourceName: record.source ? record.source.name : null,
    exportType: record.exportType,
    profile: record.profile ? JSON.parse(JSON.stringify(record.profile)) : null,
    exportPreset: record.exportPreset ? JSON.parse(JSON.stringify(record.exportPreset)) : null,
    variationPreset: record.variationPreset ? JSON.parse(JSON.stringify(record.variationPreset)) : null,
    captionTemplate: record.captionTemplate ? JSON.parse(JSON.stringify(record.captionTemplate)) : null,
    previousOutputPath: record.output.path,
    settingsSnapshot: record.settingsSnapshot ? JSON.parse(JSON.stringify(record.settingsSnapshot)) : null,
  };
}

/**
 * Determines whether a failed record can be safely retried.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ retryable: boolean, reason?: string }}
 */
function canRetryExport(id, customDir) {
  const record = getExportHistoryRecord(id, customDir);
  if (!record) {
    return { retryable: false, reason: 'History record not found' };
  }

  if (record.status !== EXPORT_HISTORY_STATUS.FAILED) {
    return { retryable: false, reason: `Retry is only available for failed records. Current status: ${record.status}` };
  }

  if (!record.source || !record.source.path) {
    return { retryable: false, reason: 'No source path available for retry' };
  }

  if (!record.settingsSnapshot && (!record.output || !record.output.path)) {
    return { retryable: false, reason: 'No configuration snapshot available for retry' };
  }

  return { retryable: true };
}

module.exports = {
  EXPORT_HISTORY_STATUS,
  MAX_HISTORY_LIMIT,
  validateExportHistoryInput,
  validateOutputPath,
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
  loadHistory,
  generateHistoryId,
  saveHistory,
};
