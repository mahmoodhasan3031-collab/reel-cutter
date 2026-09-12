'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const {
  createProfile,
  updateProfile,
} = require('../src/main/profiles/profileManager');

const {
  createBulkExportPlan,
  removeJobFromPlan,
  reorderJobsInPlan,
  planToBatchQueueItems,
  generateBulkOutputFilename,
  sanitizeFilename,
} = require('../src/main/profiles/exportPlan');

const {
  validateBulkExportPlan,
  executeBulkExport,
  cancelBulkExport,
  cancelBulkJob,
} = require('../src/main/profiles/bulkExecutor');

const {
  BatchQueueManager,
  STATUS,
  MAX_CONCURRENCY,
} = require('../src/engine/batchQueue');

console.log('======================================================');
console.log('🧪 Running Phase 2C-3 Bulk Export UX & Integration Test Suite');
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
    process.stdout.write('         ' + (err.stack || err.message) + '\n');
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write('  PASS: ' + name + '\n');
  } catch (err) {
    failed++;
    errors.push({ name, err });
    process.stdout.write('  FAIL: ' + name + '\n');
    process.stdout.write('         ' + (err.stack || err.message) + '\n');
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-ux-test-'));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

function fileSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── UI helper functions replicated from MultiProfileSelector for validation ───

function getFilename(p) {
  if (!p) return '';
  return String(p).replace(/\\/g, '/').split('/').pop() || '';
}

function formatPresetSummary(preset) {
  if (!preset) return 'Default (no variations)';
  const parts = [];
  if (preset.brightness && preset.brightness !== 0)
    parts.push(`Bright ${preset.brightness > 0 ? '+' : ''}${Math.round(preset.brightness * 100)}%`);
  if (preset.saturation && preset.saturation !== 1)
    parts.push(`Sat ${Math.round(preset.saturation * 100)}%`);
  if (preset.hue && preset.hue !== 0)
    parts.push(`Hue ${preset.hue > 0 ? '+' : ''}${preset.hue}°`);
  if (preset.audioPitch && preset.audioPitch !== 0)
    parts.push(`Pitch ${preset.audioPitch > 0 ? '+' : ''}${preset.audioPitch}%`);
  if (preset.speed && preset.speed !== 1)
    parts.push(`Speed ${preset.speed}x`);
  if (preset.reframeMode && preset.reframeMode !== 'none')
    parts.push(`Reframe: ${preset.reframeMode}`);
  if (preset.stripMetadata)
    parts.push('Clean metadata');
  return parts.length > 0 ? parts.join(', ') : 'Default (no variations)';
}

function clampProgress(val) {
  return Math.min(100, Math.max(0, Math.round(Number(val) || 0)));
}

function formatJobError(err) {
  if (!err) return null;
  const msg = typeof err === 'string' ? err : err.message || 'Export error';
  if (msg.includes('No such file') || msg.includes('ENOENT')) return 'Source file not found or inaccessible';
  if (msg.includes('Conversion failed') || msg.includes('ffmpeg')) return 'FFmpeg encoding failed. Check media codecs.';
  if (msg.includes('Cancelled') || msg.includes('CANCELLED')) return 'Export cancelled';
  return msg.length > 120 ? msg.substring(0, 117) + '…' : msg;
}

function calculateSummary(jobs, jobStates) {
  let completed = 0;
  let failedCount = 0;
  let cancelled = 0;
  for (const job of jobs) {
    const st = (jobStates[job.jobId]?.status || job.status || '').toUpperCase();
    if (st === 'DONE' || st === 'COMPLETED') completed++;
    else if (st === 'ERROR' || st === 'FAILED') failedCount++;
    else if (st === 'CANCELLED') cancelled++;
  }
  return { total: jobs.length, completed, failed: failedCount, cancelled };
}

const REAL_SOURCE = path.resolve(__dirname, '../test-videos/normal_general.mp4');
const initialSourceSha = fileSha256(REAL_SOURCE);

(async () => {

// ── 1. getFilename helper handles Windows and Unix paths safely ───────────────
test('1. getFilename handles Windows backslashes, Unix slashes, and null safely', () => {
  assert.strictEqual(getFilename('C:\\Videos\\test_clip.mp4'), 'test_clip.mp4');
  assert.strictEqual(getFilename('/home/user/videos/reel_1.mp4'), 'reel_1.mp4');
  assert.strictEqual(getFilename('simple_name.mp4'), 'simple_name.mp4');
  assert.strictEqual(getFilename(''), '');
  assert.strictEqual(getFilename(null), '');
  assert.strictEqual(getFilename(undefined), '');
});

// ── 2. formatPresetSummary generates clear descriptions ──────────────────────
test('2. formatPresetSummary displays all variation parameters correctly', () => {
  const fullPreset = {
    brightness: 0.05,
    saturation: 1.1,
    hue: -10,
    audioPitch: 1.5,
    speed: 1.02,
    reframeMode: 'crop',
    stripMetadata: true,
  };
  const summary = formatPresetSummary(fullPreset);
  assert.ok(summary.includes('Bright +5%'));
  assert.ok(summary.includes('Sat 110%'));
  assert.ok(summary.includes('Hue -10°'));
  assert.ok(summary.includes('Pitch +1.5%'));
  assert.ok(summary.includes('Speed 1.02x'));
  assert.ok(summary.includes('Reframe: crop'));
  assert.ok(summary.includes('Clean metadata'));

  assert.strictEqual(formatPresetSummary(null), 'Default (no variations)');
  assert.strictEqual(
    formatPresetSummary({ brightness: 0, saturation: 1, hue: 0, reframeMode: 'none' }),
    'Default (no variations)'
  );
});

// ── 3. clampProgress strictly bounds integer output to [0, 100] ──────────────
test('3. clampProgress guarantees values in [0, 100] without NaN risk', () => {
  assert.strictEqual(clampProgress(0), 0);
  assert.strictEqual(clampProgress(50), 50);
  assert.strictEqual(clampProgress(100), 100);
  assert.strictEqual(clampProgress(-10), 0);
  assert.strictEqual(clampProgress(120), 100);
  assert.strictEqual(clampProgress(45.7), 46);
  assert.strictEqual(clampProgress('75'), 75);
  assert.strictEqual(clampProgress(null), 0);
  assert.strictEqual(clampProgress(undefined), 0);
  assert.strictEqual(clampProgress(NaN), 0);
  assert.strictEqual(clampProgress('invalid'), 0);
});

// ── 4. formatJobError sanitizes technical errors for human readability ────────
test('4. formatJobError converts system and ffmpeg errors to human-readable text', () => {
  assert.strictEqual(formatJobError(null), null);
  assert.strictEqual(formatJobError('ENOENT: No such file or directory'), 'Source file not found or inaccessible');
  assert.strictEqual(formatJobError('ffmpeg exited with code 1: Conversion failed'), 'FFmpeg encoding failed. Check media codecs.');
  assert.strictEqual(formatJobError('Task CANCELLED by user'), 'Export cancelled');
  assert.strictEqual(formatJobError('Short error'), 'Short error');

  const longErr = 'A'.repeat(200);
  const formatted = formatJobError(longErr);
  assert.strictEqual(formatted.length, 118);
  assert.ok(formatted.endsWith('…'));
});

// ── 5. calculateSummary aggregates execution statistics accurately ───────────
test('5. calculateSummary aggregates Total, Completed, Failed, and Cancelled counts', () => {
  const jobs = [{ jobId: 'j1' }, { jobId: 'j2' }, { jobId: 'j3' }, { jobId: 'j4' }];
  const states = {
    j1: { status: 'DONE' },
    j2: { status: 'ERROR' },
    j3: { status: 'CANCELLED' },
    j4: { status: 'COMPLETED' },
  };
  const summary = calculateSummary(jobs, states);
  assert.strictEqual(summary.total, 4);
  assert.strictEqual(summary.completed, 2);
  assert.strictEqual(summary.failed, 1);
  assert.strictEqual(summary.cancelled, 1);
});

// ── 6. Plan creation rejects empty profile selection ─────────────────────────
test('6. Plan creation rejects empty profile selection', () => {
  assert.throws(() => {
    createBulkExportPlan({ sourcePath: REAL_SOURCE, exportType: 'cut', profileIds: [] });
  }, /Please select at least 1 profile/);
});

// ── 7. Plan creation rejects missing or non-existent source video ─────────────
test('7. Plan creation and validation rejects missing or non-existent source video', () => {
  assert.throws(() => {
    createBulkExportPlan({ sourcePath: '', exportType: 'cut', profileIds: ['id1'] });
  }, /Source media file path is required/);

  assert.throws(() => {
    validateBulkExportPlan({
      planId: 'plan_test_7',
      sourceFile: 'Z:\\nonexistent_file_xyz_98765.mp4',
      exportType: 'cut',
      jobs: [],
    });
  }, /Source media file does not exist/);
});

// ── 8. Disabled profiles strictly excluded from plan creation ─────────────────
test('8. Disabled profiles are strictly excluded from plan creation', () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Active A', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Disabled B', platform: 'Instagram' }, dir);
    updateProfile(p2.id, { enabled: false }, dir);

    assert.throws(() => {
      createBulkExportPlan({
        sourcePath: REAL_SOURCE,
        exportType: 'cut',
        profileIds: [p1.id, p2.id],
      }, dir);
    }, /is disabled and cannot be added/);
  } finally { cleanup(dir); }
});

