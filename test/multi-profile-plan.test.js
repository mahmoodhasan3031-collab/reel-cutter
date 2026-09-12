'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  createProfile,
  updateProfile,
  deleteProfile,
  listProfiles,
  loadProfiles,
  resolveProfilePreset,
} = require('../src/main/profiles/profileManager');

const {
  MIN_BULK_PROFILES,
  MAX_BULK_PROFILES,
  sanitizeFilename,
  generateBulkOutputFilename,
  createBulkExportPlan,
  removeJobFromPlan,
  reorderJobsInPlan,
  planToBatchQueueItems,
} = require('../src/main/profiles/exportPlan');

const {
  validateProductVariationConfig,
  PRODUCT_VARIATION_LIMITS,
} = require('../src/engine/variation/validator');

console.log('======================================================');
console.log('🧪 Running Phase 2C-1 Multi-Profile Plan Test Suite');
console.log('======================================================\n');

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

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reel-p2c-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

const DUMMY_SOURCE = 'C:\\videos\\sample_video.mp4';

// ── 1. Multi-profile selector loads enabled profiles ─────────────────────────
test('1. Multi-profile selector loads enabled profiles', () => {
  const dir = tmpDir();
  try {
    createProfile({ name: 'Page 1', platform: 'Facebook', enabled: true }, dir);
    createProfile({ name: 'Page 2', platform: 'Instagram', enabled: true }, dir);
    const list = listProfiles(dir);
    const enabledOnly = list.filter(p => p.enabled !== false);
    assert.strictEqual(enabledOnly.length, 2);
    assert.strictEqual(enabledOnly[0].name, 'Page 1');
  } finally { cleanup(dir); }
});

// ── 2. Disabled profiles excluded ───────────────────────────────────────────
test('2. Disabled profiles excluded from plan creation', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Active', platform: 'Facebook', enabled: true }, dir);
    const p2 = createProfile({ name: 'Disabled', platform: 'YouTube', enabled: false }, dir);

    // Attempting to plan with a disabled profile must throw
    assert.throws(() => {
      createBulkExportPlan({
        sourcePath: DUMMY_SOURCE,
        exportType: 'cut',
        profileIds: [p1.id, p2.id],
      }, dir);
    }, /disabled/i);
  } finally { cleanup(dir); }
});

// ── 3. Multiple profiles can be selected ─────────────────────────────────────
test('3. Multiple profiles can be selected and included in plan', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'P1', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'P2', platform: 'Instagram' }, dir);
    const p3 = createProfile({ name: 'P3', platform: 'TikTok' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'reel',
      profileIds: [p1.id, p2.id, p3.id],
    }, dir);

    assert.strictEqual(plan.totalJobs, 3);
    assert.strictEqual(plan.jobs.length, 3);
  } finally { cleanup(dir); }
});

// ── 4. Duplicate profile IDs prevented ───────────────────────────────────────
test('4. Duplicate profile IDs prevented in selection', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Single Profile', platform: 'Facebook' }, dir);
    assert.throws(() => {
      createBulkExportPlan({
        sourcePath: DUMMY_SOURCE,
        exportType: 'cut',
        profileIds: [p1.id, p1.id],
      }, dir);
    }, /duplicate/i);
  } finally { cleanup(dir); }
});

// ── 5. Minimum selection validation ─────────────────────────────────────────
test('5. Minimum selection validation enforces at least 1 profile', () => {
  const dir = tmpDir();
  try {
    assert.throws(() => {
      createBulkExportPlan({
        sourcePath: DUMMY_SOURCE,
        exportType: 'cut',
        profileIds: [],
      }, dir);
    }, /at least 1/i);
  } finally { cleanup(dir); }
});

// ── 6. Maximum selection validation ─────────────────────────────────────────
test('6. Maximum selection validation enforces limit of 10 profiles', () => {
  const dir = tmpDir();
  try {
    const ids = [];
    for (let i = 1; i <= 11; i++) {
      const p = createProfile({ name: `Bulk Profile ${i}`, platform: 'Other' }, dir);
      ids.push(p.id);
    }
    assert.throws(() => {
      createBulkExportPlan({
        sourcePath: DUMMY_SOURCE,
        exportType: 'cut',
        profileIds: ids,
      }, dir);
    }, /more than 10/i);
  } finally { cleanup(dir); }
});

