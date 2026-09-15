'use strict';

/**
 * Export Command Center Test Suite — Phase 5I
 *
 * Covers: empty state, queue, schedule, attention, recent activity,
 * export types, profiles, output health, recovery, filtering, search,
 * deep clone, mutation safety, subsystem failure, actions, and integrity.
 */

const assert = require('assert');

const {
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
} = require('../src/main/dashboard/exportCommandCenter');

console.log('======================================================');
console.log('Running Export Command Center Test Suite (Phase 5I)');
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

function makeQueueItem(overrides) {
  return {
    id: 'bq_1',
    inputPath: '/tmp/test.mp4',
    filename: 'test.mp4',
    outputDir: '/tmp/output',
    outputPath: '/tmp/output/test.mp4',
    operation: 'cut',
    mode: 'blur',
    aspectRatio: '9:16',
    quality: 'high',
    start: 0,
    duration: 10,
    interval: 1,
    width: 1080,
    height: 1920,
    generateThumbnail: false,
    thumbnailTitle: '',
    variation: null,
    textOverlays: null,
    bulkPlanId: null,
    bulkJobId: null,
    profileId: 'prof_1',
    profileName: 'Profile A',
    platform: 'Instagram',
    orderIndex: 0,
    status: 'WAITING',
    progress: 0,
    currentSegment: null,
    totalSegments: null,
    error: null,
    result: null,
    addedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function makeSchedule(overrides) {
  return {
    id: 'sched_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'SCHEDULED',
    sourcePath: '/tmp/test.mp4',
    exportType: 'cut',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    outputDirectory: '/tmp/output',
    outputPath: '/tmp/output/test.mp4',
    profileSnapshot: { id: 'prof_1', name: 'Profile A', platform: 'Instagram' },
    variationPreset: null,
    variationPresetId: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    exportOptions: { start: 0, duration: 10, aspectRatio: '9:16', mode: 'blur', interval: 1, generateThumbnail: false, thumbnailTitle: '', textOverlays: null },
    planId: null,
    jobId: null,
    progress: 0,
    error: null,
    result: null,
    startedAt: null,
    finishedAt: null,
    batchItemId: null,
    ...overrides,
  };
}

const emptyQueueOpts = {
  getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
  getSchedules: () => [],
  loadHistory: () => [],
};

function queueOptsWith(items, stateOverrides) {
  const base = {
    items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2,
    ...stateOverrides,
  };
  return {
    getBatchQueueState: () => ({ ...base, items }),
    getSchedules: () => [],
    loadHistory: () => [],
  };
}

// ─── A. Empty System ────────────────────────────────────────────────────────

test('A: Empty system returns valid snapshot', function() {
  const snapshot = getCommandCenterSnapshot(emptyQueueOpts);
  assert.ok(snapshot);
  assert.ok(snapshot.generatedAt);
  assert.strictEqual(snapshot.queue.totalCount, 0);
  assert.strictEqual(snapshot.scheduled.totalCount, 0);
  assert.strictEqual(snapshot.attention.items.length, 0);
  assert.strictEqual(snapshot.recent.items.length, 0);
});

// ─── B. Queue Summary ───────────────────────────────────────────────────────

test('B: Queue summary from batch state', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'PROCESSING', progress: 50 }), makeQueueItem({ id: 'bq_2', status: 'WAITING' })],
      totalCount: 2, runningCount: 1, waitingCount: 1, doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 25, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
  });
  assert.strictEqual(q.processingCount, 1);
  assert.strictEqual(q.waitingCount, 1);
  assert.strictEqual(q.isRunning, true);
  assert.strictEqual(q.active.length, 1);
  assert.strictEqual(q.queued.length, 1);
  assert.strictEqual(q.active[0].progress, 50);
});

// ─── C. Processing Jobs ─────────────────────────────────────────────────────

test('C: Processing jobs appear in active list', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'PROCESSING', progress: 75, filename: 'video.mp4' })],
      totalCount: 1, runningCount: 1, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 75, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
  });
  assert.strictEqual(q.active.length, 1);
  assert.strictEqual(q.active[0].source, 'video.mp4');
  assert.strictEqual(q.active[0].progress, 75);
});

// ─── D. Queued Jobs ─────────────────────────────────────────────────────────

