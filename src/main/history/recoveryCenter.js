'use strict';

/**
 * Export Recovery Center — Phase 5G
 *
 * Workspace-level intelligence for managing failed/missing/retryable exports.
 * Uses immutable historical snapshots for recovery. Never mutates original records.
 * All operations are local and offline.
 */

const fs = require('fs');
const path = require('path');
const {
  EXPORT_HISTORY_STATUS,
  loadHistory,
  saveHistory,
  getExportHistoryRecord,
  createExportHistoryRecord,
} = require('./exportHistoryManager');

const {
  checkOutputHealth,
  batchCheckRecordOutputHealth,
  OUTPUT_HEALTH_STATUS,
} = require('./outputHealthService');

const {
  createRetryRecord,
  getAttemptHistory,
} = require('./exportHistoryIntelligence');

// ─── Error Normalization ───────────────────────────────────────────────────

const RECOVERY_ERROR_CATEGORY = {
  SOURCE_MISSING: 'SOURCE_MISSING',
  OUTPUT_DIRECTORY_UNAVAILABLE: 'OUTPUT_DIRECTORY_UNAVAILABLE',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
  EXPORT_CANCELLED: 'EXPORT_CANCELLED',
  FFMPEG_FAILURE: 'FFMPEG_FAILURE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

function normalizeError(errorStr) {
  if (typeof errorStr !== 'string' || !errorStr) {
    return { category: RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR, message: 'Unknown export failure' };
  }
  const lower = errorStr.toLowerCase();

  if (lower.includes('source') && (lower.includes('not found') || lower.includes('missing') || lower.includes('no such file'))) {
    return { category: RECOVERY_ERROR_CATEGORY.SOURCE_MISSING, message: 'Source file not found' };
  }
  if (lower.includes('output') && (lower.includes('directory') || lower.includes('folder') || lower.includes('permission'))) {
    return { category: RECOVERY_ERROR_CATEGORY.OUTPUT_DIRECTORY_UNAVAILABLE, message: 'Output directory unavailable' };
  }
  if (lower.includes('permission') || lower.includes('eacces') || lower.includes('eperm')) {
    return { category: RECOVERY_ERROR_CATEGORY.OUTPUT_DIRECTORY_UNAVAILABLE, message: 'Permission denied' };
  }
  if (lower.includes('config') || lower.includes('invalid') || (lower.includes('missing') && lower.includes('preset'))) {
    return { category: RECOVERY_ERROR_CATEGORY.INVALID_CONFIGURATION, message: 'Invalid export configuration' };
  }
  if (lower.includes('feature') || lower.includes('license') || lower.includes('tier') || lower.includes('upgrade')) {
    return { category: RECOVERY_ERROR_CATEGORY.FEATURE_NOT_AVAILABLE, message: 'Feature not available in current tier' };
  }
  if (lower.includes('cancel') || lower.includes('aborted')) {
    return { category: RECOVERY_ERROR_CATEGORY.EXPORT_CANCELLED, message: 'Export was cancelled' };
  }
  if (lower.includes('ffmpeg') || lower.includes('encoder') || lower.includes('codec') || lower.includes('format')) {
    return { category: RECOVERY_ERROR_CATEGORY.FFMPEG_FAILURE, message: 'Video processing failure' };
  }

  return { category: RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR, message: 'Unknown export failure' };
}

// ─── Retry Readiness ───────────────────────────────────────────────────────

function checkRetryReadiness(recordId, customDir) {
  const record = getExportHistoryRecord(recordId, customDir);
  if (!record) {
    return { ready: false, reasons: ['History record not found'], record: null };
  }

  const reasons = [];

  if (!record.source || !record.source.path) {
    reasons.push('No source path recorded');
  } else {
    try {
      const stat = fs.statSync(record.source.path);
      if (!stat.isFile()) reasons.push('Source path is not a file');
    } catch (err) {
      reasons.push(err.code === 'ENOENT' ? 'Source file not found' : 'Source file is inaccessible');
    }
  }

  if (record.output && record.output.path) {
    try { path.dirname(record.output.path); } catch (_) {
      reasons.push('Output path is invalid');
    }
  }

  if (record.status !== EXPORT_HISTORY_STATUS.FAILED) {
    reasons.push(`Record status is ${record.status}, not FAILED`);
  }

  return {
    ready: reasons.length === 0,
    reasons,
    record: JSON.parse(JSON.stringify(record)),
  };
}

function batchCheckRetryReadiness(recordIds, customDir) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return { results: [], summary: { total: 0, ready: 0, blocked: 0 } };
  }
  const results = recordIds.map(id => {
    const check = checkRetryReadiness(id, customDir);
    return { id, ready: check.ready, reasons: check.reasons };
  });
  return {
    results,
    summary: {
      total: results.length,
      ready: results.filter(r => r.ready).length,
      blocked: results.filter(r => !r.ready).length,
    },
  };
}

