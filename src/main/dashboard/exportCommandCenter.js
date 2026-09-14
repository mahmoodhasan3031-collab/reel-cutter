'use strict';

/**
 * Export Workflow Command Center — Phase 5I
 *
 * Read-only aggregator that gathers real state from:
 * - Batch Queue (active exports)
 * - Scheduler (scheduled exports)
 * - Export History (recent activity, recovery, output health)
 * - Recovery Center (attention items, workspace)
 * - Output Health Service (file health)
 *
 * Produces a single compact snapshot for the renderer.
 * Never mutates source systems. All output is deep-cloned.
 */

const { EXPORT_HISTORY_STATUS, loadHistory } = require('../history/exportHistoryManager');
const { OUTPUT_HEALTH_STATUS, batchCheckRecordOutputHealth } = require('../history/outputHealthService');
const {
  getRecoveryCounts,
  getWorkspaceSummary,
  isNeedsAttention,
  normalizeError,
  RECOVERY_ERROR_CATEGORY,
} = require('../history/recoveryCenter');

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function safeNum(n) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

function truncate(str, max) {
  if (typeof str !== 'string') return '';
  return str.length > max ? str.slice(0, max) : str;
}

// ─── Step 2: Command Center Core ────────────────────────────────────────────

function gatherHistoryState(options) {
  try {
    const loadFn = typeof options.loadHistory === 'function' ? options.loadHistory : null;
    if (!loadFn) {
      return { records: [], error: 'History unavailable' };
    }
    const records = loadFn();
    return { records: Array.isArray(records) ? records : [] };
  } catch (err) {
    return { records: [], error: 'History error: ' + (err.message || 'unknown') };
  }
}

/**
 * Gathers the full Command Center snapshot.
 * All subsystem calls are wrapped in try/catch for error isolation.
 * @param {Object} options
 * @param {Function} options.getBatchQueueState - returns BatchQueueManager.getState()
 * @param {Function} options.getSchedules - returns Array of schedule objects
 * @param {Function} [options.loadHistory] - returns Array of history records
 * @param {string} [options.profileId] - optional profile filter
 * @param {string} [options.search] - optional search filter
 * @returns {Object} Command Center snapshot
 */
function getCommandCenterSnapshot(options) {
  options = options || {};

  const queue = gatherQueueState(options);
  const scheduled = gatherScheduleState(options);
  const history = gatherHistoryState(options);
  const attention = gatherAttentionItems(history.records);
  const recent = gatherRecentActivity(history.records);
  const outputHealth = gatherOutputHealth(history.records);
  const recovery = gatherRecoverySummary(history.records);
  const exportTypes = gatherExportTypeSummary(history.records);
  const profiles = gatherProfileSummary(history.records);

  return deepClone({
    queue,
    scheduled,
    attention,
    recent,
    outputHealth,
    recovery,
    exportTypes,
    profiles,
    overview: {
      processing: queue.processingCount,
      queued: queue.waitingCount,
      scheduled: scheduled.upcomingCount,
      attention: attention.items.length,
    },
    generatedAt: new Date().toISOString(),
  });
}

// ─── Step 3 & 4: Queue Summary ──────────────────────────────────────────────

function gatherQueueState(options) {
  try {
    const getState = options.getBatchQueueState;
    if (typeof getState !== 'function') {
      return emptyQueueState('Queue unavailable');
    }

    const state = getState();
    if (!state || typeof state !== 'object') {
      return emptyQueueState('Queue state unavailable');
    }

    const items = Array.isArray(state.items) ? state.items : [];

    const active = items
      .filter(i => i.status === 'PROCESSING')
      .map(i => ({
        id: i.id || '',
        source: i.filename || '',
        profile: i.profileName || '',
        platform: i.platform || '',
        operation: i.operation || '',
        progress: safeNum(i.progress),
        status: 'PROCESSING',
        bulkPlanId: i.bulkPlanId || null,
      }));

    const queued = items
      .filter(i => i.status === 'WAITING')
      .map(i => ({
        id: i.id || '',
        source: i.filename || '',
        profile: i.profileName || '',
        platform: i.platform || '',
        operation: i.operation || '',
        status: 'WAITING',
      }));

    return {
      available: true,
      isRunning: !!state.isRunning,
      concurrency: safeNum(state.concurrency),
      maxConcurrency: safeNum(state.maxConcurrency) || 2,
      processingCount: safeNum(state.runningCount),
      waitingCount: safeNum(state.waitingCount),
      doneCount: safeNum(state.doneCount),
      errorCount: safeNum(state.errorCount),
      cancelledCount: safeNum(state.cancelledCount),
      totalCount: safeNum(state.totalCount),
      overallProgress: safeNum(state.overallProgress),
      active,
      queued,
    };
  } catch (err) {
    return emptyQueueState('Queue error: ' + (err.message || 'unknown'));
  }
}

function emptyQueueState(error) {
  return {
    available: false,
    error,
    isRunning: false,
    concurrency: 0,
    maxConcurrency: 2,
    processingCount: 0,
    waitingCount: 0,
    doneCount: 0,
    errorCount: 0,
    cancelledCount: 0,
    totalCount: 0,
    overallProgress: 0,
    active: [],
    queued: [],
  };
}

