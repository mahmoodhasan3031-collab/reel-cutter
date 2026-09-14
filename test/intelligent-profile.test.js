'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  CONFIGURATION_STATUS,
  OVERRIDE_FIELDS,
  validateOverrides,
  getProfileConfigurationStatus,
  resolveProfileConfiguration,
  getProfilePreview,
  diffProfileConfigurations,
  applyProfileConfiguration,
  createProfile,
  updateProfile,
  duplicateProfile,
  loadProfiles,
} = require('../src/main/profiles/profileManager');

const {
  createVariationPreset,
} = require('../src/main/variations/variationPresetManager');

const {
  createExportPreset,
} = require('../src/main/exportPresets/exportPresetManager');

const {
  createCaptionTemplate,
} = require('../src/main/captions/captionTemplateManager');

console.log('======================================================');
console.log('Running Intelligent Profile Configuration Test Suite (Phase 5C)');
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

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reel-ip-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ─── CONFIGURATION_STATUS constants ────────────────────────────────────────────

test('CONFIGURATION_STATUS has 4 values', function() {
  const vals = Object.values(CONFIGURATION_STATUS);
  assert.strictEqual(vals.length, 4);
  assert.ok(vals.includes('ready'));
  assert.ok(vals.includes('incomplete'));
  assert.ok(vals.includes('fallback'));
  assert.ok(vals.includes('invalid'));
});

test('OVERRIDE_FIELDS has 16 fields', function() {
  assert.ok(OVERRIDE_FIELDS.length >= 14);
  assert.ok(OVERRIDE_FIELDS.includes('brightness'));
  assert.ok(OVERRIDE_FIELDS.includes('saturation'));
  assert.ok(OVERRIDE_FIELDS.includes('speed'));
  assert.ok(OVERRIDE_FIELDS.includes('mode'));
  assert.ok(OVERRIDE_FIELDS.includes('codec'));
});

// ─── validateOverrides ─────────────────────────────────────────────────────────

test('validateOverrides returns empty object for null input', function() {
  assert.deepStrictEqual(validateOverrides(null), {});
});

test('validateOverrides returns empty object for undefined input', function() {
  assert.deepStrictEqual(validateOverrides(undefined), {});
});

test('validateOverrides returns empty object for non-object input', function() {
  assert.deepStrictEqual(validateOverrides('string'), {});
  assert.deepStrictEqual(validateOverrides(42), {});
});

test('validateOverrides clamps brightness within [-1, 1]', function() {
  const result = validateOverrides({ brightness: 2.0 });
  assert.strictEqual(result.brightness, 1.0);

  const result2 = validateOverrides({ brightness: -2.0 });
  assert.strictEqual(result2.brightness, -1.0);
});

test('validateOverrides clamps saturation within [0, 3]', function() {
  const result = validateOverrides({ saturation: 5.0 });
  assert.strictEqual(result.saturation, 3.0);

  const result2 = validateOverrides({ saturation: -1.0 });
  assert.strictEqual(result2.saturation, 0.0);
});

test('validateOverrides clamps speed within [1, 1.05]', function() {
  const result = validateOverrides({ speed: 1.1 });
  assert.strictEqual(result.speed, 1.05);

  const result2 = validateOverrides({ speed: 0.9 });
  assert.strictEqual(result2.speed, 1.0);
});

test('validateOverrides preserves valid values', function() {
  const result = validateOverrides({
    brightness: 0.5,
    saturation: 1.2,
    hue: 45,
    pitch: 1.5,
    speed: 1.02,
    mode: 'left',
    crop: 0.5,
    cleanMetadata: false,
  });
  assert.strictEqual(result.brightness, 0.5);
  assert.strictEqual(result.saturation, 1.2);
  assert.strictEqual(result.hue, 45);
  assert.strictEqual(result.pitch, 1.5);
  assert.strictEqual(result.speed, 1.02);
  assert.strictEqual(result.mode, 'left');
  assert.strictEqual(result.crop, 0.5);
  assert.strictEqual(result.cleanMetadata, false);
});