// ─── Recovery Diagnostics ──────────────────────────────────────────────────

function getRecoveryDiagnostics(recordId, customDir) {
  const record = getExportHistoryRecord(recordId, customDir);
  if (!record) {
    return { recordId, category: RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR, message: 'Record not found', sourceExists: false, outputHealth: null };
  }
  const normalized = normalizeError(record.error);
  let sourceExists = false;
  if (record.source && record.source.path) {
    try { const stat = fs.statSync(record.source.path); sourceExists = stat.isFile(); } catch (_) { sourceExists = false; }
  }
  let outputHealth = null;
  if (record.status === EXPORT_HISTORY_STATUS.COMPLETED && record.output && record.output.path) {
    outputHealth = checkOutputHealth(record.output.path).status;
  }
  return { recordId: record.id, category: normalized.category, message: normalized.message, sourceExists, outputHealth };
}

// ─── Recovery Actions ──────────────────────────────────────────────────────

function retryFailedExport(recordId, customDir) {
  const readiness = checkRetryReadiness(recordId, customDir);
  if (!readiness.ready) return { success: false, error: readiness.reasons.join('; ') };
  try {
    const newRecord = createRetryRecord(recordId, customDir);
    return { success: true, record: newRecord };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function exportAgainMissingOutput(recordId, customDir) {
  const record = getExportHistoryRecord(recordId, customDir);
  if (!record) return { success: false, error: 'History record not found' };
  if (record.status !== EXPORT_HISTORY_STATUS.COMPLETED) {
    return { success: false, error: `Record status is ${record.status}, not COMPLETED` };
  }
  const health = checkOutputHealth(record.output && record.output.path);
  if (health.status === OUTPUT_HEALTH_STATUS.AVAILABLE) {
    return { success: false, error: 'Output file is still available' };
  }
  try {
    const newRecord = createRetryRecord(recordId, customDir);
    return { success: true, record: newRecord };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Bulk Recovery ─────────────────────────────────────────────────────────

function bulkRetryFailed(recordIds, customDir) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return { selected: 0, ready: 0, started: 0, completed: 0, failed: 0, skipped: 0, details: [], summary: 'No records selected' };
  }
  const uniqueIds = [...new Set(recordIds.filter(id => typeof id === 'string' && id.trim()))];
  if (uniqueIds.length === 0) {
    return { selected: 0, ready: 0, started: 0, completed: 0, failed: 0, skipped: 0, details: [], summary: 'No valid IDs provided' };
  }
  const readiness = batchCheckRetryReadiness(uniqueIds, customDir);
  const details = [];
  let started = 0, completed = 0, failed = 0;
  for (const r of readiness.results) {
    if (!r.ready) { details.push({ id: r.id, status: 'SKIPPED', error: r.reasons.join('; ') }); continue; }
    started++;
    const result = retryFailedExport(r.id, customDir);
    if (result.success) { completed++; details.push({ id: r.id, status: 'STARTED', recordId: result.record.id }); }
    else { failed++; details.push({ id: r.id, status: 'FAILED', error: result.error }); }
  }
  return {
    selected: uniqueIds.length, ready: readiness.summary.ready, started, completed, failed,
    skipped: readiness.summary.blocked, details,
    summary: `Selected ${uniqueIds.length}, ready ${readiness.summary.ready}, started ${started}, failed ${failed}, skipped ${readiness.summary.blocked}`,
  };
}

function bulkExportAgainMissing(recordIds, customDir) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return { selected: 0, ready: 0, started: 0, completed: 0, failed: 0, skipped: 0, details: [], summary: 'No records selected' };
  }
  const uniqueIds = [...new Set(recordIds.filter(id => typeof id === 'string' && id.trim()))];
  if (uniqueIds.length === 0) {
    return { selected: 0, ready: 0, started: 0, completed: 0, failed: 0, skipped: 0, details: [], summary: 'No valid IDs provided' };
  }
  const details = [];
  let ready = 0, started = 0, completed = 0, failed = 0, skipped = 0;
  for (const id of uniqueIds) {
    const record = getExportHistoryRecord(id, customDir);
    if (!record) { skipped++; details.push({ id, status: 'SKIPPED', error: 'Record not found' }); continue; }
    if (record.status !== EXPORT_HISTORY_STATUS.COMPLETED) { skipped++; details.push({ id, status: 'SKIPPED', error: 'Not a completed record' }); continue; }
    const health = checkOutputHealth(record.output && record.output.path);
    if (health.status === OUTPUT_HEALTH_STATUS.AVAILABLE) { skipped++; details.push({ id, status: 'SKIPPED', error: 'Output still available' }); continue; }
    ready++; started++;
    const result = exportAgainMissingOutput(id, customDir);
    if (result.success) { completed++; details.push({ id, status: 'STARTED', recordId: result.record.id }); }
    else { failed++; details.push({ id, status: 'FAILED', error: result.error }); }
  }
  return {
    selected: uniqueIds.length, ready, started, completed, failed, skipped, details,
    summary: `Selected ${uniqueIds.length}, ready ${ready}, started ${started}, failed ${failed}, skipped ${skipped}`,
  };
}

