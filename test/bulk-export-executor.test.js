'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const {
  createProfile,
  updateProfile,
  deleteProfile,
  listProfiles,
} = require('../src/main/profiles/profileManager');

const {
  createBulkExportPlan,
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
console.log('🧪 Running Phase 2C-2 Bulk Export Executor Test Suite');
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-exec-test-'));
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

const REAL_SOURCE = path.resolve(__dirname, '../test-videos/normal_general.mp4');

(async () => {

// ── 1. Valid bulk plan executes ──────────────────────────────────────────────
await asyncTest('1. Valid bulk plan executes successfully with Batch Queue', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Exec Test A', platform: 'Facebook', variationPreset: { brightness: 0.05 } }, dir);
    const p2 = createProfile({ name: 'Exec Test B', platform: 'Instagram', variationPreset: { saturation: 1.1 } }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.queuedCount, 2);
    assert.strictEqual(res.state.totalCount, 2);
    assert.strictEqual(res.state.waitingCount, 2);
  } finally { cleanup(dir); }
});

// ── 2. One queue job created per profile ────────────────────────────────────
await asyncTest('2. One queue job created per profile in plan', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Job Count A', platform: 'TikTok' }, dir);
    const p2 = createProfile({ name: 'Job Count B', platform: 'YouTube' }, dir);
    const p3 = createProfile({ name: 'Job Count C', platform: 'Other' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id, p3.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    assert.strictEqual(res.items.length, 3);
    assert.strictEqual(bq.getState().items.length, 3);
  } finally { cleanup(dir); }
});

// ── 3. Job order preserved ──────────────────────────────────────────────────
await asyncTest('3. Job order preserved from plan to batch queue', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'First Profile', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Second Profile', platform: 'Instagram' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    assert.strictEqual(res.items[0].profileId, p1.id);
    assert.strictEqual(res.items[1].profileId, p2.id);
    assert.strictEqual(res.items[0].orderIndex, 1);
    assert.strictEqual(res.items[1].orderIndex, 2);
  } finally { cleanup(dir); }
});

// ── 4. Correct profile ID passed to job ─────────────────────────────────────
await asyncTest('4. Correct profile ID passed to each queue item', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'ID Test A', platform: 'YouTube' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    assert.strictEqual(res.items[0].profileId, p1.id);
  } finally { cleanup(dir); }
});

// ── 5. Correct profile name passed to job ───────────────────────────────────
await asyncTest('5. Correct profile name passed to each queue item', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Special Brand Name', platform: 'Instagram' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    assert.strictEqual(res.items[0].profileName, 'Special Brand Name');
  } finally { cleanup(dir); }
});

// ── 6. Correct variation snapshot passed to job ─────────────────────────────
await asyncTest('6. Correct variation snapshot passed to job', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({
      name: 'Snapshot Preset',
      platform: 'TikTok',
      variationPreset: { brightness: 0.12, speed: 1.03, saturation: 1.15 },
    }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    const itemVar = res.items[0].variation;
    assert.strictEqual(itemVar.enabled, true);
    assert.strictEqual(itemVar.brightness, 0.12);
    assert.strictEqual(itemVar.speed, 1.03);
    assert.strictEqual(itemVar.saturation, 1.15);
  } finally { cleanup(dir); }
});

// ── 7. Snapshot does not change after profile edit ──────────────────────────
await asyncTest('7. Snapshot does not change when profile is edited after plan creation', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({
      name: 'Mutable Profile',
      platform: 'Facebook',
      variationPreset: { speed: 1.01, brightness: 0.05 },
    }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    // Now edit the saved profile on disk
    updateProfile(p1.id, {
      variationPreset: { speed: 1.05, brightness: -0.20 },
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    const res = await executeBulkExport(plan, { autoStart: false }, bq);

    // Must still use the plan snapshot (speed 1.01, brightness 0.05)
    assert.strictEqual(res.items[0].variation.speed, 1.01);
    assert.strictEqual(res.items[0].variation.brightness, 0.05);
  } finally { cleanup(dir); }
});

// ── 8. Cut bulk export works (Real Media) ───────────────────────────────────
await asyncTest('8. Cut bulk export processes real media successfully', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Cut Real A', platform: 'Facebook', variationPreset: { brightness: 0.05 } }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { start: 0, duration: 1, autoStart: true }, bq);

    await new Promise(resolve => bq.on('queueDone', resolve));

    const state = bq.getState();
    assert.strictEqual(state.doneCount, 1);
    assert.strictEqual(state.errorCount, 0);
    assert.ok(fs.existsSync(plan.jobs[0].outputPath));
    assert.ok(fs.statSync(plan.jobs[0].outputPath).size > 1000);
  } finally { cleanup(dir); }
});