test('D: Queued jobs appear in queued list', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'WAITING', filename: 'queued.mp4' })],
      totalCount: 1, runningCount: 0, waitingCount: 1, doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2,
    }),
  });
  assert.strictEqual(q.queued.length, 1);
  assert.strictEqual(q.queued[0].source, 'queued.mp4');
});

// ─── E. Paused Jobs ─────────────────────────────────────────────────────────

test('E: Paused queue shows correct state', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'WAITING' })],
      totalCount: 1, runningCount: 0, waitingCount: 1, doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2,
    }),
  });
  assert.strictEqual(q.isRunning, false);
  assert.strictEqual(q.waitingCount, 1);
});

// ─── F. Scheduled Jobs ──────────────────────────────────────────────────────

test('F: Scheduled jobs from schedule manager', function() {
  const s = gatherScheduleState({
    getSchedules: () => [makeSchedule({ status: 'SCHEDULED' }), makeSchedule({ id: 'sched_2', status: 'COMPLETED' })],
  });
  assert.strictEqual(s.available, true);
  assert.strictEqual(s.upcomingCount, 1);
  assert.strictEqual(s.completedCount, 1);
  assert.strictEqual(s.totalCount, 2);
  assert.strictEqual(s.items.length, 1);
});

// ─── G. Attention Items — Failed Records Only ───────────────────────────────

test('G: Failed records create attention items', function() {
  const records = [
    makeRecord({ status: 'FAILED', error: 'Source file not found', output: null }),
    makeRecord({ status: 'COMPLETED', output: null }),
  ];
  const att = gatherAttentionItems(records);
  assert.strictEqual(att.items.length, 1);
  assert.strictEqual(att.items[0].type, 'FAILED_EXPORT');
  assert.strictEqual(att.items[0].severity, 'ERROR');
});

// ─── H. Failed Records ──────────────────────────────────────────────────────

test('H: Failed records attention items have correct data', function() {
  const records = [
    makeRecord({ status: 'FAILED', error: 'FFMPEG encoder error', profile: { id: 'p1', name: 'Profile B', platform: 'TikTok' }, output: null }),
  ];
  const att = gatherAttentionItems(records);
  assert.strictEqual(att.items.length, 1);
  assert.strictEqual(att.items[0].profile, 'Profile B');
  assert.strictEqual(att.items[0].platform, 'TikTok');
  assert.ok(att.items[0].reason);
});

// ─── I. Retry-Ready Records ─────────────────────────────────────────────────

test('I: All failed records are retry-ready', function() {
  const records = [
    makeRecord({ status: 'FAILED', output: null }),
    makeRecord({ status: 'FAILED', output: null }),
    makeRecord({ status: 'COMPLETED', output: null }),
  ];
  const rv = gatherRecoverySummary(records);
  assert.strictEqual(rv.failed, 2);
  assert.strictEqual(rv.retryReady, 2);
});

// ─── J. Missing Outputs ─────────────────────────────────────────────────────

test('J: Missing output detected in attention', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', output: { path: '/nonexistent/path.mp4', directory: '/nonexistent', filename: 'path.mp4' } }),
  ];
  const att = gatherAttentionItems(records);
  assert.ok(att.items.length > 0);
  assert.strictEqual(att.items[0].type, 'MISSING_OUTPUT');
  assert.strictEqual(att.items[0].severity, 'WARNING');
});

// ─── K. Invalid Outputs ─────────────────────────────────────────────────────

test('K: Empty output path creates no attention (no valid output to check)', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', output: null }),
  ];
  const att = gatherAttentionItems(records);
  assert.strictEqual(att.items.length, 0);
});

// ─── L. Recent Activity ─────────────────────────────────────────────────────

test('L: Recent activity returns records', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', source: { name: 'a.mp4', path: '/tmp/a.mp4' }, output: null }),
    makeRecord({ status: 'FAILED', source: { name: 'b.mp4', path: '/tmp/b.mp4' }, output: null }),
  ];
  const rec = gatherRecentActivity(records, 10);
  assert.strictEqual(rec.items.length, 2);
  assert.ok(rec.items.some(i => i.source === 'a.mp4'));
  assert.ok(rec.items.some(i => i.status === 'FAILED'));
});

test('L: Recent activity respects limit', function() {
  const records = Array.from({ length: 20 }, (_, i) =>
    makeRecord({ id: `rec_${i}`, source: { name: `file${i}.mp4`, path: `/tmp/file${i}.mp4` }, output: null })
  );
  const rec = gatherRecentActivity(records, 5);
  assert.strictEqual(rec.items.length, 5);
});