// ─── Archive ───────────────────────────────────────────────────────────────

function archiveRecord(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');
  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);
  list[idx].archived = true;
  list[idx].updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(list[idx]));
}

function unarchiveRecord(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');
  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);
  list[idx].archived = false;
  list[idx].updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(list[idx]));
}

function bulkArchive(ids, customDir) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array');
  const list = loadHistory(customDir);
  const idSet = new Set(ids.filter(id => typeof id === 'string' && id.trim()));
  let count = 0;
  for (const record of list) {
    if (idSet.has(record.id) && !record.archived) {
      record.archived = true;
      record.updatedAt = new Date().toISOString();
      count++;
    }
  }
  if (count > 0) saveHistory(list, customDir);
  return { success: true, archivedCount: count };
}

function bulkUnarchive(ids, customDir) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array');
  const list = loadHistory(customDir);
  const idSet = new Set(ids.filter(id => typeof id === 'string' && id.trim()));
  let count = 0;
  for (const record of list) {
    if (idSet.has(record.id) && record.archived) {
      record.archived = false;
      record.updatedAt = new Date().toISOString();
      count++;
    }
  }
  if (count > 0) saveHistory(list, customDir);
  return { success: true, unarchivedCount: count };
}

// ─── Pin ───────────────────────────────────────────────────────────────────

function pinRecord(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');
  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);
  list[idx].pinned = true;
  list[idx].updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(list[idx]));
}

function unpinRecord(id, customDir) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Record id is required');
  const list = loadHistory(customDir);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`History record not found: ${id}`);
  list[idx].pinned = false;
  list[idx].updatedAt = new Date().toISOString();
  saveHistory(list, customDir);
  return JSON.parse(JSON.stringify(list[idx]));
}

function bulkPin(ids, customDir) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array');
  const list = loadHistory(customDir);
  const idSet = new Set(ids.filter(id => typeof id === 'string' && id.trim()));
  let count = 0;
  for (const record of list) {
    if (idSet.has(record.id) && !record.pinned) {
      record.pinned = true;
      record.updatedAt = new Date().toISOString();
      count++;
    }
  }
  if (count > 0) saveHistory(list, customDir);
  return { success: true, pinnedCount: count };
}