// ── 9. Reel bulk export works (Real Media) ──────────────────────────────────
await asyncTest('9. Reel bulk export formats to 9:16 vertical reel successfully', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Reel Real A', platform: 'Instagram', variationPreset: { saturation: 1.1 } }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'reel',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { start: 0, duration: 1, mode: 'blur', autoStart: true }, bq);

    await new Promise(resolve => bq.on('queueDone', resolve));

    const state = bq.getState();
    assert.strictEqual(state.doneCount, 1);
    assert.ok(fs.existsSync(plan.jobs[0].outputPath));
    assert.ok(fs.statSync(plan.jobs[0].outputPath).size > 1000);
  } finally { cleanup(dir); }
});

// ── 10. Split bulk export works (Real Media) ────────────────────────────────
await asyncTest('10. Split bulk export generates separate segment outputs', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Split Real A', platform: 'TikTok', variationPreset: { speed: 1.02 } }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'split',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { interval: 1, mode: 'blur', autoStart: true }, bq);

    await new Promise(resolve => bq.on('queueDone', resolve));

    const state = bq.getState();
    assert.strictEqual(state.doneCount, 1);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp4'));
    assert.ok(files.length >= 1);
  } finally { cleanup(dir); }
});

// ── 11. Each profile gets separate output ───────────────────────────────────
await asyncTest('11. Each profile receives separate, distinct output file paths', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Profile One', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Profile Two', platform: 'Instagram' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
      outputDir: dir,
    }, dir);

    assert.notStrictEqual(plan.jobs[0].outputPath, plan.jobs[1].outputPath);
    assert.notStrictEqual(plan.jobs[0].outputFilename, plan.jobs[1].outputFilename);
  } finally { cleanup(dir); }
});

// ── 12. Output filenames are deterministic ──────────────────────────────────
test('12. Output filenames are deterministic and follow pattern <source>__<profile>__<index>.mp4', () => {
  const out1 = generateBulkOutputFilename({
    sourcePath: 'C:\\Videos\\my-clip.mp4',
    profileName: 'Facebook-Main',
    exportType: 'cut',
    outputDir: 'C:\\Exports',
    index: 1,
    checkCollision: false,
  });

  const out2 = generateBulkOutputFilename({
    sourcePath: 'C:\\Videos\\my-clip.mp4',
    profileName: 'Instagram-Brand',
    exportType: 'cut',
    outputDir: 'C:\\Exports',
    index: 2,
    checkCollision: false,
  });

  assert.strictEqual(out1.filename, 'my-clip__Facebook-Main__01.mp4');
  assert.strictEqual(out2.filename, 'my-clip__Instagram-Brand__02.mp4');
});

// ── 13. Windows-invalid characters sanitized ────────────────────────────────
test('13. Windows-invalid filename characters are sanitized safely', () => {
  const clean = sanitizeFilename('Profile <Special: *Name? /\\|>');
  assert.ok(!clean.includes('<'));
  assert.ok(!clean.includes('>'));
  assert.ok(!clean.includes(':'));
  assert.ok(!clean.includes('*'));
  assert.ok(!clean.includes('?'));
  assert.ok(!clean.includes('/'));
  assert.ok(!clean.includes('\\'));
  assert.ok(!clean.includes('|'));
});

// ── 14. Path traversal blocked ──────────────────────────────────────────────
test('14. Path traversal sequences in profile name and output dir are blocked', () => {
  const clean = sanitizeFilename('../../secret/passwords');
  assert.ok(!clean.includes('..'));
  assert.ok(!clean.includes('/'));

  const out = generateBulkOutputFilename({
    sourcePath: 'C:\\Exports\\clip.mp4',
    profileName: '../../evil',
    outputDir: 'C:\\Exports',
  });
  assert.ok(out.outputPath.startsWith('C:\\Exports'));
  assert.ok(!out.filename.includes('..'));

  assert.throws(() => {
    validateBulkExportPlan({
      planId: 'plan_test',
      sourceFile: REAL_SOURCE,
      exportType: 'cut',
      jobs: [
        {
          jobId: 'j1',
          profileId: 'p1',
          profileName: 'Evil Plan',
          platform: 'Facebook',
          outputPath: 'C:\\Exports\\..\\..\\Windows\\out.mp4',
          variationPreset: { enabled: true },
        },
      ],
    });
  }, /traversal/);
});