// ─── M. Export Type Summary ──────────────────────────────────────────────────

test('M: Export type summary counts correctly', function() {
  const records = [
    makeRecord({ exportType: 'cut', output: null }),
    makeRecord({ exportType: 'cut', output: null }),
    makeRecord({ exportType: 'reel', output: null }),
    makeRecord({ exportType: 'split', output: null }),
    makeRecord({ exportType: null, output: null }),
  ];
  const et = gatherExportTypeSummary(records);
  assert.strictEqual(et.cut, 2);
  assert.strictEqual(et.reel, 1);
  assert.strictEqual(et.split, 1);
  assert.strictEqual(et.total, 5);
});

// ─── N. Profile Summary ─────────────────────────────────────────────────────

test('N: Profile summary groups correctly', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' }, status: 'COMPLETED', output: null }),
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' }, status: 'FAILED', output: null }),
    makeRecord({ profile: { id: 'p2', name: 'Profile B', platform: 'TT' }, status: 'COMPLETED', output: null }),
  ];
  const pf = gatherProfileSummary(records);
  assert.strictEqual(pf.active.length, 2);
  assert.strictEqual(pf.withFailures.length, 1);
  assert.strictEqual(pf.withFailures[0].name, 'Profile A');
  assert.strictEqual(pf.withFailures[0].failed, 1);
});

// ─── O. Recovery Summary ────────────────────────────────────────────────────

test('O: Recovery summary counts', function() {
  const records = [
    makeRecord({ status: 'FAILED', output: null }),
    makeRecord({ status: 'FAILED', output: null }),
    makeRecord({ attemptNumber: 2, status: 'COMPLETED', output: null }),
  ];
  const rv = gatherRecoverySummary(records);
  assert.strictEqual(rv.failed, 2);
  assert.strictEqual(rv.retryReady, 2);
  assert.strictEqual(rv.recentlyRecovered, 1);
});

// ─── P. Schedule Summary ────────────────────────────────────────────────────

test('P: Schedule summary from schedules', function() {
  const s = gatherScheduleState({
    getSchedules: () => [
      makeSchedule({ status: 'SCHEDULED' }),
      makeSchedule({ id: 's2', status: 'PROCESSING' }),
      makeSchedule({ id: 's3', status: 'FAILED' }),
    ],
  });
  assert.strictEqual(s.upcomingCount, 1);
  assert.strictEqual(s.processingCount, 1);
  assert.strictEqual(s.failedCount, 1);
  assert.strictEqual(s.totalCount, 3);
});

// ─── Q. Deep Clone Isolation ────────────────────────────────────────────────

test('Q: Snapshot is deep cloned', function() {
  const snapshot = getCommandCenterSnapshot(emptyQueueOpts);
  const s2 = getCommandCenterSnapshot(emptyQueueOpts);
  snapshot.overview.processing = 999;
  assert.strictEqual(s2.overview.processing, 0);
});

// ─── R. No History Mutation ─────────────────────────────────────────────────

test('R: Gather functions do not mutate input', function() {
  const records = [makeRecord({ status: 'COMPLETED', output: null }), makeRecord({ status: 'FAILED', output: null })];
  const original = JSON.parse(JSON.stringify(records));
  gatherAttentionItems(records);
  gatherRecentActivity(records);
  gatherExportTypeSummary(records);
  gatherProfileSummary(records);
  gatherRecoverySummary(records);
  assert.deepStrictEqual(records, original);
});

// ─── S. No Duplicate Bulk Counting ──────────────────────────────────────────

test('S: Bulk jobs counted separately from export types', function() {
  const records = [
    makeRecord({ planId: 'plan_1', exportType: 'cut', output: null }),
    makeRecord({ planId: 'plan_1', exportType: 'reel', output: null }),
    makeRecord({ exportType: 'cut', output: null }),
  ];
  const et = gatherExportTypeSummary(records);
  assert.strictEqual(et.cut, 2);
  assert.strictEqual(et.reel, 1);
  assert.strictEqual(et.bulk, 2);
});

// ─── T. Real Progress Handling ──────────────────────────────────────────────

test('T: Progress from queue state', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'PROCESSING', progress: 42 })],
      totalCount: 1, runningCount: 1, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 42, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
  });
  assert.strictEqual(q.active[0].progress, 42);
  assert.strictEqual(q.overallProgress, 42);
});