// ── 7. Create export plan ───────────────────────────────────────────────────
test('7. Create export plan creates plan with ID, sourceFile, and jobs', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'FB Main', platform: 'Facebook' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    assert.ok(plan.planId.startsWith('plan_'));
    assert.strictEqual(plan.sourceFile, DUMMY_SOURCE);
    assert.strictEqual(plan.exportType, 'cut');
    assert.strictEqual(plan.totalJobs, 1);
    assert.strictEqual(plan.jobs[0].status, 'READY');
  } finally { cleanup(dir); }
});

// ── 8. Plan contains correct profile IDs ────────────────────────────────────
test('8. Plan contains correct profile IDs in exact selection order', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Alpha', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Beta', platform: 'YouTube' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'reel',
      profileIds: [p2.id, p1.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].profileId, p2.id);
    assert.strictEqual(plan.jobs[1].profileId, p1.id);
  } finally { cleanup(dir); }
});

// ── 9. Plan contains correct profile names ──────────────────────────────────
test('9. Plan contains correct profile names from authoritative store', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'Authoritative Name', platform: 'Instagram' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].profileName, 'Authoritative Name');
  } finally { cleanup(dir); }
});

// ── 10. Plan contains correct platforms ─────────────────────────────────────
test('10. Plan contains correct platform metadata', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'TikTok Channel', platform: 'TikTok' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'split',
      profileIds: [p.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].platform, 'TikTok');
  } finally { cleanup(dir); }
});

// ── 11. Each profile gets its own variation preset ──────────────────────────
test('11. Each profile receives its own resolved variation preset', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Bright Profile', platform: 'Facebook', variationPreset: { brightness: 0.15 } }, dir);
    const p2 = createProfile({ name: 'Fast Profile', platform: 'Instagram', variationPreset: { speed: 1.04 } }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'reel',
      profileIds: [p1.id, p2.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].variationPreset.brightness, 0.15);
    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.00);
    assert.strictEqual(plan.jobs[1].variationPreset.brightness, 0.00);
    assert.strictEqual(plan.jobs[1].variationPreset.speed, 1.04);
  } finally { cleanup(dir); }
});

// ── 12. Presets are independently snapshotted ───────────────────────────────
test('12. Presets are independently snapshotted (modifying one job does not affect others)', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Clone 1', platform: 'Facebook', variationPreset: { hue: 10 } }, dir);
    const p2 = createProfile({ name: 'Clone 2', platform: 'Instagram', variationPreset: { hue: 10 } }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
    }, dir);

    plan.jobs[0].variationPreset.hue = 50;
    assert.strictEqual(plan.jobs[0].variationPreset.hue, 50);
    assert.strictEqual(plan.jobs[1].variationPreset.hue, 10);
  } finally { cleanup(dir); }
});

// ── 13. Editing a profile after plan creation does not mutate plan ───────────
test('13. Editing a profile after plan creation does not mutate the plan', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({
      name: 'Original Profile',
      platform: 'YouTube',
      variationPreset: { speed: 1.02, brightness: 0.10 }
    }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.02);

    // Later edit in Page Profile Manager
    updateProfile(p.id, {
      name: 'Mutated Profile',
      variationPreset: { speed: 1.05, brightness: 0.50 }
    }, dir);

    // Plan must strictly retain original values
    assert.strictEqual(plan.jobs[0].profileName, 'Original Profile');
    assert.strictEqual(plan.jobs[0].variationPreset.speed, 1.02);
    assert.strictEqual(plan.jobs[0].variationPreset.brightness, 0.10);
  } finally { cleanup(dir); }
});

// ── 14. Malformed profile rejected safely ───────────────────────────────────
test('14. Malformed profile preset rejected safely without crashing', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'Corrupt Preset', platform: 'Facebook' }, dir);

    // Directly simulate raw corrupted disk entry
    const data = loadProfiles(dir);
    data.profiles[0].variationPreset = { brightness: 'not-a-number' };
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify(data), 'utf8');

    // Planning falls back safely to normalized product defaults without crashing
    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].variationPreset.brightness, 0);
  } finally { cleanup(dir); }
});