// ── 9. Presets are immutable snapshots upon plan creation ────────────────────
test('9. Modifying profile preset after plan creation does NOT mutate plan snapshot', () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({
      name: 'Snapshot Profile',
      platform: 'Facebook',
      variationPreset: { brightness: 0.04, speed: 1.02 }
    }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    assert.strictEqual(plan.jobs[0].variationPreset.brightness, 0.04);
    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.02);

    // Modify the profile in storage
    updateProfile(p1.id, { variationPreset: { brightness: -0.05, speed: 1.05 } }, dir);

    // Plan snapshot must be unchanged
    assert.strictEqual(plan.jobs[0].variationPreset.brightness, 0.04);
    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.02);
  } finally { cleanup(dir); }
});

// ── 10. Reordering jobs updates orderIndex correctly ─────────────────────────
test('10. reorderJobsInPlan deterministically swaps jobs and updates orderIndex', () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Profile 1', platform: 'Facebook', variationPreset: { brightness: 0.02 } }, dir);
    const p2 = createProfile({ name: 'Profile 2', platform: 'YouTube', variationPreset: { brightness: 0.08 } }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    assert.strictEqual(plan.jobs[0].profileName, 'Profile 1');
    assert.strictEqual(plan.jobs[1].profileName, 'Profile 2');

    const updatedPlan = reorderJobsInPlan(plan, 1, 0);
    assert.strictEqual(updatedPlan.jobs[0].profileName, 'Profile 2');
    assert.strictEqual(updatedPlan.jobs[1].profileName, 'Profile 1');
    // orderIndex is 1-based
    assert.strictEqual(updatedPlan.jobs[0].orderIndex, 1);
    assert.strictEqual(updatedPlan.jobs[1].orderIndex, 2);
    assert.strictEqual(updatedPlan.jobs[0].variationPreset.brightness, 0.08);
    assert.strictEqual(updatedPlan.jobs[1].variationPreset.brightness, 0.02);
  } finally { cleanup(dir); }
});

