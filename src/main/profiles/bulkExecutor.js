'use strict';

/**
 * Bulk Multi-Profile Export Executor — Phase 2C-2
 *
 * Provides authoritative execution of validated bulk export plans.
 * Maps immutable job snapshots directly to BatchQueueManager items
 * without re-reading profiles from disk. Enforces queue concurrency limits,
 * error isolation, and cancellation.
 */

const path = require('path');
const fs = require('fs');
const { getBatchQueueManager } = require('../../engine/batchQueue');
const { validateProductVariationConfig } = require('../../engine/variation/validator');
const MIN_BULK_PROFILES = 1;
const MAX_BULK_PROFILES = 10;
const VALID_EXPORT_TYPES = ['cut', 'reel', 'split'];
const { planToBatchQueueItems } = require('./exportPlan');

/**
 * Strictly validates a bulk export plan before execution.
 * Throws descriptive errors if any requirement is violated.
 *
 * @param {Object} plan
 * @returns {{ valid: boolean, plan: Object }}
 */
function validateBulkExportPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Bulk export plan must be a valid object');
  }

  if (!plan.planId || typeof plan.planId !== 'string' || !plan.planId.trim()) {
    throw new Error('Bulk export plan is missing a valid planId');
  }

  if (!plan.sourceFile || typeof plan.sourceFile !== 'string') {
    throw new Error('Bulk export plan is missing sourceFile path');
  }

  // Check sourceFile exists on disk and is a file
  if (!fs.existsSync(plan.sourceFile)) {
    throw new Error(`Source media file does not exist: ${plan.sourceFile}`);
  }

  try {
    const stat = fs.statSync(plan.sourceFile);
    if (!stat.isFile()) {
      throw new Error(`Source media path is not a file: ${plan.sourceFile}`);
    }
  } catch (err) {
    if (err.message.includes('not a file')) throw err;
    throw new Error(`Unable to read source media file: ${err.message}`);
  }

  if (!VALID_EXPORT_TYPES.includes(plan.exportType)) {
    throw new Error(`Invalid plan exportType "${plan.exportType}". Must be one of: ${VALID_EXPORT_TYPES.join(', ')}`);
  }

  if (!Array.isArray(plan.jobs) || plan.jobs.length === 0) {
    throw new Error('Bulk export plan must contain at least 1 job');
  }

  if (plan.jobs.length < MIN_BULK_PROFILES || plan.jobs.length > MAX_BULK_PROFILES) {
    throw new Error(`Bulk export plan job count (${plan.jobs.length}) out of bounds [${MIN_BULK_PROFILES}, ${MAX_BULK_PROFILES}]`);
  }

  const resolvedSource = path.resolve(plan.sourceFile);

  for (let i = 0; i < plan.jobs.length; i++) {
    const job = plan.jobs[i];
    if (!job || typeof job !== 'object') {
      throw new Error(`Invalid job entry at index ${i}`);
    }

    if (!job.jobId || typeof job.jobId !== 'string') {
      throw new Error(`Job at index ${i} is missing jobId`);
    }

    if (!job.profileId || typeof job.profileId !== 'string') {
      throw new Error(`Job at index ${i} is missing profileId`);
    }

    if (!job.profileName || typeof job.profileName !== 'string') {
      throw new Error(`Job at index ${i} is missing profileName`);
    }

    if (!job.outputPath || typeof job.outputPath !== 'string') {
      throw new Error(`Job "${job.profileName}" is missing outputPath`);
    }

    // Path traversal check
    if (job.outputPath.includes('..')) {
      throw new Error(`Job "${job.profileName}" outputPath contains invalid traversal sequences`);
    }

    // Source overwrite check
    const resolvedOutput = path.resolve(job.outputPath);
    if (resolvedOutput.toLowerCase() === resolvedSource.toLowerCase()) {
      throw new Error(`Job "${job.profileName}" outputPath cannot match sourceFile`);
    }

    // Strict variation validation against engine rules
    if (!job.variationPreset || typeof job.variationPreset !== 'object') {
      throw new Error(`Job "${job.profileName}" is missing variationPreset`);
    }

    try {
      const varValidation = validateProductVariationConfig(job.variationPreset);
      if (!varValidation.valid) {
        throw new Error(`Job "${job.profileName}" has invalid variation settings`);
      }
    } catch (err) {
      throw new Error(`Job "${job.profileName}" has invalid variation settings: ${err.message}`);
    }
  }

  return { valid: true, plan };
}

/**
 * Executes a validated bulk export plan by converting its jobs into Batch Queue items
 * and starting the existing BatchQueueManager engine.
 *
 * @param {Object} plan
 * @param {Object} [options={}] Additional options (e.g. start, duration, mode, etc.)
 * @param {Object} [queueInstance] Optional custom queue instance for testing/isolation
 * @returns {Promise<{ success: boolean, planId: string, queuedCount: number, items: Array, state: Object }>}
 */
async function executeBulkExport(plan, options = {}, queueInstance) {
  // Validate plan authoritatively in main process before spawning any process
  validateBulkExportPlan(plan);

  const queue = queueInstance || getBatchQueueManager();

  // Convert plan snapshot to batch queue items
  // Note: job.variationPreset snapshot is used directly, NEVER re-read from disk
  const items = planToBatchQueueItems(plan, options);

  // Add items to the shared Batch Queue
  const created = queue.addItems(items);

  // Start processing if not explicitly suppressed
  if (options.autoStart !== false) {
    queue.startQueue();
  }

  return {
    success: true,
    planId: plan.planId,
    queuedCount: created.length,
    items: created,
    state: queue.getState(),
  };
}

/**
 * Cancels all queued or running jobs associated with a bulk plan.
 *
 * @param {string} planId
 * @param {Object} [queueInstance]
 * @returns {{ success: boolean, cancelledCount: number, state: Object }}
 */
function cancelBulkExport(planId, queueInstance) {
  if (!planId) {
    throw new Error('planId is required for cancellation');
  }

  const queue = queueInstance || getBatchQueueManager();
  const state = queue.getState();
  const planItems = state.items.filter(it => it.bulkPlanId === planId);

  let cancelledCount = 0;
  for (const item of planItems) {
    const ok = queue.cancelItem(item.id);
    if (ok) cancelledCount++;
  }

  return {
    success: true,
    cancelledCount,
    state: queue.getState(),
  };
}

/**
 * Cancels an individual job in a bulk plan.
 *
 * @param {string} jobId
 * @param {Object} [queueInstance]
 * @returns {{ success: boolean, state: Object, error?: string }}
 */
function cancelBulkJob(jobId, queueInstance) {
  if (!jobId) {
    throw new Error('jobId is required for cancellation');
  }

  const queue = queueInstance || getBatchQueueManager();
  const state = queue.getState();
  const item = state.items.find(it => it.bulkJobId === jobId || it.id === jobId);

  if (!item) {
    return { success: false, error: `Job not found: ${jobId}`, state: queue.getState() };
  }

  const ok = queue.cancelItem(item.id);
  return { success: ok, state: queue.getState() };
}

module.exports = {
  validateBulkExportPlan,
  executeBulkExport,
  cancelBulkExport,
  cancelBulkJob,
};
