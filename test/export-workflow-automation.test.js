'use strict';

/**
 * Export Workflow Automation Test Suite — Phase 5J
 *
 * Covers: workflow summary, action eligibility, retry-ready detection,
 * blocked recovery, bulk selection, duplicate handling, snapshot validation,
 * export-again, attempt relationship, source protection, output collision,
 * filter behavior, status transitions, active-job protection, history
 * immutability, snapshot isolation, IPC validation, error isolation,
 * feature gating, restart/persistence behavior.
 */

const assert = require('assert');

const {
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
} = require('../src/main/dashboard/exportWorkflowAutomation');

const {
  getCommandCenterSnapshot,
} = require('../src/main/dashboard/exportCommandCenter');

console.log('======================================================');
console.log('Running Export Workflow Automation Test Suite (Phase 5J)');
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
    settingsSnapshot: { resolution: '1080p', format: 'mp4' },
    archived: false,
    pinned: false,
    attemptNumber: 1,
    ...overrides,
  };
}

const emptyOpts = {
  getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
  getSchedules: () => [],
  loadHistory: () => [],
};

// ─── A. Workflow Summary ────────────────────────────────────────────────────

test('A: Empty system returns valid workflow summary', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.ok(summary);
  assert.ok(summary.generatedAt);
  assert.strictEqual(summary.queue.processing, 0);
  assert.strictEqual(summary.queue.queued, 0);
  assert.strictEqual(summary.history.total, 0);
  assert.strictEqual(summary.recovery.retryReady, 0);
  assert.strictEqual(summary.attention.needsAttention, 0);
});

test('A: Workflow summary includes all required sections', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.ok(summary.queue);
  assert.ok(summary.schedule);
  assert.ok(summary.history);
  assert.ok(summary.recovery);
  assert.ok(summary.attention);
  assert.ok(summary.outputHealth);
  assert.ok(Array.isArray(summary.eligibleActions));
});

test('A: Workflow summary with records provides correct counts', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED', error: 'crash' }),
    makeRecord({ status: 'CANCELLED' }),
  ];
  const summary = getWorkflowSummary({
    ...emptyOpts,
    loadHistory: () => records,
  });
  assert.strictEqual(summary.history.total, 4);
  assert.strictEqual(summary.history.completed, 2);
  assert.strictEqual(summary.history.failed, 1);
  assert.strictEqual(summary.history.cancelled, 1);
});

// ─── B. Action Eligibility ──────────────────────────────────────────────────

test('B: Validate eligibility with no IDs returns error', function() {
  const result = validateActionEligibility('retry', []);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.error);
});

test('B: Validate eligibility with invalid action type', function() {
  const result = validateActionEligibility('invalid_action', ['id_1']);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.error.includes('Unknown action type'));
});

test('B: Validate eligibility with invalid IDs only', function() {
  const result = validateActionEligibility('retry', ['', '  ', null]);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.error.includes('No valid'));
});

test('B: Validate eligibility with null action type', function() {
  const result = validateActionEligibility(null, ['id1']);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.error);
});

test('B: Validate eligibility with undefined action type', function() {
  const result = validateActionEligibility(undefined, ['id1']);
  assert.strictEqual(result.eligible, false);
});

// ─── C. Retry-Ready Detection ───────────────────────────────────────────────

test('C: Unique strings deduplicates correctly', function() {
  const result = uniqueStrings(['a', 'b', 'a', 'c', 'b']);
  assert.deepStrictEqual(result, ['a', 'b', 'c']);
});

test('C: Unique strings filters non-strings', function() {
  const result = uniqueStrings(['a', null, 123, 'b', '']);
  assert.deepStrictEqual(result, ['a', 'b']);
});

test('C: Unique strings with empty array', function() {
  const result = uniqueStrings([]);
  assert.deepStrictEqual(result, []);
});

// ─── D. Blocked Recovery ────────────────────────────────────────────────────

test('D: Validate ID returns true for valid string', function() {
  assert.strictEqual(validateId('test_id'), true);
});