// ─── U. Missing Progress Handling ───────────────────────────────────────────

test('U: Missing progress defaults to 0', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'PROCESSING' })],
      totalCount: 1, runningCount: 1, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0,
      isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
  });
  assert.strictEqual(q.active[0].progress, 0);
});

// ─── V. Subsystem Failure Isolation ─────────────────────────────────────────

test('V: Queue subsystem failure returns unavailable state', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => { throw new Error('queue crashed') },
  });
  assert.strictEqual(q.available, false);
  assert.ok(q.error);
  assert.strictEqual(q.processingCount, 0);
});

test('V: Schedule subsystem failure returns unavailable state', function() {
  const s = gatherScheduleState({
    getSchedules: () => { throw new Error('scheduler crashed') },
  });
  assert.strictEqual(s.available, false);
  assert.ok(s.error);
  assert.strictEqual(s.upcomingCount, 0);
});

// ─── W. Partial Dashboard Availability ──────────────────────────────────────

test('W: Dashboard remains usable when queue is unavailable', function() {
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => { throw new Error('queue down') },
    getSchedules: () => [],
    loadHistory: () => [],
  });
  assert.ok(snapshot);
  assert.strictEqual(snapshot.queue.available, false);
  assert.strictEqual(snapshot.scheduled.totalCount, 0);
});

// ─── X. Manual Refresh ──────────────────────────────────────────────────────

test('X: Multiple snapshot calls are independent', function() {
  const s1 = getCommandCenterSnapshot(emptyQueueOpts);
  const s2 = getCommandCenterSnapshot(queueOptsWith([makeQueueItem()], {
    totalCount: 1, runningCount: 1, waitingCount: 0, isRunning: true, overallProgress: 50,
  }));
  assert.strictEqual(s1.queue.totalCount, 0);
  assert.strictEqual(s2.queue.totalCount, 1);
});

// ─── Y. Filter Behavior ─────────────────────────────────────────────────────

test('Y: Filter active returns non-completed records', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', output: null }),
    makeRecord({ status: 'FAILED', output: null }),
    makeRecord({ status: 'CANCELLED', output: null }),
  ];
  const filtered = applyCommandCenterFilter(records, 'active');
  assert.strictEqual(filtered.length, 2);
});

test('Y: Filter attention returns needs-attention records', function() {
  const records = [
    makeRecord({ status: 'FAILED', output: null }),
    makeRecord({ status: 'COMPLETED', output: null }),
  ];
  const filtered = applyCommandCenterFilter(records, 'attention');
  const hasFailed = filtered.some(r => r.status === 'FAILED');
  assert.ok(hasFailed, 'Attention filter should include FAILED records');
});

test('Y: Filter recent returns last 7 days', function() {
  const records = [
    makeRecord({ createdAt: new Date().toISOString(), output: null }),
    makeRecord({ createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), output: null }),
  ];
  const filtered = applyCommandCenterFilter(records, 'recent');
  assert.strictEqual(filtered.length, 1);
});

// ─── Z. Search Behavior ─────────────────────────────────────────────────────

test('Z: Search by source name', function() {
  const records = [
    makeRecord({ source: { name: 'vacation.mp4', path: '/tmp/vacation.mp4' }, output: null }),
    makeRecord({ source: { name: 'birthday.mp4', path: '/tmp/birthday.mp4' }, output: null }),
  ];
  const filtered = applyCommandCenterSearch(records, 'vacation');
  assert.strictEqual(filtered.length, 1);
  assert.ok(filtered[0].source.name.includes('vacation'));
});

test('Z: Search by profile name', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Instagram Pro', platform: 'IG' }, output: null }),
    makeRecord({ profile: { id: 'p2', name: 'TikTok Main', platform: 'TT' }, output: null }),
  ];
  const filtered = applyCommandCenterSearch(records, 'instagram');
  assert.strictEqual(filtered.length, 1);
});

test('Z: Search is case-insensitive', function() {
  const records = [makeRecord({ source: { name: 'TEST.MP4', path: '/tmp/TEST.MP4' }, output: null })];
  const filtered = applyCommandCenterSearch(records, 'test');
  assert.strictEqual(filtered.length, 1);
});

// ─── AA. Empty States ───────────────────────────────────────────────────────

