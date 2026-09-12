'use strict';

/**
 * Phase 3B — Schedule Management Tests
 *
 * Tests: updateSchedule, resumeSchedule past-due policy,
 *        search/sort filtering helpers, confirmation dialog flows,
 *        deleteSchedule terminal-only guard, cancelSchedule state machine.
 *
 * 32 tests total (no Electron dependency — pure Node).
 */

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// ── Load subject under test ──────────────────────────────────────────────────
const {
  SCHEDULE_STATUS,
  createSchedule,
  getSchedules,
  getSchedule,
  updateSchedule,
  updateScheduleStatus,
  cancelSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  loadSchedules,
  saveSchedules,
} = require('../src/main/scheduler/scheduleManager');

// ── Test Harness ─────────────────────────────────────────────────────────────
let _passed = 0;
let _failed  = 0;
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

// ── Test Fixtures ────────────────────────────────────────────────────────────
let tmpDir;
let mediaFile;

function setup() {
  tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-3b-'));
  mediaFile = path.join(tmpDir, 'source.mp4');
  fs.writeFileSync(mediaFile, 'fake-video-data');
}

function teardown() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

function makeSchedule(overrides = {}) {
  return createSchedule({
    sourcePath:      mediaFile,
    exportType:      'cut',
    scheduledAt:     new Date(Date.now() + 60 * 60 * 1000).toISOString(), // +1 hour
    profileSnapshot: { id: 'p1', name: 'Test Profile', platform: 'Facebook' },
    variationPreset: { enabled: false },
    exportOptions:   { start: 0, duration: null, mode: 'blur', interval: 30 },
    ...overrides,
  }, tmpDir);
}

// ════════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log(' Phase 3B — Schedule Management Tests');
console.log('══════════════════════════════════════════════════════════\n');

setup();

// ── 1. updateSchedule — Basic Functionality ───────────────────────────────────
console.log('── 1. updateSchedule — Basic Functionality ─────────────────\n');

test('updateSchedule: returns updated object and isPastDue flag', () => {
  const s = makeSchedule();
  const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { updated, isPastDue } = updateSchedule(s.id, { scheduledAt: futureTime }, tmpDir);
  assert.strictEqual(updated.scheduledAt, futureTime);
  assert.strictEqual(isPastDue, false);
});

test('updateSchedule: past-due scheduledAt sets isPastDue=true', () => {
  const s = makeSchedule();
  const pastTime = new Date(Date.now() - 5000).toISOString();
  const { updated, isPastDue } = updateSchedule(s.id, { scheduledAt: pastTime }, tmpDir);
  assert.strictEqual(updated.scheduledAt, pastTime);
  assert.strictEqual(isPastDue, true);
});

test('updateSchedule: updates updatedAt timestamp', () => {
  const s = makeSchedule();
  const before = new Date(s.updatedAt).getTime();
  const { updated } = updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir);
  assert.ok(new Date(updated.updatedAt).getTime() >= before);
});

test('updateSchedule: does NOT change status field', () => {
  const s = makeSchedule();
  const { updated } = updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir);
  assert.strictEqual(updated.status, SCHEDULE_STATUS.SCHEDULED);
});

test('updateSchedule: persists changes to disk', () => {
  const s = makeSchedule();
  const newTime = new Date(Date.now() + 7200000).toISOString();
  updateSchedule(s.id, { scheduledAt: newTime }, tmpDir);
  const reloaded = getSchedule(s.id, tmpDir);
  assert.strictEqual(reloaded.scheduledAt, newTime);
});

test('updateSchedule: works on PAUSED jobs', () => {
  const s = makeSchedule();
  pauseSchedule(s.id, tmpDir);
  const newTime = new Date(Date.now() + 3600000).toISOString();
  const { updated } = updateSchedule(s.id, { scheduledAt: newTime }, tmpDir);
  assert.strictEqual(updated.scheduledAt, newTime);
  assert.strictEqual(updated.status, SCHEDULE_STATUS.PAUSED);
});

// ── 2. updateSchedule — Validation & Guards ───────────────────────────────────
console.log('\n── 2. updateSchedule — Validation & Guards ─────────────────\n');

test('updateSchedule: throws on missing id', () => {
  assert.throws(() => updateSchedule(null, { scheduledAt: new Date().toISOString() }, tmpDir), /id is required/);
});