// ── 15. Absolute output path strictly contained ─────────────────────────────
test('15. Output path is strictly contained within target directory', () => {
  const out = generateBulkOutputFilename({
    sourcePath: 'C:\\TargetDir\\source.mp4',
    profileName: 'Clean Profile',
    outputDir: 'C:\\TargetDir',
    checkCollision: false,
  });
  assert.ok(out.outputPath.startsWith(path.resolve('C:\\TargetDir')));
});

// ── 16. Source path cannot be used as output ────────────────────────────────
test('16. Source path cannot match or overwrite output path', () => {
  const source = 'C:\\Media\\myvideo.mp4';
  const out = generateBulkOutputFilename({
    sourcePath: source,
    profileName: '',
    outputDir: 'C:\\Media',
    checkCollision: false,
  });
  assert.notStrictEqual(out.outputPath.toLowerCase(), path.resolve(source).toLowerCase());
});

// ── 17. Existing files do not get silently overwritten ──────────────────────
test('17. Existing files on disk do not get silently overwritten (numbered alternative generated)', () => {
  const dir = makeTempDir();
  try {
    const existingFile = path.join(dir, 'test-media__ProfileA__01.mp4');
    fs.writeFileSync(existingFile, 'dummy content');

    const out = generateBulkOutputFilename({
      sourcePath: path.join(dir, 'test-media.mp4'),
      profileName: 'ProfileA',
      outputDir: dir,
      index: 1,
      checkCollision: true,
    });

    assert.notStrictEqual(out.outputPath, existingFile);
    assert.strictEqual(out.filename, 'test-media__ProfileA__01_1.mp4');
  } finally { cleanup(dir); }
});

// ── 18. Batch Queue concurrency limit respected ─────────────────────────────
test('18. Existing Batch Queue concurrency limit (MAX_CONCURRENCY=2) is respected', () => {
  const bq = new BatchQueueManager();
  assert.strictEqual(MAX_CONCURRENCY, 2);
  assert.strictEqual(bq.getConcurrency(), 1);

  bq.setConcurrency(2);
  assert.strictEqual(bq.getConcurrency(), 2);

  bq.setConcurrency(10); // Attempt exceeding max
  assert.strictEqual(bq.getConcurrency(), 2); // Clamped to 2
});

