'use strict';

/**
 * Export Workflow Automation — Phase 5J
 *
 * Action-center layer for safe operational workflow actions:
 * - Workflow summaries with actionable counts
 * - Action eligibility validation
 * - Bulk action planning with preflight
 * - Safe execution orchestration
 * - Result normalization
 *
 * Reuses existing History, Recovery, Queue services.
 * Never creates parallel systems. Never mutates historical snapshots.
 */

const {
  EXPORT_HISTORY_STATUS,
  loadHistory,
  getExportHistoryRecord,
  getExportAgainConfig,
  canRetryExport,
} = require('../history/exportHistoryManager');

const {
  checkRetryReadiness,
  batchCheckRetryReadiness,
  retryFailedExport,
  exportAgainMissingOutput,
  bulkRetryFailed,
  bulkExportAgainMissing,
  isNeedsAttention,
  getRecoveryDiagnostics,
  RECOVERY_ERROR_CATEGORY,
} = require('../history/recoveryCenter');

const {
  batchCheckRecordOutputHealth,
  OUTPUT_HEALTH_STATUS,
} = require('../history/outputHealthService');

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function safeNum(n) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

function uniqueStrings(arr) {
  return [...new Set(arr.filter(id => typeof id === 'string' && id.trim()))];
}

function validateId(id) {
  return typeof id === 'string' && id.trim().length > 0;
}

// ─── Step 1: Workflow Summary ───────────────────────────────────────────────

/**
 * Produces a comprehensive workflow summary with actionable counts.
 * All counts come from authoritative existing services.
 * @param {Object} options
 * @param {Function} options.getBatchQueueState - returns BatchQueueManager.getState()
 * @param {Function} options.getSchedules - returns Array of schedule objects
 * @param {Function} [options.loadHistory] - returns Array of history records
 * @returns {Object} Workflow summary with counts and eligible actions
 */
function getWorkflowSummary(options) {
  options = options || {};
  const records = loadRecords(options);

  const queue = getQueueCounts(options);
  const schedule = getScheduleCounts(options);
  const history = getHistoryCounts(records);
  const recovery = getRecoveryActionCounts(records);
  const attention = getAttentionCounts(records);
  const outputHealth = getOutputHealthCounts(records);

  const eligibleActions = computeEligibleActions(records, queue);

  return deepClone({
    queue,
    schedule,
    history,
    recovery,
    attention,
    outputHealth,
    eligibleActions,
    generatedAt: new Date().toISOString(),
  });
}

function loadRecords(options) {
  try {
    const loadFn = typeof options.loadHistory === 'function' ? options.loadHistory : null;
    if (!loadFn) return [];
    const records = loadFn();
    return Array.isArray(records) ? records : [];
  } catch (_) {
    return [];
  }
}