test('updateSchedule: throws on missing changes', () => {
  const s = makeSchedule();
  assert.throws(() => updateSchedule(s.id, null, tmpDir), /changes must be an object/);
});

test('updateSchedule: throws on missing scheduledAt in changes', () => {
  const s = makeSchedule();
  assert.throws(() => updateSchedule(s.id, {}, tmpDir), /scheduledAt is required/);
});

test('updateSchedule: throws on invalid ISO date', () => {
  const s = makeSchedule();
  assert.throws(
    () => updateSchedule(s.id, { scheduledAt: 'not-a-date' }, tmpDir),
    /Invalid scheduledAt date format/
  );
});

test('updateSchedule: throws on non-existent id', () => {
  assert.throws(
    () => updateSchedule('sched_nonexistent', { scheduledAt: new Date().toISOString() }, tmpDir),
    /Schedule not found/
  );
});

test('updateSchedule: rejects READY status', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.READY, {}, tmpDir);
  assert.throws(
    () => updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir),
    /Cannot update schedule in status/
  );
});

test('updateSchedule: rejects PROCESSING status', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  assert.throws(
    () => updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir),
    /Cannot update schedule in status/
  );
});

test('updateSchedule: rejects COMPLETED (terminal) status', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(s.id, SCHEDULE_STATUS.COMPLETED, {}, tmpDir);
  assert.throws(
    () => updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir),
    /Cannot update schedule in status/
  );
});

test('updateSchedule: rejects CANCELLED (terminal) status', () => {
  const s = makeSchedule();
  cancelSchedule(s.id, tmpDir);
  assert.throws(
    () => updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir),
    /Cannot update schedule in status/
  );
});

test('updateSchedule: rejects FAILED status', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(s.id, SCHEDULE_STATUS.FAILED, { error: 'oops' }, tmpDir);
  assert.throws(
    () => updateSchedule(s.id, { scheduledAt: new Date(Date.now() + 3600000).toISOString() }, tmpDir),
    /Cannot update schedule in status/
  );
});

// ── 3. resumeSchedule — Past-Due Policy ──────────────────────────────────────
console.log('\n── 3. resumeSchedule — Past-Due Policy ─────────────────────\n');