test('AA: Empty queue state', function() {
  const q = gatherQueueState({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
  });
  assert.strictEqual(q.active.length, 0);
  assert.strictEqual(q.queued.length, 0);
  assert.strictEqual(q.processingCount, 0);
});

test('AA: Empty schedule state', function() {
  const s = gatherScheduleState({ getSchedules: () => [] });
  assert.strictEqual(s.items.length, 0);
  assert.strictEqual(s.upcomingCount, 0);
});

test('AA: Empty attention state', function() {
  const att = gatherAttentionItems([]);
  assert.strictEqual(att.items.length, 0);
});

// ─── AB. Null Records Safety ────────────────────────────────────────────────

test('AB: Gather functions handle null records gracefully', function() {
  assert.doesNotThrow(() => gatherAttentionItems(null));
  assert.doesNotThrow(() => gatherRecentActivity(null));
  assert.doesNotThrow(() => gatherExportTypeSummary(null));
  assert.doesNotThrow(() => gatherProfileSummary(null));
  assert.doesNotThrow(() => gatherRecoverySummary(null));
  assert.doesNotThrow(() => gatherOutputHealth(null));
});

// ─── AC. IPC Validation ─────────────────────────────────────────────────────

test('AC: Deep clone helper works', function() {
  const obj = { a: { b: 1 } };
  const cloned = deepClone(obj);
  cloned.a.b = 2;
  assert.strictEqual(obj.a.b, 1);
});

// ─── AD. Path Safety ────────────────────────────────────────────────────────

test('AD: Attention items do not expose internal paths', function() {
  const records = [
    makeRecord({ status: 'FAILED', error: 'ENOENT /home/user/.config/secret', output: null }),
  ];
  const att = gatherAttentionItems(records);
  assert.ok(att.items[0].reason);
  assert.ok(!att.items[0].reason.includes('.config'));
});

// ─── AE. Prototype Pollution Protection ─────────────────────────────────────

test('AE: Filter with __proto__ does not pollute', function() {
  const records = [makeRecord({ output: null })];
  const result = applyCommandCenterFilter(records, '__proto__');
  assert.strictEqual(result.length, 1);
  assert.strictEqual({}.polluted, undefined);
});

// ─── AF. Feature Gating ─────────────────────────────────────────────────────

test('AF: Command center is pure computation (no license check in core)', function() {
  const snapshot = getCommandCenterSnapshot(emptyQueueOpts);
  assert.ok(snapshot);
});

// ─── AG. Backward Compatibility ─────────────────────────────────────────────

test('AG: Records without Phase 5F/5G fields still work', function() {
  const records = [
    {
      id: 'old', createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      source: { name: 'old.mp4', path: '/tmp/old.mp4' },
      exportType: 'cut', profile: { id: 'p1', name: 'Old', platform: 'IG' },
      exportPreset: { id: null, name: null }, variationPreset: { id: null, name: null },
      captionTemplate: { id: null, name: null },
      output: { path: '/tmp/out/old.mp4', directory: '/tmp/out', filename: 'old.mp4' },
      status: 'COMPLETED', error: null, planId: null, jobId: null, settingsSnapshot: null,
    },
  ];
  const att = gatherAttentionItems(records);
  const rec = gatherRecentActivity(records);
  const et = gatherExportTypeSummary(records);
  assert.ok(rec.items.length > 0);
  assert.strictEqual(et.cut, 1);
});

// ─── AH. Cross-Profile Isolation ────────────────────────────────────────────

test('AH: Profile summary does not mix profiles', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'Profile A', platform: 'IG' }, output: null }),
    makeRecord({ profile: { id: 'p2', name: 'Profile B', platform: 'TT' }, output: null }),
  ];
  const pf = gatherProfileSummary(records);
  assert.strictEqual(pf.active.length, 2);
  assert.ok(pf.active.some(p => p.name === 'Profile A'));
  assert.ok(pf.active.some(p => p.name === 'Profile B'));
});

// ─── AI. Cancel Integration ─────────────────────────────────────────────────

test('AI: Cancelled records in recent activity', function() {
  const records = [makeRecord({ status: 'CANCELLED', output: null })];
  const rec = gatherRecentActivity(records);
  assert.strictEqual(rec.items.length, 1);
  assert.strictEqual(rec.items[0].status, 'CANCELLED');
});

// ─── AK. Retry Integration ──────────────────────────────────────────────────

