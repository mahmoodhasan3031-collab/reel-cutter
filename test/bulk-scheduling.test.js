'use strict';

/**
 * Phase 3C — Advanced & Bulk Scheduling Tests
 *
 * Comprehensive tests for bulk schedule creation, time gaps, validation,
 * atomic persistence, snapshot immutability, output collision safety,
 * group summaries, group cancellation, and history cleanup.
 *
 * 35 tests total (pure Node.js — no Electron runtime dependency).
 */

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const {
  SCHEDULE_STATUS,
  loadSchedules,
  getSchedules,
  getSchedule,
  updateScheduleStatus,
  pauseSchedule,
  resumeSchedule,
} = require('../src/main/scheduler/scheduleManager');

const {
  MIN_GAP_MINUTES,
  MAX_GAP_MINUTES,
  validateGapMinutes,
  validateStartAt,
  validatePlanForBulkSchedule,
  createBulkSchedule,
  getScheduleGroupSummary,
  cancelScheduleGroup,
  deleteScheduleGroupHistory,
} = require('../src/main/scheduler/bulkScheduleManager');

const { getBatchQueueManager, MAX_CONCURRENCY } = require('../src/engine/batchQueue');

// ── Test Harness ─────────────────────────────────────────────────────────────
let _passed = 0;
let _failed = 0;
const _failures = [];