test('validateOverrides strips unknown fields', function() {
  const result = validateOverrides({ brightness: 0.5, unknownField: 'test', another: 123 });
  assert.strictEqual(result.brightness, 0.5);
  assert.strictEqual(result.unknownField, undefined);
  assert.strictEqual(result.another, undefined);
});

test('validateOverrides handles boolean cleanMetadata', function() {
  assert.strictEqual(validateOverrides({ cleanMetadata: true }).cleanMetadata, true);
  assert.strictEqual(validateOverrides({ cleanMetadata: false }).cleanMetadata, false);
});

test('validateOverrides handles string mode', function() {
  assert.strictEqual(validateOverrides({ mode: 'left' }).mode, 'left');
  assert.strictEqual(validateOverrides({ mode: 'right' }).mode, 'right');
});

test('validateOverrides skips empty string values', function() {
  const result = validateOverrides({ brightness: '', mode: '' });
  assert.strictEqual(result.brightness, undefined);
  assert.strictEqual(result.mode, undefined);
});

// ─── getProfileConfigurationStatus ─────────────────────────────────────────────

test('getProfileConfigurationStatus returns INVALID for null profile', function() {
  const result = getProfileConfigurationStatus(null);
  assert.strictEqual(result.status, CONFIGURATION_STATUS.INVALID);
  assert.ok(result.warnings.length > 0);
});

test('getProfileConfigurationStatus returns INVALID for non-object', function() {
  const result = getProfileConfigurationStatus('invalid');
  assert.strictEqual(result.status, CONFIGURATION_STATUS.INVALID);
});