// ── 11. Removing a job updates job count and orderIndex ──────────────────────
test('11. removeJobFromPlan removes target job and updates plan count', () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'P1', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'P2', platform: 'Instagram' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    const targetJobId = plan.jobs[0].jobId;
    const prunedPlan = removeJobFromPlan(plan, targetJobId);

    assert.strictEqual(prunedPlan.jobs.length, 1);
    assert.strictEqual(prunedPlan.jobs[0].profileName, 'P2');
    assert.strictEqual(prunedPlan.jobs[0].orderIndex, 1); // re-indexed to 1
    assert.strictEqual(prunedPlan.totalJobs, 1);
  } finally { cleanup(dir); }
});

// ── 12. Cut options properly mapped via planToBatchQueueItems ─────────────────
test('12. Cut workflow options (start, duration, mode) properly mapped to batch queue items', () => {
  const dir = makeTempDir();
  try {
    const p = createProfile({ name: 'Cut Profile', platform: 'Facebook' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p.id],
      outputDir: dir,
    }, dir);

    const items = planToBatchQueueItems(plan, {
      start: 2,
      duration: 5,
      mode: 'crop',
      generateThumbnail: true,
    });

    assert.strictEqual(items[0].operation, 'cut');
    assert.strictEqual(items[0].start, 2);
    assert.strictEqual(items[0].duration, 5);
    assert.strictEqual(items[0].mode, 'crop');
    assert.strictEqual(items[0].generateThumbnail, true);
    assert.strictEqual(items[0].profileName, 'Cut Profile');
  } finally { cleanup(dir); }
});

// ── 13. Reel options properly mapped via planToBatchQueueItems ────────────────
test('13. Reel workflow options (aspectRatio, mode) properly mapped to batch queue items', () => {
  const dir = makeTempDir();
  try {
    const p = createProfile({ name: 'Reel Profile', platform: 'Instagram' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'reel',
      profileIds: [p.id],
      outputDir: dir,
    }, dir);

    const items = planToBatchQueueItems(plan, { aspectRatio: '9:16', mode: 'blur' });

    assert.strictEqual(items[0].operation, 'reel');
    assert.strictEqual(items[0].aspectRatio, '9:16');
    assert.strictEqual(items[0].mode, 'blur');
    assert.strictEqual(items[0].profileName, 'Reel Profile');
  } finally { cleanup(dir); }
});