// ── 15. Invalid variation values rejected ───────────────────────────────────
test('15. Out-of-bounds variation values are clamped to product limits', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'Out Of Bounds', platform: 'Facebook' }, dir);
    const data = loadProfiles(dir);
    data.profiles[0].variationPreset = { speed: 99.0, crop: 88.0 };
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify(data), 'utf8');

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p.id],
    }, dir);

    // Values should be clamped or reset to safe product defaults — never exceed bounds
    const speed = plan.jobs[0].variationPreset.speed;
    const crop  = plan.jobs[0].variationPreset.crop;
    assert.ok(
      speed >= PRODUCT_VARIATION_LIMITS.speed.min && speed <= PRODUCT_VARIATION_LIMITS.speed.max,
      `Speed ${speed} must be within [${PRODUCT_VARIATION_LIMITS.speed.min}, ${PRODUCT_VARIATION_LIMITS.speed.max}]`
    );
    assert.ok(
      crop >= PRODUCT_VARIATION_LIMITS.crop.min && crop <= PRODUCT_VARIATION_LIMITS.crop.max,
      `Crop ${crop} must be within [${PRODUCT_VARIATION_LIMITS.crop.min}, ${PRODUCT_VARIATION_LIMITS.crop.max}]`
    );
  } finally { cleanup(dir); }
});

// ── 16. Deleted profile handled safely ──────────────────────────────────────
test('16. Deleted profile handled safely by throwing descriptive error', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'Doomed', platform: 'Facebook' }, dir);
    const deletedId = p.id;
    deleteProfile(deletedId, dir);

    assert.throws(() => {
      createBulkExportPlan({
        sourcePath: DUMMY_SOURCE,
        exportType: 'cut',
        profileIds: [deletedId],
      }, dir);
    }, /not found or deleted/i);
  } finally { cleanup(dir); }
});

// ── 17. Removed plan item works ─────────────────────────────────────────────
test('17. removeJobFromPlan removes item and recalculates count & orders', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Keep 1', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Remove Me', platform: 'Instagram' }, dir);
    const p3 = createProfile({ name: 'Keep 2', platform: 'TikTok' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id, p3.id],
    }, dir);

    const updated = removeJobFromPlan(plan, plan.jobs[1].jobId);
    assert.strictEqual(updated.totalJobs, 2);
    assert.strictEqual(updated.jobs.length, 2);
    assert.strictEqual(updated.jobs[0].profileName, 'Keep 1');
    assert.strictEqual(updated.jobs[0].orderIndex, 1);
    assert.strictEqual(updated.jobs[1].profileName, 'Keep 2');
    assert.strictEqual(updated.jobs[1].orderIndex, 2);
  } finally { cleanup(dir); }
});

// ── 18. Plan order deterministic ────────────────────────────────────────────
test('18. reorderJobsInPlan reorders items deterministically', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'First', platform: 'Facebook' }, dir);
    const p2 = createProfile({ name: 'Second', platform: 'YouTube' }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'reel',
      profileIds: [p1.id, p2.id],
    }, dir);

    assert.strictEqual(plan.jobs[0].profileName, 'First');
    const reordered = reorderJobsInPlan(plan, 0, 1);
    assert.strictEqual(reordered.jobs[0].profileName, 'Second');
    assert.strictEqual(reordered.jobs[1].profileName, 'First');
    assert.strictEqual(reordered.jobs[0].orderIndex, 1);
    assert.strictEqual(reordered.jobs[1].orderIndex, 2);
  } finally { cleanup(dir); }
});

