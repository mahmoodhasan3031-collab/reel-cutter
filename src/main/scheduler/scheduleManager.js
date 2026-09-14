'use strict';

/**
 * Schedule Manager — Phase 3A / 3B
 *
 * Local schedule storage and immutable data model for scheduled video exports.
 * Persists to schedules.json in Electron userData (or customDir for tests).
 *
 * Job lifecycle:
 *   SCHEDULED ──> READY ──> PROCESSING ──> COMPLETED
 *        │           │           │
 *        └──> PAUSED └──> CANCELLED └──> FAILED
 *
 * Phase 3B additions:
 *   - updateSchedule(id, { scheduledAt }, customDir) — edit time on SCHEDULED/PAUSED jobs
 *   - resumeSchedule: past-due check → PAUSED transitions directly to READY
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {
  validateProductVariationConfig,
  DEFAULT_PRODUCT_VARIATION,
} = require('../../engine/variation/validator');

const SCHEDULES_FILENAME = 'schedules.json';
const VALID_EXPORT_TYPES = ['cut', 'reel', 'split'];

const SCHEDULE_STATUS = {
  SCHEDULED: 'SCHEDULED',
  READY: 'READY',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  PAUSED: 'PAUSED',
};

let _scheduleCounter = 0;
function generateScheduleId() {
  return `sched_${Date.now()}_${++_scheduleCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Resolves the path to the schedules.json file.
 * @param {string} [customDir]
 * @returns {string}
 */
function getSchedulesFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, SCHEDULES_FILENAME);
  }
  try {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, SCHEDULES_FILENAME);
  } catch {
    return path.join(process.cwd(), SCHEDULES_FILENAME);
  }
}

/**
 * Loads schedules from disk. Returns { schedules: [] }.
 * Safe against corrupt, empty, or missing files.
 * @param {string} [customDir]
 * @returns {{ schedules: Array<Object> }}
 */
function loadSchedules(customDir) {
  const filePath = getSchedulesFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return { schedules: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return { schedules: [] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.schedules)) {
      return { schedules: [] };
    }
    return parsed;
  } catch (err) {
    console.error(`[ScheduleManager] Failed to load schedules from ${filePath}:`, err.message);
    return { schedules: [] };
  }
}

/**
 * Saves schedules safely to disk with atomic write.
 * @param {{ schedules: Array<Object> }} data
 * @param {string} [customDir]
 */
function saveSchedules(data, customDir) {
  const filePath = getSchedulesFilePath(customDir);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    schedules: Array.isArray(data?.schedules) ? data.schedules : [],
  };

  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Validates schedule creation input strictly in the main process.
 * Renderer values are treated as untrusted.
 *
 * @param {Object} input
 * @returns {{ valid: boolean, sanitized: Object }}
 */