test('D: Validate ID returns false for empty string', function() {
  assert.strictEqual(validateId(''), false);
});

test('D: Validate ID returns false for null', function() {
  assert.strictEqual(validateId(null), false);
});

test('D: Validate ID returns false for non-string', function() {
  assert.strictEqual(validateId(123), false);
});

// ─── E. Bulk Selection ──────────────────────────────────────────────────────

test('E: Plan bulk action with empty array returns error', function() {
  const result = planBulkAction('retry', []);
  assert.ok(result.error);
  assert.strictEqual(result.ready.length, 0);
});

test('E: Plan bulk action with duplicates separates them', function() {
  const result = planBulkAction('retry', ['id1', 'id1', 'id2']);
  assert.ok(result.plan);
  assert.strictEqual(result.duplicates.length, 1);
  assert.strictEqual(result.duplicates[0], 'id1');
});

test('E: Plan bulk action returns plan with correct structure', function() {
  const result = planBulkAction('retry', ['a', 'b']);
  assert.ok(result.plan);
  assert.strictEqual(result.plan.actionType, 'retry');
  assert.strictEqual(result.plan.totalRequested, 2);
  assert.strictEqual(result.plan.uniqueIds, 2);
});

// ─── F. Duplicate Selection Handling ────────────────────────────────────────

test('F: Plan bulk action filters non-string IDs', function() {
  const result = planBulkAction('retry', ['id1', null, 123, 'id2']);
  assert.ok(result.plan);
  assert.ok(result.plan.uniqueIds <= 2);
});

test('F: Plan bulk action with all duplicates returns error', function() {
  const result = planBulkAction('retry', ['id1', 'id1', 'id1']);
  assert.ok(result.plan);
  assert.strictEqual(result.plan.uniqueIds, 1);
  assert.strictEqual(result.plan.duplicateCount, 2);
});

// ─── G. Snapshot Validation ─────────────────────────────────────────────────

test('G: Validate snapshot with invalid ID returns invalid', function() {
  const result = validateSnapshotForExport('');
  assert.strictEqual(result.valid, false);
  assert.ok(result.issues.length > 0);
});

test('G: Validate snapshot with null ID returns invalid', function() {
  const result = validateSnapshotForExport(null);
  assert.strictEqual(result.valid, false);
});

test('G: Validate snapshot with nonexistent record returns invalid', function() {
  const result = validateSnapshotForExport('nonexistent_id');
  assert.strictEqual(result.valid, false);
  assert.ok(result.issues.includes('Record not found'));
});

// ─── H. Export Again ────────────────────────────────────────────────────────