function getQueueCounts(options) {
  try {
    const getState = options.getBatchQueueState;
    if (typeof getState !== 'function') {
      return { available: false, processing: 0, queued: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
    }
    const state = getState();
    if (!state || typeof state !== 'object') {
      return { available: false, processing: 0, queued: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
    }
    return {
      available: true,
      processing: safeNum(state.runningCount),
      queued: safeNum(state.waitingCount),
      completed: safeNum(state.doneCount),
      failed: safeNum(state.errorCount),
      cancelled: safeNum(state.cancelledCount),
      total: safeNum(state.totalCount),
    };
  } catch (_) {
    return { available: false, processing: 0, queued: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
  }
}

function getScheduleCounts(options) {
  try {
    const getSchedulesFn = options.getSchedules;
    if (typeof getSchedulesFn !== 'function') {
      return { available: false, scheduled: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    }
    const schedules = getSchedulesFn();
    if (!Array.isArray(schedules)) {
      return { available: false, scheduled: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    }
    return {
      available: true,
      scheduled: schedules.filter(s => s.status === 'SCHEDULED' || s.status === 'READY').length,
      processing: schedules.filter(s => s.status === 'PROCESSING').length,
      completed: schedules.filter(s => s.status === 'COMPLETED').length,
      failed: schedules.filter(s => s.status === 'FAILED').length,
      total: schedules.length,
    };
  } catch (_) {
    return { available: false, scheduled: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  }
}

function getHistoryCounts(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { total: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0 };
  }
  let completed = 0, failed = 0, cancelled = 0, skipped = 0;
  for (const r of records) {
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) failed++;
    else if (r.status === EXPORT_HISTORY_STATUS.CANCELLED) cancelled++;
    else if (r.status === EXPORT_HISTORY_STATUS.SKIPPED) skipped++;
  }
  return { total: records.length, completed, failed, cancelled, skipped };
}

function getRecoveryActionCounts(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { retryReady: 0, missingOutputs: 0, exportAgainReady: 0 };
  }

  let retryReady = 0;
  let missingOutputs = 0;
  let exportAgainReady = 0;

  for (const r of records) {
    if (r.archived) continue;

    // Retry-ready: failed records with source available
    if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
      const readiness = checkRetryReadinessSafe(r.id);
      if (readiness.ready) retryReady++;
    }

    // Missing output: completed records with missing output
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path) {
      const health = checkOutputHealthSafe(r.output.path);
      if (health === 'MISSING' || health === 'INVALID_PATH' || health === 'INACCESSIBLE') {
        missingOutputs++;
        exportAgainReady++;
      }
    }
  }

  return { retryReady, missingOutputs, exportAgainReady };
}

function checkRetryReadinessSafe(recordId) {
  try {
    return checkRetryReadiness(recordId);
  } catch (_) {
    return { ready: false, reasons: ['Check failed'] };
  }
}

function checkOutputHealthSafe(outputPath) {
  try {
    const { checkOutputHealth } = require('../history/outputHealthService');
    const result = checkOutputHealth(outputPath);
    return result.status;
  } catch (_) {
    return 'UNKNOWN';
  }
}

function isNeedsAttentionSafe(record) {
  try {
    return isNeedsAttention(record);
  } catch (_) {
    return false;
  }
}

function getAttentionCounts(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { needsAttention: 0, blockedRecovery: 0 };
  }
  let needsAttention = 0;
  let blockedRecovery = 0;

  for (const r of records) {
    if (r.archived) continue;
    if (isNeedsAttention(r)) {
      needsAttention++;
      // Blocked recovery: failed records where source is missing
      if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
        const readiness = checkRetryReadinessSafe(r.id);
        if (!readiness.ready && readiness.reasons && readiness.reasons.some(reason => reason.toLowerCase().includes('source'))) {
          blockedRecovery++;
        }
      }
    }
  }
  return { needsAttention, blockedRecovery };
}

function getOutputHealthCounts(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { available: 0, missing: 0, invalidPath: 0, inaccessible: 0 };
  }
  const completedRecords = records.filter(
    r => r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path
  );
  if (completedRecords.length === 0) {
    return { available: 0, missing: 0, invalidPath: 0, inaccessible: 0 };
  }
  try {
    const health = batchCheckRecordOutputHealth(completedRecords);
    return {
      available: health.summary.available,
      missing: health.summary.missing,
      invalidPath: health.summary.invalidPath,
      inaccessible: health.summary.inaccessible,
    };
  } catch (_) {
    return { available: 0, missing: 0, invalidPath: 0, inaccessible: 0 };
  }
}

function computeEligibleActions(records, queue) {
  const actions = [];

  if (queue.available && queue.failed > 0) {
    actions.push({ type: 'RETRY_FAILED', count: queue.failed, description: 'Retry failed queue items' });
  }

  // Count retry-eligible history records
  let retryEligible = 0;
  let exportAgainEligible = 0;
  if (Array.isArray(records)) {
    for (const r of records) {
      if (r.archived) continue;
      if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
        const check = canRetryExportSafe(r.id);
        if (check.retryable) retryEligible++;
      }
      if (r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path) {
        const health = checkOutputHealthSafe(r.output.path);
        if (health !== 'AVAILABLE') exportAgainEligible++;
      }
    }
  }

  if (retryEligible > 0) {
    actions.push({ type: 'RETRY_HISTORY', count: retryEligible, description: 'Retry failed history records' });
  }
  if (exportAgainEligible > 0) {
    actions.push({ type: 'EXPORT_AGAIN', count: exportAgainEligible, description: 'Export again missing outputs' });
  }

  return actions;
}

function canRetryExportSafe(recordId) {
  try {
    return canRetryExport(recordId);
  } catch (_) {
    return { retryable: false, reason: 'Check failed' };
  }
}

// ─── Step 2: Action Eligibility ─────────────────────────────────────────────

/**
 * Validates whether a specific action can be performed on a set of records.
 * @param {string} actionType - 'retry' | 'export_again' | 'retry_bulk' | 'export_again_bulk'
 * @param {string[]} recordIds - array of history record IDs
 * @param {string} [customDir]
 * @returns {{ eligible: boolean, ready: string[], blocked: Array<{id, reason}>, invalid: string[] }}
 */