// ─── Step 5: Attention Center ────────────────────────────────────────────────

function gatherAttentionItems(records) {
  const items = [];

  if (!Array.isArray(records)) return { items };

  for (const r of records) {
    if (r.archived) continue;

    // Failed exports
    if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
      const normalized = normalizeError(r.error);
      items.push({
        type: 'FAILED_EXPORT',
        severity: 'ERROR',
        historyId: r.id,
        source: r.source ? r.source.name : '',
        profile: r.profile ? r.profile.name : '',
        platform: r.profile ? r.profile.platform : '',
        reason: normalized.message || r.error || 'Export failed',
        category: normalized.category || RECOVERY_ERROR_CATEGORY.UNKNOWN_ERROR,
        createdAt: r.createdAt,
      });
      continue;
    }

    // Missing outputs on completed records
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path) {
      try {
        const health = batchCheckRecordOutputHealth([r]);
        if (health.summary.missing > 0) {
          items.push({
            type: 'MISSING_OUTPUT',
            severity: 'WARNING',
            historyId: r.id,
            source: r.source ? r.source.name : '',
            profile: r.profile ? r.profile.name : '',
            platform: r.profile ? r.profile.platform : '',
            reason: 'Output file missing',
            outputPath: r.output.path,
            createdAt: r.createdAt,
          });
        } else if (health.summary.inaccessible > 0) {
          items.push({
            type: 'INACCESSIBLE_OUTPUT',
            severity: 'WARNING',
            historyId: r.id,
            source: r.source ? r.source.name : '',
            profile: r.profile ? r.profile.name : '',
            platform: r.profile ? r.profile.platform : '',
            reason: 'Output file inaccessible',
            outputPath: r.output.path,
            createdAt: r.createdAt,
          });
        } else if (health.summary.invalidPath > 0) {
          items.push({
            type: 'INVALID_OUTPUT',
            severity: 'INFO',
            historyId: r.id,
            source: r.source ? r.source.name : '',
            profile: r.profile ? r.profile.name : '',
            platform: r.profile ? r.profile.platform : '',
            reason: 'Output path invalid',
            outputPath: r.output.path,
            createdAt: r.createdAt,
          });
        }
      } catch (_) {
        // Output health check failed, skip
      }
    }
  }

  // Sort by severity (ERROR first), then newest first
  const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };
  items.sort((a, b) => {
    const sa = a.severity in severityOrder ? severityOrder[a.severity] : 3;
    const sb = b.severity in severityOrder ? severityOrder[b.severity] : 3;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return { items };
}

// ─── Step 6: Recent Activity ────────────────────────────────────────────────

function gatherRecentActivity(records, limit) {
  limit = limit || 10;
  if (!Array.isArray(records)) return { items: [] };

  const sorted = records
    .filter(r => !r.archived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recent = sorted
    .slice(0, limit)
    .map(r => ({
      id: r.id,
      source: r.source ? r.source.name : '',
      profile: r.profile ? r.profile.name : '',
      platform: r.profile ? r.profile.platform : '',
      exportType: r.exportType || '',
      status: r.status,
      error: r.error || null,
      createdAt: r.createdAt,
      completedAt: r.completedAt || null,
      outputPath: r.output ? r.output.path : '',
      outputFilename: r.output ? r.output.filename : '',
      attemptNumber: r.attemptNumber || null,
    }));

  return { items: recent };
}

// ─── Step 8: Export Type Summary ────────────────────────────────────────────

function gatherExportTypeSummary(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { cut: 0, reel: 0, split: 0, bulk: 0, scheduled: 0, total: 0 };
  }

  let cut = 0, reel = 0, split = 0, bulk = 0, scheduled = 0;

  for (const r of records) {
    if (r.exportType === 'cut') cut++;
    else if (r.exportType === 'reel') reel++;
    else if (r.exportType === 'split') split++;

    if (r.planId) bulk++;
    if (r.jobId && !r.planId) scheduled++;
  }

  return { cut, reel, split, bulk, scheduled, total: records.length };
}

// ─── Step 9: Profile Summary ────────────────────────────────────────────────

function gatherProfileSummary(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { active: [], withFailures: [] };
  }

  const profileMap = {};

  for (const r of records) {
    if (r.archived) continue;
    const name = (r.profile && r.profile.name) || 'Unknown';
    const id = (r.profile && r.profile.id) || null;
    const platform = (r.profile && r.profile.platform) || null;

    if (!profileMap[name]) {
      profileMap[name] = { id, name, platform, total: 0, failed: 0, recentCount: 0 };
    }
    const p = profileMap[name];
    p.total++;
    if (r.status === EXPORT_HISTORY_STATUS.FAILED) p.failed++;

    // Count recent (last 7 days)
    const createdAt = new Date(r.createdAt).getTime();
    if (Date.now() - createdAt < 7 * 86400000) {
      p.recentCount++;
    }
  }

  const all = Object.values(profileMap).sort((a, b) => b.recentCount - a.recentCount);
  const withFailures = all.filter(p => p.failed > 0).sort((a, b) => b.failed - a.failed);

  return { active: all, withFailures };
}