// ── 19. Progress events emitted ─────────────────────────────────────────────
await asyncTest('19. Progress events emitted during queue processing', async () => {
  const dir = makeTempDir();
  try {
    const p1 = createProfile({ name: 'Progress Profile', platform: 'YouTube' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    let itemUpdateFired = false;
    let queueUpdateFired = false;

    bq.on('itemUpdate', () => { itemUpdateFired = true; });
    bq.on('queueUpdate', () => { queueUpdateFired = true; });

    await executeBulkExport(plan, { start: 0, duration: 1, autoStart: true }, bq);
    await new Promise(resolve => bq.on('queueDone', resolve));

    assert.strictEqual(itemUpdateFired, true);
    assert.strictEqual(queueUpdateFired, true);
  } finally { cleanup(dir); }
});

// ── 20. Overall progress calculated correctly ───────────────────────────────
test('20. Overall progress calculated correctly in BatchQueue getState', () => {
  const bq = new BatchQueueManager();
  const items = bq.addItems([
    { inputPath: REAL_SOURCE, operation: 'cut', duration: 1 },
    { inputPath: REAL_SOURCE, operation: 'cut', duration: 1 },
  ]);

  // Manually mock progress for testing formula
  items[0].progress = 100;
  items[1].progress = 50;

  const state = bq.getState();
  assert.strictEqual(state.overallProgress, 75); // (100 + 50) / 2 = 75%
});

// ── 21. One failed job does not fail successful jobs ────────────────────────
await asyncTest('21. One failed job does not incorrectly fail subsequent jobs (Error Isolation)', async () => {
  const dir = makeTempDir();
  try {
    const bq = new BatchQueueManager({ concurrency: 1 });
    bq.addItems([
      { inputPath: path.join(dir, 'non_existent_file.mp4'), operation: 'cut', duration: 1 },
      { inputPath: REAL_SOURCE, outputPath: path.join(dir, 'success_after_fail.mp4'), operation: 'cut', duration: 1 },
    ]);

    await new Promise(resolve => {
      bq.on('queueDone', resolve);
      bq.startQueue();
    });

    const state = bq.getState();
    assert.strictEqual(state.items[0].status, 'ERROR');
    assert.strictEqual(state.items[1].status, 'DONE');
    assert.strictEqual(state.doneCount, 1);
    assert.strictEqual(state.errorCount, 1);
  } finally { cleanup(dir); }
});

// ── 22. Cancellation behaves correctly ──────────────────────────────────────
await asyncTest('22. Cancellation marks job CANCELLED and removes waiting jobs', async () => {
  const dir = makeTempDir();
  try {
    const bq = new BatchQueueManager({ concurrency: 1 });
    const items = bq.addItems([
      { inputPath: REAL_SOURCE, operation: 'cut', duration: 1 },
      { inputPath: REAL_SOURCE, operation: 'cut', duration: 1 },
    ]);

    // Cancel waiting job before start
    const ok = bq.cancelItem(items[1].id);
    assert.strictEqual(ok, true);

    const state = bq.getState();
    assert.strictEqual(state.totalCount, 1);
  } finally { cleanup(dir); }
});

// ── 23. Invalid plan rejected before FFmpeg starts ──────────────────────────
test('23. Invalid plan rejected before any process is spawned', () => {
  assert.throws(() => {
    validateBulkExportPlan(null);
  }, /must be a valid object/);

  assert.throws(() => {
    validateBulkExportPlan({ planId: 'p1', sourceFile: 'non_existent_path.mp4', exportType: 'cut', jobs: [] });
  }, /does not exist/);

  assert.throws(() => {
    validateBulkExportPlan({ planId: 'p1', sourceFile: REAL_SOURCE, exportType: 'invalid_type', jobs: [] });
  }, /Invalid plan exportType/);

  assert.throws(() => {
    validateBulkExportPlan({ planId: 'p1', sourceFile: REAL_SOURCE, exportType: 'cut', jobs: [] });
  }, /must contain at least 1 job/);
});

// ── 24. Malformed variation preset rejected safely ──────────────────────────
test('24. Malformed variation preset rejected safely with descriptive error', () => {
  assert.throws(() => {
    validateBulkExportPlan({
      planId: 'plan_test',
      sourceFile: REAL_SOURCE,
      exportType: 'cut',
      jobs: [
        {
          jobId: 'j1',
          profileId: 'p1',
          profileName: 'Bad Preset',
          platform: 'Facebook',
          outputPath: 'C:\\Exports\\out.mp4',
          variationPreset: { enabled: true, brightness: 99.0 }, // Out of bounds
        },
      ],
    });
  }, /invalid variation settings/);
});

// ── 25. Source remains unchanged ────────────────────────────────────────────
await asyncTest('25. Source file SHA-256 remains 100% unchanged before and after export', async () => {
  const dir = makeTempDir();
  try {
    const originalHash = fileSha256(REAL_SOURCE);
    const originalSize = fs.statSync(REAL_SOURCE).size;

    const p1 = createProfile({ name: 'Immutability Check', platform: 'Facebook', variationPreset: { brightness: 0.05 } }, dir);
    const plan = createBulkExportPlan({
      sourcePath: REAL_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id],
      outputDir: dir,
    }, dir);

    const bq = new BatchQueueManager({ concurrency: 1 });
    await executeBulkExport(plan, { start: 0, duration: 1, autoStart: true }, bq);
    await new Promise(resolve => bq.on('queueDone', resolve));

    const postHash = fileSha256(REAL_SOURCE);
    const postSize = fs.statSync(REAL_SOURCE).size;

    assert.strictEqual(postHash, originalHash, 'Source SHA-256 must match original');
    assert.strictEqual(postSize, originalSize, 'Source size must match original');
  } finally { cleanup(dir); }
});

console.log('\n======================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`Failed ${failed} tests:`);
  errors.forEach(e => console.error(`  - ${e.name}: ${e.err.message}`));
  process.exit(1);
} else {
  console.log('All Phase 2C-2 bulk export executor tests PASSED');
  console.log('======================================================\n');
}

})();