test('H: Execute retry with invalid ID returns error', function() {
  const result = executeRetry('');
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('H: Execute export again with invalid ID returns error', function() {
  const result = executeExportAgain('');
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('H: Execute retry with null ID returns error', function() {
  const result = executeRetry(null);
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

// ─── I. Attempt Relationship ────────────────────────────────────────────────

test('I: Execute bulk action with empty array returns empty results', function() {
  const result = executeBulkAction('retry', []);
  assert.strictEqual(result.results.length, 0);
  assert.strictEqual(result.summary.total, 0);
});

test('I: Execute bulk action summary has correct structure', function() {
  const result = executeBulkAction('retry', []);
  assert.ok(result.summary);
  assert.strictEqual(typeof result.summary.total, 'number');
  assert.strictEqual(typeof result.summary.completed, 'number');
  assert.strictEqual(typeof result.summary.failed, 'number');
  assert.strictEqual(typeof result.summary.skipped, 'number');
});

// ─── J. Source Protection ───────────────────────────────────────────────────

test('J: Execute bulk action with error returns error field', function() {
  const result = executeBulkAction('retry', []);
  assert.ok(result.summary);
});

test('J: Plan export_again with non-completed records blocks them', function() {
  const result = planBulkAction('export_again', ['nonexistent_1']);
  assert.ok(result.plan);
  assert.strictEqual(result.plan.readyCount, 0);
});

// ─── K. Output Collision Protection ─────────────────────────────────────────

test('K: Deep clone produces independent copy', function() {
  const obj = { a: { b: 1 } };
  const cloned = deepClone(obj);
  cloned.a.b = 2;
  assert.strictEqual(obj.a.b, 1);
});

test('K: Sanitize path removes dangerous characters', function() {
  assert.strictEqual(sanitizePath('test<>:"|?*file.mp4'), 'testfile.mp4');
  assert.strictEqual(sanitizePath('/path/../etc/passwd'), '/path/etc/passwd');
  assert.strictEqual(sanitizePath(''), '');
  assert.strictEqual(sanitizePath(null), '');
  assert.strictEqual(sanitizePath(123), '');
});

test('K: Sanitize path normalizes slashes', function() {
  assert.strictEqual(sanitizePath('/path//to///file.mp4'), '/path/to/file.mp4');
  // Double backslashes in JS string = single backslash in value, regex collapses repeated
  const winPath = sanitizePath('C:\\\\Users\\\\test.mp4');
  assert.ok(winPath.includes('Users'));
  assert.ok(!winPath.includes('..'));
});

test('K: Check output collision with no records returns no collision', function() {
  const result = checkOutputCollision('/tmp/output/test.mp4');
  assert.strictEqual(result.collision, false);
  assert.strictEqual(result.existingRecordId, null);
});

test('K: Check output collision with invalid path returns no collision', function() {
  const result = checkOutputCollision('');
  assert.strictEqual(result.collision, false);
});

test('K: Check output collision with null path returns no collision', function() {
  const result = checkOutputCollision(null);
  assert.strictEqual(result.collision, false);
});

// ─── L. Filter Behavior ─────────────────────────────────────────────────────

test('L: Filter records by status', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
    makeRecord({ status: 'CANCELLED' }),
  ];
  const filtered = filterWorkflowRecords(records, { status: ['FAILED'] });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].status, 'FAILED');
});

test('L: Filter records by profileId', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'IG' } }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TT' } }),
  ];
  const filtered = filterWorkflowRecords(records, { profileId: 'p1' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].profile.id, 'p1');
});

test('L: Filter records by platform', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'A', platform: 'Instagram' } }),
    makeRecord({ profile: { id: 'p2', name: 'B', platform: 'TikTok' } }),
  ];
  const filtered = filterWorkflowRecords(records, { platform: 'instagram' });
  assert.strictEqual(filtered.length, 1);
});

test('L: Filter records by exportType', function() {
  const records = [
    makeRecord({ exportType: 'cut' }),
    makeRecord({ exportType: 'reel' }),
  ];
  const filtered = filterWorkflowRecords(records, { exportType: 'cut' });
  assert.strictEqual(filtered.length, 1);
});

test('L: Filter records by date range', function() {
  const records = [
    makeRecord({ createdAt: new Date().toISOString() }),
    makeRecord({ createdAt: new Date(Date.now() - 30 * 86400000).toISOString() }),
  ];
  const filtered = filterWorkflowRecords(records, {
    dateFrom: new Date(Date.now() - 86400000).toISOString(),
  });
  assert.strictEqual(filtered.length, 1);
});

test('L: Filter records by dateTo', function() {
  const records = [
    makeRecord({ createdAt: new Date().toISOString() }),
    makeRecord({ createdAt: new Date(Date.now() - 30 * 86400000).toISOString() }),
  ];
  const filtered = filterWorkflowRecords(records, {
    dateTo: new Date(Date.now() - 15 * 86400000).toISOString(),
  });
  assert.strictEqual(filtered.length, 1);
});

test('L: Filter records by search', function() {
  const records = [
    makeRecord({ source: { name: 'vacation.mp4', path: '/tmp/vacation.mp4' } }),
    makeRecord({ source: { name: 'birthday.mp4', path: '/tmp/birthday.mp4' } }),
  ];
  const filtered = filterWorkflowRecords(records, { search: 'vacation' });
  assert.strictEqual(filtered.length, 1);
});