test('getProfileConfigurationStatus returns FALLBACK for profile with no preset refs', function() {
  const dir = tmpDir();
  try {
    const profile = createProfile({ name: 'Test', platform: 'Facebook', variationPreset: { speed: 1.02 } }, dir);
    const result = getProfileConfigurationStatus(profile, dir);
    assert.strictEqual(result.status, CONFIGURATION_STATUS.FALLBACK);
    assert.strictEqual(result.missingRefs.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('getProfileConfigurationStatus returns READY for profile with valid export preset ref', function() {
  const dir = tmpDir();
  try {
    const ep = createExportPreset({ name: 'Test EP', settings: { aspectRatio: '9:16', resolution: '1080p' } }, dir);
    const profile = createProfile({ name: 'Test', platform: 'Instagram', exportPresetId: ep.id }, dir);
    const result = getProfileConfigurationStatus(profile, dir);
    assert.strictEqual(result.status, CONFIGURATION_STATUS.READY);
    assert.strictEqual(result.missingRefs.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('getProfileConfigurationStatus returns INCOMPLETE for profile with missing preset ref', function() {
  const result = getProfileConfigurationStatus({
    id: 'test',
    name: 'Test',
    exportPresetId: 'nonexistent_export_preset',
    variationPresetId: 'nonexistent_variation_preset',
    captionTemplateId: 'nonexistent_caption_template',
  });
  assert.strictEqual(result.status, CONFIGURATION_STATUS.INCOMPLETE);
  assert.ok(result.missingRefs.includes('exportPreset'));
  assert.ok(result.missingRefs.includes('variationPreset'));
  assert.ok(result.missingRefs.includes('captionTemplate'));
  assert.ok(result.warnings.length >= 3);
});

test('getProfileConfigurationStatus returns READY for profile with valid variation preset', function() {
  const dir = tmpDir();
  try {
    const vp = createVariationPreset({ name: 'Test VP', variation: { speed: 1.03, saturation: 1.5 } }, dir);
    const profile = createProfile({ name: 'Test', platform: 'TikTok', variationPresetId: vp.id }, dir);
    const result = getProfileConfigurationStatus(profile, dir);
    assert.strictEqual(result.status, CONFIGURATION_STATUS.READY);
  } finally {
    cleanup(dir);
  }
});

// ─── resolveProfileConfiguration ───────────────────────────────────────────────

test('resolveProfileConfiguration returns defaults for null profile', function() {
  const result = resolveProfileConfiguration(null);
  assert.strictEqual(result.status, CONFIGURATION_STATUS.INVALID);
  assert.ok(result.variation);
  assert.strictEqual(result.variation.speed, 1.0);
  assert.strictEqual(result.variation.brightness, 0);
  assert.strictEqual(result.exportPreset, null);
  assert.strictEqual(result.captionTemplate, null);
  assert.deepStrictEqual(result.overrides, {});
  assert.ok(result.resolvedAt);
});

test('resolveProfileConfiguration layers inline variationPreset over defaults', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.03, saturation: 1.5, brightness: 0.2 },
  };
  const result = resolveProfileConfiguration(profile);
  assert.strictEqual(result.variation.speed, 1.03);
  assert.strictEqual(result.variation.saturation, 1.5);
  assert.strictEqual(result.variation.brightness, 0.2);
  assert.strictEqual(result.variation.hue, 0);
  assert.strictEqual(result.variation.pitch, 0);
});

test('resolveProfileConfiguration applies overrides on top of preset', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.02, saturation: 1.2 },
    overrides: { brightness: 0.5, speed: 1.04 },
  };
  const result = resolveProfileConfiguration(profile);
  assert.strictEqual(result.variation.brightness, 0.5);
  assert.strictEqual(result.variation.speed, 1.04);
  assert.strictEqual(result.variation.saturation, 1.2);
});

test('resolveProfileConfiguration resolves export preset when referenced', function() {
  const dir = tmpDir();
  try {
    const ep = createExportPreset({
      name: 'My EP',
      settings: { aspectRatio: '9:16', resolution: '1080p' },
    }, dir);
    const profile = createProfile({
      name: 'Test',
      platform: 'Facebook',
      exportPresetId: ep.id,
    }, dir);
    const result = resolveProfileConfiguration(profile, dir);
    assert.ok(result.exportPreset);
    assert.strictEqual(result.exportPreset.id, ep.id);
  } finally {
    cleanup(dir);
  }
});

test('resolveProfileConfiguration resolves caption template when referenced', function() {
  const dir = tmpDir();
  try {
    const ct = createCaptionTemplate({
      name: 'My CT',
      overlays: [{ text: 'Hello', position: 'center' }],
    }, dir);
    const profile = createProfile({
      name: 'Test',
      platform: 'YouTube',
      captionTemplateId: ct.id,
    }, dir);
    const result = resolveProfileConfiguration(profile, dir);
    assert.ok(result.captionTemplate);
    assert.strictEqual(result.captionTemplate.templateId, ct.id);
    assert.strictEqual(result.captionTemplate.templateName, 'My CT');
    assert.ok(Array.isArray(result.captionTemplate.overlays));
  } finally {
    cleanup(dir);
  }
});

test('resolveProfileConfiguration handles missing preset gracefully (INCOMPLETE)', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    exportPresetId: 'deleted_export_preset',
    variationPresetId: 'deleted_variation_preset',
    variationPreset: { speed: 1.02 },
  };
  const result = resolveProfileConfiguration(profile);
  assert.strictEqual(result.status, CONFIGURATION_STATUS.INCOMPLETE);
  assert.strictEqual(result.exportPreset, null);
  assert.strictEqual(result.variation.speed, 1.02);
});

test('resolveProfileConfiguration returns deep clone (no mutation)', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.02, saturation: 1.5 },
    overrides: { brightness: 0.3 },
  };
  const result1 = resolveProfileConfiguration(profile);
  const result2 = resolveProfileConfiguration(profile);
  result1.variation.speed = 999;
  assert.strictEqual(result2.variation.speed, 1.02);
});

// ─── getProfilePreview ─────────────────────────────────────────────────────────