function bulkUnpin(ids, customDir) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array');
  const list = loadHistory(customDir);
  const idSet = new Set(ids.filter(id => typeof id === 'string' && id.trim()));
  let count = 0;
  for (const record of list) {
    if (idSet.has(record.id) && record.pinned) {
      record.pinned = false;
      record.updatedAt = new Date().toISOString();
      count++;
    }
  }
  if (count > 0) saveHistory(list, customDir);
  return { success: true, unpinnedCount: count };
}

// ─── Workspace View & Needs Attention ──────────────────────────────────────

function isNeedsAttention(record) {
  if (record.status === EXPORT_HISTORY_STATUS.FAILED) return true;
  if (record.status === EXPORT_HISTORY_STATUS.COMPLETED && record.output && record.output.path) {
    const health = checkOutputHealth(record.output.path);
    return health.status === OUTPUT_HEALTH_STATUS.MISSING;
  }
  return false;
}

function getNeedsAttentionRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(r => !r.archived && isNeedsAttention(r));
}

function getWorkspaceView(records) {
  if (!Array.isArray(records)) return { pinned: [], needsAttention: [], recent: [] };
  const active = records.filter(r => !r.archived);
  const pinned = active.filter(r => r.pinned);
  const needsAttention = active.filter(r => !r.pinned && isNeedsAttention(r));
  const recent = active.filter(r => !r.pinned && !isNeedsAttention(r));
  return { pinned, needsAttention, recent };
}

// ─── Recovery Counts ───────────────────────────────────────────────────────

function getRecoveryCounts(records) {
  if (!Array.isArray(records)) {
    return { failed: 0, missingOutput: 0, retryReady: 0, archived: 0, pinned: 0, needsAttention: 0 };
  }
  let failed = 0, missingOutput = 0, retryReady = 0, archived = 0, pinned = 0, needsAttention = 0;
  for (const r of records) {
    if (r.archived) { archived++; continue; }
    if (r.pinned) pinned++;
    if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
      failed++;
      retryReady++;
      needsAttention++;
    }
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path) {
      const health = checkOutputHealth(r.output.path);
      if (health.status === OUTPUT_HEALTH_STATUS.MISSING) {
        missingOutput++;
        needsAttention++;
      }
    }
  }
  return { failed, missingOutput, retryReady, archived, pinned, needsAttention };
}

// ─── Workspace Summary ─────────────────────────────────────────────────────

function getWorkspaceSummary(records) {
  const counts = getRecoveryCounts(records);
  const view = getWorkspaceView(records);
  const total = Array.isArray(records) ? records.length : 0;
  return {
    total,
    active: total - counts.archived,
    ...counts,
    pinnedCount: view.pinned.length,
    needsAttentionCount: view.needsAttention.length,
    recentCount: view.recent.length,
  };
}

// ─── Attempt Relationship Display ──────────────────────────────────────────

function getAttemptDisplayInfo(record, customDir) {
  if (!record || !record.attemptGroupId) return null;
  const history = getAttemptHistory(record.attemptGroupId, customDir);
  if (history.length <= 1) return null;
  const sorted = history.sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
  const totalAttempts = sorted.length;
  const currentAttempt = record.attemptNumber || 1;
  return {
    attemptNumber: currentAttempt,
    totalAttempts,
    display: `Attempt ${currentAttempt} / ${totalAttempts}`,
    isLatest: currentAttempt === totalAttempts,
    history: sorted.map(r => ({ id: r.id, status: r.status, attemptNumber: r.attemptNumber || 0, createdAt: r.createdAt })),
  };
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  RECOVERY_ERROR_CATEGORY,
  normalizeError,
  checkRetryReadiness,
  batchCheckRetryReadiness,
  getRecoveryDiagnostics,
  retryFailedExport,
  exportAgainMissingOutput,
  bulkRetryFailed,
  bulkExportAgainMissing,
  archiveRecord,
  unarchiveRecord,
  bulkArchive,
  bulkUnarchive,
  pinRecord,
  unpinRecord,
  bulkPin,
  bulkUnpin,
  isNeedsAttention,
  getNeedsAttentionRecords,
  getWorkspaceView,
  getRecoveryCounts,
  getWorkspaceSummary,
  getAttemptDisplayInfo,
};