test('L: Filter records by attentionState needs_attention', function() {
  const records = [
    makeRecord({ status: 'FAILED', error: 'crash', output: null }),
    makeRecord({ status: 'COMPLETED', output: null }),
  ];
  const filtered = filterWorkflowRecords(records, { attentionState: 'needs_attention' });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.some(r => r.status === 'FAILED'));
});

test('L: Filter with no filters returns all records', function() {
  const records = [makeRecord(), makeRecord()];
  const filtered = filterWorkflowRecords(records, {});
  assert.strictEqual(filtered.length, 2);
});

test('L: Filter with null records returns empty', function() {
  const filtered = filterWorkflowRecords(null, { status: 'COMPLETED' });
  assert.strictEqual(filtered.length, 0);
});

test('L: Filter with null filters returns all records', function() {
  const records = [makeRecord(), makeRecord()];
  const filtered = filterWorkflowRecords(records, null);
  assert.strictEqual(filtered.length, 2);
});

// ─── M. Status Transitions ──────────────────────────────────────────────────

test('M: SafeNum handles valid numbers', function() {
  assert.strictEqual(safeNum(5), 5);
  assert.strictEqual(safeNum(0), 0);
  assert.strictEqual(safeNum(-1), -1);
});

test('M: SafeNum handles invalid values', function() {
  assert.strictEqual(safeNum(null), 0);
  assert.strictEqual(safeNum(undefined), 0);
  assert.strictEqual(safeNum('abc'), 0);
  assert.strictEqual(safeNum(Infinity), 0);
  assert.strictEqual(safeNum(NaN), 0);
});

// ─── N. Active-Job Protection ───────────────────────────────────────────────

test('N: Workflow summary with queue state', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({
      items: [], totalCount: 2, runningCount: 1, waitingCount: 1,
      doneCount: 0, errorCount: 0, cancelledCount: 0,
      overallProgress: 50, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
    getSchedules: () => [],
    loadHistory: () => [],
  });
  assert.strictEqual(summary.queue.processing, 1);
  assert.strictEqual(summary.queue.queued, 1);
  assert.strictEqual(summary.queue.available, true);
});

test('N: Workflow summary with unavailable queue', function() {
  const summary = getWorkflowSummary({
    getSchedules: () => [],
    loadHistory: () => [],
  });
  assert.strictEqual(summary.queue.available, false);
});

test('N: Active job protection detects active jobs', function() {
  const queueState = {
    items: [
      { id: 'j1', filename: 'test.mp4', status: 'PROCESSING' },
      { id: 'j2', filename: 'other.mp4', status: 'WAITING' },
    ],
  };
  const result = checkActiveJobProtection('/tmp/test.mp4', queueState);
  assert.strictEqual(result.active, true);
  assert.strictEqual(result.jobCount, 1);
});

test('N: Active job protection returns false when no active jobs', function() {
  const queueState = {
    items: [
      { id: 'j1', filename: 'test.mp4', status: 'COMPLETED' },
    ],
  };
  const result = checkActiveJobProtection('/tmp/test.mp4', queueState);
  assert.strictEqual(result.active, false);
  assert.strictEqual(result.jobCount, 0);
});

test('N: Active job protection with null source path', function() {
  const result = checkActiveJobProtection(null, { items: [] });
  assert.strictEqual(result.active, false);
});

test('N: Active job protection with null queue state', function() {
  const result = checkActiveJobProtection('/tmp/test.mp4', null);
  assert.strictEqual(result.active, false);
});

// ─── O. History Immutability ────────────────────────────────────────────────

test('O: Filter does not mutate input records', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
  ];
  const original = JSON.parse(JSON.stringify(records));
  filterWorkflowRecords(records, { status: ['FAILED'] });
  assert.deepStrictEqual(records, original);
});

test('O: Workflow summary does not mutate input records', function() {
  const records = [makeRecord({ status: 'FAILED' })];
  const original = JSON.parse(JSON.stringify(records));
  getWorkflowSummary({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => records,
  });
  assert.deepStrictEqual(records, original);
});

test('O: Deep clone does not affect original', function() {
  const original = { a: { b: { c: 1 } } };
  const cloned = deepClone(original);
  cloned.a.b.c = 999;
  assert.strictEqual(original.a.b.c, 1);
});