function validateScheduleInput(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('Schedule input must be an object');
  }

  // 1. Source Path
  const { sourcePath } = input;
  if (!sourcePath || typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('Valid sourcePath is required');
  }
  const resolvedSource = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source media file does not exist: ${sourcePath}`);
  }
  try {
    const stat = fs.statSync(resolvedSource);
    if (!stat.isFile()) {
      throw new Error(`Source media path is not a file: ${sourcePath}`);
    }
  } catch (err) {
    if (err.message.includes('not a file')) throw err;
    throw new Error(`Unable to read source media file: ${err.message}`);
  }

  // 2. Export Type
  const rawType = String(input.exportType || '').toLowerCase().trim();
  if (!VALID_EXPORT_TYPES.includes(rawType)) {
    throw new Error(`Invalid exportType "${input.exportType}". Must be one of: ${VALID_EXPORT_TYPES.join(', ')}`);
  }
  const exportType = rawType;

  // 3. Scheduled Time (ISO 8601)
  if (!input.scheduledAt) {
    throw new Error('scheduledAt timestamp is required');
  }
  const parsedDate = new Date(input.scheduledAt);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid scheduledAt date format: "${input.scheduledAt}". Must be a valid ISO 8601 timestamp`);
  }
  const scheduledAt = parsedDate.toISOString();

  // 4. Output Directory / Path & Traversal Protection
  let outputDirectory = input.outputDirectory
    ? path.resolve(input.outputDirectory)
    : path.dirname(resolvedSource);

  // Path traversal check on outputDirectory
  if (input.outputDirectory && input.outputDirectory.includes('..')) {
    throw new Error('outputDirectory contains invalid path traversal sequences');
  }

  let outputPath = input.outputPath ? path.resolve(input.outputPath) : null;
  if (outputPath) {
    if (outputPath.includes('..')) {
      throw new Error('outputPath contains invalid path traversal sequences');
    }
    // Cannot match source file
    if (outputPath.toLowerCase() === resolvedSource.toLowerCase()) {
      throw new Error('outputPath cannot match source media file');
    }
  } else {
    // Generate safe default output path
    const sourceBase = path.basename(resolvedSource, path.extname(resolvedSource));
    const cleanSourceBase = sourceBase.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').slice(0, 60);
    const profName = input.profileSnapshot?.name
      ? input.profileSnapshot.name.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').slice(0, 40)
      : 'scheduled';
    const suffix = exportType === 'reel' ? 'reel' : exportType === 'split' ? 'split' : 'clip';
    const filename = `${cleanSourceBase}__${profName}_${suffix}.mp4`;
    outputPath = path.resolve(outputDirectory, filename);

    if (outputPath.toLowerCase() === resolvedSource.toLowerCase()) {
      outputPath = path.resolve(outputDirectory, `${cleanSourceBase}__${profName}_${suffix}_export.mp4`);
    }
  }

  // 5. Profile Snapshot (Immutable Snapshot)
  const profileSnapshot = {
    id: input.profileSnapshot?.id || null,
    name: String(input.profileSnapshot?.name || 'Default').slice(0, 80),
    platform: String(input.profileSnapshot?.platform || 'Other').slice(0, 40),
  };

  // 6. Variation Preset (Validated via Engine Rules)
  let variationPreset = { ...DEFAULT_PRODUCT_VARIATION, enabled: false };
  let variationPresetId = input.variationPresetId || null;

  let rawPreset = input.variationPreset;
  if (!rawPreset && variationPresetId) {
    try {
      const { getVariationPreset } = require('../variations/variationPresetManager');
      const p = getVariationPreset(variationPresetId, customDir);
      if (p) {
        rawPreset = p.variation;
      }
    } catch (_) {}
  }

  if (rawPreset && typeof rawPreset === 'object') {
    const varValidation = validateProductVariationConfig({
      ...DEFAULT_PRODUCT_VARIATION,
      ...rawPreset,
    });
    if (!varValidation.valid) {
      throw new Error('Invalid variation preset settings');
    }
    // Store deep clone of canonical variation config
    variationPreset = JSON.parse(JSON.stringify(varValidation.config));
  }

  // 7. Export Options Snapshot
  const rawOpts = input.exportOptions || {};
  const exportOptions = {
    start: Number(rawOpts.start) || 0,
    duration: rawOpts.duration !== undefined && rawOpts.duration !== null ? Number(rawOpts.duration) : null,
    aspectRatio: rawOpts.aspectRatio || (exportType === 'reel' ? '9:16' : undefined),
    mode: rawOpts.mode || 'blur',
    interval: Number(rawOpts.interval) || 30,
    generateThumbnail: Boolean(rawOpts.generateThumbnail),
    thumbnailTitle: rawOpts.thumbnailTitle ? String(rawOpts.thumbnailTitle).slice(0, 100) : '',
    textOverlays: (rawOpts.textOverlays || input.textOverlays) && Array.isArray(rawOpts.textOverlays || input.textOverlays)
      ? JSON.parse(JSON.stringify(rawOpts.textOverlays || input.textOverlays))
      : undefined,
  };

  return {
    valid: true,
    sanitized: {
      sourcePath: resolvedSource,
      exportType,
      scheduledAt,
      outputDirectory,
      outputPath,
      profileSnapshot,
      variationPreset,
      variationPresetId,
      exportOptions,
      planId: input.planId || null,
      jobId: input.jobId || null,
    },
  };
}

/**
 * Creates and persists a new scheduled export job.
 *
 * @param {Object} input
 * @param {string} [customDir]
 * @returns {Object} the newly created schedule item
 */