test('getProfilePreview returns complete preview for null profile', function() {
  const result = getProfilePreview(null);
  assert.strictEqual(result.profileId, null);
  assert.strictEqual(result.profileName, 'Unknown');
  assert.strictEqual(result.configurationStatus, CONFIGURATION_STATUS.INVALID);
  assert.ok(result.resolvedConfiguration);
  assert.ok(result.previewedAt);
});

test('getProfilePreview returns preview with correct status and sources', function() {
  const profile = {
    id: 'prof_test',
    name: 'My Profile',
    platform: 'Instagram',
    enabled: true,
    variationPreset: { speed: 1.03 },
    exportPresetId: null,
    variationPresetId: null,
    captionTemplateId: null,
    overrides: { brightness: 0.2 },
  };
  const result = getProfilePreview(profile);
  assert.strictEqual(result.profileId, 'prof_test');
  assert.strictEqual(result.profileName, 'My Profile');
  assert.strictEqual(result.platform, 'Instagram');
  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.configurationStatus, CONFIGURATION_STATUS.FALLBACK);
  assert.strictEqual(result.sources.hasOverrides, true);
  assert.strictEqual(result.resolvedConfiguration.variation.brightness, 0.2);
  assert.strictEqual(result.resolvedConfiguration.variation.speed, 1.03);
});

test('getProfilePreview includes missing references', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    exportPresetId: 'nonexistent',
    variationPresetId: 'also_nonexistent',
  };
  const result = getProfilePreview(profile);
  assert.strictEqual(result.configurationStatus, CONFIGURATION_STATUS.INCOMPLETE);
  assert.ok(result.missingReferences.includes('exportPreset'));
  assert.ok(result.missingReferences.includes('variationPreset'));
  assert.ok(result.warnings.length >= 2);
});

// ─── diffProfileConfigurations ─────────────────────────────────────────────────

test('diffProfileConfigurations returns identical for same profile', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.02, saturation: 1.2 },
  };
  const result = diffProfileConfigurations(profile, profile);
  assert.strictEqual(result.identical, true);
  assert.deepStrictEqual(result.added, {});
  assert.deepStrictEqual(result.removed, {});
  assert.deepStrictEqual(result.changed, {});
});

test('diffProfileConfigurations detects changed fields', function() {
  const profileA = {
    id: 'a',
    name: 'A',
    variationPreset: { speed: 1.02, saturation: 1.2 },
  };
  const profileB = {
    id: 'b',
    name: 'B',
    variationPreset: { speed: 1.04, saturation: 1.2 },
  };
  const result = diffProfileConfigurations(profileA, profileB);
  assert.strictEqual(result.identical, false);
  assert.ok(result.changed.speed);
  assert.strictEqual(result.changed.speed.from, 1.02);
  assert.strictEqual(result.changed.speed.to, 1.04);
});

test('diffProfileConfigurations detects changed fields when one profile has a value the other defaults', function() {
  const profileA = {
    id: 'a',
    name: 'A',
    variationPreset: { speed: 1.02 },
  };
  const profileB = {
    id: 'b',
    name: 'B',
    variationPreset: { speed: 1.02, saturation: 1.5 },
  };
  const result = diffProfileConfigurations(profileA, profileB);
  assert.strictEqual(result.identical, false);
  // Both resolved configs have saturation (defaults fill in), so it's "changed" not "added"
  assert.ok(result.changed.saturation);
  assert.strictEqual(result.changed.saturation.from, 1);
  assert.strictEqual(result.changed.saturation.to, 1.5);
});

test('diffProfileConfigurations detects changes in both directions', function() {
  const profileA = {
    id: 'a',
    name: 'A',
    variationPreset: { speed: 1.02, saturation: 1.5 },
  };
  const profileB = {
    id: 'b',
    name: 'B',
    variationPreset: { speed: 1.02, saturation: 2.0 },
  };
  const result = diffProfileConfigurations(profileA, profileB);
  assert.strictEqual(result.identical, false);
  assert.ok(result.changed.saturation);
  assert.strictEqual(result.changed.saturation.from, 1.5);
  assert.strictEqual(result.changed.saturation.to, 2.0);
});