function test(name, fn) {
  try {
    fn();
    _passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    _failed++;
    _failures.push({ name, err });
    process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`);
  }
}

// ── Fixtures & Setup ─────────────────────────────────────────────────────────
let tmpDir;
let mediaFile;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-3c-'));
  mediaFile = path.join(tmpDir, 'source_test.mp4');
  fs.writeFileSync(mediaFile, 'fake-mp4-stream');
}

function teardown() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

let _counter = 0;
function makePlan(jobCount = 3, overrides = {}) {
  const planId = `plan_test_${Date.now()}_${++_counter}`;
  const jobs = [];
  const platforms = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];
  for (let i = 0; i < jobCount; i++) {
    jobs.push({
      jobId: `job_${planId}_${i + 1}`,
      orderIndex: i + 1,
      profileId: `prof_${i + 1}`,
      profileName: `Profile ${i + 1}`,
      platform: platforms[i % platforms.length],
      variationPreset: {
        enabled: true,
        speed: 1.01 + i * 0.01,
        saturation: 1.05,
        cleanMetadata: true,
      },
      savedPreset: { enabled: false },
      isOverridden: false,
      outputFilename: `source_test__Profile_${i + 1}__${i + 1}.mp4`,
      outputPath: path.join(tmpDir, `source_test__Profile_${i + 1}__${i + 1}.mp4`),
    });
  }

  return {
    planId,
    sourceFile: mediaFile,
    exportType: 'cut',
    outputDir: tmpDir,
    jobs,
    ...overrides,
  };
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' Phase 3C — Advanced & Bulk Scheduling Tests (35 Tests)');
console.log('══════════════════════════════════════════════════════════\n');

setup();

// ── 1. Bulk Schedule Creation & Basic Flow ───────────────────────────────────
console.log('── 1. Creation & Timelines ──────────────────────────────────\n');

test('1. bulk schedule creation returns success, planId and created records', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 15 }, tmpDir);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.planId, plan.planId);
  assert.strictEqual(res.count, 3);
  assert.strictEqual(res.schedules.length, 3);
});

test('2. 3-job timeline schedules jobs sequentially according to gap', () => {
  const plan = makePlan(3);
  const startAt = new Date('2026-10-01T10:00:00.000Z').toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 15 }, tmpDir);
  const t0 = new Date(res.schedules[0].scheduledAt).getTime();
  const t1 = new Date(res.schedules[1].scheduledAt).getTime();
  const t2 = new Date(res.schedules[2].scheduledAt).getTime();
  assert.strictEqual(t1 - t0, 15 * 60 * 1000);
  assert.strictEqual(t2 - t1, 15 * 60 * 1000);
});

test('3. 15-minute gap calculates correct offset for every job', () => {
  const plan = makePlan(2);
  const startAt = new Date('2026-10-01T12:00:00.000Z').toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 15 }, tmpDir);
  assert.strictEqual(res.schedules[0].scheduledAt, '2026-10-01T12:00:00.000Z');
  assert.strictEqual(res.schedules[1].scheduledAt, '2026-10-01T12:15:00.000Z');
});

test('4. 1-minute minimum gap accepted', () => {
  assert.strictEqual(validateGapMinutes(1), 1);
  assert.strictEqual(validateGapMinutes('1'), 1);
});

test('5. 1440-minute maximum gap (24h) accepted', () => {
  assert.strictEqual(validateGapMinutes(1440), 1440);
  assert.strictEqual(validateGapMinutes('1440'), 1440);
});

// ── 2. Time Gap Validation ───────────────────────────────────────────────────
console.log('\n── 2. Time Gap Validation ───────────────────────────────────\n');

test('6. reject zero gap (0 minutes)', () => {
  assert.throws(() => validateGapMinutes(0), /must be at least 1 minute/);
});

test('7. reject negative gap (-5 minutes)', () => {
  assert.throws(() => validateGapMinutes(-5), /must be at least 1 minute/);
});

test('8. reject decimal gap (1.5 minutes)', () => {
  assert.throws(() => validateGapMinutes(1.5), /must be a whole integer/);
});

test('9. reject NaN/Infinity or invalid inputs', () => {
  assert.throws(() => validateGapMinutes(NaN), /Invalid time gap/);
  assert.throws(() => validateGapMinutes(Infinity), /Invalid time gap/);
  assert.throws(() => validateGapMinutes('abc'), /Invalid time gap/);
  assert.throws(() => validateGapMinutes(1441), /cannot exceed 1440/);
});

// ── 3. Start Timestamp & Plan Validation ─────────────────────────────────────
console.log('\n── 3. Start Timestamp & Atomic Creation ─────────────────────\n');

test('10. start timestamp validation accepts valid ISO and rejects unparseable strings', () => {
  const valid = validateStartAt('2026-12-01T08:30:00.000Z');
  assert.strictEqual(valid, '2026-12-01T08:30:00.000Z');
  assert.throws(() => validateStartAt('not-a-timestamp'), /Invalid startAt date format/);
  assert.throws(() => validateStartAt(null), /Valid startAt ISO timestamp is required/);
});

test('11. atomic creation creates all requested schedules in one write', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const beforeCount = getSchedules(tmpDir).length;
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 10 }, tmpDir);
  const afterCount = getSchedules(tmpDir).length;
  assert.strictEqual(afterCount - beforeCount, 3);
  assert.strictEqual(res.count, 3);
});

test('12. no partial records on validation error', () => {
  const plan = makePlan(3);
  // Introduce an error on job 3 (invalid variation speed > 1.05)
  plan.jobs[2].variationPreset.speed = 1.99;
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const beforeCount = getSchedules(tmpDir).length;

  assert.throws(() => {
    createBulkSchedule({ plan, startAt, gapMinutes: 10 }, tmpDir);
  }, /invalid variation preset/i);

  const afterCount = getSchedules(tmpDir).length;
  assert.strictEqual(afterCount, beforeCount, 'Zero partial schedules persisted');
});

// ── 4. Snapshot Immutability ─────────────────────────────────────────────────
console.log('\n── 4. Snapshot Immutability ─────────────────────────────────\n');

test('13. profile snapshot cloning protects against subsequent mutations', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  // Mutate the original plan object
  plan.jobs[0].profileName = 'MUTATED_PROFILE';
  const disk = getSchedule(res.schedules[0].id, tmpDir);
  assert.strictEqual(disk.profileSnapshot.name, 'Profile 1');
});

test('14. variation snapshot cloning ensures independent preset copy', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  // Mutate plan variation
  plan.jobs[0].variationPreset.speed = 1.05;
  const disk = getSchedule(res.schedules[0].id, tmpDir);
  assert.strictEqual(disk.variationPreset.speed, 1.01);
});

test('15. export option cloning captures canonical options snapshot', () => {
  const plan = makePlan(1);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({
    plan,
    startAt,
    gapMinutes: 5,
    options: { start: 10, duration: 25, mode: 'blur' },
  }, tmpDir);
  const disk = getSchedule(res.schedules[0].id, tmpDir);
  assert.strictEqual(disk.exportOptions.start, 10);
  assert.strictEqual(disk.exportOptions.duration, 25);
  assert.strictEqual(disk.exportOptions.mode, 'blur');
});

// ── 5. Ordering & Output Safety ──────────────────────────────────────────────
console.log('\n── 5. Ordering & Collision Safety ───────────────────────────\n');

test('16. order preservation follows plan job sequence', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 10 }, tmpDir);
  assert.strictEqual(res.schedules[0].profileSnapshot.name, 'Profile 1');
  assert.strictEqual(res.schedules[1].profileSnapshot.name, 'Profile 2');
  assert.strictEqual(res.schedules[2].profileSnapshot.name, 'Profile 3');
});

test('17. reordered profiles receive scheduled times according to new order', () => {
  const plan = makePlan(3);
  // Swap job 0 and job 2
  const temp = plan.jobs[0];
  plan.jobs[0] = plan.jobs[2];
  plan.jobs[2] = temp;
  const startAt = new Date('2026-11-01T15:00:00.000Z').toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 10 }, tmpDir);
  assert.strictEqual(res.schedules[0].profileSnapshot.name, 'Profile 3');
  assert.strictEqual(res.schedules[0].scheduledAt, '2026-11-01T15:00:00.000Z');
  assert.strictEqual(res.schedules[2].profileSnapshot.name, 'Profile 1');
  assert.strictEqual(res.schedules[2].scheduledAt, '2026-11-01T15:20:00.000Z');
});

test('18. output collision safety prevents duplicate output filenames within a plan', () => {
  const plan = makePlan(2);
  // Force same output path on both jobs
  plan.jobs[1].outputPath = plan.jobs[0].outputPath;
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  assert.notStrictEqual(res.schedules[0].outputPath.toLowerCase(), res.schedules[1].outputPath.toLowerCase());
});

test('19. source overwrite protection rejects output path matching source', () => {
  const plan = makePlan(1);
  plan.jobs[0].outputPath = mediaFile;
  const startAt = new Date(Date.now() + 3600000).toISOString();
  assert.throws(() => {
    createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  }, /cannot match source/i);
});

test('20. unique schedule IDs generated for each job in the bulk schedule', () => {
  const plan = makePlan(4);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  const ids = res.schedules.map(s => s.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(uniqueIds.size, 4);
});

test('21. group/plan ID consistency across all jobs in bulk schedule', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  for (const s of res.schedules) {
    assert.strictEqual(s.planId, plan.planId);
  }
});

// ── 6. Group Summaries & Lifecycle Actions ────────────────────────────────────
console.log('\n── 6. Group Summaries & Actions ─────────────────────────────\n');

test('22. group summary calculation correctly aggregates statuses', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  // Transition job 0 to COMPLETED, job 1 to PAUSED, leave job 2 as SCHEDULED
  updateScheduleStatus(res.schedules[0].id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(res.schedules[0].id, SCHEDULE_STATUS.COMPLETED, {}, tmpDir);
  pauseSchedule(res.schedules[1].id, tmpDir);

  const summary = getScheduleGroupSummary(plan.planId, tmpDir);
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.completed, 1);
  assert.strictEqual(summary.paused, 1);
  assert.strictEqual(summary.scheduled, 1);
  assert.strictEqual(summary.failed, 0);
  assert.strictEqual(summary.cancelled, 0);
});

test('23. cancel remaining cancels only active/pending jobs in the group', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  pauseSchedule(res.schedules[1].id, tmpDir);

  const cancelRes = cancelScheduleGroup(plan.planId, tmpDir);
  assert.strictEqual(cancelRes.cancelledCount, 3);

  const disk = getSchedules(tmpDir).filter(s => s.planId === plan.planId);
  for (const item of disk) {
    assert.strictEqual(item.status, SCHEDULE_STATUS.CANCELLED);
  }
});

test('24. completed unaffected by group cancellation', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  updateScheduleStatus(res.schedules[0].id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(res.schedules[0].id, SCHEDULE_STATUS.COMPLETED, {}, tmpDir);

  cancelScheduleGroup(plan.planId, tmpDir);
  const disk0 = getSchedule(res.schedules[0].id, tmpDir);
  const disk1 = getSchedule(res.schedules[1].id, tmpDir);
  assert.strictEqual(disk0.status, SCHEDULE_STATUS.COMPLETED);
  assert.strictEqual(disk1.status, SCHEDULE_STATUS.CANCELLED);
});

test('25. failed unaffected by group cancellation', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  updateScheduleStatus(res.schedules[0].id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(res.schedules[0].id, SCHEDULE_STATUS.FAILED, { error: 'Render failure' }, tmpDir);

  cancelScheduleGroup(plan.planId, tmpDir);
  const disk0 = getSchedule(res.schedules[0].id, tmpDir);
  const disk1 = getSchedule(res.schedules[1].id, tmpDir);
  assert.strictEqual(disk0.status, SCHEDULE_STATUS.FAILED);
  assert.strictEqual(disk1.status, SCHEDULE_STATUS.CANCELLED);
});

test('26. paused schedule independence within bulk group', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  pauseSchedule(res.schedules[0].id, tmpDir);
  const s0 = getSchedule(res.schedules[0].id, tmpDir);
  const s1 = getSchedule(res.schedules[1].id, tmpDir);
  assert.strictEqual(s0.status, SCHEDULE_STATUS.PAUSED);
  assert.strictEqual(s1.status, SCHEDULE_STATUS.SCHEDULED);
});

test('27. resume schedule independence within bulk group', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  pauseSchedule(res.schedules[0].id, tmpDir);
  pauseSchedule(res.schedules[1].id, tmpDir);
  resumeSchedule(res.schedules[0].id, tmpDir);
  const s0 = getSchedule(res.schedules[0].id, tmpDir);
  const s1 = getSchedule(res.schedules[1].id, tmpDir);
  assert.strictEqual(s0.status, SCHEDULE_STATUS.SCHEDULED);
  assert.strictEqual(s1.status, SCHEDULE_STATUS.PAUSED);
});

test('28. duplicate submission protection rejects identical planId re-submission', () => {
  const plan = makePlan(2);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  assert.throws(() => {
    createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  }, /already been created/);
});

test('29. restart persistence retains all bulk schedule items and group link', () => {
  const plan = makePlan(3);
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({ plan, startAt, gapMinutes: 10 }, tmpDir);
  // Reload store from disk
  const diskStore = loadSchedules(tmpDir);
  const matching = diskStore.schedules.filter(s => s.planId === plan.planId);
  assert.strictEqual(matching.length, 3);
  assert.strictEqual(matching[0].planId, plan.planId);
});

test('30. concurrency remains <= 2 in BatchQueueManager', () => {
  const q = getBatchQueueManager();
  assert.ok(MAX_CONCURRENCY <= 2);
  assert.ok(q.getState().concurrency <= 2);
});

// ── 7. Workflow Mappings & Edge Cases ─────────────────────────────────────────
console.log('\n── 7. Workflow Mappings & Edge Cases ────────────────────────\n');

test('31. Cut mapping configures exportOptions correctly', () => {
  const plan = makePlan(1, { exportType: 'cut' });
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({
    plan,
    startAt,
    gapMinutes: 5,
    options: { start: 5, duration: 15, mode: 'blur' },
  }, tmpDir);
  assert.strictEqual(res.schedules[0].exportType, 'cut');
  assert.strictEqual(res.schedules[0].exportOptions.start, 5);
  assert.strictEqual(res.schedules[0].exportOptions.duration, 15);
});

test('32. Reel mapping sets 9:16 vertical aspect ratio snapshot', () => {
  const plan = makePlan(1, { exportType: 'reel' });
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({
    plan,
    startAt,
    gapMinutes: 5,
    options: { mode: 'blur' },
  }, tmpDir);
  assert.strictEqual(res.schedules[0].exportType, 'reel');
  assert.strictEqual(res.schedules[0].exportOptions.aspectRatio, '9:16');
});

test('33. Split mapping preserves interval option snapshot', () => {
  const plan = makePlan(1, { exportType: 'split' });
  const startAt = new Date(Date.now() + 3600000).toISOString();
  const res = createBulkSchedule({
    plan,
    startAt,
    gapMinutes: 5,
    options: { interval: 45 },
  }, tmpDir);
  assert.strictEqual(res.schedules[0].exportType, 'split');
  assert.strictEqual(res.schedules[0].exportOptions.interval, 45);
});

test('34. invalid job isolation rejects bulk creation if any profile is invalid', () => {
  const plan = makePlan(2);
  plan.jobs[1].profileId = null; // invalid
  const startAt = new Date(Date.now() + 3600000).toISOString();
  assert.throws(() => {
    createBulkSchedule({ plan, startAt, gapMinutes: 5 }, tmpDir);
  }, /missing profileId/);
});

test('35. past-due schedule handling preserves ISO date without shifting', () => {
  const plan = makePlan(2);
  const pastIso = '2020-01-01T00:00:00.000Z';
  const res = createBulkSchedule({ plan, startAt: pastIso, gapMinutes: 10 }, tmpDir);
  assert.strictEqual(res.schedules[0].scheduledAt, '2020-01-01T00:00:00.000Z');
  assert.strictEqual(res.schedules[1].scheduledAt, '2020-01-01T00:10:00.000Z');
});

// ── Teardown & Summary ───────────────────────────────────────────────────────
teardown();

console.log('\n──────────────────────────────────────────────────────────');
if (_failed > 0) {
  _failures.forEach(({ name, err }) => {
    console.error(`\n  ✗ FAILED: ${name}`);
    console.error(`    ${err.stack || err.message}`);
  });
  console.error(`\n❌ ${_failed} test(s) failed. ${_passed} passed.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ ${_passed}/${_passed} Phase 3C advanced & bulk scheduling tests PASSED.\n`);
}