function validateActionEligibility(actionType, recordIds, customDir) {
  if (!actionType || typeof actionType !== 'string') {
    return { eligible: false, ready: [], blocked: [], invalid: [], error: 'Invalid action type' };
  }

  const validActions = ['retry', 'export_again', 'retry_bulk', 'export_again_bulk'];
  if (!validActions.includes(actionType)) {
    return { eligible: false, ready: [], blocked: [], invalid: [], error: 'Unknown action type: ' + actionType };
  }

  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return { eligible: false, ready: [], blocked: [], invalid: [], error: 'No record IDs provided' };
  }

  const uniqueIds = uniqueStrings(recordIds);
  if (uniqueIds.length === 0) {
    return { eligible: false, ready: [], blocked: [], invalid: [], error: 'No valid record IDs provided' };
  }

  const ready = [];
  const blocked = [];
  const invalid = [];

  for (const id of uniqueIds) {
    const record = getExportHistoryRecordSafe(id, customDir);
    if (!record) {
      invalid.push(id);
      continue;
    }

    if (actionType === 'retry' || actionType === 'retry_bulk') {
      const check = canRetryExportSafe(id);
      if (check.retryable) {
        ready.push(id);
      } else {
        blocked.push({ id, reason: check.reason || 'Not retryable' });
      }
    } else if (actionType === 'export_again' || actionType === 'export_again_bulk') {
      if (record.status !== EXPORT_HISTORY_STATUS.COMPLETED) {
        blocked.push({ id, reason: 'Record is not completed' });
      } else if (!record.output || !record.output.path) {
        blocked.push({ id, reason: 'No output path' });
      } else {
        const health = checkOutputHealthSafe(record.output.path);
        if (health === 'AVAILABLE') {
          blocked.push({ id, reason: 'Output still available' });
        } else {
          ready.push(id);
        }
      }
    }
  }

  return {
    eligible: ready.length > 0,
    ready,
    blocked,
    invalid,
    total: uniqueIds.length,
  };
}

function getExportHistoryRecordSafe(id, customDir) {
  try {
    return getExportHistoryRecord(id, customDir);
  } catch (_) {
    return null;
  }
}

// ─── Step 3: Bulk Action Planning ───────────────────────────────────────────

/**
 * Plans a bulk action with preflight checks.
 * Separates records into ready, blocked, invalid, and duplicate categories.
 * @param {string} actionType - 'retry' | 'export_again'
 * @param {string[]} recordIds
 * @param {string} [customDir]
 * @returns {{ plan, ready, blocked, invalid, duplicates }}
 */
function planBulkAction(actionType, recordIds, customDir) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return { plan: null, ready: [], blocked: [], invalid: [], duplicates: [], error: 'No records provided' };
  }

  // Deduplicate
  const seen = new Set();
  const uniqueIds = [];
  const duplicates = [];
  for (const id of recordIds) {
    if (typeof id !== 'string' || !id.trim()) continue;
    if (seen.has(id)) {
      duplicates.push(id);
    } else {
      seen.add(id);
      uniqueIds.push(id);
    }
  }

  if (uniqueIds.length === 0) {
    return { plan: null, ready: [], blocked: [], invalid: [], duplicates, error: 'No unique valid IDs' };
  }

  const eligibility = validateActionEligibility(
    actionType === 'retry' ? 'retry_bulk' : 'export_again_bulk',
    uniqueIds,
    customDir
  );

  return {
    plan: {
      actionType,
      totalRequested: recordIds.length,
      uniqueIds: uniqueIds.length,
      readyCount: eligibility.ready.length,
      blockedCount: eligibility.blocked.length,
      invalidCount: eligibility.invalid.length,
      duplicateCount: duplicates.length,
    },
    ready: eligibility.ready,
    blocked: eligibility.blocked,
    invalid: eligibility.invalid,
    duplicates,
  };
}

// ─── Step 4: Safe Execution ─────────────────────────────────────────────────

/**
 * Executes a bulk action on eligible records.
 * Returns per-item success/failure results.
 * @param {string} actionType - 'retry' | 'export_again'
 * @param {string[]} recordIds
 * @param {string} [customDir]
 * @returns {{ results, summary }}
 */