test('diffProfileConfigurations handles null profiles', function() {
  const result = diffProfileConfigurations(null, null);
  assert.strictEqual(result.identical, true);
});

test('diffProfileConfigurations compares overrides', function() {
  const profileA = {
    id: 'a',
    name: 'A',
    variationPreset: { speed: 1.02 },
    overrides: { brightness: 0.5 },
  };
  const profileB = {
    id: 'b',
    name: 'B',
    variationPreset: { speed: 1.02 },
    overrides: { brightness: -0.3 },
  };
  const result = diffProfileConfigurations(profileA, profileB);
  assert.strictEqual(result.identical, false);
  assert.ok(result.changed.brightness);
  assert.strictEqual(result.changed.brightness.from, 0.5);
  assert.strictEqual(result.changed.brightness.to, -0.3);
});

// ─── applyProfileConfiguration ─────────────────────────────────────────────────

test('applyProfileConfiguration merges variation into current config', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.03, saturation: 1.5, brightness: 0.2 },
  };
  const currentConfig = {
    variation: { speed: 1.0 },
    other: 'preserved',
  };
  const result = applyProfileConfiguration(profile, currentConfig);
  // Profile's resolved variation overrides speed (1.0 → 1.03), adds saturation/brightness
  assert.strictEqual(result.variation.speed, 1.03);
  assert.strictEqual(result.variation.saturation, 1.5);
  assert.strictEqual(result.variation.brightness, 0.2);
  assert.strictEqual(result.other, 'preserved');
  assert.strictEqual(result.profileId, 'test');
  assert.strictEqual(result.profileName, 'Test');
});

test('applyProfileConfiguration does not mutate input', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.03 },
  };
  const currentConfig = {
    variation: { speed: 1.0 },
  };
  const result = applyProfileConfiguration(profile, currentConfig);
  result.variation.speed = 999;
  assert.strictEqual(currentConfig.variation.speed, 1.0);
});

test('applyProfileConfiguration with empty current config', function() {
  const profile = {
    id: 'test',
    name: 'Test',
    variationPreset: { speed: 1.02 },
    overrides: { brightness: 0.3 },
  };
  const result = applyProfileConfiguration(profile, {});
  assert.strictEqual(result.variation.speed, 1.02);
  assert.strictEqual(result.variation.brightness, 0.3);
  assert.strictEqual(result.profileId, 'test');
});

test('applyProfileConfiguration with null profile', function() {
  const result = applyProfileConfiguration(null, { variation: { speed: 1.0 } });
  assert.strictEqual(result.variation.speed, 1.0);
  assert.strictEqual(result.profileId, null);
});

// ─── Profile CRUD with overrides ───────────────────────────────────────────────

test('createProfile stores overrides correctly', function() {
  const dir = tmpDir();
  try {
    const profile = createProfile({
      name: 'Override Test',
      platform: 'Facebook',
      overrides: { brightness: 0.5, speed: 1.03, mode: 'left' },
    }, dir);
    assert.deepStrictEqual(profile.overrides, { brightness: 0.5, speed: 1.03, mode: 'left' });

    const loaded = loadProfiles(dir);
    const found = loaded.profiles.find(p => p.id === profile.id);
    assert.deepStrictEqual(found.overrides, { brightness: 0.5, speed: 1.03, mode: 'left' });
  } finally {
    cleanup(dir);
  }
});

test('createProfile validates overrides bounds', function() {
  const dir = tmpDir();
  try {
    const profile = createProfile({
      name: 'Override Bounds Test',
      overrides: { brightness: 2.0, speed: 1.1 },
    }, dir);
    assert.strictEqual(profile.overrides.brightness, 1.0);
    assert.strictEqual(profile.overrides.speed, 1.05);
  } finally {
    cleanup(dir);
  }
});

test('createProfile defaults to empty overrides', function() {
  const dir = tmpDir();
  try {
    const profile = createProfile({ name: 'No Overrides' }, dir);
    assert.deepStrictEqual(profile.overrides, {});
  } finally {
    cleanup(dir);
  }
});

