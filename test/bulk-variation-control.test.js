'use strict';

/**
 * Phase 2D — Bulk Variation Control & Export Preset Management Tests
 *
 * Tests the following features:
 *  - Preset template defaults (neutral, lightColor, punchyColor, subtleMotion)
 *  - Preset template validation (all pass validateProductVariationConfig)
 *  - Restore profile preset (restoreJobVariationToProfilePreset)
 *  - Reset variation to neutral (resetJobVariationInPlan)
 *  - Apply variation to all jobs (applyVariationToAllJobsInPlan)
 *  - Export override does NOT mutate saved profile
 *  - Snapshot deep-cloning (plan mutation isolation)
 *  - Profile A/B/C variation isolation (no cross-leakage)
 *  - Speed range enforcement (1.00–1.05)
 *  - Pitch range enforcement (-3.0 to 3.0)
 *  - Crop range enforcement (0.0 to 2.0)
 *  - Invalid reframe mode rejection
 *  - Running export disables editing (flag check)
 *  - Cut / Reel / Split workflow variation mapping
 *  - Source immutability (plan modifications do not touch profiles.json)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const {
  BULK_VARIATION_TEMPLATES,
  getBulkVariationTemplate,
  createBulkExportPlan,
  updateJobVariationInPlan,
  applyVariationToAllJobsInPlan,
  restoreJobVariationToProfilePreset,
  resetJobVariationInPlan,
} = require('../src/main/profiles/exportPlan');

const {
  validateProductVariationConfig,
  DEFAULT_PRODUCT_VARIATION,
} = require('../src/engine/variation/validator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _tmpDirs = [];

/**
 * Create a temporary profiles directory with a profiles.json file.
 * Returns the tmpDir path.
 */
function makeTmpProfiles(profiles) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-p2d-'));
  _tmpDirs.push(tmpDir);
  fs.writeFileSync(
    path.join(tmpDir, 'profiles.json'),
    JSON.stringify({ profiles }, null, 2),
    'utf8'
  );
  return tmpDir;
}

/** Shallow-read profiles.json from a tmpDir and return the raw string. */
function readProfilesRaw(tmpDir) {
  return fs.readFileSync(path.join(tmpDir, 'profiles.json'), 'utf8');
}

/** Build a minimal valid profile object. */
function makeProfile(overrides = {}) {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Test Profile',
    platform: 'facebook',
    enabled: true,
    variationPreset: {
      enabled: true,
      brightness: 0.0,
      saturation: 1.0,
      hue: 0.0,
      pitch: 0.0,
      speed: 1.0,
      mode: 'center',
      crop: 0.0,
      cleanMetadata: true,
    },
    ...overrides,
  };
}