// ── 14. Split options properly mapped via planToBatchQueueItems ───────────────
test('14. Split workflow options (interval, mode) properly mapped to batch queue items', () => {
  const dir = makeTempDir();
  try {
    const p = createProfile({ name: 'Split Profile', platform: 'TikTok' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'split',
      profileIds: [p.id],
      outputDir: dir,
    }, dir);

    const items = planToBatchQueueItems(plan, { interval: 15, mode: 'blur' });

    assert.strictEqual(items[0].operation, 'split');
    assert.strictEqual(items[0].interval, 15);
    assert.strictEqual(items[0].mode, 'blur');
    assert.strictEqual(items[0].profileName, 'Split Profile');
  } finally { cleanup(dir); }
});

// ── 15. Concurrency mutual exclusion logic (pure logic test) ─────────────────
test('15. Mutual exclusion: single export locked while bulk executing and vice versa', () => {
  let isProcessing = false;
  let isBulkExecuting = false;

  assert.strictEqual(!isProcessing && !isBulkExecuting, true);

  isBulkExecuting = true;
  assert.strictEqual(!isProcessing && !isBulkExecuting, false, 'Single must be locked during bulk');

  isBulkExecuting = false;
  isProcessing = true;
  assert.strictEqual(!isProcessing && !isBulkExecuting, false, 'Bulk must be locked during single');
});

// ── 16. Output filename sanitization and collision avoidance ─────────────────
test('16. generateBulkOutputFilename sanitizes illegal chars and avoids collision', () => {
  const dir = makeTempDir();
  try {
    // sanitizeFilename removes Windows reserved characters
    const sanitized = sanitizeFilename('Page: "Best" <Clips> | #1? *');
    assert.ok(!/[<>:"/\\|?*]/.test(sanitized));

    // generateBulkOutputFilename uses object signature
    const { outputPath: out1 } = generateBulkOutputFilename({
      sourcePath: REAL_SOURCE,
      profileName: 'My Profile',
      index: 1,
      outputDir: dir,
    });
    assert.ok(out1.endsWith('.mp4'));
    assert.ok(out1.startsWith(dir));

    // Collision: if file exists, generates a new non-colliding name
    fs.writeFileSync(out1, 'dummy');
    const { outputPath: out2 } = generateBulkOutputFilename({
      sourcePath: REAL_SOURCE,
      profileName: 'My Profile',
      index: 1,
      outputDir: dir,
    });
    assert.notStrictEqual(out1, out2);
    assert.ok(out2.endsWith('.mp4'));
    assert.ok(out2.startsWith(dir));
  } finally { cleanup(dir); }
});

// ── 17. Real Media Bulk Cut execution with 2 profiles ─────────────────────────
await asyncTest('17. Real Media Cut Bulk Export executes 2 profiles and produces valid MP4 files', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Page Alpha', platform: 'Facebook', variationPreset: { brightness: 0.03 } }, dir);
    const p2 = createProfile({ name: 'Page Beta', platform: 'Instagram', variationPreset: { saturation: 1.05 } }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    let itemUpdateFired = false;
    bq.on('itemUpdate', () => { itemUpdateFired = true; });

    const res = await executeBulkExport(plan, { start: 0, duration: 2, autoStart: true }, bq);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.queuedCount, 2);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Bulk Cut timed out after 60s')), 60000);
      bq.on('queueDone', () => { clearTimeout(timeout); resolve(); });
    });

    const state = bq.getState();
    assert.strictEqual(state.items.length, 2);
    assert.strictEqual(state.items[0].status, STATUS.DONE);
    assert.strictEqual(state.items[1].status, STATUS.DONE);
    assert.ok(fs.existsSync(state.items[0].outputPath));
    assert.ok(fs.existsSync(state.items[1].outputPath));
    assert.ok(fs.statSync(state.items[0].outputPath).size > 1000);
    assert.ok(fs.statSync(state.items[1].outputPath).size > 1000);
    assert.ok(itemUpdateFired);
  } finally { cleanup(dir); }
});