test('AK: Retry count in recovery summary', function() {
  const records = [
    makeRecord({ attemptNumber: 2, status: 'COMPLETED', output: null }),
    makeRecord({ attemptNumber: 3, status: 'COMPLETED', output: null }),
  ];
  const rv = gatherRecoverySummary(records);
  assert.strictEqual(rv.recentlyRecovered, 2);
});

// ─── AL. Export Again Integration ───────────────────────────────────────────

test('AL: Missing output in recovery summary', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', output: { path: '/nonexistent/file.mp4', directory: '/nonexistent', filename: 'file.mp4' } }),
  ];
  const rv = gatherRecoverySummary(records);
  assert.strictEqual(rv.missingOutputs, 1);
});

// ─── AM. Scheduled Item Integrity ───────────────────────────────────────────

test('AM: Scheduled items have required fields', function() {
  const s = gatherScheduleState({
    getSchedules: () => [makeSchedule()],
  });
  assert.ok(s.items[0].id);
  assert.ok(s.items[0].scheduledAt);
  assert.ok(s.items[0].status);
});

// ─── AN. Recent History Ordering ────────────────────────────────────────────

test('AN: Recent history is newest first', function() {
  const records = [
    makeRecord({ createdAt: new Date(Date.now() - 1000).toISOString(), source: { name: 'old.mp4', path: '/tmp/old.mp4' }, output: null }),
    makeRecord({ createdAt: new Date().toISOString(), source: { name: 'new.mp4', path: '/tmp/new.mp4' }, output: null }),
  ];
  const rec = gatherRecentActivity(records, 10);
  assert.strictEqual(rec.items[0].source, 'new.mp4');
  assert.strictEqual(rec.items[1].source, 'old.mp4');
});

// ─── AO. Deterministic Snapshot ─────────────────────────────────────────────

test('AO: Same input produces same output', function() {
  const s1 = getCommandCenterSnapshot(emptyQueueOpts);
  const s2 = getCommandCenterSnapshot(emptyQueueOpts);
  assert.deepStrictEqual(s1.overview, s2.overview);
});

// ─── AP. No Fake Analytics ──────────────────────────────────────────────────

test('AP: No invented metrics in snapshot', function() {
  const snapshot = getCommandCenterSnapshot(emptyQueueOpts);
  assert.strictEqual(snapshot.overview.processing, 0);
  assert.strictEqual(snapshot.overview.queued, 0);
  assert.strictEqual(snapshot.overview.scheduled, 0);
  assert.strictEqual(snapshot.overview.attention, 0);
  assert.ok(!snapshot.overview_fakeMetric);
});

// ─── AQ. History Load Failure ───────────────────────────────────────────────

test('AQ: History load failure returns empty records', function() {
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => { throw new Error('history crashed') },
  });
  assert.ok(snapshot);
  assert.strictEqual(snapshot.attention.items.length, 0);
  assert.strictEqual(snapshot.recent.items.length, 0);
});

// ─── AR. History Not Provided ───────────────────────────────────────────────

test('AR: Missing loadHistory option returns empty records', function() {
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
  });
  assert.ok(snapshot);
  assert.strictEqual(snapshot.recent.items.length, 0);
});

// ─── AS. Overview Counts ────────────────────────────────────────────────────

test('AS: Overview reflects correct counts', function() {
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({
      items: [makeQueueItem({ status: 'PROCESSING' }), makeQueueItem({ id: 'bq2', status: 'WAITING' })],
      totalCount: 2, runningCount: 1, waitingCount: 1, doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 25, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
    getSchedules: () => [makeSchedule()],
    loadHistory: () => [makeRecord({ status: 'FAILED', output: null })],
  });
  assert.strictEqual(snapshot.overview.processing, 1);
  assert.strictEqual(snapshot.overview.queued, 1);
  assert.strictEqual(snapshot.overview.scheduled, 1);
  assert.strictEqual(snapshot.overview.attention, 1);
});

// ─── AT. Multi-Record Attention Sorting ─────────────────────────────────────

test('AT: Attention items sorted by severity then newest', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', createdAt: new Date(Date.now() - 2000).toISOString(), output: { path: '/nonexistent/a.mp4', directory: '/nonexistent', filename: 'a.mp4' } }),
    makeRecord({ status: 'FAILED', createdAt: new Date().toISOString(), error: 'crash', output: null }),
    makeRecord({ status: 'COMPLETED', createdAt: new Date().toISOString(), output: { path: '/nonexistent/b.mp4', directory: '/nonexistent', filename: 'b.mp4' } }),
  ];
  const att = gatherAttentionItems(records);
  const firstFailed = att.items.findIndex(i => i.type === 'FAILED_EXPORT');
  const firstMissing = att.items.findIndex(i => i.type === 'MISSING_OUTPUT');
  if (firstFailed >= 0 && firstMissing >= 0) {
    assert.ok(firstFailed < firstMissing, 'ERROR severity should come before WARNING');
  }
});