/** Create a minimal plan using up to 3 profiles (A, B, C). */
function makePlan(profiles, tmpDir, extraInput = {}) {
  const sourcePath = path.join(tmpDir, 'source.mp4');
  if (!fs.existsSync(sourcePath)) {
    fs.writeFileSync(sourcePath, 'FAKE');
  }
  return createBulkExportPlan(
    {
      sourcePath,
      exportType: 'cut',
      profileIds: profiles.map(p => p.id),
      checkCollision: false,
      ...extraInput,
    },
    tmpDir
  );
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function cleanup() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

console.log('\n========================================================');
console.log('  Phase 2D — Bulk Variation Control Tests');
console.log('========================================================\n');

// ── Test 1: Preset template defaults — neutral ────────────────────────────
test('1. neutral template has correct default values', () => {
  const t = BULK_VARIATION_TEMPLATES.neutral;
  assert.strictEqual(t.brightness, 0.0, 'brightness');
  assert.strictEqual(t.saturation, 1.0, 'saturation');
  assert.strictEqual(t.hue, 0.0, 'hue');
  assert.strictEqual(t.pitch, 0.0, 'pitch');
  assert.strictEqual(t.speed, 1.00, 'speed');
  assert.strictEqual(t.mode, 'center', 'mode');
  assert.strictEqual(t.crop, 0.0, 'crop');
  assert.strictEqual(t.cleanMetadata, true, 'cleanMetadata');
});

// ── Test 2: Preset template defaults — lightColor ─────────────────────────
test('2. lightColor template has correct default values', () => {
  const t = BULK_VARIATION_TEMPLATES.lightColor;
  assert.strictEqual(t.brightness, 0.05, 'brightness');
  assert.strictEqual(t.saturation, 1.05, 'saturation');
  assert.strictEqual(t.hue, 0.0, 'hue');
  assert.strictEqual(t.speed, 1.00, 'speed');
  assert.strictEqual(t.crop, 0.0, 'crop');
});

// ── Test 3: Preset template defaults — punchyColor ────────────────────────
test('3. punchyColor template has correct default values', () => {
  const t = BULK_VARIATION_TEMPLATES.punchyColor;
  assert.strictEqual(t.brightness, 0.05, 'brightness');
  assert.strictEqual(t.saturation, 1.15, 'saturation');
  assert.strictEqual(t.speed, 1.00, 'speed');
  assert.strictEqual(t.crop, 0.0, 'crop');
});

// ── Test 4: Preset template defaults — subtleMotion ───────────────────────
test('4. subtleMotion template has correct default values', () => {
  const t = BULK_VARIATION_TEMPLATES.subtleMotion;
  assert.strictEqual(t.speed, 1.02, 'speed');
  assert.strictEqual(t.crop, 1.0, 'crop');
  assert.strictEqual(t.brightness, 0.0, 'brightness');
  assert.strictEqual(t.saturation, 1.0, 'saturation');
});

// ── Test 5: All named templates pass validateProductVariationConfig ────────
test('5. all concrete templates pass product validation', () => {
  const concrete = ['neutral', 'lightColor', 'punchyColor', 'subtleMotion'];
  for (const key of concrete) {
    const t = BULK_VARIATION_TEMPLATES[key];
    const result = validateProductVariationConfig({ ...DEFAULT_PRODUCT_VARIATION, ...t, enabled: true });
    assert.strictEqual(result.valid, true, `${key} failed validation`);
  }
});

// ── Test 6: getBulkVariationTemplate returns independent clones ───────────
test('6. getBulkVariationTemplate returns independent clones', () => {
  const a = getBulkVariationTemplate('neutral');
  const b = getBulkVariationTemplate('neutral');
  assert.ok(a !== b, 'Should be different object references');
  a.brightness = 99;
  assert.strictEqual(b.brightness, 0.0, 'Mutation of clone A should not affect clone B');
  assert.strictEqual(BULK_VARIATION_TEMPLATES.neutral.brightness, 0.0, 'Should not affect source template');
});

// ── Test 7: updateJobVariationInPlan applies override to target job ────────
test('7. updateJobVariationInPlan applies override to specified job', () => {
  const profA = makeProfile({ name: 'Alpha' });
  const profB = makeProfile({ name: 'Beta' });
  const tmpDir = makeTmpProfiles([profA, profB]);
  const plan = makePlan([profA, profB], tmpDir);

  const override = { brightness: 0.3, saturation: 1.5, speed: 1.01, pitch: 0.5, hue: 5.0, mode: 'left', crop: 0.5, cleanMetadata: true };
  const updated = updateJobVariationInPlan(plan, profA.id, override);

  const jobA = updated.jobs.find(j => j.profileId === profA.id);
  const jobB = updated.jobs.find(j => j.profileId === profB.id);

  assert.ok(jobA.isOverridden === true, 'job A should be marked overridden');
  assert.ok(!jobB.isOverridden, 'job B should not be overridden');
  // Plan is deep-cloned — original untouched
  const origJobA = plan.jobs.find(j => j.profileId === profA.id);
  assert.ok(!origJobA.isOverridden, 'original plan job A should not be overridden');
});

// ── Test 8: restoreJobVariationToProfilePreset clears override ────────────
test('8. restoreJobVariationToProfilePreset restores saved preset and clears isOverridden', () => {
  const profA = makeProfile({ name: 'AlphaRestore', variationPreset: { enabled: true, brightness: 0.1, saturation: 1.2, hue: 3.0, pitch: 0.5, speed: 1.01, mode: 'right', crop: 0.5, cleanMetadata: true } });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  // First override it
  const override = { brightness: 0.5, saturation: 2.0, speed: 1.02, pitch: -1.0, hue: -10.0, mode: 'center', crop: 0.3, cleanMetadata: false };
  const overridden = updateJobVariationInPlan(plan, profA.id, override);
  assert.strictEqual(overridden.jobs[0].isOverridden, true, 'must be overridden first');

  // Then restore
  const restored = restoreJobVariationToProfilePreset(overridden, profA.id, tmpDir);
  assert.strictEqual(restored.jobs[0].isOverridden, false, 'isOverridden should be false after restore');
  // Restored brightness should match profile's saved value (0.1)
  assert.ok(
    Math.abs(restored.jobs[0].variationPreset.brightness - 0.1) < 0.001,
    'brightness should be restored to profile preset value'
  );
});

// ── Test 9: resetJobVariationInPlan applies neutral defaults ─────────────
test('9. resetJobVariationInPlan applies neutral defaults to target job', () => {
  const profA = makeProfile({ name: 'ResetMe', variationPreset: { enabled: true, brightness: 0.8, saturation: 2.5, hue: 45.0, pitch: 2.0, speed: 1.04, mode: 'top', crop: 1.5, cleanMetadata: false } });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  const reset = resetJobVariationInPlan(plan, profA.id);
  const job = reset.jobs[0];

  assert.ok(Math.abs(job.variationPreset.brightness - 0.0) < 0.001, 'brightness neutral');
  assert.ok(Math.abs(job.variationPreset.saturation - 1.0) < 0.001, 'saturation neutral');
  assert.ok(Math.abs(job.variationPreset.hue - 0.0) < 0.001, 'hue neutral');
  assert.ok(Math.abs(job.variationPreset.pitch - 0.0) < 0.001, 'pitch neutral');
  assert.ok(Math.abs(job.variationPreset.speed - 1.00) < 0.001, 'speed neutral');
  assert.strictEqual(job.variationPreset.mode, 'center', 'mode neutral');
  assert.ok(Math.abs(job.variationPreset.crop - 0.0) < 0.001, 'crop neutral');
  assert.strictEqual(job.isOverridden, true, 'reset still marks isOverridden');
});

// ── Test 10: applyVariationToAllJobsInPlan affects all jobs ───────────────
test('10. applyVariationToAllJobsInPlan applies variation to every job', () => {
  const profA = makeProfile({ name: 'AAA' });
  const profB = makeProfile({ name: 'BBB' });
  const profC = makeProfile({ name: 'CCC' });
  const tmpDir = makeTmpProfiles([profA, profB, profC]);
  const plan = makePlan([profA, profB, profC], tmpDir);

  const shared = { brightness: 0.1, saturation: 1.1, hue: 2.0, pitch: 0.2, speed: 1.01, mode: 'left', crop: 0.2, cleanMetadata: true };
  const updated = applyVariationToAllJobsInPlan(plan, shared);

  for (const job of updated.jobs) {
    assert.strictEqual(job.isOverridden, true, `job ${job.profileId} should be overridden`);
    assert.ok(Math.abs(job.variationPreset.brightness - 0.1) < 0.001, `job ${job.profileId} brightness`);
    assert.ok(Math.abs(job.variationPreset.saturation - 1.1) < 0.001, `job ${job.profileId} saturation`);
  }
  // Original plan untouched
  for (const job of plan.jobs) {
    assert.ok(!job.isOverridden, `original plan job ${job.profileId} must be unmodified`);
  }
});

// ── Test 11: Export override does NOT mutate profiles.json ────────────────
test('11. variationOverrides in createBulkExportPlan does not mutate profiles.json', () => {
  const profA = makeProfile({ name: 'ImmutCheck' });
  const tmpDir = makeTmpProfiles([profA]);
  const beforeRaw = readProfilesRaw(tmpDir);

  const sourcePath = path.join(tmpDir, 'source.mp4');
  fs.writeFileSync(sourcePath, 'FAKE');
  createBulkExportPlan(
    {
      sourcePath,
      exportType: 'cut',
      profileIds: [profA.id],
      checkCollision: false,
      variationOverrides: {
        [profA.id]: { brightness: 0.9, saturation: 2.8, speed: 1.05, pitch: 3.0, hue: 100.0, mode: 'bottom', crop: 2.0, cleanMetadata: false },
      },
    },
    tmpDir
  );

  const afterRaw = readProfilesRaw(tmpDir);
  assert.strictEqual(beforeRaw, afterRaw, 'profiles.json must be byte-identical before and after plan creation with overrides');
});

// ── Test 12: updateJobVariationInPlan does NOT mutate profiles.json ───────
test('12. updateJobVariationInPlan does not write to profiles.json', () => {
  const profA = makeProfile({ name: 'NoMutate' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);
  const beforeRaw = readProfilesRaw(tmpDir);

  updateJobVariationInPlan(plan, profA.id, { brightness: 0.5, saturation: 1.5, speed: 1.02, pitch: 1.0, hue: 10.0, mode: 'right', crop: 0.8, cleanMetadata: true });

  const afterRaw = readProfilesRaw(tmpDir);
  assert.strictEqual(beforeRaw, afterRaw, 'profiles.json must remain unchanged after updateJobVariationInPlan');
});

// ── Test 13: Profile A / B / C variation isolation (no cross-leakage) ─────
test('13. per-profile variation overrides are isolated — no cross-leakage', () => {
  const profA = makeProfile({ name: 'PA' });
  const profB = makeProfile({ name: 'PB' });
  const profC = makeProfile({ name: 'PC' });
  const tmpDir = makeTmpProfiles([profA, profB, profC]);
  const plan = makePlan([profA, profB, profC], tmpDir);

  const ovA = { brightness: 0.5, saturation: 2.0, speed: 1.03, pitch: 1.5, hue: 20.0, mode: 'top', crop: 1.0, cleanMetadata: false };
  const step1 = updateJobVariationInPlan(plan, profA.id, ovA);

  const ovB = { brightness: -0.3, saturation: 0.8, speed: 1.01, pitch: -1.0, hue: -15.0, mode: 'bottom', crop: 0.5, cleanMetadata: true };
  const step2 = updateJobVariationInPlan(step1, profB.id, ovB);

  const jobA = step2.jobs.find(j => j.profileId === profA.id);
  const jobB = step2.jobs.find(j => j.profileId === profB.id);
  const jobC = step2.jobs.find(j => j.profileId === profC.id);

  // Profile A values unchanged after profile B override
  assert.ok(Math.abs(jobA.variationPreset.brightness - 0.5) < 0.001, 'job A brightness unchanged after B override');
  // Profile B values correct
  assert.ok(Math.abs(jobB.variationPreset.brightness - (-0.3)) < 0.001, 'job B brightness correct');
  // Profile C not affected
  assert.ok(!jobC.isOverridden, 'job C should not be overridden');
  assert.ok(Math.abs(jobC.variationPreset.brightness - 0.0) < 0.001, 'job C brightness unchanged');
});

// ── Test 14: Speed range enforcement — above max rejected ─────────────────
test('14. speed above max (1.05) is rejected by updateJobVariationInPlan', () => {
  const profA = makeProfile({ name: 'SpeedTest' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  assert.throws(() => {
    updateJobVariationInPlan(plan, profA.id, {
      brightness: 0.0, saturation: 1.0, hue: 0.0, pitch: 0.0,
      speed: 1.10,  // OVER limit
      mode: 'center', crop: 0.0, cleanMetadata: true,
    });
  }, Error, 'speed 1.10 should throw a validation error');
});

// ── Test 15: Pitch range enforcement ─────────────────────────────────────
test('15. pitch outside [-3.0, 3.0] is rejected', () => {
  const profA = makeProfile({ name: 'PitchTest' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  assert.throws(() => {
    updateJobVariationInPlan(plan, profA.id, {
      brightness: 0.0, saturation: 1.0, hue: 0.0,
      pitch: 5.0,  // OVER limit
      speed: 1.0, mode: 'center', crop: 0.0, cleanMetadata: true,
    });
  }, Error, 'pitch 5.0 should throw');

  assert.throws(() => {
    updateJobVariationInPlan(plan, profA.id, {
      brightness: 0.0, saturation: 1.0, hue: 0.0,
      pitch: -5.0,  // UNDER limit
      speed: 1.0, mode: 'center', crop: 0.0, cleanMetadata: true,
    });
  }, Error, 'pitch -5.0 should throw');
});

// ── Test 16: Crop range enforcement ──────────────────────────────────────
test('16. crop outside [0.0, 2.0] is rejected', () => {
  const profA = makeProfile({ name: 'CropTest' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  assert.throws(() => {
    updateJobVariationInPlan(plan, profA.id, {
      brightness: 0.0, saturation: 1.0, hue: 0.0, pitch: 0.0, speed: 1.0,
      mode: 'center',
      crop: 3.0,  // OVER limit
      cleanMetadata: true,
    });
  }, Error, 'crop 3.0 should throw');
});

// ── Test 17: Invalid reframe mode rejection ────────────────────────────────
test('17. invalid reframe mode is rejected by updateJobVariationInPlan', () => {
  const profA = makeProfile({ name: 'ModeTest' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  assert.throws(() => {
    updateJobVariationInPlan(plan, profA.id, {
      brightness: 0.0, saturation: 1.0, hue: 0.0, pitch: 0.0, speed: 1.0,
      mode: 'diagonal',  // NOT in allowed set
      crop: 0.0, cleanMetadata: true,
    });
  }, Error, '"diagonal" mode should throw');
});

// ── Test 18: Variation mapping — Cut export type ───────────────────────────
test('18. cut workflow: variationOverrides flow through to job.variationPreset', () => {
  const profA = makeProfile({ name: 'CutMap' });
  const tmpDir = makeTmpProfiles([profA]);
  const sourcePath = path.join(tmpDir, 'source.mp4');
  fs.writeFileSync(sourcePath, 'FAKE');

  const overrides = { [profA.id]: { brightness: 0.2, saturation: 1.3, speed: 1.02, pitch: 0.8, hue: 12.0, mode: 'right', crop: 0.6, cleanMetadata: true } };
  const plan = createBulkExportPlan({ sourcePath, exportType: 'cut', profileIds: [profA.id], checkCollision: false, variationOverrides: overrides }, tmpDir);

  assert.strictEqual(plan.exportType, 'cut');
  assert.strictEqual(plan.jobs[0].isOverridden, true);
  assert.ok(Math.abs(plan.jobs[0].variationPreset.brightness - 0.2) < 0.001, 'brightness override flows through');
  assert.ok(Math.abs(plan.jobs[0].variationPreset.saturation - 1.3) < 0.001, 'saturation override flows through');
});

// ── Test 19: Variation mapping — Reel export type ─────────────────────────
test('19. reel workflow: variationOverrides flow through to job.variationPreset', () => {
  const profA = makeProfile({ name: 'ReelMap' });
  const tmpDir = makeTmpProfiles([profA]);
  const sourcePath = path.join(tmpDir, 'source.mp4');
  fs.writeFileSync(sourcePath, 'FAKE');

  const overrides = { [profA.id]: { brightness: 0.1, saturation: 1.2, speed: 1.01, pitch: 0.3, hue: 5.0, mode: 'top', crop: 0.3, cleanMetadata: false } };
  const plan = createBulkExportPlan({ sourcePath, exportType: 'reel', profileIds: [profA.id], checkCollision: false, variationOverrides: overrides }, tmpDir);

  assert.strictEqual(plan.exportType, 'reel');
  assert.strictEqual(plan.jobs[0].isOverridden, true);
  assert.ok(Math.abs(plan.jobs[0].variationPreset.brightness - 0.1) < 0.001, 'brightness override for reel');
});

// ── Test 20: Variation mapping — Split export type ────────────────────────
test('20. split workflow: variationOverrides flow through to job.variationPreset', () => {
  const profA = makeProfile({ name: 'SplitMap' });
  const tmpDir = makeTmpProfiles([profA]);
  const sourcePath = path.join(tmpDir, 'source.mp4');
  fs.writeFileSync(sourcePath, 'FAKE');

  const overrides = { [profA.id]: { brightness: -0.1, saturation: 0.9, speed: 1.00, pitch: -0.5, hue: -8.0, mode: 'bottom', crop: 0.1, cleanMetadata: true } };
  const plan = createBulkExportPlan({ sourcePath, exportType: 'split', profileIds: [profA.id], checkCollision: false, variationOverrides: overrides }, tmpDir);

  assert.strictEqual(plan.exportType, 'split');
  assert.strictEqual(plan.jobs[0].isOverridden, true);
  assert.ok(Math.abs(plan.jobs[0].variationPreset.brightness - (-0.1)) < 0.001, 'brightness override for split');
});

// ── Test 21: Deep-clone: modifying returned plan does not affect original ──
test('21. plan modifier functions return deep-cloned plans (no shared references)', () => {
  const profA = makeProfile({ name: 'CloneA' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  const override = { brightness: 0.4, saturation: 1.4, speed: 1.01, pitch: 0.6, hue: 8.0, mode: 'left', crop: 0.4, cleanMetadata: true };
  const updated = updateJobVariationInPlan(plan, profA.id, override);

  // Mutate the returned plan
  updated.jobs[0].variationPreset.brightness = 999;
  updated.jobs[0].__test_mutation__ = true;

  // Original should be untouched
  const origJob = plan.jobs.find(j => j.profileId === profA.id);
  assert.ok(origJob.variationPreset.brightness !== 999, 'Original plan job should not be mutated');
  assert.ok(!origJob.__test_mutation__, 'Original plan should not reflect returned plan mutations');
});

// ── Test 22: savedPreset stored on job reflects profile-at-plan-creation ──
test('22. job.savedPreset reflects profile preset at plan creation time', () => {
  const profA = makeProfile({ name: 'SavedSnap', variationPreset: { enabled: true, brightness: 0.3, saturation: 1.6, hue: 18.0, pitch: 1.0, speed: 1.02, mode: 'top', crop: 0.8, cleanMetadata: true } });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  const job = plan.jobs[0];
  assert.ok(job.savedPreset, 'savedPreset should be present on job');
  assert.ok(Math.abs(job.savedPreset.brightness - 0.3) < 0.001, 'savedPreset.brightness matches profile');
  assert.ok(Math.abs(job.savedPreset.saturation - 1.6) < 0.001, 'savedPreset.saturation matches profile');
});

// ── Test 23: isOverridden flag absent on non-overridden jobs ──────────────
test('23. plan jobs without variationOverrides have no isOverridden flag', () => {
  const profA = makeProfile({ name: 'NotOverridden' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  const job = plan.jobs[0];
  assert.ok(!job.isOverridden, 'isOverridden should be falsy for non-overridden job');
});

// ── Test 24: Source immutability — profiles.json unchanged after all mutations ──
test('24. profiles.json bytes identical after all plan modifier calls', () => {
  const profA = makeProfile({ name: 'ImmuA' });
  const profB = makeProfile({ name: 'ImmuB' });
  const tmpDir = makeTmpProfiles([profA, profB]);
  const beforeRaw = readProfilesRaw(tmpDir);

  const plan = makePlan([profA, profB], tmpDir);

  const override = { brightness: 0.5, saturation: 1.8, speed: 1.03, pitch: 1.2, hue: 25.0, mode: 'left', crop: 0.9, cleanMetadata: false };
  const step1 = updateJobVariationInPlan(plan, profA.id, override);
  const step2 = applyVariationToAllJobsInPlan(step1, { brightness: 0.1, saturation: 1.1, speed: 1.01, pitch: 0.1, hue: 2.0, mode: 'right', crop: 0.1, cleanMetadata: true });
  const step3 = resetJobVariationInPlan(step2, profB.id);
  restoreJobVariationToProfilePreset(step3, profA.id, tmpDir);

  const afterRaw = readProfilesRaw(tmpDir);
  assert.strictEqual(beforeRaw, afterRaw, 'profiles.json must be byte-identical after all plan modifier calls');
});

// ── Test 25: getBulkVariationTemplate key normalization ───────────────────
test('25. getBulkVariationTemplate key lookup is case/separator insensitive', () => {
  assert.ok(getBulkVariationTemplate('Neutral') !== null, 'Neutral');
  assert.ok(getBulkVariationTemplate('LIGHTCOLOR') !== null, 'LIGHTCOLOR');
  assert.ok(getBulkVariationTemplate('light-color') !== null, 'light-color');
  assert.ok(getBulkVariationTemplate('subtle_motion') !== null, 'subtle_motion');
  assert.ok(getBulkVariationTemplate('punchy color') !== null, 'punchy color');
  assert.strictEqual(getBulkVariationTemplate('nonexistent'), null, 'unknown key → null');
});

// ── Test 26: Running export flag check — isExecuting disables editing ──────
test('26. isExecuting flag semantics: variation editors must check it before mutating plan', () => {
  // This is a contract/flag test — the UI uses the `isExecuting` flag to disable all
  // variation editing controls. We verify the flag's semantics are clear by ensuring
  // that the plan modifier functions themselves are pure and do not inspect isExecuting —
  // that guard lives in the React component. Here we verify that calling plan modifiers
  // during "execution" (no lock in modifiers) still returns new plans without throwing,
  // and that the state flag is the caller's responsibility.
  const profA = makeProfile({ name: 'ExecFlag' });
  const tmpDir = makeTmpProfiles([profA]);
  const plan = makePlan([profA], tmpDir);

  // Simulate: modifier is called while isExecuting would be true (caller's guard bypassed).
  // The modifier must not throw — caller guard is the UI layer's responsibility.
  let result;
  assert.doesNotThrow(() => {
    result = resetJobVariationInPlan(plan, profA.id);
  }, 'resetJobVariationInPlan is pure and does not enforce isExecuting lock');
  assert.ok(result && Array.isArray(result.jobs), 'returned plan is valid even if called "during execution"');
});

// ---------------------------------------------------------------------------
// Cleanup & Summary
// ---------------------------------------------------------------------------

cleanup();

console.log('\n--------------------------------------------------------');
console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('--------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
}
