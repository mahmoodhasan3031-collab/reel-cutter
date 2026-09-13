'use strict';

/**
 * Bulk Schedule Manager — Phase 3C
 *
 * Provides authoritative creation, validation, grouping, and lifecycle management
 * for bulk scheduled export plans.
 *
 * Guarantees:
 *  - Atomic creation (all jobs scheduled or zero schedules created)
 *  - Strict main-process validation (gapMinutes: 1..1440 integer, ISO start timestamp)
 *  - Independent schedule records with immutable snapshots
 *  - Order preservation from export plan
 *  - Output collision safety
 *  - Safe group cancellation & history cleanup
 */

const path = require('path');
const fs = require('fs');
const {
  SCHEDULE_STATUS,
  VALID_EXPORT_TYPES,
  loadSchedules,
  saveSchedules,
  getSchedule,
  cancelSchedule,
  deleteSchedule,
} = require('./scheduleManager');
const { validateProductVariationConfig, DEFAULT_PRODUCT_VARIATION } = require('../../engine/variation/validator');

const MIN_GAP_MINUTES = 1;
const MAX_GAP_MINUTES = 1440; // 24 hours
const MIN_JOBS = 1;
const MAX_JOBS = 10;

let _bulkScheduleCounter = 0;
function generateBulkScheduleId() {
  return `sched_bulk_${Date.now()}_${++_bulkScheduleCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Validates the time gap parameter.
 * Must be a strict integer between 1 and 1440.
 *
 * @param {*} gap
 * @returns {number}
 */
function validateGapMinutes(gap) {
  if (gap === null || gap === undefined || gap === '') {
    throw new Error('Time gap (gapMinutes) is required');
  }

  const num = Number(gap);

  if (typeof gap === 'boolean' || isNaN(num) || !isFinite(num)) {
    throw new Error(`Invalid time gap: "${gap}". Must be a valid integer between ${MIN_GAP_MINUTES} and ${MAX_GAP_MINUTES} minutes.`);
  }

  if (!Number.isInteger(num)) {
    throw new Error(`Time gap must be a whole integer number of minutes (got decimal ${gap}).`);
  }

  if (num < MIN_GAP_MINUTES) {
    throw new Error(`Time gap must be at least ${MIN_GAP_MINUTES} minute (got ${num}).`);
  }

  if (num > MAX_GAP_MINUTES) {
    throw new Error(`Time gap cannot exceed ${MAX_GAP_MINUTES} minutes / 24 hours (got ${num}).`);
  }

  return num;
}

/**
 * Validates the start timestamp parameter.
 * Must be a valid parseable ISO 8601 date.
 *
 * @param {*} startAt
 * @returns {string} ISO string
 */
function validateStartAt(startAt) {
  if (!startAt || typeof startAt !== 'string' || !startAt.trim()) {
    throw new Error('Valid startAt ISO timestamp is required');
  }

  const d = new Date(startAt);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid startAt date format: "${startAt}". Must be a valid ISO 8601 timestamp.`);
  }

  return d.toISOString();
}

/**
 * Validates the export plan structure for bulk scheduling.
 *
 * @param {Object} plan
 * @returns {Object} validated plan
 */