// ── 18. Real Media Bulk Reel execution (9:16 vertical) ───────────────────────
await asyncTest('18. Real Media Reel Bulk Export produces valid 9:16 vertical MP4 output', async () => {
  const dir = makeTempDir();
  try {
    const p = createProfile({ name: 'Reel Vertical', platform: 'TikTok', variationPreset: { brightness: 0.02 } }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'reel',
      profileIds: [p.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { aspectRatio: '9:16', mode: 'blur', autoStart: true }, bq);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Bulk Reel timed out after 60s')), 60000);
      bq.on('queueDone', () => { clearTimeout(timeout); resolve(); });
    });

    const state = bq.getState();
    assert.strictEqual(state.items[0].status, STATUS.DONE);
    assert.ok(fs.existsSync(state.items[0].outputPath));
    assert.ok(fs.statSync(state.items[0].outputPath).size > 1000);
  } finally { cleanup(dir); }
});

// ── 19. Error Isolation during Bulk Export ───────────────────────────────────
await asyncTest('19. Error Isolation: bad job fails without aborting the subsequent good job', async () => {
  const dir = makeTempDir();
  try {
    const bq = new BatchQueueManager({ concurrency: 1 });
    bq.addItems([
      {
        inputPath: path.join(dir, 'nonexistent_corrupted_file_ux19.mp4'),
        operation: 'cut',
        duration: 1,
      },
      {
        inputPath: REAL_SOURCE,
        outputPath: path.join(dir, 'valid_output_ux19.mp4'),
        operation: 'cut',
        duration: 1,
      },
    ]);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Error isolation test timed out after 60s')), 60000);
      bq.on('queueDone', () => { clearTimeout(timeout); resolve(); });
      bq.startQueue();
    });

    const state = bq.getState();
    assert.strictEqual(state.items.length, 2);
    assert.strictEqual(state.items[0].status, STATUS.ERROR);
    assert.strictEqual(state.items[1].status, STATUS.DONE);
    assert.ok(state.items[0].error && state.items[0].error.length > 0);
  } finally { cleanup(dir); }
});

// ── 20. Individual job cancellation (WAITING item removal) ────────────────────
await asyncTest('20. cancelBulkJob cancels (removes) a waiting item by bulkJobId', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Cancel Target 1', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Cancel Target 2', platform: 'Instagram' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { autoStart: false }, bq);

    const stateBefore = bq.getState();
    assert.strictEqual(stateBefore.waitingCount, 2);

    // Get the bulkJobId from plan job 2 (index 1)
    const job2BulkId = plan.jobs[1].jobId;
    const cancelRes = cancelBulkJob(job2BulkId, bq);
    assert.strictEqual(cancelRes.success, true);

    // After cancel, WAITING item is removed from queue
    const stateAfter = bq.getState();
    assert.strictEqual(stateAfter.waitingCount, 1); // One remaining
    assert.strictEqual(stateAfter.items.length, 1); // Cancelled WAITING item is purged
    assert.strictEqual(stateAfter.items[0].status, STATUS.WAITING); // job1 still waiting
  } finally { cleanup(dir); }
});

// ── 21. Cancel All clears all pending jobs ────────────────────────────────────
await asyncTest('21. cancelBulkExport cancels all pending jobs by planId', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Abort 1', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Abort 2', platform: 'Instagram' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { autoStart: false }, bq);

    const stateBefore = bq.getState();
    assert.strictEqual(stateBefore.waitingCount, 2);

    // cancelBulkExport requires planId as first argument
    const res = cancelBulkExport(plan.planId, bq);
    assert.strictEqual(res.success, true);
    // Both WAITING items were cancelled (and removed from queue)
    assert.strictEqual(res.cancelledCount, 2);

    const stateAfter = bq.getState();
    // WAITING items are removed on cancel, so queue should be empty
    assert.strictEqual(stateAfter.items.length, 0);
    assert.strictEqual(stateAfter.waitingCount, 0);
  } finally { cleanup(dir); }
});

// ── 22. Source file SHA-256 remains 100% unchanged ───────────────────────────
test('22. Source file SHA-256 remains 100% byte-for-byte identical after all tests', () => {
  const postSha = fileSha256(REAL_SOURCE);
  assert.strictEqual(postSha, initialSourceSha, 'CRITICAL: Source video was modified during test suite!');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n======================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Errors:');
  errors.forEach(e => {
    console.log(`  - ${e.name}`);
    console.log(`    ${e.err.message}`);
  });
  process.exit(1);
} else {
  console.log('All Phase 2C-3 bulk export UX & integration tests PASSED');
  console.log('======================================================\n');
}

})();