function createSchedule(input, customDir) {
  const { sanitized } = validateScheduleInput(input, customDir);
  const store = loadSchedules(customDir);

  const now = new Date().toISOString();
  const scheduleItem = {
    id: generateScheduleId(),
    createdAt: now,
    updatedAt: now,
    status: SCHEDULE_STATUS.SCHEDULED,
    ...sanitized,
    progress: 0,
    error: null,
    result: null,
    startedAt: null,
    finishedAt: null,
    batchItemId: null,
  };

  store.schedules.push(scheduleItem);
  saveSchedules(store, customDir);

  return JSON.parse(JSON.stringify(scheduleItem));
}

/**
 * Retrieves all schedules from disk.
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function getSchedules(customDir) {
  const store = loadSchedules(customDir);
  return store.schedules || [];
}

/**
 * Retrieves a single schedule by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getSchedule(id, customDir) {
  if (!id) return null;
  const store = loadSchedules(customDir);
  const item = store.schedules.find(s => s.id === id);
  return item ? JSON.parse(JSON.stringify(item)) : null;
}

/**
 * Updates status and optional fields of an existing schedule.
 * Atomic and persistent.
 *
 * @param {string} id
 * @param {string} newStatus
 * @param {Object} [extraFields={}]
 * @param {string} [customDir]
 * @returns {Object} updated schedule
 */