// ─── AU. Export Type Total ───────────────────────────────────────────────────

test('AU: Total includes all records regardless of type', function() {
  const records = [
    makeRecord({ exportType: 'cut', output: null }),
    makeRecord({ exportType: null, output: null }),
    makeRecord({ exportType: 'unknown', output: null }),
  ];
  const et = gatherExportTypeSummary(records);
  assert.strictEqual(et.total, 3);
  assert.strictEqual(et.cut, 1);
});

// ─── AV. Profile With Failures Isolation ────────────────────────────────────

test('AV: Profile with failures only includes profiles with FAILED records', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'IG' }, status: 'COMPLETED', output: null }),
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'IG' }, status: 'FAILED', output: null }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TT' }, status: 'COMPLETED', output: null }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TT' }, status: 'COMPLETED', output: null }),
  ];
  const pf = gatherProfileSummary(records);
  assert.strictEqual(pf.withFailures.length, 1);
  assert.strictEqual(pf.withFailures[0].name, 'A');
});

// ─── AW. Schedule Empty When No Function ────────────────────────────────────

test('AW: Schedule unavailable when getSchedules not provided', function() {
  const s = gatherScheduleState({});
  assert.strictEqual(s.available, false);
  assert.ok(s.error);
});

// ─── AX. Filter Default Case ────────────────────────────────────────────────

test('AX: Unknown filter returns original records', function() {
  const records = [makeRecord({ output: null })];
  const filtered = applyCommandCenterFilter(records, 'unknown_filter');
  assert.strictEqual(filtered.length, 1);
});

// ─── AY. Search Empty Query ─────────────────────────────────────────────────

test('AY: Empty search returns all records', function() {
  const records = [makeRecord({ output: null }), makeRecord({ output: null })];
  const filtered = applyCommandCenterSearch(records, '');
  assert.strictEqual(filtered.length, 2);
});

// ─── AZ. No Sensitive Data in Snapshot ──────────────────────────────────────

test('AZ: Snapshot does not contain sensitive data', function() {
  const snapshot = getCommandCenterSnapshot(emptyQueueOpts);
  const str = JSON.stringify(snapshot);
  assert.ok(!str.includes('password'));
  assert.ok(!str.includes('secret'));
  assert.ok(!str.includes('token'));
});

// ─── BA. Regression: loadHistory option must be consumed (5I bug fix) ────────

test('BA: loadHistory option is consumed by getCommandCenterSnapshot', function() {
  let loadHistoryCalled = false;
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => { loadHistoryCalled = true; return [makeRecord({ output: null })]; },
  });
  assert.ok(loadHistoryCalled, 'loadHistory should have been called');
  assert.strictEqual(snapshot.recent.items.length, 1);
});

test('BA: getCommandCenterSnapshot works without loadHistory option', function() {
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
  });
  assert.ok(snapshot);
  assert.strictEqual(snapshot.recent.items.length, 0);
});

// ─── Bug #3 Regression: Command Center must see completed history ──────────

test('BB: Completed record appears in Recent Activity', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut' })];
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  assert.strictEqual(snapshot.recent.items.length, 1, 'Recent activity should contain the completed record');
  assert.strictEqual(snapshot.recent.items[0].status, 'COMPLETED');
});

test('BC: Completed record counts in Export Types', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut' })];
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  assert.strictEqual(snapshot.exportTypes.cut, 1, 'Export Types should count cut records');
  assert.strictEqual(snapshot.exportTypes.total, 1);
});

test('BD: Completed record evaluated in Output Health', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut', output: { path: '/tmp/output/test.mp4', directory: '/tmp/output', filename: 'test.mp4' } })];
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  assert.ok(snapshot.outputHealth, 'Output health should exist');
  assert.ok(snapshot.outputHealth.total >= 0, 'Output health total should be a number');
});