function executeBulkAction(actionType, recordIds, customDir) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return { results: [], summary: { total: 0, started: 0, completed: 0, failed: 0, skipped: 0 } };
  }

  const plan = planBulkAction(actionType, recordIds, customDir);

  if (plan.error) {
    return { results: [], summary: { total: 0, started: 0, completed: 0, failed: 0, skipped: 0 }, error: plan.error };
  }

  const results = [];
  let started = 0, completed = 0, failed = 0;

  for (const id of plan.ready) {
    started++;
    let result;
    try {
      if (actionType === 'retry') {
        result = retryFailedExport(id, customDir);
      } else {
        result = exportAgainMissingOutput(id, customDir);
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }

    if (result && result.success) {
      completed++;
      results.push({ id, status: 'SUCCESS', newRecordId: result.record ? result.record.id : null });
    } else {
      failed++;
      results.push({ id, status: 'FAILED', error: result ? result.error : 'Unknown error' });
    }
  }

  // Add skipped items
  for (const item of plan.blocked) {
    results.push({ id: item.id, status: 'SKIPPED', reason: item.reason });
  }
  for (const id of plan.invalid) {
    results.push({ id, status: 'INVALID', reason: 'Record not found' });
  }
  for (const id of plan.duplicates) {
    results.push({ id, status: 'DUPLICATE', reason: 'Duplicate ID removed' });
  }

  return {
    results,
    summary: {
      total: recordIds.length,
      started,
      completed,
      failed,
      skipped: plan.blocked.length + plan.invalid.length + plan.duplicates.length,
    },
  };
}

// ─── Step 5: Workflow Filters ───────────────────────────────────────────────

/**
 * Filters records by multiple criteria.
 * Deterministic. Never mutates stored history.
 * @param {Object} records
 * @param {Object} filters
 * @returns {Object[]} filtered records
 */
function filterWorkflowRecords(records, filters) {
  if (!Array.isArray(records)) return [];
  if (!filters || typeof filters !== 'object') return records;

  let result = records;

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    result = result.filter(r => statuses.includes(r.status));
  }

  if (filters.profileId) {
    result = result.filter(r => r.profile && r.profile.id === filters.profileId);
  }

  if (filters.platform) {
    const platform = filters.platform.toLowerCase();
    result = result.filter(r => r.profile && r.profile.platform && r.profile.platform.toLowerCase() === platform);
  }

  if (filters.exportType) {
    result = result.filter(r => r.exportType === filters.exportType);
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    if (!isNaN(from)) {
      result = result.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return !isNaN(t) && t >= from;
      });
    }
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo).getTime();
    if (!isNaN(to)) {
      result = result.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return !isNaN(t) && t <= to;
      });
    }
  }

  if (filters.recoveryState) {
    const state = filters.recoveryState.toLowerCase();
    result = result.filter(r => {
      if (state === 'retry_ready') {
        return r.status === EXPORT_HISTORY_STATUS.FAILED && !r.archived;
      }
      if (state === 'missing_output') {
        return r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path && !r.archived;
      }
      if (state === 'blocked') {
        if (r.status !== EXPORT_HISTORY_STATUS.FAILED) return false;
        const check = canRetryExportSafe(r.id);
        return !check.retryable;
      }
      return true;
    });
  }

  if (filters.attentionState) {
    const state = filters.attentionState.toLowerCase();
    result = result.filter(r => {
      try {
        if (state === 'needs_attention') return isNeedsAttention(r) && !r.archived;
        if (state === 'archived') return !!r.archived;
        if (state === 'normal') return !isNeedsAttentionSafe(r) && !r.archived;
        return true;
      } catch (_) {
        return false;
      }
    });
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    if (q) {
      result = result.filter(r =>
        (r.source && r.source.name && r.source.name.toLowerCase().includes(q)) ||
        (r.profile && r.profile.name && r.profile.name.toLowerCase().includes(q)) ||
        (r.output && r.output.filename && r.output.filename.toLowerCase().includes(q))
      );
    }
  }

  return result;
}

// ─── Step 6: Single Record Actions ──────────────────────────────────────────

/**
 * Validates and executes a single retry action.
 * @param {string} recordId
 * @param {string} [customDir]
 * @returns {{ success, record?, error? }}
 */
function executeRetry(recordId, customDir) {
  if (!validateId(recordId)) {
    return { success: false, error: 'Invalid record ID' };
  }
  return retryFailedExport(recordId, customDir);
}