function updateScheduleStatus(id, newStatus, extraFields = {}, customDir) {
  if (!id) throw new Error('Schedule id is required');
  if (!Object.values(SCHEDULE_STATUS).includes(newStatus)) {
    throw new Error(`Invalid schedule status: "${newStatus}"`);
  }

  const store = loadSchedules(customDir);
  const index = store.schedules.findIndex(s => s.id === id);
  if (index === -1) {
    throw new Error(`Schedule not found: ${id}`);
  }

  const current = store.schedules[index];

  // Disallow invalid transitions from terminal states
  if (
    (current.status === SCHEDULE_STATUS.COMPLETED || current.status === SCHEDULE_STATUS.CANCELLED) &&
    newStatus !== current.status
  ) {
    throw new Error(`Cannot transition schedule ${id} from terminal status ${current.status} to ${newStatus}`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    ...extraFields,
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === SCHEDULE_STATUS.PROCESSING && !updated.startedAt) {
    updated.startedAt = now;
  }
  if (
    (newStatus === SCHEDULE_STATUS.COMPLETED ||
      newStatus === SCHEDULE_STATUS.FAILED ||
      newStatus === SCHEDULE_STATUS.CANCELLED) &&
    !updated.finishedAt
  ) {
    updated.finishedAt = now;
  }

  store.schedules[index] = updated;
  saveSchedules(store, customDir);

  return JSON.parse(JSON.stringify(updated));
}

/**
 * Cancels a scheduled job.
 * If SCHEDULED, READY, or PAUSED -> transitions to CANCELLED.
 * If COMPLETED or FAILED -> throws error (terminal).
 *
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object} updated cancelled schedule
 */
function cancelSchedule(id, customDir) {
  if (!id) throw new Error('Schedule id is required');

  const store = loadSchedules(customDir);
  const item = store.schedules.find(s => s.id === id);
  if (!item) {
    throw new Error(`Schedule not found: ${id}`);
  }

  if (item.status === SCHEDULE_STATUS.COMPLETED) {
    throw new Error('Completed schedules cannot be cancelled');
  }
  if (item.status === SCHEDULE_STATUS.FAILED) {
    throw new Error('Failed schedules cannot be cancelled');
  }
  if (item.status === SCHEDULE_STATUS.CANCELLED) {
    return JSON.parse(JSON.stringify(item));
  }

  return updateScheduleStatus(id, SCHEDULE_STATUS.CANCELLED, { error: 'Cancelled by user' }, customDir);
}

/**
 * Deletes a schedule record from disk.
 * Only allowed for terminal states (COMPLETED, FAILED, CANCELLED).
 * Active or waiting schedules must be cancelled first.
 *
 * @param {string} id
 * @param {string} [customDir]
 * @returns {boolean}
 */
function deleteSchedule(id, customDir) {
  if (!id) throw new Error('Schedule id is required');

  const store = loadSchedules(customDir);
  const index = store.schedules.findIndex(s => s.id === id);
  if (index === -1) {
    throw new Error(`Schedule not found: ${id}`);
  }

  const item = store.schedules[index];
  if (
    item.status === SCHEDULE_STATUS.SCHEDULED ||
    item.status === SCHEDULE_STATUS.READY ||
    item.status === SCHEDULE_STATUS.PROCESSING
  ) {
    throw new Error(`Cannot delete active or scheduled item "${id}". Cancel it first.`);
  }

  store.schedules.splice(index, 1);
  saveSchedules(store, customDir);
  return true;
}

/**
 * Pauses a SCHEDULED job.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object}
 */
function pauseSchedule(id, customDir) {
  if (!id) throw new Error('Schedule id is required');
  const item = getSchedule(id, customDir);
  if (!item) throw new Error(`Schedule not found: ${id}`);
  if (item.status !== SCHEDULE_STATUS.SCHEDULED) {
    throw new Error(`Cannot pause schedule in status "${item.status}". Only SCHEDULED jobs can be paused.`);
  }
  return updateScheduleStatus(id, SCHEDULE_STATUS.PAUSED, {}, customDir);
}

/**
 * Resumes a PAUSED job.
 * If scheduledAt is past-due (<=now) → transitions to READY immediately.
 * Otherwise → transitions back to SCHEDULED.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object}
 */
function resumeSchedule(id, customDir) {
  if (!id) throw new Error('Schedule id is required');
  const item = getSchedule(id, customDir);
  if (!item) throw new Error(`Schedule not found: ${id}`);
  if (item.status !== SCHEDULE_STATUS.PAUSED) {
    throw new Error(`Cannot resume schedule in status "${item.status}". Only PAUSED jobs can be resumed.`);
  }

  // Past-due check: if scheduledAt is in the past, promote directly to READY
  const scheduledAt = new Date(item.scheduledAt);
  const isPastDue = !isNaN(scheduledAt.getTime()) && scheduledAt <= new Date();
  const targetStatus = isPastDue ? SCHEDULE_STATUS.READY : SCHEDULE_STATUS.SCHEDULED;

  return updateScheduleStatus(id, targetStatus, {}, customDir);
}

/**
 * Updates the scheduledAt time of an existing SCHEDULED or PAUSED job.
 * Rejects terminal or active (READY/PROCESSING) jobs.
 *
 * @param {string} id
 * @param {{ scheduledAt: string }} changes
 * @param {string} [customDir]
 * @returns {{ updated: Object, isPastDue: boolean }}
 */
function updateSchedule(id, changes, customDir) {
  if (!id) throw new Error('Schedule id is required');
  if (!changes || typeof changes !== 'object') throw new Error('changes must be an object');

  const item = getSchedule(id, customDir);
  if (!item) throw new Error(`Schedule not found: ${id}`);

  // Only SCHEDULED and PAUSED can be edited
  if (
    item.status !== SCHEDULE_STATUS.SCHEDULED &&
    item.status !== SCHEDULE_STATUS.PAUSED
  ) {
    throw new Error(
      `Cannot update schedule in status "${item.status}". Only SCHEDULED or PAUSED jobs can be edited.`
    );
  }

  // Validate new scheduledAt
  if (!changes.scheduledAt) throw new Error('scheduledAt is required in changes');
  const parsedDate = new Date(changes.scheduledAt);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid scheduledAt date format: "${changes.scheduledAt}". Must be a valid ISO 8601 timestamp`);
  }
  const newScheduledAt = parsedDate.toISOString();

  // Determine if past-due (caller can transition to READY)
  const isPastDue = parsedDate <= new Date();

  // Persist only scheduledAt (no other fields mutable here)
  const store = loadSchedules(customDir);
  const index = store.schedules.findIndex(s => s.id === id);
  if (index === -1) throw new Error(`Schedule not found: ${id}`);

  const now = new Date().toISOString();
  const updated = {
    ...store.schedules[index],
    scheduledAt: newScheduledAt,
    updatedAt: now,
  };
  store.schedules[index] = updated;
  saveSchedules(store, customDir);

  return { updated: JSON.parse(JSON.stringify(updated)), isPastDue };
}

module.exports = {
  SCHEDULES_FILENAME,
  SCHEDULE_STATUS,
  VALID_EXPORT_TYPES,
  getSchedulesFilePath,
  loadSchedules,
  saveSchedules,
  validateScheduleInput,
  createSchedule,
  getSchedules,
  getSchedule,
  updateScheduleStatus,
  cancelSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
};