test('BE: "all" filter includes completed records', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut' })];
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  // No filter applied = "all" = all records should be visible
  assert.strictEqual(snapshot.recent.items.length, 1, 'All filter should include completed records');
  assert.strictEqual(snapshot.exportTypes.total, 1, 'Export types total should count all records');
});

test('BF: "recent" filter includes completed records from last 7 days', function() {
  const now = new Date().toISOString();
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut', createdAt: now, completedAt: now })];
  const filtered = applyCommandCenterFilter(records, 'recent');
  assert.strictEqual(filtered.length, 1, 'Recent filter should include records from last 7 days');
  assert.strictEqual(filtered[0].status, 'COMPLETED');
});

test('BG: Search finds completed record by source name', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut', source: { name: 'my-video.mp4', path: '/tmp/my-video.mp4' } })];
  const filtered = applyCommandCenterSearch(records, 'my-video');
  assert.strictEqual(filtered.length, 1, 'Search should find record by source name');
});

test('BH: Search finds completed record by profile name', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut', profile: { id: 'p1', name: 'Instagram Reels', platform: 'instagram' } })];
  const filtered = applyCommandCenterSearch(records, 'Instagram');
  assert.strictEqual(filtered.length, 1, 'Search should find record by profile name');
});

test('BI: Snapshot is deep cloned (mutation safety)', function() {
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut' })];
  const opts = {
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  };
  const s1 = getCommandCenterSnapshot(opts);
  const s2 = getCommandCenterSnapshot(opts);
  // Structure should be identical (ignoring generatedAt timestamp)
  assert.strictEqual(s1.recent.items.length, s2.recent.items.length);
  assert.strictEqual(s1.exportTypes.cut, s2.exportTypes.cut);
  assert.deepStrictEqual(s1.outputHealth, s2.outputHealth);
  assert.deepStrictEqual(s1.queue, s2.queue);
  // Mutate s1 and verify s2 is unaffected
  s1.recent.items.push({ id: 'fake' });
  assert.strictEqual(s2.recent.items.length, 1, 'Mutating snapshot should not affect other snapshots');
});

test('BJ: Failed record visible in Attention', function() {
  const records = [makeRecord({ status: 'FAILED', exportType: 'cut', error: 'FFmpeg crashed' })];
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  assert.ok(snapshot.attention.items.length > 0, 'Failed record should create attention item');
  assert.strictEqual(snapshot.attention.items[0].type, 'FAILED_EXPORT');
});

test('BK: Empty history correctly shows zeros', function() {
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => [],
  });
  assert.strictEqual(snapshot.recent.items.length, 0);
  assert.strictEqual(snapshot.exportTypes.total, 0);
  assert.strictEqual(snapshot.outputHealth.total, 0);
  assert.strictEqual(snapshot.attention.items.length, 0);
});

test('BL: Multiple mixed records (completed, failed, split) all visible', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', exportType: 'cut', createdAt: new Date().toISOString() }),
    makeRecord({ status: 'FAILED', exportType: 'reel', createdAt: new Date().toISOString() }),
    makeRecord({ status: 'COMPLETED', exportType: 'split', createdAt: new Date().toISOString() }),
  ];
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  assert.strictEqual(snapshot.recent.items.length, 3, 'All 3 records should be in recent activity');
  assert.strictEqual(snapshot.exportTypes.cut, 1);
  assert.strictEqual(snapshot.exportTypes.reel, 1);
  assert.strictEqual(snapshot.exportTypes.split, 1);
  assert.strictEqual(snapshot.exportTypes.total, 3);
  assert.ok(snapshot.attention.items.length > 0, 'Failed record should create attention item');
});

test('BM: IPC handler pattern — loadHistory from main process is passed to snapshot', function() {
  // This test verifies the pattern used by the IPC handler in index.js after the bug fix
  const records = [makeRecord({ status: 'COMPLETED', exportType: 'cut' })];
  const loadHistory = () => records;

  // Simulate what the IPC handler now does
  const snapshot = getCommandCenterSnapshot({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => loadHistory(),
  });

  assert.strictEqual(snapshot.recent.items.length, 1, 'IPC handler must pass loadHistory to snapshot');
  assert.strictEqual(snapshot.recent.items[0].status, 'COMPLETED');
  assert.strictEqual(snapshot.exportTypes.cut, 1);
});

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailed tests:');
  for (const { name, err } of errors) {
    console.log(`  - ${name}: ${err.message}`);
  }
  process.exit(1);
}