/**
 * Validates and executes a single export-again action.
 * @param {string} recordId
 * @param {string} [customDir]
 * @returns {{ success, record?, error? }}
 */
function executeExportAgain(recordId, customDir) {
  if (!validateId(recordId)) {
    return { success: false, error: 'Invalid record ID' };
  }
  return exportAgainMissingOutput(recordId, customDir);
}

// ─── Step 7: Snapshot Validation ────────────────────────────────────────────

/**
 * Validates that a record's snapshot is intact for re-export.
 * Checks all required snapshots: profile, variation, caption, export type, output settings.
 * @param {string} recordId
 * @param {string} [customDir]
 * @returns {{ valid, issues, config }}
 */
function validateSnapshotForExport(recordId, customDir) {
  if (!validateId(recordId)) {
    return { valid: false, issues: ['Invalid record ID'], config: null };
  }

  const record = getExportHistoryRecordSafe(recordId, customDir);
  if (!record) {
    return { valid: false, issues: ['Record not found'], config: null };
  }

  const issues = [];

  if (!record.source || !record.source.path) {
    issues.push('Missing source path');
  }
  if (!record.exportType) {
    issues.push('Missing export type');
  }
  if (!record.profile) {
    issues.push('Missing profile snapshot');
  }
  if (!record.output || !record.output.path) {
    issues.push('Missing output path');
  }

  // Check snapshot integrity for export-again
  if (!record.exportPreset) {
    issues.push('Missing export preset snapshot');
  }
  if (!record.variationPreset) {
    issues.push('Missing variation preset snapshot');
  }
  if (!record.captionTemplate) {
    issues.push('Missing caption template snapshot');
  }
  if (!record.settingsSnapshot) {
    issues.push('Missing settings snapshot');
  }

  let config = null;
  try {
    config = getExportAgainConfig(recordId, customDir);
  } catch (err) {
    issues.push('Cannot generate export config: ' + err.message);
  }

  return {
    valid: issues.length === 0,
    issues,
    config,
  };
}

// ─── Step 8: Output Collision Protection ────────────────────────────────────

/**
 * Sanitizes a file path to prevent directory traversal and dangerous characters.
 * @param {string} filePath
 * @returns {string} sanitized path
 */
function sanitizePath(filePath) {
  if (typeof filePath !== 'string') return '';
  return filePath
    .replace(/[<>:"|?*]/g, '')
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/\\\\+/g, '\\')
    .trim();
}

/**
 * Checks if an output path would collide with an existing file.
 * @param {string} outputPath
 * @param {string} [customDir]
 * @returns {{ collision: boolean, existingRecordId: string|null }}
 */
function checkOutputCollision(outputPath, customDir) {
  if (!outputPath || typeof outputPath !== 'string') {
    return { collision: false, existingRecordId: null };
  }
  try {
    const records = loadRecords({ loadHistory: () => loadHistory(customDir) });
    for (const r of records) {
      if (r.output && r.output.path === outputPath && r.status === EXPORT_HISTORY_STATUS.COMPLETED) {
        return { collision: true, existingRecordId: r.id };
      }
    }
  } catch (_) {}
  return { collision: false, existingRecordId: null };
}

// ─── Step 9: Active-Job Protection ──────────────────────────────────────────

/**
 * Checks whether a source file is currently being processed in the queue.
 * @param {string} sourcePath
 * @param {Object} queueState
 * @returns {{ active: boolean, jobCount: number }}
 */
function checkActiveJobProtection(sourcePath, queueState) {
  if (!sourcePath || typeof sourcePath !== 'string') {
    return { active: false, jobCount: 0 };
  }
  if (!queueState || typeof queueState !== 'object') {
    return { active: false, jobCount: 0 };
  }
  try {
    const items = Array.isArray(queueState.items) ? queueState.items : [];
    const activeJobs = items.filter(i =>
      (i.status === 'PROCESSING' || i.status === 'WAITING') &&
      i.filename && sourcePath.includes(i.filename)
    );
    return { active: activeJobs.length > 0, jobCount: activeJobs.length };
  } catch (_) {
    return { active: false, jobCount: 0 };
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getWorkflowSummary,
  validateActionEligibility,
  planBulkAction,
  executeBulkAction,
  filterWorkflowRecords,
  executeRetry,
  executeExportAgain,
  validateSnapshotForExport,
  sanitizePath,
  checkOutputCollision,
  checkActiveJobProtection,
  deepClone,
  safeNum,
  uniqueStrings,
  validateId,
};
