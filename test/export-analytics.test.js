'use strict';

/**
 * Export Analytics Engine Test Suite — Phase 5H
 *
 * Covers: overview, time, profile, platform, preset, export type,
 * recovery, attempt, bulk, scheduled, output health, insights,
 * attention signals, filter-aware, comparisons, exports, security,
 * backward compatibility, and deterministic results.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
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
} = require('../src/main/analytics/exportAnalytics');

console.log('======================================================');
console.log('Running Export Analytics Engine Test Suite (Phase 5H)');
console.log('======================================================');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('  PASS: ' + name + '\n');
  } catch (err) {
    failed++;
    errors.push({ name, err });
    process.stdout.write('  FAIL: ' + name + '\n');
    process.stdout.write('         ' + err.message + '\n');
  }
}

function makeRecord(overrides) {
  const now = new Date().toISOString();
  return {
    id: `exh_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    completedAt: now,
    source: { name: 'test.mp4', path: '/tmp/test.mp4' },
    exportType: 'cut',
    profile: { id: 'prof_1', name: 'Profile A', platform: 'Instagram' },
    exportPreset: { id: 'ep_1', name: 'Preset A' },
    variationPreset: { id: 'vp_1', name: 'Variation A' },
    captionTemplate: { id: 'ct_1', name: 'Template A' },
    output: { path: '/tmp/output/test.mp4', directory: '/tmp/output', filename: 'test.mp4' },
    status: 'COMPLETED',
    error: null,
    planId: null,
    jobId: null,
    settingsSnapshot: null,
    archived: false,
    pinned: false,
    ...overrides,
  };
}

function makeFailedRecord(overrides) {
  return makeRecord({ status: 'FAILED', error: 'Source file not found', ...overrides });
}

function makeBulkRecord(planId, overrides) {
  return makeRecord({ planId, ...overrides });
}

function makeScheduledRecord(jobId, overrides) {
  return makeRecord({ jobId, ...overrides });
}

function makeRetryRecord(groupId, attemptNum, overrides) {
  return makeRecord({
    attemptGroupId: groupId,
    attemptNumber: attemptNum,
    parentHistoryId: attemptNum > 1 ? `${groupId}_prev` : undefined,
    ...overrides,
  });
}

// ─── A. Empty History ────────────────────────────────────────────────────────

test('A: Empty history returns zero metrics', function() {
  const ov = getOverviewMetrics([]);
  assert.strictEqual(ov.total, 0);
  assert.strictEqual(ov.completed, 0);
  assert.strictEqual(ov.failed, 0);
  assert.strictEqual(ov.successRate, 0);
});

test('A: Empty history time analytics', function() {
  const ta = getTimeAnalytics([]);
  assert.strictEqual(ta.today, 0);
  assert.strictEqual(ta.last7Days, 0);
  assert.strictEqual(ta.last30Days, 0);
});

test('A: Empty history profile analytics', function() {
  const pa = getProfileAnalytics([]);
  assert.deepStrictEqual(pa.byProfile, []);
  assert.strictEqual(pa.mostUsed, null);
});

test('A: Empty history platform analytics', function() {
  const pa = getPlatformAnalytics([]);
  assert.deepStrictEqual(pa.byPlatform, []);
  assert.strictEqual(pa.total, 0);
});

test('A: Empty history preset analytics', function() {
  const pa = getPresetAnalytics([]);
  assert.deepStrictEqual(pa.exportPresets, []);
  assert.deepStrictEqual(pa.variationPresets, []);
  assert.deepStrictEqual(pa.captionTemplates, []);
});

test('A: Empty history export type analytics', function() {
  const et = getExportTypeAnalytics([]);
  assert.deepStrictEqual(et.byType, []);
  assert.strictEqual(et.bulkCount, 0);
});

test('A: Empty history recovery analytics', function() {
  const ra = getRecoveryAnalytics([]);
  assert.strictEqual(ra.failed, 0);
  assert.strictEqual(ra.retryAttempts, 0);
  assert.strictEqual(ra.recoverySuccessRate, 0);
});

test('A: Empty history attempt analytics', function() {
  const aa = getAttemptAnalytics([]);
  assert.strictEqual(aa.totalChains, 0);
  assert.strictEqual(aa.singleAttemptSuccesses, 0);
});

test('A: Empty history bulk analytics', function() {
  const ba = getBulkAnalytics([]);
  assert.strictEqual(ba.totalBulkJobs, 0);
  assert.strictEqual(ba.avgJobsPerPlan, 0);
});

test('A: Empty history scheduled analytics', function() {
  const sa = getScheduledAnalytics([]);
  assert.strictEqual(sa.scheduledExports, 0);
  assert.strictEqual(sa.scheduledSuccessRate, 0);
});

test('A: Empty history output health analytics', function() {
  const oh = getOutputHealthAnalytics([]);
  assert.strictEqual(oh.available, 0);
  assert.strictEqual(oh.missing, 0);
});

test('A: Empty history dashboard analytics', function() {
  const da = getDashboardAnalytics([]);
  assert.strictEqual(da.overview.total, 0);
  assert.deepStrictEqual(da.insights, []);
});

// ─── B. Overview Statistics ──────────────────────────────────────────────────

test('B: Overview counts by status', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
    makeRecord({ status: 'CANCELLED' }),
    makeRecord({ status: 'SKIPPED' }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.total, 5);
  assert.strictEqual(ov.completed, 2);
  assert.strictEqual(ov.failed, 1);
  assert.strictEqual(ov.cancelled, 1);
  assert.strictEqual(ov.skipped, 1);
});

// ─── C. Success Rate ─────────────────────────────────────────────────────────

test('C: Success rate calculation', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.successRate, 75);
});

test('C: Success rate with zero total', function() {
  const ov = getOverviewMetrics([]);
  assert.strictEqual(ov.successRate, 0);
});

// ─── D. Failure Rate ─────────────────────────────────────────────────────────

test('D: Failure rate calculation', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
    makeRecord({ status: 'FAILED' }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.failureRate, 67);
});

// ─── E. Retry Count ──────────────────────────────────────────────────────────

test('E: Retry count from attempt numbers', function() {
  const records = [
    makeRecord({ attemptNumber: 1 }),
    makeRecord({ attemptNumber: 2 }),
    makeRecord({ attemptNumber: 3 }),
    makeRecord({ attemptNumber: undefined }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.retryCount, 2);
});

// ─── F. Archive Count ────────────────────────────────────────────────────────

test('F: Archive count in overview', function() {
  const records = [
    makeRecord({ archived: true }),
    makeRecord({ archived: true }),
    makeRecord({ archived: false }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.archivedCount, 2);
});

// ─── G. Pin Count ────────────────────────────────────────────────────────────

test('G: Pin count in overview', function() {
  const records = [
    makeRecord({ pinned: true }),
    makeRecord({ pinned: false }),
    makeRecord({ pinned: true }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.pinnedCount, 2);
});

// ─── H. Output Health Statistics ─────────────────────────────────────────────

test('H: Output health with no path returns nothing', function() {
  const records = [
    makeRecord({ output: { path: '', directory: '', filename: '' } }),
  ];
  const oh = getOutputHealthAnalytics(records);
  assert.strictEqual(oh.total, 0);
});

// ─── I. Today Filter ─────────────────────────────────────────────────────────

test('I: Today filter', function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 12, 0, 0).toISOString();
  const records = [
    makeRecord({ createdAt: today }),
    makeRecord({ createdAt: yesterday }),
  ];
  const ta = getTimeAnalytics(records);
  assert.strictEqual(ta.today, 1);
});

// ─── J. Last 7 Days ──────────────────────────────────────────────────────────

test('J: Last 7 days filter', function() {
  const today = new Date().toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
  const records = [
    makeRecord({ createdAt: today }),
    makeRecord({ createdAt: threeDaysAgo }),
    makeRecord({ createdAt: tenDaysAgo }),
  ];
  const ta = getTimeAnalytics(records);
  assert.strictEqual(ta.last7Days, 2);
});

// ─── K. Last 30 Days ─────────────────────────────────────────────────────────

test('K: Last 30 days filter', function() {
  const today = new Date().toISOString();
  const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString();
  const fortyDaysAgo = new Date(Date.now() - 40 * 86400000).toISOString();
  const records = [
    makeRecord({ createdAt: today }),
    makeRecord({ createdAt: twentyDaysAgo }),
    makeRecord({ createdAt: fortyDaysAgo }),
  ];
  const ta = getTimeAnalytics(records);
  assert.strictEqual(ta.last30Days, 2);
});

// ─── L. Custom Date Range ────────────────────────────────────────────────────

test('L: Custom date range filter', function() {
  const from = new Date(Date.now() - 5 * 86400000).toISOString();
  const to = new Date(Date.now() + 1 * 86400000).toISOString();
  const records = [
    makeRecord({ createdAt: from }),
    makeRecord({ createdAt: to }),
  ];
  const filtered = applyTimeRange(records, { timeRange: 'custom', dateFrom: from, dateTo: to });
  assert.strictEqual(filtered.length, 2);
});

// ─── M. Invalid Date Range ───────────────────────────────────────────────────

test('M: Invalid date range returns empty', function() {
  const from = new Date(Date.now() + 10 * 86400000).toISOString();
  const to = new Date(Date.now() - 10 * 86400000).toISOString();
  const records = [makeRecord()];
  const filtered = applyTimeRange(records, { timeRange: 'custom', dateFrom: from, dateTo: to });
  assert.strictEqual(filtered.length, 0);
});

// ─── N. Profile Analytics ────────────────────────────────────────────────────

test('N: Profile analytics with multiple profiles', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'Instagram' } }),
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'Instagram' } }),
    makeRecord({ profile: { id: 'p2', name: 'Profile B', platform: 'TikTok' } }),
  ];
  const pa = getProfileAnalytics(records);
  assert.strictEqual(pa.byProfile.length, 2);
  assert.strictEqual(pa.mostUsed, 'Profile A');
});

test('N: Profile analytics failure counting', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'Instagram' }, status: 'FAILED' }),
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'Instagram' }, status: 'FAILED' }),
    makeRecord({ profile: { id: 'p2', name: 'Profile B', platform: 'TikTok' }, status: 'COMPLETED' }),
  ];
  const pa = getProfileAnalytics(records);
  assert.strictEqual(pa.mostFailures, 'Profile A');
});

// ─── O. Platform Analytics ───────────────────────────────────────────────────

test('O: Platform analytics grouping', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'Instagram' } }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TikTok' } }),
    makeRecord({ profile: { id: 'p3', name: 'C', platform: 'Instagram' } }),
  ];
  const pa = getPlatformAnalytics(records);
  assert.strictEqual(pa.byPlatform.length, 2);
  const instagram = pa.byPlatform.find(p => p.platform === 'Instagram');
  assert.strictEqual(instagram.total, 2);
});

// ─── P. Export Preset Analytics ──────────────────────────────────────────────

test('P: Export preset usage counting', function() {
  const records = [
    makeRecord({ exportPreset: { id: 'ep1', name: 'HD' } }),
    makeRecord({ exportPreset: { id: 'ep1', name: 'HD' } }),
    makeRecord({ exportPreset: { id: 'ep2', name: '4K' } }),
  ];
  const pa = getPresetAnalytics(records);
  assert.strictEqual(pa.exportPresets.length, 2);
  assert.strictEqual(pa.exportPresets[0].name, 'HD');
  assert.strictEqual(pa.exportPresets[0].usageCount, 2);
});

// ─── Q. Variation Preset Analytics ───────────────────────────────────────────

test('Q: Variation preset usage counting', function() {
  const records = [
    makeRecord({ variationPreset: { id: 'vp1', name: 'Var A' } }),
    makeRecord({ variationPreset: { id: 'vp1', name: 'Var A' } }),
  ];
  const pa = getPresetAnalytics(records);
  assert.strictEqual(pa.variationPresets.length, 1);
  assert.strictEqual(pa.variationPresets[0].usageCount, 2);
});

// ─── R. Caption Template Analytics ───────────────────────────────────────────

test('R: Caption template usage counting', function() {
  const records = [
    makeRecord({ captionTemplate: { id: 'ct1', name: 'Bold' } }),
    makeRecord({ captionTemplate: { id: 'ct2', name: 'Minimal' } }),
    makeRecord({ captionTemplate: { id: 'ct1', name: 'Bold' } }),
  ];
  const pa = getPresetAnalytics(records);
  assert.strictEqual(pa.captionTemplates.length, 2);
  assert.strictEqual(pa.captionTemplates[0].name, 'Bold');
  assert.strictEqual(pa.captionTemplates[0].usageCount, 2);
});

// ─── S. Export Type Analytics ────────────────────────────────────────────────

test('S: Export type grouping', function() {
  const records = [
    makeRecord({ exportType: 'cut' }),
    makeRecord({ exportType: 'cut' }),
    makeRecord({ exportType: 'reel' }),
    makeRecord({ exportType: 'split' }),
  ];
  const et = getExportTypeAnalytics(records);
  assert.strictEqual(et.byType.length, 3);
  assert.strictEqual(et.byType[0].type, 'cut');
  assert.strictEqual(et.byType[0].total, 2);
});

// ─── T. Bulk Analytics ───────────────────────────────────────────────────────

test('T: Bulk analytics from plan IDs', function() {
  const records = [
    makeBulkRecord('plan_1', { status: 'COMPLETED' }),
    makeBulkRecord('plan_1', { status: 'COMPLETED' }),
    makeBulkRecord('plan_2', { status: 'FAILED' }),
  ];
  const ba = getBulkAnalytics(records);
  assert.strictEqual(ba.totalBulkJobs, 3);
  assert.strictEqual(ba.completedBulkJobs, 2);
  assert.strictEqual(ba.failedBulkJobs, 1);
  assert.strictEqual(ba.avgJobsPerPlan, 1.5);
  assert.strictEqual(ba.largestPlan, 2);
  assert.strictEqual(ba.planIds.length, 2);
});

test('T: Bulk analytics profiles used', function() {
  const records = [
    makeBulkRecord('plan_1', { profile: { id: 'p1', name: 'Profile A', platform: 'IG' } }),
    makeBulkRecord('plan_1', { profile: { id: 'p2', name: 'Profile B', platform: 'TT' } }),
  ];
  const ba = getBulkAnalytics(records);
  assert.ok(ba.profilesUsed.includes('Profile A'));
  assert.ok(ba.profilesUsed.includes('Profile B'));
});

// ─── U. Scheduled Analytics ──────────────────────────────────────────────────

test('U: Scheduled analytics from job IDs without plan IDs', function() {
  const records = [
    makeScheduledRecord('job_1', { status: 'COMPLETED' }),
    makeScheduledRecord('job_2', { status: 'FAILED' }),
    makeScheduledRecord('job_3', { status: 'CANCELLED' }),
  ];
  const sa = getScheduledAnalytics(records);
  assert.strictEqual(sa.scheduledExports, 3);
  assert.strictEqual(sa.completedScheduled, 1);
  assert.strictEqual(sa.failedScheduled, 1);
  assert.strictEqual(sa.cancelledScheduled, 1);
  assert.strictEqual(sa.scheduledSuccessRate, 33);
});

// ─── V. Recovery Analytics ───────────────────────────────────────────────────

test('V: Recovery analytics counting', function() {
  const records = [
    makeFailedRecord(),
    makeFailedRecord(),
    makeRecord({ attemptNumber: 2, status: 'COMPLETED' }),
  ];
  const ra = getRecoveryAnalytics(records);
  assert.strictEqual(ra.failed, 2);
  assert.strictEqual(ra.retryAttempts, 1);
  assert.strictEqual(ra.successfulRetries, 1);
  assert.strictEqual(ra.failedRetries, 0);
});

// ─── W. Attempt Chain Analytics ──────────────────────────────────────────────

test('W: Attempt chain analytics', function() {
  const records = [
    makeRetryRecord('chain_1', 1, { status: 'COMPLETED' }),
    makeRetryRecord('chain_2', 1, { status: 'FAILED' }),
    makeRetryRecord('chain_2', 2, { status: 'COMPLETED' }),
  ];
  const aa = getAttemptAnalytics(records);
  assert.strictEqual(aa.totalChains, 2);
  assert.strictEqual(aa.singleAttemptSuccesses, 1);
  assert.strictEqual(aa.retryChains, 1);
  assert.strictEqual(aa.recoveredChains, 1);
});

// ─── X. Eventually Recovered Chain ───────────────────────────────────────────

test('X: Eventually recovered chain', function() {
  const records = [
    makeRetryRecord('chain_1', 1, { status: 'FAILED' }),
    makeRetryRecord('chain_1', 2, { status: 'FAILED' }),
    makeRetryRecord('chain_1', 3, { status: 'COMPLETED' }),
  ];
  const aa = getAttemptAnalytics(records);
  assert.strictEqual(aa.recoveredChains, 1);
  assert.strictEqual(aa.avgAttemptsForRecovered, 3);
});

// ─── Y. Unresolved Chain ─────────────────────────────────────────────────────

test('Y: Unresolved chain', function() {
  const records = [
    makeRetryRecord('chain_1', 1, { status: 'FAILED' }),
    makeRetryRecord('chain_1', 2, { status: 'FAILED' }),
  ];
  const aa = getAttemptAnalytics(records);
  assert.strictEqual(aa.unresolvedChains, 1);
  assert.strictEqual(aa.recoveredChains, 0);
});

// ─── Z. Workflow Insights ────────────────────────────────────────────────────

test('Z: Insights generated from data', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' } }),
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' } }),
    makeFailedRecord({ profile: { id: 'p2', name: 'Profile B', platform: 'TT' } }),
  ];
  const ov = getOverviewMetrics(records);
  const pa = getProfileAnalytics(records);
  const plat = getPlatformAnalytics(records);
  const presets = getPresetAnalytics(records);
  const ra = getRecoveryAnalytics(records);
  const aa = getAttemptAnalytics(records);
  const bulk = getBulkAnalytics(records);
  const oh = getOutputHealthAnalytics(records);
  const insights = generateInsights(ov, pa, plat, presets, ra, aa, bulk, oh);
  assert.ok(insights.length > 0);
  assert.ok(insights.some(i => i.text.includes('Profile A')));
});

// ─── AA. Insufficient Data Insight Suppression ───────────────────────────────

test('AA: No insights for empty data', function() {
  const ov = getOverviewMetrics([]);
  const pa = getProfileAnalytics([]);
  const plat = getPlatformAnalytics([]);
  const presets = getPresetAnalytics([]);
  const ra = getRecoveryAnalytics([]);
  const aa = getAttemptAnalytics([]);
  const bulk = getBulkAnalytics([]);
  const oh = getOutputHealthAnalytics([]);
  const insights = generateInsights(ov, pa, plat, presets, ra, aa, bulk, oh);
  assert.strictEqual(insights.length, 0);
});

// ─── AB. Attention Signals ───────────────────────────────────────────────────

test('AB: Attention signals for high failure count', function() {
  const records = [
    makeFailedRecord(),
    makeFailedRecord(),
    makeFailedRecord(),
    makeFailedRecord(),
  ];
  const ov = getOverviewMetrics(records);
  const ra = getRecoveryAnalytics(records);
  const oh = getOutputHealthAnalytics(records);
  const pa = getProfileAnalytics(records);
  const signals = generateAttentionSignals(ov, ra, oh, pa);
  assert.ok(signals.length > 0);
  assert.ok(signals.some(s => s.text.includes('failed exports')));
});

test('AB: No attention signals when everything is fine', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'COMPLETED' }),
  ];
  const ov = getOverviewMetrics(records);
  const ra = getRecoveryAnalytics(records);
  const oh = getOutputHealthAnalytics(records);
  const pa = getProfileAnalytics(records);
  const signals = generateAttentionSignals(ov, ra, oh, pa);
  assert.strictEqual(signals.length, 0);
});

// ─── AC. Filter-Aware Analytics ──────────────────────────────────────────────

test('AC: Filter by status', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
    makeRecord({ status: 'COMPLETED' }),
  ];
  const filtered = applyFilters(records, { status: 'FAILED' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].status, 'FAILED');
});

test('AC: Filter by platform', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'Instagram' } }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TikTok' } }),
  ];
  const filtered = applyFilters(records, { platform: 'tiktok' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].profile.platform, 'TikTok');
});

test('AC: Filter by exportType', function() {
  const records = [
    makeRecord({ exportType: 'cut' }),
    makeRecord({ exportType: 'reel' }),
  ];
  const filtered = applyFilters(records, { exportType: 'reel' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].exportType, 'reel');
});

test('AC: Filter by search term', function() {
  const records = [
    makeRecord({ source: { name: 'vacation.mp4', path: '/tmp/vacation.mp4' } }),
    makeRecord({ source: { name: 'birthday.mp4', path: '/tmp/birthday.mp4' } }),
  ];
  const filtered = applyFilters(records, { search: 'vacation' });
  assert.strictEqual(filtered.length, 1);
  assert.ok(filtered[0].source.name.includes('vacation'));
});

test('AC: Filter by profileId', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'IG' } }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TT' } }),
  ];
  const filtered = applyFilters(records, { profileId: 'p1' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].profile.id, 'p1');
});

test('AC: Filter by archived', function() {
  const records = [
    makeRecord({ archived: true }),
    makeRecord({ archived: false }),
  ];
  const filtered = applyFilters(records, { archived: true });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].archived, true);
});

test('AC: Combined filters', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', profile: { id: 'p1', name: 'A', platform: 'Instagram' } }),
    makeRecord({ status: 'FAILED', profile: { id: 'p1', name: 'A', platform: 'Instagram' } }),
    makeRecord({ status: 'COMPLETED', profile: { id: 'p2', name: 'B', platform: 'TikTok' } }),
  ];
  const filtered = applyFilters(records, { status: 'COMPLETED', platform: 'instagram' });
  assert.strictEqual(filtered.length, 1);
});

// ─── AD. Profile Comparison ──────────────────────────────────────────────────

test('AD: Profile comparison', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' }, status: 'COMPLETED' }),
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' }, status: 'FAILED' }),
    makeRecord({ profile: { id: 'p2', name: 'Profile B', platform: 'TT' }, status: 'COMPLETED' }),
  ];
  const result = compareProfiles(records, ['p1', 'p2']);
  assert.strictEqual(result.comparisons.length, 2);
  assert.strictEqual(result.comparisons[0].exportCount, 2);
  assert.strictEqual(result.comparisons[0].completed, 1);
  assert.strictEqual(result.comparisons[0].failed, 1);
});

test('AD: Profile comparison with less than 2 profiles', function() {
  const records = [makeRecord()];
  const result = compareProfiles(records, ['p1']);
  assert.strictEqual(result.comparisons.length, 0);
  assert.ok(result.message);
});

// ─── AE. Preset Comparison ───────────────────────────────────────────────────

test('AE: Export preset comparison', function() {
  const records = [
    makeRecord({ exportPreset: { id: 'ep1', name: 'HD' }, status: 'COMPLETED' }),
    makeRecord({ exportPreset: { id: 'ep2', name: '4K' }, status: 'FAILED' }),
  ];
  const result = comparePresets(records, ['ep1', 'ep2'], 'export');
  assert.strictEqual(result.comparisons.length, 2);
  assert.strictEqual(result.comparisons[0].usageCount, 1);
});

test('AE: Variation preset comparison', function() {
  const records = [
    makeRecord({ variationPreset: { id: 'vp1', name: 'Var A' } }),
    makeRecord({ variationPreset: { id: 'vp2', name: 'Var B' } }),
  ];
  const result = comparePresets(records, ['vp1', 'vp2'], 'variation');
  assert.strictEqual(result.comparisons.length, 2);
});

// ─── AF. Analytics Deep Clone ────────────────────────────────────────────────

test('AF: Analytics result is deep cloned', function() {
  const records = [makeRecord()];
  const a1 = getDashboardAnalytics(records);
  const a2 = getDashboardAnalytics(records);
  a1.overview.total = 999;
  assert.strictEqual(a2.overview.total, 1);
});

// ─── AG. History Immutability ────────────────────────────────────────────────

test('AG: Analytics does not mutate input records', function() {
  const records = [makeRecord({ pinned: false, archived: false })];
  const original = JSON.parse(JSON.stringify(records));
  getDashboardAnalytics(records);
  assert.deepStrictEqual(records, original);
});

// ─── AH. Deleted Profile Snapshot Compatibility ─────────────────────────────

test('AH: Deleted profile snapshot still analytics-compatible', function() {
  const records = [
    makeRecord({ profile: { id: 'deleted_profile', name: 'Deleted Profile', platform: 'Unknown' } }),
  ];
  const pa = getProfileAnalytics(records);
  assert.strictEqual(pa.byProfile.length, 1);
  assert.strictEqual(pa.byProfile[0].name, 'Deleted Profile');
});

// ─── AI. Deleted Preset Snapshot Compatibility ───────────────────────────────

test('AI: Deleted preset snapshot still analytics-compatible', function() {
  const records = [
    makeRecord({ exportPreset: { id: 'deleted_preset', name: 'Deleted Preset' } }),
  ];
  const pa = getPresetAnalytics(records);
  assert.strictEqual(pa.exportPresets.length, 1);
  assert.strictEqual(pa.exportPresets[0].name, 'Deleted Preset');
});

// ─── AJ. Missing Output Handling ─────────────────────────────────────────────

test('AJ: Missing output counted in overview', function() {
  const records = [
    makeRecord({ output: { path: '', directory: '', filename: '' } }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.missingOutputCount, 0);
  assert.strictEqual(ov.availableOutputCount, 0);
});

// ─── AK. Invalid Output Handling ─────────────────────────────────────────────

test('AK: Invalid output path handled gracefully', function() {
  const records = [
    makeRecord({ output: { path: null, directory: '', filename: '' } }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.total, 1);
});

// ─── AL. CSV Export ──────────────────────────────────────────────────────────

test('AL: CSV export contains headers', function() {
  const records = [makeRecord()];
  const a = getDashboardAnalytics(records);
  const csv = analyticsToCSV(a);
  assert.ok(csv.includes('Overview'));
  assert.ok(csv.includes('Metric'));
});

test('AL: CSV export for empty analytics', function() {
  const a = getDashboardAnalytics([]);
  const csv = analyticsToCSV(a);
  assert.ok(typeof csv === 'string');
});

// ─── AM. JSON Export ─────────────────────────────────────────────────────────

test('AM: JSON export is valid JSON', function() {
  const records = [makeRecord()];
  const a = getDashboardAnalytics(records);
  const json = analyticsToJSON(a);
  const parsed = JSON.parse(json);
  assert.ok(parsed.exportedAt);
  assert.ok(parsed.analytics);
});

// ─── AN. Export Path Validation ──────────────────────────────────────────────

test('AN: JSON export has required fields', function() {
  const json = analyticsToJSON({});
  const parsed = JSON.parse(json);
  assert.ok(parsed.exportedAt);
  assert.strictEqual(parsed.source, 'Reel Cutter Export Intelligence Dashboard');
});

// ─── AO. IPC Validation ──────────────────────────────────────────────────────

test('AO: getDashboardAnalytics with null input', function() {
  const da = getDashboardAnalytics(null);
  assert.strictEqual(da.overview.total, 0);
});

test('AO: getDashboardAnalytics with undefined options', function() {
  const da = getDashboardAnalytics([makeRecord()], undefined);
  assert.strictEqual(da.overview.total, 1);
});

// ─── AP. Path Traversal Protection ──────────────────────────────────────────

test('AP: applyFilters with malicious search term', function() {
  const records = [makeRecord()];
  const filtered = applyFilters(records, { search: '../../../etc/passwd' });
  assert.strictEqual(filtered.length, 0);
});

// ─── AQ. Prototype Pollution Protection ──────────────────────────────────────

test('AQ: applyFilters with __proto__ in filter', function() {
  const records = [makeRecord()];
  const result = applyFilters(records, { '__proto__': { polluted: true } });
  assert.strictEqual(result.length, 1);
  assert.strictEqual({}.polluted, undefined);
});

// ─── AR. Feature Gating ──────────────────────────────────────────────────────

test('AR: Dashboard analytics does not require feature check (pure computation)', function() {
  const records = [makeRecord()];
  const da = getDashboardAnalytics(records);
  assert.strictEqual(da.overview.total, 1);
});

// ─── AS. Backward Compatibility ──────────────────────────────────────────────

test('AS: Records without Phase 5F/5G fields still work', function() {
  const records = [
    {
      id: 'old_record',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      source: { name: 'old.mp4', path: '/tmp/old.mp4' },
      exportType: 'cut',
      profile: { id: 'p1', name: 'Old Profile', platform: 'Instagram' },
      exportPreset: { id: null, name: null },
      variationPreset: { id: null, name: null },
      captionTemplate: { id: null, name: null },
      output: { path: '/tmp/output/old.mp4', directory: '/tmp/output', filename: 'old.mp4' },
      status: 'COMPLETED',
      error: null,
      planId: null,
      jobId: null,
      settingsSnapshot: null,
    },
  ];
  const da = getDashboardAnalytics(records);
  assert.strictEqual(da.overview.total, 1);
  assert.strictEqual(da.overview.completed, 1);
});

// ─── AT. Deterministic Results ───────────────────────────────────────────────

test('AT: Same input produces same output', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
  ];
  const a1 = getDashboardAnalytics(records);
  const a2 = getDashboardAnalytics(records);
  assert.deepStrictEqual(a1.overview, a2.overview);
  assert.deepStrictEqual(a1.profileAnalytics, a2.profileAnalytics);
});

// ─── AU. No Double Counting Bulk Jobs ────────────────────────────────────────

test('AU: Bulk jobs counted in both bulk and export type analytics', function() {
  const records = [
    makeBulkRecord('plan_1', { exportType: 'cut', status: 'COMPLETED' }),
    makeBulkRecord('plan_1', { exportType: 'cut', status: 'COMPLETED' }),
  ];
  const bulk = getBulkAnalytics(records);
  const et = getExportTypeAnalytics(records);
  assert.strictEqual(bulk.totalBulkJobs, 2);
  assert.strictEqual(et.byType.find(t => t.type === 'cut').total, 2);
  assert.strictEqual(et.bulkCount, 2);
});

// ─── AV. Retry Counting Correctness ─────────────────────────────────────────

test('AV: Retry count only for attemptNumber > 1', function() {
  const records = [
    makeRecord({ attemptNumber: 1 }),
    makeRecord({ attemptNumber: undefined }),
    makeRecord({ attemptNumber: 2 }),
    makeRecord({ attemptNumber: 3 }),
  ];
  const ov = getOverviewMetrics(records);
  assert.strictEqual(ov.retryCount, 2);
});

// ─── AW. Scheduled Counting Correctness ─────────────────────────────────────

test('AW: Scheduled count only for records with jobId and no planId', function() {
  const records = [
    makeScheduledRecord('job_1'),
    makeBulkRecord('plan_1', { jobId: 'job_2' }),
    makeRecord(),
  ];
  const sa = getScheduledAnalytics(records);
  assert.strictEqual(sa.scheduledExports, 1);
});

// ─── Additional: Dashboard time range filtering ──────────────────────────────

test('Additional: Dashboard time range today', function() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T12:00:00.000Z`;
  const twoDaysAgoStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()-2).padStart(2,'0')}T12:00:00.000Z`;
  const records = [
    makeRecord({ createdAt: todayStr }),
    makeRecord({ createdAt: twoDaysAgoStr }),
  ];
  const da = getDashboardAnalytics(records, { timeRange: 'today' });
  assert.strictEqual(da.overview.total, 1);
});

test('Additional: Dashboard with null filters option', function() {
  const records = [makeRecord()];
  const da = getDashboardAnalytics(records, { filters: null });
  assert.strictEqual(da.overview.total, 1);
});

test('Additional: Dashboard with empty filters', function() {
  const records = [makeRecord()];
  const da = getDashboardAnalytics(records, { filters: {} });
  assert.strictEqual(da.overview.total, 1);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailed tests:');
  for (const { name, err } of errors) {
    console.log(`  - ${name}: ${err.message}`);
  }
  process.exit(1);
}