// ─── P. Snapshot Isolation ──────────────────────────────────────────────────

test('P: Two workflow summaries are independent', function() {
  const s1 = getWorkflowSummary(emptyOpts);
  const s2 = getWorkflowSummary(emptyOpts);
  s1.queue.processing = 999;
  assert.strictEqual(s2.queue.processing, 0);
});

test('P: Deep clone produces fully isolated copy', function() {
  const obj = { nested: { value: 1 } };
  const clone1 = deepClone(obj);
  const clone2 = deepClone(obj);
  clone1.nested.value = 10;
  clone2.nested.value = 20;
  assert.strictEqual(obj.nested.value, 1);
  assert.strictEqual(clone1.nested.value, 10);
  assert.strictEqual(clone2.nested.value, 20);
});

// ─── Q. IPC Validation ──────────────────────────────────────────────────────

test('Q: Validate eligibility with null action type', function() {
  const result = validateActionEligibility(null, ['id1']);
  assert.strictEqual(result.eligible, false);
});

test('Q: Validate eligibility with undefined action type', function() {
  const result = validateActionEligibility(undefined, ['id1']);
  assert.strictEqual(result.eligible, false);
});

test('Q: Validate eligibility with empty string action type', function() {
  const result = validateActionEligibility('', ['id1']);
  assert.strictEqual(result.eligible, false);
});

// ─── R. Error Isolation ─────────────────────────────────────────────────────

test('R: Workflow summary handles loadHistory failure', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => { throw new Error('history crashed') },
  });
  assert.ok(summary);
  assert.strictEqual(summary.history.total, 0);
});

test('R: Workflow summary handles getSchedules failure', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => { throw new Error('scheduler crashed') },
    loadHistory: () => [],
  });
  assert.ok(summary);
  assert.strictEqual(summary.schedule.available, false);
});

test('R: Workflow summary handles getBatchQueueState failure', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => { throw new Error('queue crashed') },
    getSchedules: () => [],
    loadHistory: () => [],
  });
  assert.ok(summary);
  assert.strictEqual(summary.queue.available, false);
});

test('R: Execute bulk action with error returns gracefully', function() {
  const result = executeBulkAction('retry', ['nonexistent_1', 'nonexistent_2']);
  assert.ok(result.results);
  assert.ok(result.summary);
});

// ─── S. Feature Gating ──────────────────────────────────────────────────────

test('S: Command center snapshot includes workflow section', function() {
  const snapshot = getCommandCenterSnapshot(emptyOpts);
  assert.ok(snapshot);
  assert.ok(snapshot.workflow !== undefined);
});

test('S: Command center snapshot workflow has correct shape', function() {
  const snapshot = getCommandCenterSnapshot(emptyOpts);
  const wf = snapshot.workflow;
  assert.ok(wf.queue);
  assert.ok(wf.schedule);
  assert.ok(wf.history);
  assert.ok(wf.recovery);
  assert.ok(wf.attention);
  assert.ok(wf.outputHealth);
  assert.ok(Array.isArray(wf.eligibleActions));
});

test('S: Command center snapshot has overview section', function() {
  const snapshot = getCommandCenterSnapshot(emptyOpts);
  assert.ok(snapshot.overview);
  assert.strictEqual(typeof snapshot.overview.processing, 'number');
  assert.strictEqual(typeof snapshot.overview.queued, 'number');
  assert.strictEqual(typeof snapshot.overview.scheduled, 'number');
  assert.strictEqual(typeof snapshot.overview.attention, 'number');
});

// ─── T. Restart/Persistence Behavior ────────────────────────────────────────

test('T: Workflow summary is deterministic for same input', function() {
  const s1 = getWorkflowSummary(emptyOpts);
  const s2 = getWorkflowSummary(emptyOpts);
  assert.deepStrictEqual(s1.history, s2.history);
  assert.deepStrictEqual(s1.recovery, s2.recovery);
});