// ─── Step 10: Output Health ─────────────────────────────────────────────────

function gatherOutputHealth(records) {
  const defaultHealth = { available: 0, missing: 0, invalidPath: 0, inaccessible: 0, total: 0 };

  if (!Array.isArray(records)) return defaultHealth;

  const completedRecords = records.filter(
    r => r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path
  );

  if (completedRecords.length === 0) return defaultHealth;

  try {
    const healthResult = batchCheckRecordOutputHealth(completedRecords);
    return {
      available: healthResult.summary.available,
      missing: healthResult.summary.missing,
      invalidPath: healthResult.summary.invalidPath,
      inaccessible: healthResult.summary.inaccessible,
      total: completedRecords.length,
    };
  } catch (_) {
    return defaultHealth;
  }
}

// ─── Step 11: Recovery Summary ──────────────────────────────────────────────

function gatherRecoverySummary(records) {
  if (!Array.isArray(records)) {
    return { failed: 0, retryReady: 0, missingOutputs: 0, recentlyRecovered: 0 };
  }

  const counts = getRecoveryCounts(records);

  // Count recently recovered (retry attempts that succeeded in last 7 days)
  let recentlyRecovered = 0;
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  for (const r of records) {
    if (r.attemptNumber && r.attemptNumber > 1 && r.status === EXPORT_HISTORY_STATUS.COMPLETED) {
      const completedAt = new Date(r.completedAt || r.createdAt).getTime();
      if (completedAt >= sevenDaysAgo) recentlyRecovered++;
    }
  }

  return {
    failed: counts.failed,
    retryReady: counts.retryReady,
    missingOutputs: counts.missingOutput,
    recentlyRecovered,
  };
}

// ─── Step 12: Schedule Summary ──────────────────────────────────────────────

function gatherScheduleState(options) {
  try {
    const getSchedulesFn = options.getSchedules;
    if (typeof getSchedulesFn !== 'function') {
      return { available: false, error: 'Scheduler unavailable', items: [], upcomingCount: 0 };
    }

    const schedules = getSchedulesFn();
    if (!Array.isArray(schedules)) {
      return { available: false, error: 'Scheduler returned invalid data', items: [], upcomingCount: 0 };
    }

    const upcoming = schedules
      .filter(s => s.status === 'SCHEDULED' || s.status === 'READY')
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .map(s => ({
        id: s.id,
        source: s.sourcePath ? s.sourcePath.split(/[/\\]/).pop() : '',
        profile: s.profileSnapshot ? s.profileSnapshot.name : '',
        platform: s.profileSnapshot ? s.profileSnapshot.platform : '',
        exportType: s.exportType || '',
        scheduledAt: s.scheduledAt,
        status: s.status,
      }));

    const processing = schedules.filter(s => s.status === 'PROCESSING');
    const completed = schedules.filter(s => s.status === 'COMPLETED');
    const failed = schedules.filter(s => s.status === 'FAILED');
    const cancelled = schedules.filter(s => s.status === 'CANCELLED');
    const paused = schedules.filter(s => s.status === 'PAUSED');

    return {
      available: true,
      upcomingCount: upcoming.length,
      processingCount: processing.length,
      completedCount: completed.length,
      failedCount: failed.length,
      cancelledCount: cancelled.length,
      pausedCount: paused.length,
      totalCount: schedules.length,
      items: upcoming,
    };
  } catch (err) {
    return { available: false, error: 'Scheduler error: ' + (err.message || 'unknown'), items: [], upcomingCount: 0 };
  }
}

// ─── Step 19: Filtering ─────────────────────────────────────────────────────

function applyCommandCenterFilter(records, filter) {
  if (!filter || typeof filter !== 'string') return records;
  const f = filter.toLowerCase().trim();

  if (f === 'active') {
    return records.filter(r => r.status !== EXPORT_HISTORY_STATUS.COMPLETED);
  }
  if (f === 'attention') {
    return records.filter(r => isNeedsAttention(r) && !r.archived);
  }
  if (f === 'recent') {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    return records.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return !isNaN(t) && t >= sevenDaysAgo && !r.archived;
    });
  }

  return records;
}

// ─── Step 20: Search ────────────────────────────────────────────────────────

function applyCommandCenterSearch(records, search) {
  if (!search || typeof search !== 'string') return records;
  const q = search.trim().toLowerCase();
  if (!q) return records;

  return records.filter(r =>
    (r.source && r.source.name && r.source.name.toLowerCase().includes(q)) ||
    (r.profile && r.profile.name && r.profile.name.toLowerCase().includes(q)) ||
    (r.output && r.output.filename && r.output.filename.toLowerCase().includes(q))
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getCommandCenterSnapshot,
  gatherQueueState,
  gatherScheduleState,
  gatherAttentionItems,
  gatherRecentActivity,
  gatherExportTypeSummary,
  gatherProfileSummary,
  gatherOutputHealth,
  gatherRecoverySummary,
  applyCommandCenterFilter,
  applyCommandCenterSearch,
  deepClone,
};
