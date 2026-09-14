'use strict';

/**
 * Export Analytics Engine — Phase 5H
 *
 * Deterministic, pure, local analytics derived from real application data.
 * Does not mutate history. All returned structures are deep-cloned.
 * Based only on actual history records and configuration snapshots.
 */

const { EXPORT_HISTORY_STATUS, loadHistory } = require('../history/exportHistoryManager');
const { OUTPUT_HEALTH_STATUS, batchCheckRecordOutputHealth } = require('../history/outputHealthService');

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function safeNum(n) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

function rate(num, den) {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

function toDateKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInRange(dateStr, from, to) {
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  if (from && t < from) return false;
  if (to && t > to) return false;
  return true;
}

// ─── Step 3: Overview Metrics ───────────────────────────────────────────────

function getOverviewMetrics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      total: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0,
      successRate: 0, failureRate: 0, retryCount: 0, archivedCount: 0,
      pinnedCount: 0, missingOutputCount: 0, availableOutputCount: 0,
    };
  }

  let completed = 0, failed = 0, cancelled = 0, skipped = 0;
  let retryCount = 0, archivedCount = 0, pinnedCount = 0;
  let missingOutputCount = 0, availableOutputCount = 0;

  for (const r of records) {
    if (r.archived) archivedCount++;
    if (r.pinned) pinnedCount++;
    if (r.attemptNumber && r.attemptNumber > 1) retryCount++;

    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) {
      completed++;
      if (r.output && r.output.path) {
        const health = batchCheckRecordOutputHealth([r]);
        if (health.summary.missing > 0) missingOutputCount++;
        else if (health.summary.available > 0) availableOutputCount++;
      }
    } else if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
      failed++;
    } else if (r.status === EXPORT_HISTORY_STATUS.CANCELLED) {
      cancelled++;
    } else if (r.status === EXPORT_HISTORY_STATUS.SKIPPED) {
      skipped++;
    }
  }

  const total = completed + failed + cancelled + skipped;

  return {
    total,
    completed,
    failed,
    cancelled,
    skipped,
    successRate: rate(completed, total),
    failureRate: rate(failed, total),
    retryCount,
    archivedCount,
    pinnedCount,
    missingOutputCount,
    availableOutputCount,
  };
}

// ─── Step 4: Time Analytics ─────────────────────────────────────────────────

function getTimeAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { today: 0, yesterday: 0, last7Days: 0, last30Days: 0, daily: {}, weekly: {}, monthly: {} };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 6 * 86400000;
  const startOf30Days = startOfToday - 29 * 86400000;

  let today = 0, yesterday = 0, last7Days = 0, last30Days = 0;
  const daily = {};
  const weekly = {};
  const monthly = {};

  for (const r of records) {
    const t = new Date(r.createdAt).getTime();
    if (isNaN(t)) continue;

    if (t >= startOfToday) today++;
    else if (t >= startOfYesterday) yesterday++;
    if (t >= startOf7Days) last7Days++;
    if (t >= startOf30Days) last30Days++;

    const dayKey = toDateKey(r.createdAt);
    if (dayKey) daily[dayKey] = (daily[dayKey] || 0) + 1;

    const d = new Date(r.createdAt);
    const weekKey = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}`;
    weekly[weekKey] = (weekly[weekKey] || 0) + 1;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[monthKey] = (monthly[monthKey] || 0) + 1;
  }

  return { today, yesterday, last7Days, last30Days, daily, weekly, monthly };
}

// ─── Step 5: Profile Analytics ──────────────────────────────────────────────

function getProfileAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { byProfile: [], mostUsed: null, highestVolume: null, mostFailures: null };
  }

  const profileMap = {};

  for (const r of records) {
    const name = (r.profile && r.profile.name) || 'Unknown';
    const id = (r.profile && r.profile.id) || null;
    if (!profileMap[name]) {
      profileMap[name] = { id, name, total: 0, completed: 0, failed: 0, retryCount: 0 };
    }
    const p = profileMap[name];
    p.total++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) p.completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) p.failed++;
    if (r.attemptNumber && r.attemptNumber > 1) p.retryCount++;
  }

  const byProfile = Object.values(profileMap).map(p => ({
    ...p,
    successRate: rate(p.completed, p.total),
  })).sort((a, b) => b.total - a.total);

  const mostUsed = byProfile[0]?.name || null;
  const highestVolume = byProfile[0]?.name || null;
  const mostFailures = [...byProfile].sort((a, b) => b.failed - a.failed)[0]?.name || null;

  return { byProfile, mostUsed, highestVolume, mostFailures };
}

// ─── Step 6: Platform Analytics ─────────────────────────────────────────────

function getPlatformAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { byPlatform: [], total: 0 };
  }

  const platformMap = {};

  for (const r of records) {
    const platform = (r.profile && r.profile.platform) || 'Unknown';
    if (!platformMap[platform]) {
      platformMap[platform] = { platform, total: 0, completed: 0, failed: 0 };
    }
    const p = platformMap[platform];
    p.total++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) p.completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) p.failed++;
  }

  const byPlatform = Object.values(platformMap)
    .map(p => ({ ...p, successRate: rate(p.completed, p.total) }))
    .sort((a, b) => b.total - a.total);

  return { byPlatform, total: records.length };
}

// ─── Step 7: Preset Analytics ───────────────────────────────────────────────

function getPresetAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { exportPresets: [], variationPresets: [], captionTemplates: [] };
  }

  const presetMap = {};
  const variationMap = {};
  const captionMap = {};

  for (const r of records) {
    // Export preset
    const epName = (r.exportPreset && r.exportPreset.name) || 'None';
    const epId = (r.exportPreset && r.exportPreset.id) || null;
    if (!presetMap[epName]) presetMap[epName] = { id: epId, name: epName, usageCount: 0, completed: 0, failed: 0 };
    presetMap[epName].usageCount++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) presetMap[epName].completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) presetMap[epName].failed++;

    // Variation preset
    const vpName = (r.variationPreset && r.variationPreset.name) || 'None';
    const vpId = (r.variationPreset && r.variationPreset.id) || null;
    if (!variationMap[vpName]) variationMap[vpName] = { id: vpId, name: vpName, usageCount: 0, completed: 0, failed: 0 };
    variationMap[vpName].usageCount++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) variationMap[vpName].completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) variationMap[vpName].failed++;

    // Caption template
    const ctName = (r.captionTemplate && r.captionTemplate.name) || 'None';
    const ctId = (r.captionTemplate && r.captionTemplate.id) || null;
    if (!captionMap[ctName]) captionMap[ctName] = { id: ctId, name: ctName, usageCount: 0, completed: 0, failed: 0 };
    captionMap[ctName].usageCount++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) captionMap[ctName].completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) captionMap[ctName].failed++;
  }

  const sortFn = (a, b) => b.usageCount - a.usageCount;

  return {
    exportPresets: Object.values(presetMap).sort(sortFn),
    variationPresets: Object.values(variationMap).sort(sortFn),
    captionTemplates: Object.values(captionMap).sort(sortFn),
  };
}

// ─── Step 8: Export Type Analytics ──────────────────────────────────────────

function getExportTypeAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { byType: [], bulkCount: 0, scheduledCount: 0, total: 0 };
  }

  const typeMap = {};
  let bulkCount = 0;
  let scheduledCount = 0;

  for (const r of records) {
    const type = r.exportType || 'Unknown';
    if (!typeMap[type]) typeMap[type] = { type, total: 0, completed: 0, failed: 0 };
    typeMap[type].total++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) typeMap[type].completed++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) typeMap[type].failed++;

    if (r.planId) bulkCount++;
    if (r.jobId && !r.planId) scheduledCount++;
  }

  const byType = Object.values(typeMap)
    .map(t => ({ ...t, successRate: rate(t.completed, t.total) }))
    .sort((a, b) => b.total - a.total);

  return { byType, bulkCount, scheduledCount, total: records.length };
}

// ─── Step 9: Recovery Analytics ─────────────────────────────────────────────

function getRecoveryAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      failed: 0, retryAttempts: 0, successfulRetries: 0, failedRetries: 0,
      missingOutput: 0, recoveryReady: 0, recoverySuccessRate: 0,
    };
  }

  let failed = 0, retryAttempts = 0, successfulRetries = 0, failedRetries = 0;
  let missingOutput = 0, recoveryReady = 0;

  for (const r of records) {
    if (r.status === EXPORT_HISTORY_STATUS.FAILED) {
      failed++;
      recoveryReady++;
    }
    if (r.attemptNumber && r.attemptNumber > 1) {
      retryAttempts++;
      if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) successfulRetries++;
      else if (r.status === EXPORT_HISTORY_STATUS.FAILED) failedRetries++;
    }
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path) {
      const health = batchCheckRecordOutputHealth([r]);
      if (health.summary.missing > 0) missingOutput++;
    }
  }

  const recoverySuccessRate = rate(successfulRetries, retryAttempts);

  return { failed, retryAttempts, successfulRetries, failedRetries, missingOutput, recoveryReady, recoverySuccessRate };
}

// ─── Step 10: Attempt Analytics ─────────────────────────────────────────────

function getAttemptAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalChains: 0, singleAttemptSuccesses: 0, retryChains: 0,
      recoveredChains: 0, unresolvedChains: 0, avgAttemptsForRecovered: 0,
    };
  }

  const chainMap = {};

  for (const r of records) {
    const groupId = r.attemptGroupId || r.id;
    if (!chainMap[groupId]) chainMap[groupId] = [];
    chainMap[groupId].push(r);
  }

  let totalChains = 0, singleAttemptSuccesses = 0, retryChains = 0;
  let recoveredChains = 0, unresolvedChains = 0;
  let totalRecoveredAttempts = 0;

  for (const [, chain] of Object.entries(chainMap)) {
    totalChains++;
    const hasRetry = chain.some(r => r.attemptNumber && r.attemptNumber > 1);

    if (!hasRetry) {
      const lastStatus = chain[chain.length - 1].status;
      if (lastStatus === EXPORT_HISTORY_STATUS.COMPLETED) singleAttemptSuccesses++;
    } else {
      retryChains++;
      const lastRecord = chain.sort((a, b) => (b.attemptNumber || 0) - (a.attemptNumber || 0))[0];
      if (lastRecord.status === EXPORT_HISTORY_STATUS.COMPLETED) {
        recoveredChains++;
        totalRecoveredAttempts += chain.length;
      } else {
        unresolvedChains++;
      }
    }
  }

  const avgAttemptsForRecovered = recoveredChains > 0
    ? Math.round((totalRecoveredAttempts / recoveredChains) * 10) / 10
    : 0;

  return { totalChains, singleAttemptSuccesses, retryChains, recoveredChains, unresolvedChains, avgAttemptsForRecovered };
}

// ─── Step 11: Bulk Export Analytics ─────────────────────────────────────────

function getBulkAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalBulkJobs: 0, completedBulkJobs: 0, failedBulkJobs: 0,
      bulkSuccessRate: 0, avgJobsPerPlan: 0, largestPlan: 0,
      profilesUsed: [], planIds: [],
    };
  }

  const planMap = {};

  for (const r of records) {
    if (!r.planId) continue;
    if (!planMap[r.planId]) planMap[r.planId] = { planId: r.planId, jobs: [], profiles: new Set() };
    const plan = planMap[r.planId];
    plan.jobs.push(r);
    if (r.profile && r.profile.name) plan.profiles.add(r.profile.name);
  }

  const planIds = Object.keys(planMap);
  const totalBulkJobs = records.filter(r => r.planId).length;
  const completedBulkJobs = records.filter(r => r.planId && r.status === EXPORT_HISTORY_STATUS.COMPLETED).length;
  const failedBulkJobs = records.filter(r => r.planId && r.status === EXPORT_HISTORY_STATUS.FAILED).length;
  const bulkSuccessRate = rate(completedBulkJobs, totalBulkJobs);
  const avgJobsPerPlan = planIds.length > 0 ? Math.round((totalBulkJobs / planIds.length) * 10) / 10 : 0;
  const largestPlan = planIds.reduce((max, id) => Math.max(max, planMap[id].jobs.length), 0);

  const profilesSet = new Set();
  for (const plan of Object.values(planMap)) {
    for (const p of plan.profiles) profilesSet.add(p);
  }
  const profilesUsed = [...profilesSet];

  return { totalBulkJobs, completedBulkJobs, failedBulkJobs, bulkSuccessRate, avgJobsPerPlan, largestPlan, profilesUsed, planIds };
}

// ─── Step 12: Scheduled Analytics ──────────────────────────────────────────

function getScheduledAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { scheduledExports: 0, completedScheduled: 0, failedScheduled: 0, cancelledScheduled: 0, scheduledSuccessRate: 0 };
  }

  let scheduledExports = 0, completedScheduled = 0, failedScheduled = 0, cancelledScheduled = 0;

  for (const r of records) {
    if (!r.jobId || r.planId) continue;
    scheduledExports++;
    if (r.status === EXPORT_HISTORY_STATUS.COMPLETED) completedScheduled++;
    else if (r.status === EXPORT_HISTORY_STATUS.FAILED) failedScheduled++;
    else if (r.status === EXPORT_HISTORY_STATUS.CANCELLED) cancelledScheduled++;
  }

  return { scheduledExports, completedScheduled, failedScheduled, cancelledScheduled, scheduledSuccessRate: rate(completedScheduled, scheduledExports) };
}

// ─── Step 13: Output Health Analytics ──────────────────────────────────────

function getOutputHealthAnalytics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { available: 0, missing: 0, invalidPath: 0, inaccessible: 0, total: 0 };
  }

  const completedRecords = records.filter(r => r.status === EXPORT_HISTORY_STATUS.COMPLETED && r.output && r.output.path);
  if (completedRecords.length === 0) {
    return { available: 0, missing: 0, invalidPath: 0, inaccessible: 0, total: 0 };
  }

  const healthResult = batchCheckRecordOutputHealth(completedRecords);
  return {
    available: healthResult.summary.available,
    missing: healthResult.summary.missing,
    invalidPath: healthResult.summary.invalidPath,
    inaccessible: healthResult.summary.inaccessible,
    total: completedRecords.length,
  };
}

// ─── Step 14: Workflow Insights ─────────────────────────────────────────────

function generateInsights(overview, profileAnalytics, platformAnalytics, presetAnalytics, recoveryAnalytics, attemptAnalytics, bulkAnalytics, outputHealth) {
  const insights = [];

  if (overview.total === 0) return insights;

  if (profileAnalytics.mostUsed) {
    const topProfile = profileAnalytics.byProfile.find(p => p.name === profileAnalytics.mostUsed);
    if (topProfile && topProfile.total > 0) {
      insights.push({ type: 'info', text: `Most exports use ${profileAnalytics.mostUsed} (${topProfile.total} exports).` });
    }
  }

  if (profileAnalytics.mostFailures && overview.failed > 0) {
    const failProfile = profileAnalytics.byProfile.find(p => p.name === profileAnalytics.mostFailures);
    if (failProfile && failProfile.failed > 0) {
      insights.push({ type: 'warning', text: `Failed exports are concentrated in ${profileAnalytics.mostFailures} (${failProfile.failed} failures).` });
    }
  }

  if (presetAnalytics.exportPresets.length > 0) {
    const topPreset = presetAnalytics.exportPresets[0];
    if (topPreset.name !== 'None' && topPreset.usageCount > 0) {
      insights.push({ type: 'info', text: `You used Export Preset "${topPreset.name}" most often (${topPreset.usageCount} times).` });
    }
  }

  if (outputHealth.missing > 0) {
    insights.push({ type: 'warning', text: `There are ${outputHealth.missing} missing output files.` });
  }

  if (recoveryAnalytics.successfulRetries > 0) {
    insights.push({ type: 'info', text: `${recoveryAnalytics.successfulRetries} failed export(s) have successful retry attempts.` });
  }

  if (bulkAnalytics.totalBulkJobs > 0 && overview.completed > 0) {
    const bulkPct = rate(bulkAnalytics.totalBulkJobs, overview.total);
    insights.push({ type: 'info', text: `Bulk exports account for ${bulkPct}% of total jobs (${bulkAnalytics.totalBulkJobs}/${overview.total}).` });
  }

  if (attemptAnalytics.recoveredChains > 0) {
    insights.push({ type: 'info', text: `${attemptAnalytics.recoveredChains} retry chain(s) were eventually recovered.` });
  }

  return insights;
}

// ─── Step 15: Attention Signals ─────────────────────────────────────────────

function generateAttentionSignals(overview, recoveryAnalytics, outputHealth, profileAnalytics) {
  const signals = [];

  if (overview.failed > 3) {
    signals.push({ type: 'needs_attention', text: `Needs attention: ${overview.failed} failed exports.` });
  }

  if (outputHealth.missing > 3) {
    signals.push({ type: 'needs_attention', text: `Growing missing-output count: ${outputHealth.missing} files.` });
  }

  if (recoveryAnalytics.failedRetries > 0) {
    signals.push({ type: 'needs_attention', text: `Repeated export failures: ${recoveryAnalytics.failedRetries} retry attempt(s) failed.` });
  }

  if (profileAnalytics.byProfile.length > 0) {
    const worstProfile = profileAnalytics.byProfile.reduce((worst, p) => (p.failed > (worst?.failed || 0) ? p : worst), null);
    if (worstProfile && worstProfile.failed >= 2) {
      signals.push({ type: 'needs_attention', text: `Profile "${worstProfile.name}" has ${worstProfile.failed} failures.` });
    }
  }

  if (recoveryAnalytics.recoveryReady > 5) {
    signals.push({ type: 'needs_attention', text: `Large number of unresolved exports: ${recoveryAnalytics.recoveryReady} ready for retry.` });
  }

  return signals;
}

// ─── Step 18: Filter-Aware Analytics ────────────────────────────────────────

function applyFilters(records, filters) {
  if (!filters || typeof filters !== 'object') return records;
  let filtered = [...records];

  if (filters.search && typeof filters.search === 'string') {
    const q = filters.search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(r =>
        (r.source && r.source.name && r.source.name.toLowerCase().includes(q)) ||
        (r.profile && r.profile.name && r.profile.name.toLowerCase().includes(q)) ||
        (r.profile && r.profile.platform && r.profile.platform.toLowerCase().includes(q)) ||
        (r.output && r.output.filename && r.output.filename.toLowerCase().includes(q))
      );
    }
  }

  if (filters.status && typeof filters.status === 'string') {
    const s = filters.status.toUpperCase();
    filtered = filtered.filter(r => r.status === s);
  }

  if (filters.exportType && typeof filters.exportType === 'string') {
    filtered = filtered.filter(r => r.exportType === filters.exportType);
  }

  if (filters.platform && typeof filters.platform === 'string') {
    const p = filters.platform.toLowerCase();
    filtered = filtered.filter(r => r.profile && r.profile.platform && r.profile.platform.toLowerCase() === p);
  }

  if (filters.profileId && typeof filters.profileId === 'string') {
    filtered = filtered.filter(r => r.profile && r.profile.id === filters.profileId);
  }

  if (filters.exportPresetId && typeof filters.exportPresetId === 'string') {
    filtered = filtered.filter(r => r.exportPreset && r.exportPreset.id === filters.exportPresetId);
  }

  if (filters.variationPresetId && typeof filters.variationPresetId === 'string') {
    filtered = filtered.filter(r => r.variationPreset && r.variationPreset.id === filters.variationPresetId);
  }

  if (filters.captionTemplateId && typeof filters.captionTemplateId === 'string') {
    filtered = filtered.filter(r => r.captionTemplate && r.captionTemplate.id === filters.captionTemplateId);
  }

  if (filters.planId && typeof filters.planId === 'string') {
    filtered = filtered.filter(r => r.planId === filters.planId);
  }

  if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
    const tagSet = new Set(filters.tags.map(t => String(t).toLowerCase()));
    filtered = filtered.filter(r => Array.isArray(r.tags) && r.tags.some(t => tagSet.has(t.toLowerCase())));
  }

  if (filters.archived !== undefined) {
    filtered = filtered.filter(r => !!r.archived === !!filters.archived);
  }

  return filtered;
}

// ─── Step 19: Time Range ────────────────────────────────────────────────────

function applyTimeRange(records, range) {
  if (!range || typeof range !== 'object') return records;
  let filtered = [...records];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (range.timeRange === 'today') {
    filtered = filtered.filter(r => new Date(r.createdAt).getTime() >= startOfToday);
  } else if (range.timeRange === 'last7') {
    filtered = filtered.filter(r => new Date(r.createdAt).getTime() >= startOfToday - 6 * 86400000);
  } else if (range.timeRange === 'last30') {
    filtered = filtered.filter(r => new Date(r.createdAt).getTime() >= startOfToday - 29 * 86400000);
  } else if (range.timeRange === 'custom') {
    const from = range.dateFrom ? new Date(range.dateFrom).getTime() : null;
    const to = range.dateTo ? new Date(range.dateTo).getTime() + 86399999 : null;
    if (from !== null && to !== null && from > to) return [];
    filtered = filtered.filter(r => isInRange(r.createdAt, from, to));
  }

  return filtered;
}

// ─── Step 20: Profile Comparison ────────────────────────────────────────────

function compareProfiles(records, profileIds) {
  if (!Array.isArray(profileIds) || profileIds.length < 2) {
    return { comparisons: [], message: 'Select at least two profiles to compare.' };
  }

  const profileIdSet = new Set(profileIds);
  const relevant = records.filter(r => r.profile && r.profile.id && profileIdSet.has(r.profile.id));

  const comparisons = [];
  for (const pid of profileIds) {
    const subset = relevant.filter(r => r.profile.id === pid);
    const name = subset[0]?.profile?.name || pid;
    const completed = subset.filter(r => r.status === EXPORT_HISTORY_STATUS.COMPLETED).length;
    const failed = subset.filter(r => r.status === EXPORT_HISTORY_STATUS.FAILED).length;
    const retries = subset.filter(r => r.attemptNumber && r.attemptNumber > 1).length;
    comparisons.push({
      profileId: pid,
      name,
      exportCount: subset.length,
      completed,
      failed,
      successRate: rate(completed, subset.length),
      retryCount: retries,
    });
  }

  return { comparisons };
}

// ─── Step 21: Preset Comparison ─────────────────────────────────────────────

function comparePresets(records, presetIds, presetType) {
  const idField = presetType === 'variation' ? 'variationPreset' : 'exportPreset';
  if (!Array.isArray(presetIds) || presetIds.length < 2) {
    return { comparisons: [], message: 'Select at least two presets to compare.' };
  }

  const presetIdSet = new Set(presetIds);
  const relevant = records.filter(r => r[idField] && r[idField].id && presetIdSet.has(r[idField].id));

  const comparisons = [];
  for (const pid of presetIds) {
    const subset = relevant.filter(r => r[idField] && r[idField].id === pid);
    const name = subset[0]?.[idField]?.name || pid;
    const completed = subset.filter(r => r.status === EXPORT_HISTORY_STATUS.COMPLETED).length;
    const failed = subset.filter(r => r.status === EXPORT_HISTORY_STATUS.FAILED).length;
    comparisons.push({
      presetId: pid,
      name,
      usageCount: subset.length,
      completed,
      failed,
      successRate: rate(completed, subset.length),
    });
  }

  return { comparisons };
}

// ─── Step 22: Analytics Export ──────────────────────────────────────────────

function analyticsToJSON(analytics) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: 'Reel Cutter Export Intelligence Dashboard',
    analytics: deepClone(analytics),
  }, null, 2);
}

function analyticsToCSV(analytics) {
  const sections = [];

  // Overview
  if (analytics.overview) {
    sections.push(['Overview']);
    sections.push(['Metric', 'Value']);
    for (const [k, v] of Object.entries(analytics.overview)) {
      sections.push([k, String(v)]);
    }
    sections.push([]);
  }

  // Profile
  if (analytics.profileAnalytics && analytics.profileAnalytics.byProfile && analytics.profileAnalytics.byProfile.length > 0) {
    sections.push(['Profile Analytics']);
    sections.push(['Profile', 'Total', 'Completed', 'Failed', 'Success Rate', 'Retries']);
    for (const p of analytics.profileAnalytics.byProfile) {
      sections.push([p.name, String(p.total), String(p.completed), String(p.failed), `${p.successRate}%`, String(p.retryCount)]);
    }
    sections.push([]);
  }

  // Platform
  if (analytics.platformAnalytics && analytics.platformAnalytics.byPlatform && analytics.platformAnalytics.byPlatform.length > 0) {
    sections.push(['Platform Analytics']);
    sections.push(['Platform', 'Total', 'Completed', 'Failed', 'Success Rate']);
    for (const p of analytics.platformAnalytics.byPlatform) {
      sections.push([p.platform, String(p.total), String(p.completed), String(p.failed), `${p.successRate}%`]);
    }
    sections.push([]);
  }

  // Recovery
  if (analytics.recoveryAnalytics) {
    sections.push(['Recovery Analytics']);
    sections.push(['Metric', 'Value']);
    for (const [k, v] of Object.entries(analytics.recoveryAnalytics)) {
      sections.push([k, String(v)]);
    }
  }

  const escapeCSV = (val) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return sections.map(row => row.map(escapeCSV).join(',')).join('\n');
}

// ─── Main: Full Dashboard Analytics ─────────────────────────────────────────

function getDashboardAnalytics(allRecords, options) {
  options = options || {};
  const filters = options.filters || null;
  const timeRange = options.timeRange || null;

  let records = applyFilters(allRecords || [], filters);
  records = applyTimeRange(records, timeRange ? { timeRange: timeRange, dateFrom: options.dateFrom, dateTo: options.dateTo } : null);

  const overview = getOverviewMetrics(records);
  const timeAnalytics = getTimeAnalytics(records);
  const profileAnalytics = getProfileAnalytics(records);
  const platformAnalytics = getPlatformAnalytics(records);
  const presetAnalytics = getPresetAnalytics(records);
  const exportTypeAnalytics = getExportTypeAnalytics(records);
  const recoveryAnalytics = getRecoveryAnalytics(records);
  const attemptAnalytics = getAttemptAnalytics(records);
  const bulkAnalytics = getBulkAnalytics(records);
  const scheduledAnalytics = getScheduledAnalytics(records);
  const outputHealthAnalytics = getOutputHealthAnalytics(records);
  const insights = generateInsights(overview, profileAnalytics, platformAnalytics, presetAnalytics, recoveryAnalytics, attemptAnalytics, bulkAnalytics, outputHealthAnalytics);
  const attentionSignals = generateAttentionSignals(overview, recoveryAnalytics, outputHealthAnalytics, profileAnalytics);

  return deepClone({
    overview,
    timeAnalytics,
    profileAnalytics,
    platformAnalytics,
    presetAnalytics,
    exportTypeAnalytics,
    recoveryAnalytics,
    attemptAnalytics,
    bulkAnalytics,
    scheduledAnalytics,
    outputHealthAnalytics,
    insights,
    attentionSignals,
    filteredRecordCount: records.length,
  });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  deepClone,
  getOverviewMetrics,
  getTimeAnalytics,
  getProfileAnalytics,
  getPlatformAnalytics,
  getPresetAnalytics,
  getExportTypeAnalytics,
  getRecoveryAnalytics,
  getAttemptAnalytics,
  getBulkAnalytics,
  getScheduledAnalytics,
  getOutputHealthAnalytics,
  generateInsights,
  generateAttentionSignals,
  applyFilters,
  applyTimeRange,
  compareProfiles,
  comparePresets,
  analyticsToJSON,
  analyticsToCSV,
  getDashboardAnalytics,
};