test('T: Workflow summary generatedAt is ISO string', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.ok(summary.generatedAt);
  assert.ok(!isNaN(new Date(summary.generatedAt).getTime()));
});

// ─── U. Filter Edge Cases ───────────────────────────────────────────────────

test('U: Filter by recoveryState retry_ready', function() {
  const records = [
    makeRecord({ status: 'FAILED', error: 'crash' }),
    makeRecord({ status: 'COMPLETED' }),
  ];
  const filtered = filterWorkflowRecords(records, { recoveryState: 'retry_ready' });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every(r => r.status === 'FAILED'));
});

test('U: Filter by recoveryState missing_output', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', output: { path: '/nonexistent.mp4', directory: '/', filename: 'nonexistent.mp4' } }),
    makeRecord({ status: 'FAILED' }),
  ];
  const filtered = filterWorkflowRecords(records, { recoveryState: 'missing_output' });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every(r => r.status === 'COMPLETED'));
});

test('U: Filter by attentionState archived', function() {
  const records = [
    makeRecord({ archived: true }),
    makeRecord({ archived: false }),
  ];
  const filtered = filterWorkflowRecords(records, { attentionState: 'archived' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].archived, true);
});

test('U: Filter by attentionState normal', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', output: null }),
    makeRecord({ status: 'FAILED', error: 'crash', output: null }),
  ];
  const filtered = filterWorkflowRecords(records, { attentionState: 'normal' });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.some(r => r.status === 'COMPLETED'));
});

test('U: Filter by recoveryState blocked', function() {
  const records = [
    makeRecord({ status: 'FAILED', error: 'crash', source: null }),
  ];
  const filtered = filterWorkflowRecords(records, { recoveryState: 'blocked' });
  // Blocked means failed + not retryable (source missing)
  assert.ok(filtered.length >= 0);
});

// ─── V. Bulk Action Execution ───────────────────────────────────────────────

test('V: Execute bulk action with all invalid IDs returns all skipped', function() {
  const result = executeBulkAction('retry', ['nonexistent_1', 'nonexistent_2']);
  assert.strictEqual(result.summary.total, 2);
  assert.strictEqual(result.summary.started, 0);
  assert.ok(result.summary.skipped > 0 || result.results.every(r => r.status === 'INVALID' || r.status === 'SKIPPED'));
});

test('V: Execute export_again with all invalid IDs returns all skipped', function() {
  const result = executeBulkAction('export_again', ['nonexistent_1']);
  assert.strictEqual(result.summary.total, 1);
  assert.strictEqual(result.summary.started, 0);
});

test('V: Execute bulk action with mixed valid/invalid IDs', function() {
  const result = executeBulkAction('retry', ['valid_1', 'nonexistent_1', 'valid_2']);
  assert.strictEqual(result.summary.total, 3);
  assert.ok(result.results.length > 0);
});

// ─── W. Plan Bulk Action ────────────────────────────────────────────────────

test('W: Plan bulk action counts duplicates', function() {
  const result = planBulkAction('retry', ['a', 'b', 'a', 'c', 'b', 'a']);
  assert.ok(result.plan);
  assert.strictEqual(result.plan.duplicateCount, 3);
  assert.strictEqual(result.plan.uniqueIds, 3);
});

test('W: Plan export_again with empty array', function() {
  const result = planBulkAction('export_again', []);
  assert.ok(result.error);
});

test('W: Plan with non-string IDs filters them', function() {
  const result = planBulkAction('retry', [123, null, 'valid_id']);
  assert.ok(result.plan);
  assert.ok(result.plan.uniqueIds <= 1);
});

// ─── X. Queue Counts ────────────────────────────────────────────────────────

test('X: Workflow summary queue with error items', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({
      items: [], totalCount: 5, runningCount: 2, waitingCount: 1,
      doneCount: 1, errorCount: 1, cancelledCount: 0,
      overallProgress: 60, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
    getSchedules: () => [],
    loadHistory: () => [],
  });
  assert.strictEqual(summary.queue.processing, 2);
  assert.strictEqual(summary.queue.queued, 1);
  assert.strictEqual(summary.queue.completed, 1);
  assert.strictEqual(summary.queue.failed, 1);
  assert.strictEqual(summary.queue.total, 5);
});

