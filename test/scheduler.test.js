'use strict';

/**
 * Phase 3A — Schedule & Queue Foundation Tests
 *
 * Covers:
 *  1. schedule creation
 *  2. schedule validation
 *  3. ISO timestamp handling
 *  4. future schedule persistence
 *  5. loading schedules from disk
 *  6. status transitions
 *  7. scheduled → ready
 *  8. ready → processing
 *  9. processing → completed
 * 10. processing → failed
 * 11. cancellation before execution
 * 12. completed job cannot execute again
 * 13. cancelled job cannot execute
 * 14. duplicate execution protection
 * 15. restart recovery
 * 16. past-due startup behavior
 * 17. profile snapshot immutability
 * 18. variation snapshot immutability
 * 19. Cut mapping
 * 20. Reel mapping
 * 21. Split mapping
 * 22. invalid export type rejection
 * 23. invalid variation rejection
 * 24. unsafe path rejection
 * 25. scheduler loop singleton behavior
 * 26. queue concurrency remains <= 2
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const {
  SCHEDULE_STATUS,
  getSchedulesFilePath,
  loadSchedules,
  saveSchedules,
  validateScheduleInput,
  createSchedule,
  getSchedules,
  getSchedule,
  updateScheduleStatus,
  cancelSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
} = require('../src/main/scheduler/scheduleManager');

const {
  SchedulerService,
  getSchedulerService,
} = require('../src/main/scheduler/schedulerService');

const { BatchQueueManager, MAX_CONCURRENCY } = require('../src/engine/batchQueue');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-test-'));
  _tmpDirs.push(dir);
  return dir;
}

function makeFakeVideo(dir, name = 'test_video.mp4') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'FAKE_VIDEO_CONTENT_BYTES');
  return p;
}

function cleanup() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  }
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

async function runTests() {
  console.log('\n========================================================');
  console.log('  Phase 3A — Schedule & Queue Foundation Tests');
  console.log('========================================================\n');

  // ── 1. Schedule creation ──────────────────────────────────────────────────
  await test('1. schedule creation generates valid schedule object with defaults', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({
      sourcePath: vid,
      exportType: 'cut',
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      profileSnapshot: { name: 'Test Page', platform: 'Facebook' },
    }, tmp);

    assert.ok(item.id.startsWith('sched_'), 'ID format');
    assert.strictEqual(item.status, SCHEDULE_STATUS.SCHEDULED);
    assert.strictEqual(item.sourcePath, path.resolve(vid));
    assert.strictEqual(item.exportType, 'cut');
    assert.strictEqual(item.profileSnapshot.name, 'Test Page');
    assert.strictEqual(item.profileSnapshot.platform, 'Facebook');
    assert.ok(item.createdAt, 'createdAt present');
    assert.ok(item.updatedAt, 'updatedAt present');
  });

  // ── 2. Schedule validation ────────────────────────────────────────────────
  await test('2. schedule validation rejects missing or non-existent source', () => {
    assert.throws(() => {
      validateScheduleInput({ sourcePath: '', exportType: 'cut', scheduledAt: new Date().toISOString() });
    }, /sourcePath is required/i);

    assert.throws(() => {
      validateScheduleInput({ sourcePath: 'Z:\\non_existent_folder_xyz\\vid.mp4', exportType: 'cut', scheduledAt: new Date().toISOString() });
    }, /does not exist/i);
  });

  // ── 3. ISO timestamp handling ─────────────────────────────────────────────
  await test('3. ISO timestamp handling accepts valid ISO strings and rejects unparseable dates', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);

    const validIso = '2026-09-12T20:30:00.000Z';
    const { sanitized } = validateScheduleInput({
      sourcePath: vid,
      exportType: 'reel',
      scheduledAt: validIso,
    });
    assert.strictEqual(sanitized.scheduledAt, validIso);

    assert.throws(() => {
      validateScheduleInput({
        sourcePath: vid,
        exportType: 'reel',
        scheduledAt: 'tomorrow at 5pm',
      });
    }, /invalid scheduledAt date format/i);
  });

  // ── 4. Future schedule persistence ────────────────────────────────────────
  await test('4. future schedule persistence writes schedules.json to disk', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({
      sourcePath: vid,
      exportType: 'split',
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    }, tmp);

    const filePath = getSchedulesFilePath(tmp);
    assert.ok(fs.existsSync(filePath), 'schedules.json exists on disk');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(raw.schedules.length, 1);
    assert.strictEqual(raw.schedules[0].id, item.id);
  });

  // ── 5. Loading schedules from disk ────────────────────────────────────────
  await test('5. loading schedules from disk recovers persisted records', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);
    createSchedule({ sourcePath: vid, exportType: 'reel', scheduledAt: new Date().toISOString() }, tmp);

    const loaded = getSchedules(tmp);
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].exportType, 'cut');
    assert.strictEqual(loaded[1].exportType, 'reel');
  });

  // ── 6. Status transitions ─────────────────────────────────────────────────
  await test('6. status transitions enforce valid lifecycle transitions', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);

    const ready = updateScheduleStatus(item.id, SCHEDULE_STATUS.READY, {}, tmp);
    assert.strictEqual(ready.status, SCHEDULE_STATUS.READY);

    const processing = updateScheduleStatus(item.id, SCHEDULE_STATUS.PROCESSING, {}, tmp);
    assert.strictEqual(processing.status, SCHEDULE_STATUS.PROCESSING);

    const completed = updateScheduleStatus(item.id, SCHEDULE_STATUS.COMPLETED, {}, tmp);
    assert.strictEqual(completed.status, SCHEDULE_STATUS.COMPLETED);

    // Terminal state cannot transition to something else
    assert.throws(() => {
      updateScheduleStatus(item.id, SCHEDULE_STATUS.PROCESSING, {}, tmp);
    }, /terminal status/i);
  });

  // ── 7. Scheduled → ready promotion ────────────────────────────────────────
  await test('7. scheduled → ready promotion promotes due jobs via service', async () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const pastDue = new Date(Date.now() - 1000).toISOString();
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: pastDue }, tmp);

    // Use a mock queue that captures items
    const mockQueue = new BatchQueueManager();
    const service = new SchedulerService({ customDir: tmp, queueInstance: mockQueue, intervalMs: 50 });

    let promoted = false;
    service.on('scheduleUpdate', (sched) => {
      if (sched.id === item.id && (sched.status === SCHEDULE_STATUS.READY || sched.status === SCHEDULE_STATUS.PROCESSING)) {
        promoted = true;
      }
    });

    service.start();
    await new Promise(r => setTimeout(r, 200));
    service.stop();

    assert.ok(promoted, 'Schedule was promoted to READY/PROCESSING');
  });

  // ── 8. Ready → processing ─────────────────────────────────────────────────
  await test('8. ready → processing status transition marks start time and batchItemId', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);

    updateScheduleStatus(item.id, SCHEDULE_STATUS.READY, {}, tmp);
    const proc = updateScheduleStatus(item.id, SCHEDULE_STATUS.PROCESSING, { batchItemId: 'bq_123' }, tmp);

    assert.strictEqual(proc.status, SCHEDULE_STATUS.PROCESSING);
    assert.strictEqual(proc.batchItemId, 'bq_123');
    assert.ok(proc.startedAt, 'startedAt timestamp set');
  });

  // ── 9. Processing → completed ─────────────────────────────────────────────
  await test('9. processing → completed records finishedAt and result', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);
    updateScheduleStatus(item.id, SCHEDULE_STATUS.PROCESSING, {}, tmp);

    const comp = updateScheduleStatus(item.id, SCHEDULE_STATUS.COMPLETED, {
      result: { outputPath: 'C:/out/clip.mp4' },
      progress: 100,
    }, tmp);

    assert.strictEqual(comp.status, SCHEDULE_STATUS.COMPLETED);
    assert.strictEqual(comp.progress, 100);
    assert.ok(comp.finishedAt, 'finishedAt timestamp set');
    assert.strictEqual(comp.result.outputPath, 'C:/out/clip.mp4');
  });

  // ── 10. Processing → failed ───────────────────────────────────────────────
  await test('10. processing → failed records finishedAt and descriptive error', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);
    updateScheduleStatus(item.id, SCHEDULE_STATUS.PROCESSING, {}, tmp);

    const failedItem = updateScheduleStatus(item.id, SCHEDULE_STATUS.FAILED, {
      error: 'FFmpeg encoding error code 1',
      progress: 0,
    }, tmp);

    assert.strictEqual(failedItem.status, SCHEDULE_STATUS.FAILED);
    assert.strictEqual(failedItem.error, 'FFmpeg encoding error code 1');
    assert.ok(failedItem.finishedAt, 'finishedAt set on failure');
  });

  // ── 11. Cancellation before execution ─────────────────────────────────────
  await test('11. cancellation before execution transitions SCHEDULED to CANCELLED', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date(Date.now() + 60000).toISOString() }, tmp);

    const cancelled = cancelSchedule(item.id, tmp);
    assert.strictEqual(cancelled.status, SCHEDULE_STATUS.CANCELLED);
    assert.strictEqual(cancelled.error, 'Cancelled by user');

    const loaded = getSchedule(item.id, tmp);
    assert.strictEqual(loaded.status, SCHEDULE_STATUS.CANCELLED);
  });

  // ── 12. Completed job cannot execute again ─────────────────────────────────
  await test('12. completed job cannot execute again (terminal lock)', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);
    updateScheduleStatus(item.id, SCHEDULE_STATUS.COMPLETED, {}, tmp);

    assert.throws(() => {
      updateScheduleStatus(item.id, SCHEDULE_STATUS.READY, {}, tmp);
    }, /terminal status/i);

    assert.throws(() => {
      cancelSchedule(item.id, tmp);
    }, /completed schedules cannot be cancelled/i);
  });

  // ── 13. Cancelled job cannot execute ──────────────────────────────────────
  await test('13. cancelled job cannot execute or transition to active status', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);
    cancelSchedule(item.id, tmp);

    assert.throws(() => {
      updateScheduleStatus(item.id, SCHEDULE_STATUS.READY, {}, tmp);
    }, /terminal status/i);
  });

  // ── 14. Duplicate execution protection ────────────────────────────────────
  await test('14. duplicate execution protection prevents multiple triggers of same schedule', async () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const pastDue = new Date(Date.now() - 5000).toISOString();
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: pastDue }, tmp);

    let queueAddCount = 0;
    const mockQueue = {
      addItems: () => {
        queueAddCount++;
        return [{ id: 'bq_test_dup' }];
      },
      startQueue: () => {},
      on: () => {},
      removeListener: () => {},
    };

    const service = new SchedulerService({ customDir: tmp, queueInstance: mockQueue, intervalMs: 25 });
    service.start();

    // Let the loop tick multiple times
    await new Promise(r => setTimeout(r, 120));
    service.stop();

    // Must be added to queue EXACTLY once
    assert.strictEqual(queueAddCount, 1, 'Schedule was submitted to queue only once despite multiple ticks');
  });

  // ── 15. Restart recovery ──────────────────────────────────────────────────
  await test('15. restart recovery: future schedules remain SCHEDULED after restart', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const future = new Date(Date.now() + 600000).toISOString();
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: future }, tmp);

    // Simulate new service instance starting up
    const service = new SchedulerService({ customDir: tmp, intervalMs: 1000 });
    service._reconcileOnStartup();

    const loaded = getSchedule(item.id, tmp);
    assert.strictEqual(loaded.status, SCHEDULE_STATUS.SCHEDULED, 'Future job remains SCHEDULED on startup');
  });

  // ── 16. Past-due startup behavior ─────────────────────────────────────────
  await test('16. past-due startup behavior reconciles interrupted jobs safely', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({ sourcePath: vid, exportType: 'cut', scheduledAt: new Date().toISOString() }, tmp);

    // Simulate app crashed while job was PROCESSING
    updateScheduleStatus(item.id, SCHEDULE_STATUS.PROCESSING, {}, tmp);

    // Restart scheduler
    const service = new SchedulerService({ customDir: tmp, intervalMs: 1000 });
    service._reconcileOnStartup();

    const loaded = getSchedule(item.id, tmp);
    assert.strictEqual(loaded.status, SCHEDULE_STATUS.FAILED, 'Interrupted job marked FAILED on startup');
    assert.ok(loaded.error.includes('shutdown'), 'Descriptive error stored');
  });

  // ── 17. Profile snapshot immutability ─────────────────────────────────────
  await test('17. profile snapshot immutability: changing external profile does not mutate schedule', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const profObj = { id: 'prof_a', name: 'Original Profile Name', platform: 'Instagram' };

    const item = createSchedule({
      sourcePath: vid,
      exportType: 'reel',
      scheduledAt: new Date().toISOString(),
      profileSnapshot: profObj,
    }, tmp);

    // External mutation
    profObj.name = 'MUTATED PROFILE NAME';

    const loaded = getSchedule(item.id, tmp);
    assert.strictEqual(loaded.profileSnapshot.name, 'Original Profile Name', 'Snapshot untouched by mutation');
  });

  // ── 18. Variation snapshot immutability ───────────────────────────────────
  await test('18. variation snapshot immutability: variation config is independently snapshotted', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const varObj = { enabled: true, brightness: 0.1, saturation: 1.2, speed: 1.02 };

    const item = createSchedule({
      sourcePath: vid,
      exportType: 'cut',
      scheduledAt: new Date().toISOString(),
      variationPreset: varObj,
    }, tmp);

    // Mutate source variation object
    varObj.brightness = 0.99;
    varObj.speed = 1.05;

    const loaded = getSchedule(item.id, tmp);
    assert.ok(Math.abs(loaded.variationPreset.brightness - 0.1) < 0.001, 'Snapshot brightness untouched');
    assert.ok(Math.abs(loaded.variationPreset.speed - 1.02) < 0.001, 'Snapshot speed untouched');
  });

  // ── 19. Cut mapping ───────────────────────────────────────────────────────
  await test('19. cut mapping: exportOptions start & duration correctly mapped', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({
      sourcePath: vid,
      exportType: 'cut',
      scheduledAt: new Date().toISOString(),
      exportOptions: { start: 10, duration: 15, mode: 'blur' },
    }, tmp);

    assert.strictEqual(item.exportType, 'cut');
    assert.strictEqual(item.exportOptions.start, 10);
    assert.strictEqual(item.exportOptions.duration, 15);
  });

  // ── 20. Reel mapping ──────────────────────────────────────────────────────
  await test('20. reel mapping: 9:16 vertical aspect ratio correctly configured', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({
      sourcePath: vid,
      exportType: 'reel',
      scheduledAt: new Date().toISOString(),
      exportOptions: { aspectRatio: '9:16', mode: 'blur' },
    }, tmp);

    assert.strictEqual(item.exportType, 'reel');
    assert.strictEqual(item.exportOptions.aspectRatio, '9:16');
  });

  // ── 21. Split mapping ─────────────────────────────────────────────────────
  await test('21. split mapping: segment interval correctly preserved', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);
    const item = createSchedule({
      sourcePath: vid,
      exportType: 'split',
      scheduledAt: new Date().toISOString(),
      exportOptions: { interval: 45, mode: 'blur' },
    }, tmp);

    assert.strictEqual(item.exportType, 'split');
    assert.strictEqual(item.exportOptions.interval, 45);
  });

  // ── 22. Invalid export type rejection ─────────────────────────────────────
  await test('22. invalid export type rejection rejects unknown types', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);

    assert.throws(() => {
      validateScheduleInput({
        sourcePath: vid,
        exportType: 'gif_converter',
        scheduledAt: new Date().toISOString(),
      });
    }, /invalid exportType/i);
  });

  // ── 23. Invalid variation rejection ───────────────────────────────────────
  await test('23. invalid variation rejection enforces product validator limits', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);

    assert.throws(() => {
      validateScheduleInput({
        sourcePath: vid,
        exportType: 'cut',
        scheduledAt: new Date().toISOString(),
        variationPreset: { enabled: true, speed: 1.20 }, // over 1.05 limit
      });
    }, /speed must be between/i);
  });

  // ── 24. Unsafe path rejection ─────────────────────────────────────────────
  await test('24. unsafe path rejection blocks path traversal and source overwrite', () => {
    const tmp = makeTmpDir();
    const vid = makeFakeVideo(tmp);

    assert.throws(() => {
      validateScheduleInput({
        sourcePath: vid,
        exportType: 'cut',
        scheduledAt: new Date().toISOString(),
        outputDirectory: 'C:/some/dir/../../../windows',
      });
    }, /traversal/i);

    assert.throws(() => {
      validateScheduleInput({
        sourcePath: vid,
        exportType: 'cut',
        scheduledAt: new Date().toISOString(),
        outputPath: vid, // exact same path
      });
    }, /cannot match source/i);
  });

  // ── 25. Scheduler loop singleton behavior ─────────────────────────────────
  await test('25. scheduler loop singleton behavior returns identical instance', () => {
    const a = getSchedulerService();
    const b = getSchedulerService();
    assert.strictEqual(a, b, 'getSchedulerService returns singleton instance');
  });

  // ── 26. Queue concurrency remains <= 2 ────────────────────────────────────
  await test('26. queue concurrency remains <= 2', () => {
    assert.strictEqual(MAX_CONCURRENCY, 2, 'BatchQueue MAX_CONCURRENCY is strictly 2');
    const q = new BatchQueueManager();
    assert.ok(q.getConcurrency() <= 2, 'Default concurrency <= 2');
    q.setConcurrency(5);
    assert.strictEqual(q.getConcurrency(), 2, 'Concurrency clamped to max 2');
  });

  cleanup();

  console.log('\n--------------------------------------------------------');
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log('--------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
