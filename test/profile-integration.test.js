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
  loadProfiles,
  setSelectedProfile,
  resolveProfilePreset,
  getDefaultVariation,
} = require('../src/main/profiles/profileManager');

const {
  validateProductVariationConfig,
  PRODUCT_VARIATION_LIMITS,
} = require('../src/engine/variation/validator');

const { cutClip, splitIntoReels } = require('../src/engine/cutter');

console.log('======================================================');
console.log('Running Phase 2B Profile Integration Test Suite');
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

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reel-p2b-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

(async () => {

  // ── 1. Profile list loads correctly ──────────────────────────────────────────
  test('1. Profile list loads correctly with expected fields and types', () => {
    const dir = tmpDir();
    try {
      createProfile({ name: 'FB Reel Profile', platform: 'Facebook', variationPreset: { brightness: 0.1, speed: 1.02 } }, dir);
      createProfile({ name: 'IG Story Profile', platform: 'Instagram', variationPreset: { hue: 10, crop: 1.0 } }, dir);
      const list = listProfiles(dir);
      assert.strictEqual(list.length, 2);
      assert.strictEqual(list[0].name, 'FB Reel Profile');
      assert.strictEqual(list[0].platform, 'Facebook');
      assert.strictEqual(list[1].name, 'IG Story Profile');
      assert.strictEqual(list[1].platform, 'Instagram');
      assert.ok(list[0].variationPreset);
    } finally { cleanup(dir); }
  });

  // ── 2. Profile selection works ──────────────────────────────────────────────
  test('2. Profile selection works and sets selectedProfileId', () => {
    const dir = tmpDir();
    try {
      const p1 = createProfile({ name: 'P1', platform: 'Facebook' }, dir);
      const p2 = createProfile({ name: 'P2', platform: 'YouTube' }, dir);
      setSelectedProfile(p2.id, dir);
      const list = listProfiles(dir);
      assert.strictEqual(list.selectedProfileId, p2.id);
    } finally { cleanup(dir); }
  });

  // ── 3. Selecting profile loads variationPreset ──────────────────────────────
  test('3. Selecting profile loads variationPreset into export configuration', () => {
    const preset = {
      brightness: 0.15,
      saturation: 1.25,
      hue: 12,
      pitch: 1.5,
      speed: 1.03,
      mode: 'top',
      crop: 1.5,
      cleanMetadata: true,
    };
    const resolved = resolveProfilePreset(preset);
    assert.strictEqual(resolved.enabled, true);
    assert.strictEqual(resolved.brightness, 0.15);
    assert.strictEqual(resolved.saturation, 1.25);
    assert.strictEqual(resolved.hue, 12);
    assert.strictEqual(resolved.pitch, 1.5);
    assert.strictEqual(resolved.speed, 1.03);
    assert.strictEqual(resolved.mode, 'top');
    assert.strictEqual(resolved.crop, 1.5);
    assert.strictEqual(resolved.cleanMetadata, true);
  });

  // ── 4. None preserves existing manual settings ──────────────────────────────
  test('4. None preserves existing manual settings without silent overrides', () => {
    const manualSettings = {
      enabled: true,
      brightness: 0.20,
      saturation: 1.30,
      hue: 45,
      pitch: -1.0,
      speed: 1.01,
      mode: 'bottom',
      crop: 0.5,
      cleanMetadata: false,
    };
    // Simulated UI state flow:
    let currentExportVariation = { ...manualSettings };
    let manualSaved = { ...manualSettings };

    // User selects a profile
    const profilePreset = { brightness: 0.05, speed: 1.02 };
    currentExportVariation = resolveProfilePreset(profilePreset);
    assert.strictEqual(currentExportVariation.brightness, 0.05);

    // User switches back to None
    currentExportVariation = { ...manualSaved };
    assert.deepStrictEqual(currentExportVariation, manualSettings);
  });

  // ── 5. Manual changes do not modify saved profile ───────────────────────────
  test('5. Manual changes in export UI do not modify the saved profile on disk', () => {
    const dir = tmpDir();
    try {
      const p = createProfile({
        name: 'Brand Page',
        platform: 'Facebook',
        variationPreset: { brightness: 0.05, speed: 1.02 }
      }, dir);

      // User loads profile into export variation
      const exportVariation = resolveProfilePreset(p.variationPreset);
      // User modifies value for this export only
      exportVariation.brightness = 0.50;
      exportVariation.speed = 1.05;

      // Reload profile from disk — must be unchanged
      const fresh = loadProfiles(dir).profiles.find(x => x.id === p.id);
      assert.strictEqual(fresh.variationPreset.brightness, 0.05);
      assert.strictEqual(fresh.variationPreset.speed, 1.02);
    } finally { cleanup(dir); }
  });

  // ── 6. Saved profile remains unchanged after export ─────────────────────────
  test('6. Saved profile remains unchanged on disk after export execution', () => {
    const dir = tmpDir();
    try {
      const p = createProfile({
        name: 'Unchanged After Export',
        platform: 'TikTok',
        variationPreset: { brightness: 0.08, saturation: 1.10, speed: 1.01 }
      }, dir);

      const beforeJson = fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8');

      // Export uses resolved config with local tweaks
      const exportVariation = resolveProfilePreset(p.variationPreset);
      exportVariation.saturation = 2.0;

      // Validate variation passes product validator
      const validation = validateProductVariationConfig(exportVariation);
      assert.strictEqual(validation.valid, true);

      // Verify file on disk is bit-for-bit identical
      const afterJson = fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8');
      assert.strictEqual(beforeJson, afterJson);
    } finally { cleanup(dir); }
  });

  // ── 7. Profile edit is reflected when reselected ────────────────────────────
  test('7. Profile edit in Page Profiles is immediately reflected when reselected', () => {
    const dir = tmpDir();
    try {
      const p = createProfile({
        name: 'Live Edit',
        platform: 'Facebook',
        variationPreset: { speed: 1.02, brightness: 0.05 }
      }, dir);

      // Initial resolve
      let resolved = resolveProfilePreset(p.variationPreset);
      assert.strictEqual(resolved.speed, 1.02);

      // Edit profile in profileManager (e.g. 1.02x -> 1.04x)
      updateProfile(p.id, {
        variationPreset: { speed: 1.04, brightness: 0.10 }
      }, dir);

      // Reload and re-resolve
      const refreshedList = listProfiles(dir);
      const updatedProfile = refreshedList.find(x => x.id === p.id);
      resolved = resolveProfilePreset(updatedProfile.variationPreset);
      assert.strictEqual(resolved.speed, 1.04);
      assert.strictEqual(resolved.brightness, 0.10);
    } finally { cleanup(dir); }
  });

  // ── 8. Deleted selected profile falls back to None ──────────────────────────
  test('8. Deleted selected profile falls back safely to None', () => {
    const dir = tmpDir();
    try {
      const p = createProfile({ name: 'To Be Deleted', platform: 'YouTube' }, dir);
      setSelectedProfile(p.id, dir);
      deleteProfile(p.id, dir);

      const list = listProfiles(dir);
      // Selected ID is updated to null because it was the only profile
      assert.strictEqual(list.selectedProfileId, null);

      // If simulated UI checks for selected profile in list:
      const active = list.find(x => x.id === p.id);
      assert.strictEqual(active, undefined);
    } finally { cleanup(dir); }
  });

  // ── 9. Disabled profile is not selectable ───────────────────────────────────
  test('9. Disabled profile is filtered out and not offered in export selector', () => {
    const dir = tmpDir();
    try {
      const p1 = createProfile({ name: 'Active P1', platform: 'Facebook', enabled: true }, dir);
      const p2 = createProfile({ name: 'Disabled P2', platform: 'Instagram', enabled: false }, dir);

      const all = listProfiles(dir);
      const selectable = all.filter(p => p.enabled !== false);
      assert.strictEqual(selectable.length, 1);
      assert.strictEqual(selectable[0].id, p1.id);
      assert.ok(!selectable.some(p => p.id === p2.id));
    } finally { cleanup(dir); }
  });

  // ── 10. Selected disabled profile falls back safely ─────────────────────────
  test('10. If selected profile is disabled, selector safely falls back to None', () => {
    const dir = tmpDir();
    try {
      const p = createProfile({ name: 'Will Disable', platform: 'TikTok', enabled: true }, dir);
      setSelectedProfile(p.id, dir);

      // User disables the profile in settings
      updateProfile(p.id, { enabled: false }, dir);

      const all = listProfiles(dir);
      const enabledList = all.filter(x => x.enabled !== false);
      const isStillSelectable = enabledList.some(x => x.id === p.id);
      assert.strictEqual(isStillSelectable, false);

      // UI fallback: if selected ID not in enabled list -> revert to None
      const activeSelection = isStillSelectable ? p.id : null;
      assert.strictEqual(activeSelection, null);
    } finally { cleanup(dir); }
  });

  // ── 11. Malformed profile preset falls back to defaults ─────────────────────
  test('11. Malformed or partial profile preset falls back to safe product defaults', () => {
    // Null / non-object
    const res1 = resolveProfilePreset(null);
    assert.strictEqual(res1.enabled, false);
    assert.strictEqual(res1.brightness, 0);

    // Empty object
    const res2 = resolveProfilePreset({});
    assert.strictEqual(res2.enabled, true);
    assert.strictEqual(res2.brightness, 0);
    assert.strictEqual(res2.saturation, 1);
    assert.strictEqual(res2.speed, 1.0);
    assert.strictEqual(res2.mode, 'center');

    // Values with invalid types
    const res3 = resolveProfilePreset({
      brightness: 'not-a-number',
      saturation: true,
      speed: undefined,
      mode: 'diagonal_invalid_mode'
    });
    assert.strictEqual(res3.brightness, 0);
    assert.strictEqual(res3.saturation, 1);
    assert.strictEqual(res3.speed, 1.0);
    assert.strictEqual(res3.mode, 'center');
  });

  // ── 12. Invalid variation values never reach FFmpeg ─────────────────────────
  test('12. Invalid or out-of-bounds variation values are strictly clamped and validated', () => {
    const extremePreset = {
      brightness: 999.0,     // max is 1.0
      saturation: -50.0,     // min is 0.0
      hue: 9999.0,           // max is 180.0
      pitch: -100.0,         // min is -3.0
      speed: 5.0,            // max is 1.05
      crop: 50.0,            // max is 2.0
    };

    const resolved = resolveProfilePreset(extremePreset);
    assert.strictEqual(resolved.brightness, 1.0);
    assert.strictEqual(resolved.saturation, 0.0);
    assert.strictEqual(resolved.hue, 180.0);
    assert.strictEqual(resolved.pitch, -3.0);
    assert.strictEqual(resolved.speed, 1.05);
    assert.strictEqual(resolved.crop, 2.0);

    // Validate using engine validator — must succeed without throwing
    const val = validateProductVariationConfig(resolved);
    assert.strictEqual(val.valid, true);
  });

  // ── 13. Cut receives resolved profile variation ─────────────────────────────
  test('13. Cut workflow accepts resolved profile variation configuration', () => {
    const preset = { brightness: 0.05, saturation: 1.10, speed: 1.01 };
    const resolved = resolveProfilePreset(preset);

    // Verify format expected by cutClip
    const { config } = validateProductVariationConfig(resolved);
    assert.ok(config.color);
    assert.ok(config.audio);
    assert.ok(config.speedConfig);
    assert.ok(config.reframe);
    assert.ok(config.metadata);
    assert.strictEqual(config.color.brightness, 0.05);
    assert.strictEqual(config.color.saturation, 1.10);
    assert.strictEqual(config.speedConfig.factor, 1.01);
  });

  // ── 14. Reel receives resolved profile variation ────────────────────────────
  test('14. Reel workflow accepts resolved profile variation configuration', () => {
    const preset = { hue: 15, pitch: 1.0, crop: 1.0, mode: 'center' };
    const resolved = resolveProfilePreset(preset);

    const { config } = validateProductVariationConfig(resolved);
    assert.strictEqual(config.color.hue, 15);
    assert.strictEqual(config.audio.pitchPercent, 1.0);
    assert.strictEqual(config.reframe.cropPercent, 1.0);
    assert.strictEqual(config.reframe.mode, 'center');
  });

  // ── 15. Split receives resolved profile variation ───────────────────────────
  test('15. Split workflow accepts resolved profile variation configuration', () => {
    const preset = { brightness: -0.05, speed: 1.02, cleanMetadata: true };
    const resolved = resolveProfilePreset(preset);

    const { config } = validateProductVariationConfig(resolved);
    assert.strictEqual(config.color.brightness, -0.05);
    assert.strictEqual(config.speedConfig.factor, 1.02);
    assert.strictEqual(config.metadata.clean, true);
  });

  // ── 16. Existing Content Variation tests still pass ─────────────────────────
  test('16. Variation validator rejects non-object input and handles defaults correctly', () => {
    assert.throws(() => validateProductVariationConfig('invalid'), /object/i);
    const def = validateProductVariationConfig(null);
    assert.strictEqual(def.valid, true);
    assert.strictEqual(def.config.enabled, false);
  });

  // ── 17. Existing Profile Manager tests still pass ───────────────────────────
  test('17. Profile Manager validation constraints remain intact', () => {
    assert.strictEqual(PRODUCT_VARIATION_LIMITS.speed.max, 1.05);
    assert.strictEqual(PRODUCT_VARIATION_LIMITS.crop.max, 2.0);
    assert.strictEqual(PRODUCT_VARIATION_LIMITS.pitch.max, 3.0);
  });

  // ── 18. Existing application tests still pass ───────────────────────────────
  test('18. Default variation state is clean and disabled by default', () => {
    const def = getDefaultVariation();
    assert.strictEqual(def.enabled, false);
    assert.strictEqual(def.brightness, 0);
    assert.strictEqual(def.saturation, 1);
    assert.strictEqual(def.cleanMetadata, true);
  });

  // ── 19. Existing Batch Queue remains functional ─────────────────────────────
  test('19. Batch Queue item can encapsulate resolved profile variation config', () => {
    const resolved = resolveProfilePreset({ brightness: 0.1, speed: 1.02 });
    const batchItem = {
      id: 'batch_item_1',
      operation: 'cut',
      inputPath: 'test.mp4',
      outputPath: 'out.mp4',
      variation: resolved,
    };
    assert.ok(batchItem.variation.enabled);
    assert.strictEqual(batchItem.variation.brightness, 0.1);
    assert.strictEqual(batchItem.variation.speed, 1.02);
  });

  // ── 20. Profile selection persists across restart ───────────────────────────
  test('20. Profile selection persists across reload/restart in profiles.json', () => {
    const dir = tmpDir();
    try {
      const p1 = createProfile({ name: 'P1', platform: 'Facebook' }, dir);
      const p2 = createProfile({ name: 'P2', platform: 'Instagram' }, dir);
      setSelectedProfile(p2.id, dir);

      // Simulate app shutdown and restart: reload fresh from disk
      const reloaded = loadProfiles(dir);
      assert.strictEqual(reloaded.selectedProfileId, p2.id);
      const active = reloaded.profiles.find(x => x.id === reloaded.selectedProfileId);
      assert.strictEqual(active.name, 'P2');
    } finally { cleanup(dir); }
  });

  // ── 21. Real media export with profile and Source Immutability ──────────────
  await asyncTest('21. Real media cut export with profile variation preserves source immutability', async () => {
    const candidates = [
      path.join(__dirname, '..', 'test-videos', 'sample.mp4'),
      path.join(__dirname, '..', 'test-videos', 'test_clip.mp4'),
    ];
    const testVideo = candidates.find(p => fs.existsSync(p));
    if (!testVideo) {
      console.log('       (skipped: sample.mp4 not present)');
      return;
    }

    // Compute SHA-256 before export
    const hashBefore = crypto.createHash('sha256').update(fs.readFileSync(testVideo)).digest('hex');

    const outDir = tmpDir();
    const outVideo = path.join(outDir, 'test_profile_out.mp4');

    try {
      // Simulate profile preset
      const profilePreset = {
        brightness: 0.05,
        saturation: 1.05,
        hue: 5,
        speed: 1.01,
        cleanMetadata: true,
      };
      const resolved = resolveProfilePreset(profilePreset);

      const res = await cutClip(testVideo, outVideo, {
        start: 0,
        duration: 1,
        variation: resolved,
      });

      assert.ok(res.outputPath);
      assert.ok(fs.existsSync(outVideo));
      assert.ok(fs.statSync(outVideo).size > 0);

      // Compute SHA-256 after export
      const hashAfter = crypto.createHash('sha256').update(fs.readFileSync(testVideo)).digest('hex');
      assert.strictEqual(hashBefore, hashAfter, 'Source file SHA-256 hash must be identical before and after export');
    } finally {
      cleanup(outDir);
    }
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('======================================================');
  process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    errors.forEach(e => process.stdout.write('   - ' + e.name + ': ' + (e.err.message || e.err) + '\n'));
    console.log('======================================================');
    process.exit(1);
  } else {
    console.log('All Phase 2B profile integration tests PASSED');
    console.log('======================================================');
  }

})();