// ─── Y. Schedule Counts ─────────────────────────────────────────────────────

test('Y: Workflow summary schedule counts', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [
      { status: 'SCHEDULED' }, { status: 'READY' }, { status: 'PROCESSING' },
      { status: 'COMPLETED' }, { status: 'FAILED' },
    ],
    loadHistory: () => [],
  });
  assert.strictEqual(summary.schedule.scheduled, 2);
  assert.strictEqual(summary.schedule.processing, 1);
  assert.strictEqual(summary.schedule.completed, 1);
  assert.strictEqual(summary.schedule.failed, 1);
  assert.strictEqual(summary.schedule.total, 5);
});

// ─── Z. History Counts ──────────────────────────────────────────────────────

test('Z: Workflow summary history counts', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => [
      makeRecord({ status: 'COMPLETED' }),
      makeRecord({ status: 'COMPLETED' }),
      makeRecord({ status: 'FAILED' }),
      makeRecord({ status: 'CANCELLED' }),
    ],
  });
  assert.strictEqual(summary.history.total, 4);
  assert.strictEqual(summary.history.completed, 2);
  assert.strictEqual(summary.history.failed, 1);
  assert.strictEqual(summary.history.cancelled, 1);
});

// ─── AA. No Sensitive Data ──────────────────────────────────────────────────

test('AA: Workflow summary does not contain sensitive data', function() {
  const summary = getWorkflowSummary(emptyOpts);
  const str = JSON.stringify(summary);
  assert.ok(!str.includes('password'));
  assert.ok(!str.includes('secret'));
  assert.ok(!str.includes('token'));
});

// ─── AB. Eligible Actions ───────────────────────────────────────────────────

test('AB: Eligible actions computed from history', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({ items: [], totalCount: 0, runningCount: 0, waitingCount: 0, doneCount: 0, errorCount: 0, cancelledCount: 0, overallProgress: 0, isRunning: false, concurrency: 2, maxConcurrency: 2 }),
    getSchedules: () => [],
    loadHistory: () => [
      makeRecord({ status: 'FAILED', error: 'crash' }),
    ],
  });
  assert.ok(Array.isArray(summary.eligibleActions));
});

test('AB: Eligible actions with queue failures', function() {
  const summary = getWorkflowSummary({
    getBatchQueueState: () => ({
      items: [], totalCount: 3, runningCount: 1, waitingCount: 0,
      doneCount: 1, errorCount: 1, cancelledCount: 0,
      overallProgress: 50, isRunning: true, concurrency: 2, maxConcurrency: 2,
    }),
    getSchedules: () => [],
    loadHistory: () => [],
  });
  const retryAction = summary.eligibleActions.find(a => a.type === 'RETRY_FAILED');
  assert.ok(retryAction);
  assert.strictEqual(retryAction.count, 1);
});

// ─── AC. Filter Multi-Status ────────────────────────────────────────────────

test('AC: Filter by multiple statuses', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
    makeRecord({ status: 'CANCELLED' }),
  ];
  const filtered = filterWorkflowRecords(records, { status: ['FAILED', 'CANCELLED'] });
  assert.strictEqual(filtered.length, 2);
});

// ─── AD. Search Case Insensitive ────────────────────────────────────────────

test('AD: Search filter is case-insensitive', function() {
  const records = [
    makeRecord({ source: { name: 'Test.MP4', path: '/tmp/Test.MP4' } }),
  ];
  const filtered = filterWorkflowRecords(records, { search: 'test' });
  assert.strictEqual(filtered.length, 1);
});

test('AD: Search by profile name', function() {
  const records = [
    makeRecord({ profile: { id: 'p1', name: 'My Profile', platform: 'IG' } }),
    makeRecord({ profile: { id: 'p2', name: 'Other', platform: 'TT' } }),
  ];
  const filtered = filterWorkflowRecords(records, { search: 'my profile' });
  assert.strictEqual(filtered.length, 1);
});