function validatePlanForBulkSchedule(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Export plan must be a valid object');
  }

  if (!plan.planId || typeof plan.planId !== 'string' || !plan.planId.trim()) {
    throw new Error('Export plan must have a valid planId');
  }

  const sourceFile = plan.sourceFile || plan.sourcePath;
  if (!sourceFile || typeof sourceFile !== 'string' || !sourceFile.trim()) {
    throw new Error('Export plan is missing sourceFile');
  }

  const resolvedSource = path.resolve(sourceFile);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source media file does not exist: ${sourceFile}`);
  }

  try {
    const stat = fs.statSync(resolvedSource);
    if (!stat.isFile()) {
      throw new Error(`Source media path is not a file: ${sourceFile}`);
    }
  } catch (err) {
    if (err.message.includes('not a file')) throw err;
    throw new Error(`Unable to read source media file: ${err.message}`);
  }

  const exportType = String(plan.exportType || 'cut').toLowerCase().trim();
  if (!VALID_EXPORT_TYPES.includes(exportType)) {
    throw new Error(`Invalid exportType "${plan.exportType}". Must be one of: ${VALID_EXPORT_TYPES.join(', ')}`);
  }

  if (!Array.isArray(plan.jobs) || plan.jobs.length === 0) {
    throw new Error('Export plan must contain at least 1 job');
  }

  if (plan.jobs.length < MIN_JOBS || plan.jobs.length > MAX_JOBS) {
    throw new Error(`Export plan job count (${plan.jobs.length}) out of bounds [${MIN_JOBS}, ${MAX_JOBS}]`);
  }

  return {
    ...plan,
    sourceFile: resolvedSource,
    exportType,
  };
}

/**
 * Creates independent schedule records from a bulk export plan and persists
 * them atomically to disk.
 *
 * @param {Object} input
 * @param {Object} input.plan Export plan object
 * @param {string} input.startAt ISO timestamp for the first job
 * @param {number} input.gapMinutes Integer minutes between subsequent jobs
 * @param {Object} [input.options] Export options (start, duration, mode, etc.)
 * @param {string} [customDir] Custom directory for persistence (tests)
 * @returns {{ success: boolean, planId: string, schedules: Array<Object>, count: number }}
 */
function createBulkSchedule(input = {}, customDir) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input must be an object');
  }

  const validatedPlan = validatePlanForBulkSchedule(input.plan);
  const validatedStartIso = validateStartAt(input.startAt);
  const gapMinutes = validateGapMinutes(input.gapMinutes);

  const startTimeMs = new Date(validatedStartIso).getTime();
  const rawOpts = input.options || input.exportOptions || {};
  const exportType = validatedPlan.exportType;

  // Canonical export options snapshot
  const exportOptionsSnapshot = {
    start: Number(rawOpts.start) || 0,
    duration: rawOpts.duration !== undefined && rawOpts.duration !== null ? Number(rawOpts.duration) : null,
    aspectRatio: rawOpts.aspectRatio || (exportType === 'reel' ? '9:16' : undefined),
    mode: rawOpts.mode || 'blur',
    interval: Number(rawOpts.interval) || 30,
    generateThumbnail: Boolean(rawOpts.generateThumbnail),
    thumbnailTitle: rawOpts.thumbnailTitle ? String(rawOpts.thumbnailTitle).slice(0, 100) : '',
  };

  const outputDirectory = validatedPlan.outputDir
    ? path.resolve(validatedPlan.outputDir)
    : path.dirname(validatedPlan.sourceFile);

  // Path traversal guard on outputDirectory
  if (validatedPlan.outputDir && validatedPlan.outputDir.includes('..')) {
    throw new Error('outputDir contains invalid path traversal sequences');
  }

  // Duplicate submission protection: prevent creating duplicate schedules for the same planId
  const existingStore = loadSchedules(customDir);
  const duplicatePlan = existingStore.schedules.filter(s => s.planId === validatedPlan.planId);
  if (duplicatePlan.length > 0) {
    throw new Error(`Bulk schedule for plan "${validatedPlan.planId}" has already been created`);
  }

  const nowIso = new Date().toISOString();
  const createdSchedules = [];
  const assignedOutputPaths = new Set();

  // Validate every job first before making any mutations (atomic preparation)
  for (let i = 0; i < validatedPlan.jobs.length; i++) {
    const job = validatedPlan.jobs[i];
    if (!job || typeof job !== 'object') {
      throw new Error(`Job at index ${i} is invalid`);
    }

    if (!job.profileId) {
      throw new Error(`Job at index ${i} is missing profileId`);
    }

    // Deep clone profile snapshot
    const profileSnapshot = {
      id: String(job.profileId),
      name: String(job.profileName || 'Default').slice(0, 80),
      platform: String(job.platform || 'Other').slice(0, 40),
    };

    // Deep clone and validate variation preset
    let variationPreset = { ...DEFAULT_PRODUCT_VARIATION, enabled: false };
    if (job.variationPreset && typeof job.variationPreset === 'object') {
      try {
        const varVal = validateProductVariationConfig({
          ...DEFAULT_PRODUCT_VARIATION,
          ...job.variationPreset,
        });
        if (!varVal.valid) {
          throw new Error(`Job for profile "${profileSnapshot.name}" has invalid variation preset`);
        }
        variationPreset = JSON.parse(JSON.stringify(varVal.config));
      } catch (err) {
        throw new Error(`Job for profile "${profileSnapshot.name}" has invalid variation preset: ${err.message}`);
      }
    }

    // Compute scheduled time in order
    const jobTimeMs = startTimeMs + i * gapMinutes * 60 * 1000;
    const scheduledAt = new Date(jobTimeMs).toISOString();

    // Output path resolution with collision safety
    let candidateOutputPath = job.outputPath ? path.resolve(job.outputPath) : null;
    if (candidateOutputPath) {
      if (candidateOutputPath.includes('..')) {
        throw new Error(`Job outputPath contains invalid path traversal sequences`);
      }
      if (candidateOutputPath.toLowerCase() === validatedPlan.sourceFile.toLowerCase()) {
        throw new Error(`Job outputPath cannot match source media file`);
      }
    } else {
      const sourceBase = path.basename(validatedPlan.sourceFile, path.extname(validatedPlan.sourceFile));
      const cleanBase = sourceBase.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').slice(0, 50);
      const cleanProf = profileSnapshot.name.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').slice(0, 40);
      const filename = `${cleanBase}__${cleanProf}__${i + 1}.mp4`;
      candidateOutputPath = path.resolve(outputDirectory, filename);
    }

    // Ensure no collisions between jobs in this bulk schedule or with disk files
    let finalOutputPath = candidateOutputPath;
    let collisionCounter = 1;
    while (
      assignedOutputPaths.has(finalOutputPath.toLowerCase()) ||
      fs.existsSync(finalOutputPath)
    ) {
      const ext = path.extname(candidateOutputPath);
      const base = path.basename(candidateOutputPath, ext);
      finalOutputPath = path.resolve(outputDirectory, `${base}_${collisionCounter}${ext}`);
      collisionCounter++;
    }
    assignedOutputPaths.add(finalOutputPath.toLowerCase());

    const scheduleItem = {
      id: generateBulkScheduleId(),
      createdAt: nowIso,
      updatedAt: nowIso,
      status: SCHEDULE_STATUS.SCHEDULED,
      sourcePath: validatedPlan.sourceFile,
      exportType,
      scheduledAt,
      outputDirectory,
      outputPath: finalOutputPath,
      profileSnapshot,
      variationPreset,
      exportOptions: {
        ...JSON.parse(JSON.stringify(exportOptionsSnapshot)),
        textOverlays: job.textOverlays && Array.isArray(job.textOverlays) && job.textOverlays.length > 0
          ? JSON.parse(JSON.stringify(job.textOverlays))
          : (Array.isArray(rawOpts.textOverlays) && rawOpts.textOverlays.length > 0
              ? JSON.parse(JSON.stringify(rawOpts.textOverlays))
              : undefined),
      },
      planId: validatedPlan.planId,
      jobId: job.jobId || `job_${validatedPlan.planId}_${i + 1}`,
      progress: 0,
      error: null,
      result: null,
      startedAt: null,
      finishedAt: null,
      batchItemId: null,
    };

    createdSchedules.push(scheduleItem);
  }

  // ATOMIC PERSISTENCE: Save all created schedules together in one disk write
  const store = loadSchedules(customDir);
  store.schedules.push(...createdSchedules);
  saveSchedules(store, customDir);

  return {
    success: true,
    planId: validatedPlan.planId,
    schedules: JSON.parse(JSON.stringify(createdSchedules)),
    count: createdSchedules.length,
  };
}

/**
 * Calculates a live summary for a bulk schedule group.
 *
 * @param {string} planId
 * @param {string} [customDir]
 * @returns {Object} summary counts
 */
function getScheduleGroupSummary(planId, customDir) {
  if (!planId) throw new Error('planId is required');

  const store = loadSchedules(customDir);
  const group = store.schedules.filter(s => s.planId === planId);

  const summary = {
    planId,
    total: group.length,
    scheduled: 0,
    paused: 0,
    ready: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const s of group) {
    const st = (s.status || '').toUpperCase();
    if (st === SCHEDULE_STATUS.SCHEDULED) summary.scheduled++;
    else if (st === SCHEDULE_STATUS.PAUSED) summary.paused++;
    else if (st === SCHEDULE_STATUS.READY) summary.ready++;
    else if (st === SCHEDULE_STATUS.PROCESSING) summary.processing++;
    else if (st === SCHEDULE_STATUS.COMPLETED) summary.completed++;
    else if (st === SCHEDULE_STATUS.FAILED) summary.failed++;
    else if (st === SCHEDULE_STATUS.CANCELLED) summary.cancelled++;
  }

  return summary;
}

/**
 * Cancels all pending/active schedules in a bulk group.
 * Cancels SCHEDULED, PAUSED, READY, and PROCESSING.
 * Leaves COMPLETED, FAILED, CANCELLED untouched.
 *
 * @param {string} planId
 * @param {string} [customDir]
 * @param {Object} [schedulerService] Optional scheduler service instance for cancelling processing batch items
 * @returns {{ success: boolean, planId: string, cancelledCount: number }}
 */
function cancelScheduleGroup(planId, customDir, schedulerService) {
  if (!planId) throw new Error('planId is required');

  const store = loadSchedules(customDir);
  const group = store.schedules.filter(s => s.planId === planId);

  let cancelledCount = 0;
  for (const item of group) {
    const st = item.status;
    if (
      st === SCHEDULE_STATUS.SCHEDULED ||
      st === SCHEDULE_STATUS.PAUSED ||
      st === SCHEDULE_STATUS.READY ||
      st === SCHEDULE_STATUS.PROCESSING
    ) {
      if (schedulerService && typeof schedulerService.cancelScheduleJob === 'function') {
        schedulerService.cancelScheduleJob(item.id);
      } else {
        cancelSchedule(item.id, customDir);
      }
      cancelledCount++;
    }
  }

  return {
    success: true,
    planId,
    cancelledCount,
  };
}

/**
 * Deletes all terminal schedules (COMPLETED, FAILED, CANCELLED) in a bulk group.
 * Active or pending jobs are preserved.
 * Output files and source media are never deleted.
 *
 * @param {string} planId
 * @param {string} [customDir]
 * @returns {{ success: boolean, planId: string, deletedCount: number, remainingCount: number }}
 */
function deleteScheduleGroupHistory(planId, customDir) {
  if (!planId) throw new Error('planId is required');

  const store = loadSchedules(customDir);
  const group = store.schedules.filter(s => s.planId === planId);

  let deletedCount = 0;
  for (const item of group) {
    const st = item.status;
    if (
      st === SCHEDULE_STATUS.COMPLETED ||
      st === SCHEDULE_STATUS.FAILED ||
      st === SCHEDULE_STATUS.CANCELLED
    ) {
      deleteSchedule(item.id, customDir);
      deletedCount++;
    }
  }

  const updatedStore = loadSchedules(customDir);
  const remainingCount = updatedStore.schedules.filter(s => s.planId === planId).length;

  return {
    success: true,
    planId,
    deletedCount,
    remainingCount,
  };
}

module.exports = {
  MIN_GAP_MINUTES,
  MAX_GAP_MINUTES,
  validateGapMinutes,
  validateStartAt,
  validatePlanForBulkSchedule,
  createBulkSchedule,
  getScheduleGroupSummary,
  cancelScheduleGroup,
  deleteScheduleGroupHistory,
};