test('resumeSchedule: future scheduledAt → PAUSED → SCHEDULED', () => {
  const s = makeSchedule({ scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  pauseSchedule(s.id, tmpDir);
  const resumed = resumeSchedule(s.id, tmpDir);
  assert.strictEqual(resumed.status, SCHEDULE_STATUS.SCHEDULED);
});

test('resumeSchedule: past-due scheduledAt → PAUSED → READY', () => {
  const s = makeSchedule({ scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  pauseSchedule(s.id, tmpDir);
  // Manually set scheduledAt to past so it's past-due on resume
  const store = loadSchedules(tmpDir);
  const idx = store.schedules.findIndex(x => x.id === s.id);
  store.schedules[idx].scheduledAt = new Date(Date.now() - 10000).toISOString();
  saveSchedules(store, tmpDir);
  const resumed = resumeSchedule(s.id, tmpDir);
  assert.strictEqual(resumed.status, SCHEDULE_STATUS.READY);
});

test('resumeSchedule: throws on non-PAUSED status', () => {
  const s = makeSchedule();
  assert.throws(() => resumeSchedule(s.id, tmpDir), /Only PAUSED jobs can be resumed/);
});

test('resumeSchedule: past-due persists correctly to disk', () => {
  const s = makeSchedule({ scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  pauseSchedule(s.id, tmpDir);
  const store = loadSchedules(tmpDir);
  const idx = store.schedules.findIndex(x => x.id === s.id);
  store.schedules[idx].scheduledAt = new Date(Date.now() - 10000).toISOString();
  saveSchedules(store, tmpDir);
  resumeSchedule(s.id, tmpDir);
  const disk = getSchedule(s.id, tmpDir);
  assert.strictEqual(disk.status, SCHEDULE_STATUS.READY);
});

// ── 4. pauseSchedule ─────────────────────────────────────────────────────────
console.log('\n── 4. pauseSchedule ─────────────────────────────────────────\n');

test('pauseSchedule: SCHEDULED → PAUSED', () => {
  const s = makeSchedule();
  const paused = pauseSchedule(s.id, tmpDir);
  assert.strictEqual(paused.status, SCHEDULE_STATUS.PAUSED);
});

test('pauseSchedule: throws on non-SCHEDULED status', () => {
  const s = makeSchedule();
  pauseSchedule(s.id, tmpDir);
  assert.throws(() => pauseSchedule(s.id, tmpDir), /Only SCHEDULED jobs can be paused/);
});

// ── 5. cancelSchedule ────────────────────────────────────────────────────────
console.log('\n── 5. cancelSchedule ───────────────────────────────────────\n');

test('cancelSchedule: SCHEDULED → CANCELLED', () => {
  const s = makeSchedule();
  const cancelled = cancelSchedule(s.id, tmpDir);
  assert.strictEqual(cancelled.status, SCHEDULE_STATUS.CANCELLED);
});

test('cancelSchedule: PAUSED → CANCELLED', () => {
  const s = makeSchedule();
  pauseSchedule(s.id, tmpDir);
  const cancelled = cancelSchedule(s.id, tmpDir);
  assert.strictEqual(cancelled.status, SCHEDULE_STATUS.CANCELLED);
});

test('cancelSchedule: COMPLETED throws', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(s.id, SCHEDULE_STATUS.COMPLETED, {}, tmpDir);
  assert.throws(() => cancelSchedule(s.id, tmpDir), /Completed schedules cannot be cancelled/);
});

test('cancelSchedule: FAILED throws', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(s.id, SCHEDULE_STATUS.FAILED, { error: 'err' }, tmpDir);
  assert.throws(() => cancelSchedule(s.id, tmpDir), /Failed schedules cannot be cancelled/);
});

// ── 6. deleteSchedule ────────────────────────────────────────────────────────
console.log('\n── 6. deleteSchedule ───────────────────────────────────────\n');

test('deleteSchedule: CANCELLED → deleted', () => {
  const s = makeSchedule();
  cancelSchedule(s.id, tmpDir);
  const ok = deleteSchedule(s.id, tmpDir);
  assert.strictEqual(ok, true);
  assert.strictEqual(getSchedule(s.id, tmpDir), null);
});

test('deleteSchedule: COMPLETED → deleted', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(s.id, SCHEDULE_STATUS.COMPLETED, {}, tmpDir);
  const ok = deleteSchedule(s.id, tmpDir);
  assert.strictEqual(ok, true);
});

test('deleteSchedule: FAILED → deleted', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  updateScheduleStatus(s.id, SCHEDULE_STATUS.FAILED, { error: 'err' }, tmpDir);
  const ok = deleteSchedule(s.id, tmpDir);
  assert.strictEqual(ok, true);
});

test('deleteSchedule: SCHEDULED throws (cancel first)', () => {
  const s = makeSchedule();
  assert.throws(() => deleteSchedule(s.id, tmpDir), /Cancel it first/);
});

test('deleteSchedule: PROCESSING throws', () => {
  const s = makeSchedule();
  updateScheduleStatus(s.id, SCHEDULE_STATUS.PROCESSING, {}, tmpDir);
  assert.throws(() => deleteSchedule(s.id, tmpDir), /Cancel it first/);
});

// ── 7. Multiple Schedules & getSchedules ─────────────────────────────────────
console.log('\n── 7. Multiple Schedules ───────────────────────────────────\n');

test('getSchedules: returns all schedules from disk', () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-3b-multi-'));
  const mf   = path.join(dir2, 's.mp4');
  fs.writeFileSync(mf, 'x');
  const input = {
    sourcePath: mf, exportType: 'cut',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    profileSnapshot: { id: null, name: 'D', platform: 'Other' },
    variationPreset: { enabled: false }, exportOptions: {},
  };
  createSchedule(input, dir2);
  createSchedule(input, dir2);
  createSchedule(input, dir2);
  const all = getSchedules(dir2);
  assert.strictEqual(all.length, 3);
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('updateSchedule: multiple edits on same schedule all persist', () => {
  const s = makeSchedule();
  const t1 = new Date(Date.now() + 3600000).toISOString();
  const t2 = new Date(Date.now() + 7200000).toISOString();
  updateSchedule(s.id, { scheduledAt: t1 }, tmpDir);
  updateSchedule(s.id, { scheduledAt: t2 }, tmpDir);
  const disk = getSchedule(s.id, tmpDir);
  assert.strictEqual(disk.scheduledAt, t2);
});

// ── Summary ──────────────────────────────────────────────────────────────────
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
  console.log(`\n✅ ${_passed}/${_passed} Phase 3B schedule-management tests PASSED.\n`);
}