// ── 19. Filename sanitization helper ────────────────────────────────────────
test('19. sanitizeFilename strips Windows reserved chars and collapses whitespace', () => {
  const dirty = 'My <Brand> : "Channel" / \\ | ? *';
  const clean = sanitizeFilename(dirty);
  assert.ok(!/[<>:"/\\|?*]/.test(clean));
  assert.strictEqual(clean, 'My_Brand_Channel');
});

// ── 20. Path traversal prevention ───────────────────────────────────────────
test('20. Path traversal sequences (..) in profile names are neutralized', () => {
  const malicious = '../../etc/passwd';
  const clean = sanitizeFilename(malicious);
  assert.ok(!clean.includes('..'));
  assert.ok(!clean.includes('/'));

  const out = generateBulkOutputFilename({
    sourcePath: 'C:\\exports\\clip.mp4',
    profileName: '../../evil',
    outputDir: 'C:\\exports',
  });
  assert.ok(out.outputPath.startsWith('C:\\exports'));
});

// ── 21. Source file cannot become output path ────────────────────────────────
test('21. Output path cannot overwrite the source media file', () => {
  const source = 'C:\\media\\test.mp4';
  const out = generateBulkOutputFilename({
    sourcePath: source,
    profileName: '', // empty name fallback
    exportType: 'clip',
    outputDir: 'C:\\media',
  });
  assert.notStrictEqual(out.outputPath.toLowerCase(), source.toLowerCase());
});

// ── 22. Existing profile manager tests remain passing ───────────────────────
test('22. Existing profileManager exports and constants remain intact', () => {
  const pm = require('../src/main/profiles/profileManager');
  assert.strictEqual(pm.MAX_NAME_LENGTH, 80);
  assert.strictEqual(pm.SUPPORTED_PLATFORMS.length, 5);
});

// ── 23. Existing per-profile integration compatibility ──────────────────────
test('23. resolveProfilePreset output matches single-profile export format', () => {
  const preset = resolveProfilePreset({ brightness: 0.05, speed: 1.02 });
  assert.strictEqual(preset.enabled, true);
  assert.strictEqual(preset.brightness, 0.05);
  assert.strictEqual(preset.speed, 1.02);
});

// ── 24. Existing variation validator compatibility ──────────────────────────
test('24. Job variation preset passes product-level variation validation', () => {
  const preset = resolveProfilePreset({ saturation: 1.2, hue: 15 });
  const result = validateProductVariationConfig(preset);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.config.color.saturation, 1.2);
});

// ── 25. Existing Batch Queue compatibility ──────────────────────────────────
test('25. planToBatchQueueItems generates valid Batch Queue items with variation', () => {
  const dir = tmpDir();
  try {
    const p1 = createProfile({ name: 'Batch 1', platform: 'Facebook', variationPreset: { speed: 1.02 } }, dir);
    const p2 = createProfile({ name: 'Batch 2', platform: 'Instagram', variationPreset: { hue: 10 } }, dir);

    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'cut',
      profileIds: [p1.id, p2.id],
    }, dir);

    const bqItems = planToBatchQueueItems(plan, { duration: 15 });
    assert.strictEqual(bqItems.length, 2);
    assert.strictEqual(bqItems[0].inputPath, DUMMY_SOURCE);
    assert.strictEqual(bqItems[0].duration, 15);
    assert.strictEqual(bqItems[0].variation.speed, 1.02);
    assert.strictEqual(bqItems[1].variation.hue, 10);
  } finally { cleanup(dir); }
});

// ── 26. Full plan structure validation ──────────────────────────────────────
test('26. Full plan structure satisfies all required fields', () => {
  const dir = tmpDir();
  try {
    const p = createProfile({ name: 'Complete Profile', platform: 'YouTube' }, dir);
    const plan = createBulkExportPlan({
      sourcePath: DUMMY_SOURCE,
      exportType: 'reel',
      profileIds: [p.id],
    }, dir);

    assert.ok(plan.planId);
    assert.ok(plan.createdAt);
    assert.ok(plan.sourceFile);
    assert.strictEqual(plan.exportType, 'reel');
    assert.strictEqual(plan.totalJobs, 1);

    const job = plan.jobs[0];
    assert.ok(job.jobId);
    assert.strictEqual(job.orderIndex, 1);
    assert.strictEqual(job.profileId, p.id);
    assert.strictEqual(job.profileName, 'Complete Profile');
    assert.strictEqual(job.platform, 'YouTube');
    assert.strictEqual(job.status, 'READY');
    assert.ok(job.variationPreset);
    assert.ok(job.outputFilename);
    assert.ok(job.outputPath);
  } finally { cleanup(dir); }
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n======================================================');
process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n');

if (failed > 0) {
  console.log('FAILED TESTS:');
  errors.forEach(e => process.stdout.write('   - ' + e.name + ': ' + (e.err.message || e.err) + '\n'));
  console.log('======================================================\n');
  process.exit(1);
} else {
  console.log('All Phase 2C-1 multi-profile plan tests PASSED');
  console.log('======================================================\n');
}