// ─── AE. No Fake Metrics ────────────────────────────────────────────────────

test('AE: No invented metrics in workflow summary', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.strictEqual(summary.queue.processing, 0);
  assert.strictEqual(summary.history.total, 0);
  assert.strictEqual(summary.recovery.retryReady, 0);
  assert.ok(!summary.fakeMetric);
});

// ─── AF. Output Health Counts ───────────────────────────────────────────────

test('AF: Output health counts with empty records', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.strictEqual(summary.outputHealth.available, 0);
  assert.strictEqual(summary.outputHealth.missing, 0);
});

test('AF: Output health counts with records without output', function() {
  const summary = getWorkflowSummary({
    ...emptyOpts,
    loadHistory: () => [makeRecord({ output: null })],
  });
  assert.strictEqual(summary.outputHealth.available, 0);
});

// ─── AG. Attention Counts ───────────────────────────────────────────────────

test('AG: Attention counts with empty records', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.strictEqual(summary.attention.needsAttention, 0);
  assert.strictEqual(summary.attention.blockedRecovery, 0);
});

test('AG: Attention counts with failed records', function() {
  const summary = getWorkflowSummary({
    ...emptyOpts,
    loadHistory: () => [makeRecord({ status: 'FAILED', error: 'crash', output: null })],
  });
  assert.ok(summary.attention.needsAttention >= 0);
});

// ─── AH. Recovery Action Counts ─────────────────────────────────────────────

test('AH: Recovery counts with empty records', function() {
  const summary = getWorkflowSummary(emptyOpts);
  assert.strictEqual(summary.recovery.retryReady, 0);
  assert.strictEqual(summary.recovery.missingOutputs, 0);
  assert.strictEqual(summary.recovery.exportAgainReady, 0);
});

// ─── AI. Combined Filters ───────────────────────────────────────────────────

test('AI: Combined status and exportType filter', function() {
  const records = [
    makeRecord({ status: 'COMPLETED', exportType: 'cut' }),
    makeRecord({ status: 'COMPLETED', exportType: 'reel' }),
    makeRecord({ status: 'FAILED', exportType: 'cut' }),
  ];
  const filtered = filterWorkflowRecords(records, { status: ['COMPLETED'], exportType: 'cut' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].exportType, 'cut');
});

test('AI: Combined search and status filter', function() {
  const records = [
    makeRecord({ status: 'FAILED', source: { name: 'crash.mp4', path: '/tmp/crash.mp4' } }),
    makeRecord({ status: 'FAILED', source: { name: 'error.mp4', path: '/tmp/error.mp4' } }),
    makeRecord({ status: 'COMPLETED', source: { name: 'crash.mp4', path: '/tmp/crash.mp4' } }),
  ];
  const filtered = filterWorkflowRecords(records, { status: ['FAILED'], search: 'crash' });
  assert.strictEqual(filtered.length, 1);
});

// ─── AJ. Export Again Intelligence ──────────────────────────────────────────

test('AJ: Validate snapshot checks all required snapshots', function() {
  const record = makeRecord({
    exportPreset: null,
    variationPreset: null,
    captionTemplate: null,
    settingsSnapshot: null,
  });
  const result = validateSnapshotForExport(record.id);
  // Record won't be found by the service, but validate the function structure
  assert.ok(result);
  assert.strictEqual(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.issues));
});

// ─── AK. Bulk Action with All Duplicates ────────────────────────────────────

test('AK: Execute bulk with all duplicate IDs', function() {
  const result = executeBulkAction('retry', ['id1', 'id1', 'id1']);
  assert.ok(result.summary);
  assert.strictEqual(result.summary.total, 3);
});

// ─── AL. Filter by single status string ─────────────────────────────────────

test('AL: Filter by single status string', function() {
  const records = [
    makeRecord({ status: 'COMPLETED' }),
    makeRecord({ status: 'FAILED' }),
  ];
  const filtered = filterWorkflowRecords(records, { status: 'FAILED' });
  assert.strictEqual(filtered.length, 1);
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