test('updateProfile can update overrides', function() {
  const dir = tmpDir();
  try {
    const profile = createProfile({
      name: 'Update Overrides',
      overrides: { brightness: 0.3 },
    }, dir);
    const updated = updateProfile(profile.id, {
      overrides: { brightness: -0.5, saturation: 2.0 },
    }, dir);
    assert.deepStrictEqual(updated.overrides, { brightness: -0.5, saturation: 2.0 });
  } finally {
    cleanup(dir);
  }
});

test('duplicateProfile clones overrides', function() {
  const dir = tmpDir();
  try {
    const profile = createProfile({
      name: 'Clone Overrides',
      overrides: { brightness: 0.4, speed: 1.02 },
    }, dir);
    const cloned = duplicateProfile(profile.id, dir);
    assert.deepStrictEqual(cloned.overrides, { brightness: 0.4, speed: 1.02 });
    cloned.overrides.brightness = 999;
    const original = loadProfiles(dir).profiles.find(p => p.id === profile.id);
    assert.strictEqual(original.overrides.brightness, 0.4);
  } finally {
    cleanup(dir);
  }
});

// ─── Export plan integration ───────────────────────────────────────────────────

test('resolveProfileConfiguration with export preset resolves inline variation from preset', function() {
  const dir = tmpDir();
  try {
    const ep = createExportPreset({
      name: 'EP with Variation',
      settings: {
        aspectRatio: '9:16',
        resolution: '1080p',
        variation: { enabled: true, speed: 1.03, saturation: 1.5 },
      },
    }, dir);
    const profile = createProfile({
      name: 'EP Test',
      exportPresetId: ep.id,
    }, dir);
    const result = resolveProfileConfiguration(profile, dir);
    assert.ok(result.exportPreset);
    assert.strictEqual(result.variation.speed, 1.03);
    assert.strictEqual(result.variation.saturation, 1.5);
  } finally {
    cleanup(dir);
  }
});

test('resolveProfileConfiguration with overrides takes precedence over export preset', function() {
  const dir = tmpDir();
  try {
    const ep = createExportPreset({
      name: 'EP for Override',
      settings: {
        aspectRatio: '9:16',
        resolution: '1080p',
        variation: { enabled: true, speed: 1.03, saturation: 1.5 },
      },
    }, dir);
    const profile = createProfile({
      name: 'Override EP Test',
      exportPresetId: ep.id,
      overrides: { speed: 1.04 },
    }, dir);
    const result = resolveProfileConfiguration(profile, dir);
    assert.strictEqual(result.variation.speed, 1.04);
    assert.strictEqual(result.variation.saturation, 1.5);
  } finally {
    cleanup(dir);
  }
});

// ─── Feature key ───────────────────────────────────────────────────────────────

test('INTELLIGENT_PROFILES feature key is defined', function() {
  const { FEATURE_KEYS } = require('../src/shared/features');
  assert.strictEqual(FEATURE_KEYS.INTELLIGENT_PROFILES, 'intelligent_profiles');
});

test('INTELLIGENT_PROFILES is in pro tier', function() {
  const { hasFeature } = require('../src/shared/features');
  assert.strictEqual(hasFeature('pro', 'intelligent_profiles'), true);
  assert.strictEqual(hasFeature('standard', 'intelligent_profiles'), false);
  assert.strictEqual(hasFeature('basic', 'intelligent_profiles'), false);
});

test('INTELLIGENT_PROFILES has correct metadata', function() {
  const { FEATURE_METADATA } = require('../src/shared/features');
  const meta = FEATURE_METADATA.find(f => f.key === 'intelligent_profiles');
  assert.ok(meta);
  assert.strictEqual(meta.name, 'Intelligent Profile Configuration');
  assert.strictEqual(meta.minTier, 'pro');
});

// ─── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.log('\nFailed tests:');
  errors.forEach(({ name, err }) => {
    console.log(`  - ${name}: ${err.message}`);
  });
}
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
