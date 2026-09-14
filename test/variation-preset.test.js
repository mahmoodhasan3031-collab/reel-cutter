'use strict';

/**
 * Phase 5A — Advanced Content Variation Preset System Test Suite
 *
 * Tests covering 23 comprehensive cases (A through W):
 *   A. Built-in preset availability
 *   B. Built-in immutability
 *   C. Custom preset creation
 *   D. Custom preset update
 *   E. Custom preset duplication
 *   F. Custom preset deletion
 *   G. Search/filter
 *   H. Corrupt persistence recovery
 *   I. Validation
 *   J. Invalid range rejection
 *   K. Prototype pollution rejection
 *   L. Deep clone isolation
 *   M. Apply preset
 *   N. Manual override isolation
 *   O. Profile integration
 *   P. Profile deletion fallback
 *   Q. Bulk snapshot isolation
 *   R. Schedule snapshot isolation
 *   S. Preset edit after scheduling
 *   T. Preset comparison
 *   U. Duplicate naming
 *   V. Reset behavior
 *   W. Feature gating
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  CANONICAL_BUILTIN_PRESETS,
  BUILTIN_IDS,
  getVariationPresetsFilePath,
  validatePresetName,
  validatePresetDescription,
  validatePresetVariation,
  validatePresetInput,
  getVariationPresets,
  getVariationPreset,
  searchVariationPresets,
  createVariationPreset,
  updateVariationPreset,
  deleteVariationPreset,
  duplicateVariationPreset,
  compareVariationPresets,
  applyVariationPreset,
  resolveVariationPresetSnapshot,
  getSafeVariationDefaults,
  resetVariationPresets,
  deepClone,
} = require('../src/main/variations/variationPresetManager');

const {
  createProfile,
  updateProfile,
  duplicateProfile,
  loadProfiles,
  validateVariationPresetId,
  resolveProfileVariationPreset,
} = require('../src/main/profiles/profileManager');

const { createBulkExportPlan } = require('../src/main/profiles/exportPlan');
const { createSchedule, getSchedule } = require('../src/main/scheduler/scheduleManager');
const { hasFeature, FEATURE_KEYS } = require('../src/shared/features');

console.log('======================================================');
console.log('🧪 Running Phase 5A Variation Preset Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_var_preset_test_'));
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

const sampleValidVariation = {
  enabled: true,
  brightness: 0.05,
  saturation: 1.1,
  hue: 5,
  pitch: 0.5,
  speed: 1.01,
  mode: 'center',
  crop: 1.0,
  cleanMetadata: true,
};

// ── Test Definitions (A through W) ──────────────────────────────────────────

// A. Built-in preset availability
test('A. Built-in preset availability', () => {
  const tmp = makeTmpDir();
  try {
    const list = getVariationPresets(tmp);
    assert.ok(Array.isArray(list), 'List must be an array');
    assert.strictEqual(list.length, 6, 'Must contain exactly 6 canonical built-in presets');

    const expectedNames = ['Neutral', 'Bright', 'Punchy', 'Soft', 'Subtle Motion', 'Reframe Focus'];
    for (const name of expectedNames) {
      const found = list.find(p => p.name === name);
      assert.ok(found, `Built-in preset "${name}" must exist`);
      assert.strictEqual(found.isBuiltIn, true, `Preset "${name}" must have isBuiltIn: true`);
      assert.ok(found.variation, `Preset "${name}" must have variation object`);
      assert.ok(typeof found.id === 'string' && found.id.startsWith('vpreset_builtin_'), `Preset "${name}" ID format`);
    }
  } finally {
    cleanupTmpDir(tmp);
  }
});

// B. Built-in immutability
test('B. Built-in immutability', () => {
  const tmp = makeTmpDir();
  try {
    const builtins = getVariationPresets(tmp);
    const neutral = builtins.find(p => p.id === 'vpreset_builtin_neutral');
    assert.ok(neutral);

    // Cannot update built-in
    assert.throws(() => {
      updateVariationPreset('vpreset_builtin_neutral', { name: 'Hacked Neutral' }, tmp);
    }, /Built-in presets cannot be modified/i);

    // Cannot delete built-in
    assert.throws(() => {
      deleteVariationPreset('vpreset_builtin_neutral', tmp);
    }, /Built-in presets cannot be deleted/i);

    // Deep clone immutability: mutating returned object must not mutate store
    neutral.variation.brightness = 0.99;
    const fresh = getVariationPreset('vpreset_builtin_neutral', tmp);
    assert.strictEqual(fresh.variation.brightness, 0.0, 'Internal built-in state must not be mutated');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// C. Custom preset creation
test('C. Custom preset creation', () => {
  const tmp = makeTmpDir();
  try {
    const created = createVariationPreset(
      {
        name: 'My Custom Warmth',
        description: 'Warm color grade for sunset clips',
        variation: {
          enabled: true,
          brightness: 0.08,
          saturation: 1.2,
          hue: 2,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0.5,
          cleanMetadata: true,
        },
      },
      tmp
    );

    assert.ok(created.id, 'Must generate preset ID');
    assert.ok(created.id.startsWith('vpreset_'), 'Preset ID prefix');
    assert.strictEqual(created.name, 'My Custom Warmth');
    assert.strictEqual(created.description, 'Warm color grade for sunset clips');
    assert.strictEqual(created.isBuiltIn, false);
    assert.strictEqual(created.variation.brightness, 0.08);
    assert.strictEqual(created.variation.saturation, 1.2);
    assert.ok(created.createdAt);
    assert.ok(created.updatedAt);

    // Must be persisted and retrievable
    const fetched = getVariationPreset(created.id, tmp);
    assert.ok(fetched);
    assert.strictEqual(fetched.name, 'My Custom Warmth');
    assert.strictEqual(fetched.isBuiltIn, false);

    const all = getVariationPresets(tmp);
    assert.strictEqual(all.length, 7, 'Should have 6 built-ins + 1 custom');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// D. Custom preset update
test('D. Custom preset update', () => {
  const tmp = makeTmpDir();
  try {
    const created = createVariationPreset(
      {
        name: 'Original Preset',
        description: 'Original description',
        variation: sampleValidVariation,
      },
      tmp
    );

    const updated = updateVariationPreset(
      created.id,
      {
        name: 'Updated Preset Name',
        description: 'Updated description',
        variation: {
          ...sampleValidVariation,
          brightness: -0.05,
          crop: 1.5,
        },
      },
      tmp
    );

    assert.strictEqual(updated.id, created.id, 'ID must remain identical');
    assert.strictEqual(updated.name, 'Updated Preset Name');
    assert.strictEqual(updated.description, 'Updated description');
    assert.strictEqual(updated.variation.brightness, -0.05);
    assert.strictEqual(updated.variation.crop, 1.5);
    assert.ok(updated.updatedAt >= created.updatedAt);

    // Verify on disk
    const fetched = getVariationPreset(created.id, tmp);
    assert.strictEqual(fetched.name, 'Updated Preset Name');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// E. Custom preset duplication
test('E. Custom preset duplication', () => {
  const tmp = makeTmpDir();
  try {
    const orig = createVariationPreset(
      {
        name: 'Base Grade',
        description: 'Base grade description',
        variation: sampleValidVariation,
      },
      tmp
    );

    const dup = duplicateVariationPreset(orig.id, {}, tmp);
    assert.ok(dup.id);
    assert.notStrictEqual(dup.id, orig.id, 'Duplicate must receive new unique ID');
    assert.strictEqual(dup.name, 'Base Grade Copy');
    assert.strictEqual(dup.isBuiltIn, false);
    assert.strictEqual(dup.variation.brightness, orig.variation.brightness);

    // Mutating duplicate does not affect original
    updateVariationPreset(dup.id, { name: 'Modified Dup', variation: { ...sampleValidVariation, brightness: 0.5 } }, tmp);
    const origReloaded = getVariationPreset(orig.id, tmp);
    assert.strictEqual(origReloaded.name, 'Base Grade');
    assert.strictEqual(origReloaded.variation.brightness, sampleValidVariation.brightness);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// F. Custom preset deletion
test('F. Custom preset deletion', () => {
  const tmp = makeTmpDir();
  try {
    const created = createVariationPreset(
      {
        name: 'To Be Deleted',
        variation: sampleValidVariation,
      },
      tmp
    );

    assert.ok(getVariationPreset(created.id, tmp));
    const result = deleteVariationPreset(created.id, tmp);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.id, created.id);

    // Check retrieval returns null
    assert.strictEqual(getVariationPreset(created.id, tmp), null);
    assert.strictEqual(getVariationPresets(tmp).length, 6, 'Should be back to 6 built-ins');

    // Deleting again throws
    assert.throws(() => {
      deleteVariationPreset(created.id, tmp);
    }, /not found/i);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// G. Search/filter
test('G. Search/filter', () => {
  const tmp = makeTmpDir();
  try {
    createVariationPreset({ name: 'Sunset Vibe', description: 'Vibrant sunset look', variation: sampleValidVariation }, tmp);
    createVariationPreset({ name: 'Moody Cinema', description: 'Dark tones', variation: sampleValidVariation }, tmp);

    // Filter by category
    const builtins = searchVariationPresets({ type: 'builtin', customDir: tmp });
    assert.strictEqual(builtins.length, 6);
    assert.ok(builtins.every(p => p.isBuiltIn));

    const custom = searchVariationPresets({ type: 'custom', customDir: tmp });
    assert.strictEqual(custom.length, 2);
    assert.ok(custom.every(p => !p.isBuiltIn));

    // Search query by name
    const sunsetSearch = searchVariationPresets({ query: 'sunset', customDir: tmp });
    assert.strictEqual(sunsetSearch.length, 1);
    assert.strictEqual(sunsetSearch[0].name, 'Sunset Vibe');

    // Search query by description
    const cinemaSearch = searchVariationPresets({ query: 'dark tones', customDir: tmp });
    assert.strictEqual(cinemaSearch.length, 1);
    assert.strictEqual(cinemaSearch[0].name, 'Moody Cinema');

    // Search query matching built-in
    const punchySearch = searchVariationPresets({ query: 'punchy', customDir: tmp });
    assert.strictEqual(punchySearch.length, 1);
    assert.strictEqual(punchySearch[0].id, 'vpreset_builtin_punchy');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// H. Corrupt persistence recovery
test('H. Corrupt persistence recovery', () => {
  const tmp = makeTmpDir();
  try {
    const filePath = getVariationPresetsFilePath(tmp);
    // Write corrupted JSON
    fs.writeFileSync(filePath, '{ corrupt: json,,, broken!!', 'utf8');

    // Must not throw; returns built-ins gracefully
    const list = getVariationPresets(tmp);
    assert.strictEqual(list.length, 6);

    // Can save new preset without error
    const created = createVariationPreset({ name: 'Recovery Preset', variation: sampleValidVariation }, tmp);
    assert.ok(created);
    assert.strictEqual(getVariationPresets(tmp).length, 7);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// I. Validation
test('I. Validation', () => {
  // Empty name
  assert.throws(() => {
    validatePresetName('');
  }, /empty/i);

  assert.throws(() => {
    validatePresetName('   ');
  }, /empty/i);

  // Name too long (> 100 chars)
  assert.throws(() => {
    validatePresetName('A'.repeat(101));
  }, /cannot exceed 100 characters/i);

  // Description too long (> 300 chars)
  assert.throws(() => {
    validatePresetDescription('B'.repeat(301));
  }, /cannot exceed 300 characters/i);

  // Non-object input
  assert.throws(() => {
    validatePresetInput(null);
  }, /non-null object/i);

  assert.throws(() => {
    validatePresetInput('string');
  }, /non-null object/i);

  // Function property rejected
  assert.throws(() => {
    validatePresetInput({
      name: 'Exploit',
      variation: sampleValidVariation,
      malicious: () => {},
    });
  }, /functions are not allowed/i);
});

// J. Invalid range rejection
test('J. Invalid range rejection', () => {
  // Out-of-range brightness (> 1.0)
  assert.throws(() => {
    validatePresetVariation({ enabled: true, brightness: 1.5 });
  }, /Brightness must be between/i);

  // Out-of-range saturation (< 0.0)
  assert.throws(() => {
    validatePresetVariation({ enabled: true, saturation: -0.5 });
  }, /Saturation must be between/i);

  // Out-of-range speed (> 1.05)
  assert.throws(() => {
    validatePresetVariation({ enabled: true, speed: 1.10 });
  }, /Speed must be between/i);

  // Out-of-range crop (> 2.0)
  assert.throws(() => {
    validatePresetVariation({ enabled: true, crop: 3.5 });
  }, /Crop must be between/i);

  // Invalid reframe mode
  assert.throws(() => {
    validatePresetVariation({ enabled: true, mode: 'diagonal' });
  }, /Reframe mode must be one of/i);

  // NaN values
  assert.throws(() => {
    validatePresetVariation({ enabled: true, brightness: NaN });
  }, /valid number/i);
});

// K. Prototype pollution rejection
test('K. Prototype pollution rejection', () => {
  assert.throws(() => {
    const malicious = JSON.parse('{"name":"Pollute","__proto__":{"polluted":true},"variation":{"enabled":true}}');
    validatePresetInput(malicious);
  }, /Prototype pollution attempt/i);

  assert.throws(() => {
    const maliciousVar = JSON.parse('{"enabled":true,"constructor":{"prototype":{"polluted":true}}}');
    validatePresetVariation(maliciousVar);
  }, /Prototype pollution attempt/i);

  assert.strictEqual(Object.prototype.polluted, undefined, 'Global Object prototype must not be polluted');
});

// L. Deep clone isolation
test('L. Deep clone isolation', () => {
  const tmp = makeTmpDir();
  try {
    const inputVar = { ...sampleValidVariation };
    const created = createVariationPreset(
      {
        name: 'Isolation Test',
        variation: inputVar,
      },
      tmp
    );

    // Mutate the original input object
    inputVar.brightness = 0.99;
    inputVar.crop = 1.99;

    const fetched = getVariationPreset(created.id, tmp);
    assert.strictEqual(fetched.variation.brightness, sampleValidVariation.brightness, 'Stored preset must not change when input is mutated');
    assert.strictEqual(fetched.variation.crop, sampleValidVariation.crop);

    // Mutate the returned fetched object
    fetched.variation.brightness = -0.99;
    const fetchedAgain = getVariationPreset(created.id, tmp);
    assert.strictEqual(fetchedAgain.variation.brightness, sampleValidVariation.brightness, 'Stored preset must not change when retrieved object is mutated');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// M. Apply preset
test('M. Apply preset', () => {
  const tmp = makeTmpDir();
  try {
    const preset = createVariationPreset(
      {
        name: 'Punchy Apply',
        variation: {
          enabled: true,
          brightness: 0.1,
          saturation: 1.3,
          hue: 0,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0.5,
          cleanMetadata: true,
        },
      },
      tmp
    );

    const currentExportConfig = {
      enabled: false,
      brightness: 0.0,
      saturation: 1.0,
      customExportTag: 'reels_v1',
    };

    const applied = applyVariationPreset(preset.id, currentExportConfig, tmp);
    assert.strictEqual(applied.enabled, true);
    assert.strictEqual(applied.brightness, 0.1);
    assert.strictEqual(applied.saturation, 1.3);
    assert.strictEqual(applied.crop, 0.5);
    assert.strictEqual(applied.customExportTag, 'reels_v1', 'Should preserve current export options');

    // Verify preset on disk is unchanged
    const stored = getVariationPreset(preset.id, tmp);
    assert.strictEqual(stored.variation.brightness, 0.1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// N. Manual override isolation
test('N. Manual override isolation', () => {
  const tmp = makeTmpDir();
  try {
    const preset = getVariationPreset('vpreset_builtin_bright', tmp);
    const applied = applyVariationPreset(preset, {}, tmp);

    // Simulate user tweaking brightness in the UI after applying the preset
    applied.brightness = 0.25;
    applied.saturation = 1.5;

    // Built-in and custom presets must remain completely isolated
    const reloadBuiltin = getVariationPreset('vpreset_builtin_bright', tmp);
    assert.strictEqual(reloadBuiltin.variation.brightness, 0.05);
    assert.strictEqual(reloadBuiltin.variation.saturation, 1.1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// O. Profile integration
test('O. Profile integration', () => {
  const tmp = makeTmpDir();
  try {
    // 1. Valid preset ID attached to profile
    const profile = createProfile(
      {
        name: 'Brand Reel Profile',
        platform: 'Instagram',
        variationPresetId: 'vpreset_builtin_punchy',
      },
      tmp
    );

    assert.strictEqual(profile.variationPresetId, 'vpreset_builtin_punchy');

    // 2. Profile resolution resolves preset variation
    const resolved = resolveProfileVariationPreset(profile, tmp);
    assert.strictEqual(resolved.presetId, 'vpreset_builtin_punchy');
    assert.strictEqual(resolved.presetName, 'Punchy');
    assert.strictEqual(resolved.variation.saturation, 1.15);

    // 3. Duplicate profile preserves preset ID
    const dupProfile = duplicateProfile(profile.id, tmp);
    assert.strictEqual(dupProfile.variationPresetId, 'vpreset_builtin_punchy');

    // 4. Invalid preset ID throws on profile creation
    assert.throws(() => {
      createProfile({ name: 'Bad Profile', variationPresetId: 'vpreset_nonexistent' }, tmp);
    }, /Variation preset not found/i);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// P. Profile deletion fallback
test('P. Profile deletion fallback', () => {
  const tmp = makeTmpDir();
  try {
    // Create custom preset and attach to profile
    const preset = createVariationPreset({ name: 'Temporary Preset', variation: sampleValidVariation }, tmp);
    const profile = createProfile({ name: 'Temp Profile', variationPresetId: preset.id }, tmp);
    assert.strictEqual(profile.variationPresetId, preset.id);

    // Delete the preset
    deleteVariationPreset(preset.id, tmp);

    // Resolving profile variation must not throw; falls back safely
    const resolved = resolveProfileVariationPreset(profile, tmp);
    assert.ok(resolved);
    assert.strictEqual(resolved.presetId, null, 'Should fall back gracefully');
    assert.ok(resolved.variation, 'Must provide fallback variation config');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Q. Bulk snapshot isolation
test('Q. Bulk snapshot isolation', () => {
  const tmp = makeTmpDir();
  try {
    const dummyVideo = path.join(tmp, 'source.mp4');
    fs.writeFileSync(dummyVideo, 'dummy video payload');

    const customPreset = createVariationPreset(
      {
        name: 'Bulk Grade A',
        variation: {
          enabled: true,
          brightness: 0.05,
          saturation: 1.2,
          hue: 0,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0,
          cleanMetadata: true,
        },
      },
      tmp
    );

    const profile = createProfile(
      {
        name: 'Bulk Profile 1',
        platform: 'TikTok',
        variationPresetId: customPreset.id,
      },
      tmp
    );

    // Create bulk export plan (takes immutable snapshot)
    const plan = createBulkExportPlan(
      {
        sourcePath: dummyVideo,
        profileIds: [profile.id],
        exportType: 'cut',
        outputDir: tmp,
      },
      tmp
    );

    assert.strictEqual(plan.jobs.length, 1);
    assert.strictEqual(plan.jobs[0].variationPreset.saturation, 1.2);
    assert.strictEqual(plan.jobs[0].variationPresetId, customPreset.id);
    assert.strictEqual(plan.jobs[0].variationPresetName, 'Bulk Grade A');

    // Mutate the custom preset after plan creation
    updateVariationPreset(
      customPreset.id,
      {
        name: 'Bulk Grade A Modified',
        variation: {
          enabled: true,
          brightness: -0.2,
          saturation: 0.5,
          hue: 0,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0,
          cleanMetadata: true,
        },
      },
      tmp
    );

    // Mutate profile after plan creation
    updateProfile(profile.id, { name: 'Bulk Profile Renamed' }, tmp);

    // The existing plan jobs must remain completely unchanged
    assert.strictEqual(plan.jobs[0].variationPreset.saturation, 1.2, 'Plan snapshot saturation must remain immutable');
    assert.strictEqual(plan.jobs[0].variationPreset.brightness, 0.05, 'Plan snapshot brightness must remain immutable');
    assert.strictEqual(plan.jobs[0].profileName, 'Bulk Profile 1', 'Plan snapshot profile name must remain immutable');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// R. Schedule snapshot isolation
test('R. Schedule snapshot isolation', () => {
  const tmp = makeTmpDir();
  try {
    const dummyVideo = path.join(tmp, 'scheduled_source.mp4');
    fs.writeFileSync(dummyVideo, 'dummy video payload');

    const schedPreset = createVariationPreset(
      {
        name: 'Schedule Grade',
        variation: {
          enabled: true,
          brightness: 0.08,
          saturation: 1.15,
          hue: 0,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0,
          cleanMetadata: true,
        },
      },
      tmp
    );

    const schedule = createSchedule(
      {
        sourcePath: dummyVideo,
        exportType: 'cut',
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
        outputDirectory: tmp,
        variationPresetId: schedPreset.id,
        variationPreset: schedPreset.variation,
      },
      tmp
    );

    assert.ok(schedule.id);
    assert.strictEqual(schedule.variationPreset.brightness, 0.08);

    // Delete preset
    deleteVariationPreset(schedPreset.id, tmp);

    // Scheduled item retains its immutable snapshot
    const fetchedSchedule = getSchedule(schedule.id, tmp);
    assert.strictEqual(fetchedSchedule.variationPreset.brightness, 0.08);
    assert.strictEqual(fetchedSchedule.variationPreset.saturation, 1.15);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// S. Preset edit after scheduling
test('S. Preset edit after scheduling', () => {
  const tmp = makeTmpDir();
  try {
    const dummyVideo = path.join(tmp, 'source_s.mp4');
    fs.writeFileSync(dummyVideo, 'dummy video payload');

    const preset = createVariationPreset(
      {
        name: 'Preset X',
        variation: {
          enabled: true,
          brightness: 0.05,
          saturation: 1.25,
          hue: 0,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0,
          cleanMetadata: true,
        },
      },
      tmp
    );

    const schedule = createSchedule(
      {
        sourcePath: dummyVideo,
        exportType: 'cut',
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
        outputDirectory: tmp,
        variationPresetId: preset.id,
        variationPreset: preset.variation,
      },
      tmp
    );

    // Edit preset X
    updateVariationPreset(
      preset.id,
      {
        variation: {
          enabled: true,
          brightness: -0.5,
          saturation: 0.1,
          hue: 0,
          pitch: 0,
          speed: 1.0,
          mode: 'center',
          crop: 0,
          cleanMetadata: true,
        },
      },
      tmp
    );

    // Scheduled job retains original values
    const reloadedSchedule = getSchedule(schedule.id, tmp);
    assert.strictEqual(reloadedSchedule.variationPreset.saturation, 1.25);
    assert.strictEqual(reloadedSchedule.variationPreset.brightness, 0.05);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// T. Preset comparison
test('T. Preset comparison', () => {
  const current = {
    enabled: true,
    brightness: 0.0,
    saturation: 1.0,
    hue: 0,
    speed: 1.0,
    crop: 0,
    mode: 'center',
  };

  const targetPreset = {
    enabled: true,
    brightness: 0.1,
    saturation: 1.2,
    hue: 10,
    speed: 1.03,
    crop: 2.0,
    mode: 'left',
  };

  const comparison = compareVariationPresets(current, targetPreset);
  assert.strictEqual(comparison.title, 'Creative Difference');
  assert.strictEqual(comparison.hasDifferences, true);
  assert.ok(comparison.differences.some(d => d.includes('Brightness: +0.10')));
  assert.ok(comparison.differences.some(d => d.includes('Saturation: +0.20')));
  assert.ok(comparison.differences.some(d => d.includes('Speed: 1.03x')));
  assert.ok(comparison.differences.some(d => d.includes('Crop: 2.0%')));
  assert.ok(comparison.differences.some(d => d.includes('Mode: center → left')));

  // Comparison between identical configs
  const identical = compareVariationPresets(current, current);
  assert.strictEqual(identical.hasDifferences, false);
  assert.strictEqual(identical.differences.length, 0);
});

// U. Duplicate naming
test('U. Duplicate naming', () => {
  const tmp = makeTmpDir();
  try {
    const orig = createVariationPreset({ name: 'Dynamic Punch', variation: sampleValidVariation }, tmp);

    const dup1 = duplicateVariationPreset(orig.id, {}, tmp);
    assert.strictEqual(dup1.name, 'Dynamic Punch Copy');

    const dup2 = duplicateVariationPreset(orig.id, {}, tmp);
    assert.strictEqual(dup2.name, 'Dynamic Punch Copy 2');

    const dup3 = duplicateVariationPreset(orig.id, {}, tmp);
    assert.strictEqual(dup3.name, 'Dynamic Punch Copy 3');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// V. Reset behavior
test('V. Reset behavior', () => {
  const tmp = makeTmpDir();
  try {
    // Custom presets exist
    createVariationPreset({ name: 'User Grade', variation: sampleValidVariation }, tmp);
    assert.strictEqual(getVariationPresets(tmp).length, 7);

    // Reset restores built-ins without deleting custom presets
    const afterReset = resetVariationPresets(tmp);
    assert.strictEqual(afterReset.length, 7);
    assert.ok(afterReset.some(p => p.name === 'User Grade'));

    // getSafeVariationDefaults returns default config
    const defaults = getSafeVariationDefaults();
    assert.strictEqual(defaults.enabled, false);
    assert.strictEqual(defaults.brightness, 0.0);
    assert.strictEqual(defaults.saturation, 1.0);
    assert.strictEqual(defaults.speed, 1.0);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// W. Feature gating
test('W. Feature gating', () => {
  assert.strictEqual(hasFeature('basic', 'variation_presets'), false, 'Basic tier must not have variation_presets');
  assert.strictEqual(hasFeature('standard', 'variation_presets'), false, 'Standard tier must not have variation_presets');
  assert.strictEqual(hasFeature('pro', 'variation_presets'), true, 'Pro tier must have variation_presets');

  // Flexible aliases
  assert.strictEqual(hasFeature('pro', 'Content Variation Presets'), true);
  assert.strictEqual(hasFeature('pro', 'export presets'), true);
  assert.strictEqual(hasFeature('pro', 'variation_presets'), true);
});

// ── Runner ───────────────────────────────────────────────────────────────────

console.log(`Executing ${testQueue.length} test cases...\n`);

for (const t of testQueue) {
  totalCount++;
  try {
    t.fn();
    passedCount++;
    console.log(`  ✓ [PASS] ${t.name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${t.name}`);
    console.error(`    ${err.stack || err.message}\n`);
  }
}

console.log(`\n======================================================`);
console.log(`Phase 5A Tests: ${passedCount}/${totalCount} passed`);
console.log(`======================================================\n`);

if (passedCount !== totalCount) {
  process.exit(1);
}
