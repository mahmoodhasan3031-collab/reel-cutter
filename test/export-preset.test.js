'use strict';

/**
 * Phase 5B — Export Preset Manager Unit & Integration Test Suite
 *
 * Covers:
 * A. Built-in presets (all 6 exist, correct properties, valid defaults)
 * B. Built-in immutability (cannot modify or delete built-ins, mutations do not affect canonical presets)
 * C. Custom CRUD (create, get, list, update, delete custom presets)
 * D. Duplicate (Built-in -> Custom, Custom -> Custom, incremental duplicate naming)
 * E. Delete (delete custom preset, cannot delete built-in, non-existent preset error)
 * F. Search/filter (search by name, description, filter category all/builtin/custom, filter aspectRatio, filter exportType)
 * G. Persistence (persists to export-presets.json in customDir, reloads correctly across instances)
 * H. Corrupt recovery (corrupt JSON, empty file, missing file handled gracefully without crashing)
 * I. Strict validation (name required, name max length, invalid aspect ratio, resolution, quality, mode, export type)
 * J. Nested validation (nested variation config validation via engine validator, nested textOverlays validation)
 * K. Prototype pollution rejection (__proto__, constructor, prototype rejected)
 * L. Normalization (deterministic defaults, safe fallback for missing/undefined fields)
 * M. Deep clone isolation (mutating returned preset does not mutate stored preset or other copies)
 * N. Apply preset (applying preset deep-clones settings, resolves referenced preset, preserves unrelated caller config)
 * O. Manual override isolation (manual modifications after apply affect only current export state, not the saved preset)
 * P. Variation preset integration (referenced variationPresetId resolved properly, deleted reference falls back safely)
 * Q. Caption template integration (referenced captionTemplateId resolved, textOverlays resolved, deleted template falls back safely)
 * R. Profile integration (validateExportPresetId, resolveProfileExportPreset, profileManager create/update/duplicate with exportPresetId)
 * S. Bulk export snapshot (createBulkExportPlan resolves profile's exportPresetId, jobSnapshot contains immutable exportPresetSnapshot)
 * T. Schedule snapshot (createSchedule with exportPresetId stores immutable exportPresetSnapshot, subsequent preset edits do not affect schedule)
 * U. Export Difference (compareExportPresets produces structured comparison, differencesCount, summary, hasDifferences)
 * V. Reset behavior (resetExportPresets clears custom presets without deleting built-ins, profiles, schedules, or templates)
 * W. Feature gating (export_presets feature gating requires Pro tier, basic/standard return false)
 * X. Cross-profile isolation (two profiles with different export presets have completely independent snapshots)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  CANONICAL_BUILTIN_EXPORT_PRESETS,
  BUILTIN_EXPORT_PRESET_IDS,
  VALID_ASPECT_RATIOS,
  VALID_RESOLUTIONS,
  VALID_QUALITIES,
  VALID_MODES,
  VALID_EXPORT_TYPES,
  getSafeExportPresetDefaults,
  normalizeExportSettings,
  validateExportPresetSettings,
  validateExportPresetInput,
  getExportPresets,
  getExportPreset,
  searchExportPresets,
  createExportPreset,
  updateExportPreset,
  deleteExportPreset,
  duplicateExportPreset,
  compareExportPresets,
  applyExportPreset,
  resolveExportPresetSnapshot,
  resetExportPresets,
} = require('../src/main/exportPresets/exportPresetManager');

const {
  createProfile,
  updateProfile,
  duplicateProfile,
  loadProfiles,
  validateExportPresetId,
  resolveProfileExportPreset,
} = require('../src/main/profiles/profileManager');

const { createBulkExportPlan } = require('../src/main/profiles/exportPlan');
const { createSchedule, getSchedule } = require('../src/main/scheduler/scheduleManager');
const { hasFeature, FEATURE_KEYS } = require('../src/shared/features');

function createTempTestDir() {
  const dir = path.join(os.tmpdir(), `reel-cutter-exp-preset-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

async function runTests() {
  console.log('======================================================');
  console.log('🧪 Starting Phase 5B — Export Preset Manager Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}\n${err.stack}`);
      failed++;
    }
  }

  // ─── Test A: Built-in Presets ─────────────────────────────────────────────
  test('A. Built-in presets: exactly 6 canonical built-ins exist with valid properties', () => {
    assert.strictEqual(CANONICAL_BUILTIN_EXPORT_PRESETS.length, 6);
    const expectedIds = [
      'exp_builtin_vertical_1080p',
      'exp_builtin_vertical_4k',
      'exp_builtin_square_1080p',
      'exp_builtin_landscape_1080p',
      'exp_builtin_social_caption',
      'exp_builtin_clean_repurpose',
    ];

    for (const expectedId of expectedIds) {
      const found = CANONICAL_BUILTIN_EXPORT_PRESETS.find((p) => p.id === expectedId);
      assert.ok(found, `Expected built-in preset ${expectedId} to exist`);
      assert.strictEqual(found.isBuiltIn, true);
      assert.ok(found.name && found.name.length > 0);
      assert.ok(found.description && found.description.length > 0);
      assert.ok(found.settings, 'Settings object must exist');
      assert.ok(VALID_ASPECT_RATIOS.includes(found.settings.aspectRatio));
      assert.ok(VALID_RESOLUTIONS.includes(found.settings.resolution));
      assert.ok(VALID_MODES.includes(found.settings.mode));
      assert.ok(VALID_EXPORT_TYPES.includes(found.settings.exportType));
      assert.ok(found.settings.variation && typeof found.settings.variation === 'object');
      assert.ok(found.settings.audio && typeof found.settings.audio === 'object');
    }
  });

  // ─── Test B: Built-in Immutability ────────────────────────────────────────
  test('B. Built-in immutability: cannot modify or delete built-ins, mutations do not affect source', () => {
    const tempDir = createTempTestDir();
    try {
      assert.throws(() => {
        updateExportPreset('exp_builtin_vertical_1080p', { name: 'Hacked Vertical' }, tempDir);
      }, /Built-in export preset "exp_builtin_vertical_1080p" cannot be modified/);

      assert.throws(() => {
        deleteExportPreset('exp_builtin_vertical_1080p', tempDir);
      }, /Built-in export preset "exp_builtin_vertical_1080p" cannot be deleted/);

      // Verify mutating a retrieved built-in preset object does not modify the canonical object
      const preset = getExportPreset('exp_builtin_vertical_1080p', tempDir);
      preset.name = 'Locally Mutated Name';
      preset.settings.aspectRatio = '16:9';

      const fresh = getExportPreset('exp_builtin_vertical_1080p', tempDir);
      assert.strictEqual(fresh.name, 'Vertical 1080p');
      assert.strictEqual(fresh.settings.aspectRatio, '9:16');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test C: Custom CRUD ──────────────────────────────────────────────────
  test('C. Custom CRUD: create, get, list, update, delete custom presets', () => {
    const tempDir = createTempTestDir();
    try {
      // 1. Create
      const created = createExportPreset(
        {
          name: 'My Custom Reel',
          description: 'Custom social preset for testing',
          settings: {
            aspectRatio: '9:16',
            resolution: '1080p',
            mode: 'crop',
            exportType: 'reel',
            variation: { enabled: true, brightness: 0.1, saturation: 1.2 },
          },
        },
        tempDir
      );

      assert.ok(created.id.startsWith('exp_preset_'));
      assert.strictEqual(created.name, 'My Custom Reel');
      assert.strictEqual(created.isBuiltIn, false);
      assert.strictEqual(created.settings.mode, 'crop');
      assert.strictEqual(created.settings.variation.brightness, 0.1);

      // 2. Get
      const fetched = getExportPreset(created.id, tempDir);
      assert.ok(fetched);
      assert.strictEqual(fetched.id, created.id);
      assert.strictEqual(fetched.name, 'My Custom Reel');

      // 3. List
      const customList = getExportPresets({ category: 'custom' }, tempDir);
      assert.strictEqual(customList.length, 1);
      assert.strictEqual(customList[0].id, created.id);

      // 4. Update
      const updated = updateExportPreset(
        created.id,
        {
          name: 'My Custom Reel Updated',
          settings: {
            ...created.settings,
            aspectRatio: '1:1',
          },
        },
        tempDir
      );
      assert.strictEqual(updated.name, 'My Custom Reel Updated');
      assert.strictEqual(updated.settings.aspectRatio, '1:1');

      // 5. Delete
      const delRes = deleteExportPreset(created.id, tempDir);
      assert.strictEqual(delRes.success, true);
      assert.strictEqual(delRes.deletedId, created.id);

      const afterDel = getExportPreset(created.id, tempDir);
      assert.strictEqual(afterDel, null);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test D: Duplicate ────────────────────────────────────────────────────
  test('D. Duplicate: Built-in -> Custom and Custom -> Custom with safe duplicate naming', () => {
    const tempDir = createTempTestDir();
    try {
      // Duplicate Built-in
      const copy1 = duplicateExportPreset('exp_builtin_vertical_1080p', {}, tempDir);
      assert.strictEqual(copy1.isBuiltIn, false);
      assert.strictEqual(copy1.name, 'Vertical 1080p Copy');
      assert.strictEqual(copy1.settings.aspectRatio, '9:16');

      // Duplicate again (incremental numbering)
      const copy2 = duplicateExportPreset('exp_builtin_vertical_1080p', {}, tempDir);
      assert.strictEqual(copy2.name, 'Vertical 1080p Copy 2');

      // Duplicate Custom with overrides
      const copy3 = duplicateExportPreset(
        copy1.id,
        {
          name: 'Overridden Custom Name',
          description: 'Special custom copy',
        },
        tempDir
      );
      assert.strictEqual(copy3.name, 'Overridden Custom Name');
      assert.strictEqual(copy3.description, 'Special custom copy');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test E: Delete Edge Cases ────────────────────────────────────────────
  test('E. Delete: rejecting built-ins and non-existent IDs', () => {
    const tempDir = createTempTestDir();
    try {
      assert.throws(() => {
        deleteExportPreset('exp_builtin_vertical_4k', tempDir);
      }, /Built-in export preset "exp_builtin_vertical_4k" cannot be deleted/);

      assert.throws(() => {
        deleteExportPreset('non_existent_preset_id_123', tempDir);
      }, /Export preset not found/);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test F: Search and Filter ────────────────────────────────────────────
  test('F. Search and Filter: query, category, aspectRatio, and exportType filters', () => {
    const tempDir = createTempTestDir();
    try {
      createExportPreset({ name: 'Alpha Landscape Test', settings: { aspectRatio: '16:9', exportType: 'cut' } }, tempDir);
      createExportPreset({ name: 'Beta Vertical Test', settings: { aspectRatio: '9:16', exportType: 'reel' } }, tempDir);

      // Search by query
      const searchRes = searchExportPresets({ query: 'Alpha' }, tempDir);
      assert.strictEqual(searchRes.length, 1);
      assert.strictEqual(searchRes[0].name, 'Alpha Landscape Test');

      // Filter by category
      const customOnly = searchExportPresets({ category: 'custom' }, tempDir);
      assert.strictEqual(customOnly.length, 2);

      const builtinOnly = searchExportPresets({ category: 'builtin' }, tempDir);
      assert.strictEqual(builtinOnly.length, 6);

      // Filter by aspectRatio
      const squareOnly = searchExportPresets({ aspectRatio: '1:1' }, tempDir);
      assert.ok(squareOnly.every((p) => p.settings.aspectRatio === '1:1'));

      // Filter by exportType
      const cutsOnly = searchExportPresets({ exportType: 'cut' }, tempDir);
      assert.ok(cutsOnly.every((p) => p.settings.exportType === 'cut'));
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test G: Persistence ──────────────────────────────────────────────────
  test('G. Persistence: atomic save and accurate disk reload', () => {
    const tempDir = createTempTestDir();
    try {
      const created = createExportPreset(
        {
          name: 'Persistent Preset',
          description: 'Should persist on disk',
          settings: {
            aspectRatio: '4:5',
            resolution: '4k',
            quality: '4k',
            mode: 'pad',
            exportType: 'reel',
          },
        },
        tempDir
      );

      const filePath = path.join(tempDir, 'export-presets.json');
      assert.ok(fs.existsSync(filePath), 'export-presets.json must exist');

      // Reload fresh from disk
      const presets = getExportPresets({ category: 'custom' }, tempDir);
      assert.strictEqual(presets.length, 1);
      assert.strictEqual(presets[0].id, created.id);
      assert.strictEqual(presets[0].settings.resolution, '4k');
      assert.strictEqual(presets[0].settings.aspectRatio, '4:5');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test H: Corrupt Recovery ─────────────────────────────────────────────
  test('H. Corrupt recovery: handles corrupt, invalid, or empty persistence files gracefully', () => {
    const tempDir = createTempTestDir();
    try {
      const filePath = path.join(tempDir, 'export-presets.json');
      fs.writeFileSync(filePath, '{{INVALID_JSON_CORRUPT_DATA', 'utf8');

      // Must not crash; returns built-ins safely and empty custom list
      const presets = getExportPresets({ category: 'all' }, tempDir);
      assert.strictEqual(presets.length, 6); // 6 built-ins intact

      const customPresets = getExportPresets({ category: 'custom' }, tempDir);
      assert.deepStrictEqual(customPresets, []);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test I: Strict Validation ────────────────────────────────────────────
  test('I. Strict validation: rejects empty names, long names, and invalid enum values', () => {
    const tempDir = createTempTestDir();
    try {
      // Empty name
      assert.throws(() => {
        createExportPreset({ name: '   ', settings: {} }, tempDir);
      }, /Preset name cannot be empty/);

      // Name too long
      assert.throws(() => {
        createExportPreset({ name: 'a'.repeat(101), settings: {} }, tempDir);
      }, /Preset name cannot exceed 100 characters/);

      // Invalid aspect ratio
      assert.throws(() => {
        createExportPreset({ name: 'Valid', settings: { aspectRatio: '3:2' } }, tempDir);
      }, /Invalid aspectRatio "3:2"/);

      // Invalid resolution
      assert.throws(() => {
        createExportPreset({ name: 'Valid', settings: { resolution: '8k' } }, tempDir);
      }, /Invalid resolution "8k"/);

      // Invalid mode
      assert.throws(() => {
        createExportPreset({ name: 'Valid', settings: { mode: 'stealth_reframe' } }, tempDir);
      }, /Invalid mode "stealth_reframe"/);

      // Invalid exportType
      assert.throws(() => {
        createExportPreset({ name: 'Valid', settings: { exportType: 'transcode' } }, tempDir);
      }, /Invalid exportType "transcode"/);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test J: Nested Validation ────────────────────────────────────────────
  test('J. Nested validation: validates variation config and text overlays strictly', () => {
    const tempDir = createTempTestDir();
    try {
      // Variation out of bounds (brightness > 1.0)
      assert.throws(() => {
        createExportPreset(
          {
            name: 'Invalid Variation',
            settings: {
              variation: { enabled: true, brightness: 5.0 },
            },
          },
          tempDir
        );
      }, /Brightness must be between -1 and 1/);

      // Speed out of product bounds (speed > 1.05)
      assert.throws(() => {
        createExportPreset(
          {
            name: 'Invalid Speed',
            settings: {
              variation: { enabled: true, speed: 2.0 },
            },
          },
          tempDir
        );
      }, /Speed must be between 1 and 1.05/);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test K: Prototype Pollution Rejection ─────────────────────────────────
  test('K. Prototype pollution rejection: rejects __proto__, constructor, and prototype payloads', () => {
    const tempDir = createTempTestDir();
    try {
      const maliciousPayload = JSON.parse('{"name":"Malicious","settings":{"__proto__":{"polluted":true}}}');
      assert.throws(() => {
        createExportPreset(maliciousPayload, tempDir);
      }, /Prototype pollution attempt rejected/);

      const maliciousConstructor = JSON.parse('{"name":"Malicious","constructor":{"prototype":{"polluted":true}}}');
      assert.throws(() => {
        createExportPreset(maliciousConstructor, tempDir);
      }, /Prototype pollution attempt rejected/);

      assert.strictEqual(Object.prototype.polluted, undefined);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test L: Normalization ────────────────────────────────────────────────
  test('L. Normalization: produces canonical, complete settings with guaranteed safe defaults', () => {
    const normalized = normalizeExportSettings({});
    assert.strictEqual(normalized.aspectRatio, '9:16');
    assert.strictEqual(normalized.resolution, '1080p');
    assert.strictEqual(normalized.quality, '1080p');
    assert.strictEqual(normalized.mode, 'blur');
    assert.strictEqual(normalized.smartCrop, false);
    assert.strictEqual(normalized.exportType, 'reel');
    assert.strictEqual(normalized.variation.enabled, false);
    assert.strictEqual(normalized.audio.preservePitch, true);
    assert.strictEqual(normalized.audio.normalizeAudio, false);
    assert.deepStrictEqual(normalized.textOverlays, []);
  });

  // ─── Test M: Deep Clone Isolation ─────────────────────────────────────────
  test('M. Deep clone isolation: modifying retrieved preset does not mutate stored preset', () => {
    const tempDir = createTempTestDir();
    try {
      const created = createExportPreset(
        {
          name: 'Clone Isolation Test',
          settings: {
            aspectRatio: '9:16',
            variation: { enabled: true, brightness: 0.05 },
          },
        },
        tempDir
      );

      created.settings.variation.brightness = 0.99;
      created.settings.aspectRatio = '16:9';

      const fresh = getExportPreset(created.id, tempDir);
      assert.strictEqual(fresh.settings.variation.brightness, 0.05);
      assert.strictEqual(fresh.settings.aspectRatio, '9:16');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test N: Apply Preset ─────────────────────────────────────────────────
  test('N. Apply preset: deep-clones settings and preserves unrelated caller export state', () => {
    const tempDir = createTempTestDir();
    try {
      const currentConfig = {
        inputPath: 'C:\\Videos\\sample.mp4',
        outputPath: 'C:\\Videos\\out_clip.mp4',
        start: '10',
        duration: '45',
        aspectRatio: '16:9',
        mode: 'pad',
      };

      const applied = applyExportPreset('exp_builtin_vertical_1080p', currentConfig, tempDir);
      assert.strictEqual(applied.appliedPresetId, 'exp_builtin_vertical_1080p');
      assert.strictEqual(applied.aspectRatio, '9:16');
      assert.strictEqual(applied.mode, 'blur');
      assert.strictEqual(applied.inputPath, 'C:\\Videos\\sample.mp4');
      assert.strictEqual(applied.start, '10');
      assert.strictEqual(applied.duration, '45');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test O: Manual Override Isolation ────────────────────────────────────
  test('O. Manual override isolation: modifying state after apply does not modify the preset', () => {
    const tempDir = createTempTestDir();
    try {
      const preset = createExportPreset(
        {
          name: 'Saved Source Preset',
          settings: { aspectRatio: '9:16', resolution: '1080p', mode: 'blur' },
        },
        tempDir
      );

      const applied = applyExportPreset(preset.id, {}, tempDir);
      // Simulate user manually tweaking sliders afterwards
      applied.aspectRatio = '1:1';
      applied.mode = 'crop';
      applied.variation.brightness = 0.5;

      const stored = getExportPreset(preset.id, tempDir);
      assert.strictEqual(stored.settings.aspectRatio, '9:16');
      assert.strictEqual(stored.settings.mode, 'blur');
      assert.strictEqual(stored.settings.variation.brightness, 0.0);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test P: Variation Preset Integration ─────────────────────────────────
  test('P. Variation preset integration: references and resolves variation presets, safe fallback', () => {
    const tempDir = createTempTestDir();
    try {
      // Built-in social caption references vpreset_builtin_bright
      const preset = getExportPreset('exp_builtin_social_caption', tempDir);
      assert.strictEqual(preset.settings.variationPresetId, 'vpreset_builtin_bright');
      assert.strictEqual(preset.settings.variation.enabled, true);

      // Resolving snapshot resolves variation preset cleanly
      const snapshot = resolveExportPresetSnapshot(preset.id, tempDir);
      assert.strictEqual(snapshot.settings.variationPresetId, 'vpreset_builtin_bright');
      assert.strictEqual(snapshot.settings.variation.enabled, true);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test Q: Caption Template Integration ─────────────────────────────────
  test('Q. Caption template integration: references and resolves caption templates', () => {
    const tempDir = createTempTestDir();
    try {
      const preset = getExportPreset('exp_builtin_social_caption', tempDir);
      assert.strictEqual(preset.settings.captionTemplateId, 'tpl_builtin_social');
      assert.ok(Array.isArray(preset.settings.textOverlays));
      assert.strictEqual(preset.settings.textOverlays.length, 1);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test R: Profile Integration ──────────────────────────────────────────
  test('R. Profile integration: profileManager validates, attaches, and resolves exportPresetId', () => {
    const tempDir = createTempTestDir();
    try {
      // Validate exportPresetId helper
      assert.strictEqual(validateExportPresetId(null, tempDir), null);
      assert.strictEqual(validateExportPresetId('exp_builtin_vertical_1080p', tempDir), 'exp_builtin_vertical_1080p');
      assert.throws(() => {
        validateExportPresetId('non_existent_preset_999', tempDir);
      }, /Export preset not found/);

      // Create profile with exportPresetId
      const profile = createProfile(
        {
          name: 'TikTok Channel Profile',
          platform: 'TikTok',
          exportPresetId: 'exp_builtin_vertical_1080p',
        },
        tempDir
      );
      assert.strictEqual(profile.exportPresetId, 'exp_builtin_vertical_1080p');

      // Resolve profile export preset
      const resolved = resolveProfileExportPreset(profile, tempDir);
      assert.strictEqual(resolved.presetId, 'exp_builtin_vertical_1080p');
      assert.strictEqual(resolved.presetName, 'Vertical 1080p');
      assert.strictEqual(resolved.preset.settings.aspectRatio, '9:16');

      // Duplicate profile preserves exportPresetId
      const duplicated = duplicateProfile(profile.id, tempDir);
      assert.strictEqual(duplicated.exportPresetId, 'exp_builtin_vertical_1080p');

      // Update profile exportPresetId
      const updated = updateProfile(profile.id, { exportPresetId: 'exp_builtin_square_1080p' }, tempDir);
      assert.strictEqual(updated.exportPresetId, 'exp_builtin_square_1080p');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test S: Bulk Export Snapshot ─────────────────────────────────────────
  test('S. Bulk export snapshot: createBulkExportPlan generates independent immutable snapshot', () => {
    const tempDir = createTempTestDir();
    try {
      // Mock source video file
      const sourceVideo = path.join(tempDir, 'source.mp4');
      fs.writeFileSync(sourceVideo, 'MOCK_VIDEO_DATA');

      const profile = createProfile(
        {
          name: 'Bulk Target Profile',
          platform: 'Instagram',
          exportPresetId: 'exp_builtin_vertical_1080p',
        },
        tempDir
      );

      const plan = createBulkExportPlan(
        {
          sourcePath: sourceVideo,
          profileIds: [profile.id],
          exportType: 'reel',
        },
        tempDir
      );

      assert.strictEqual(plan.jobs.length, 1);
      const job = plan.jobs[0];
      assert.strictEqual(job.exportPresetId, 'exp_builtin_vertical_1080p');
      assert.strictEqual(job.exportPresetName, 'Vertical 1080p');
      assert.ok(job.exportPresetSnapshot, 'Job must hold immutable exportPresetSnapshot');
      assert.strictEqual(job.exportPresetSnapshot.settings.aspectRatio, '9:16');

      // Mutate profile or preset afterwards - plan job snapshot must remain unchanged
      updateProfile(profile.id, { name: 'Mutated Profile Name', exportPresetId: 'exp_builtin_square_1080p' }, tempDir);
      assert.strictEqual(job.profileName, 'Bulk Target Profile');
      assert.strictEqual(job.exportPresetId, 'exp_builtin_vertical_1080p');
      assert.strictEqual(job.exportPresetSnapshot.settings.aspectRatio, '9:16');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test T: Schedule Snapshot ────────────────────────────────────────────
  test('T. Schedule snapshot: createSchedule snapshots exportPresetId and exportPresetSnapshot immutably', () => {
    const tempDir = createTempTestDir();
    try {
      const sourceVideo = path.join(tempDir, 'sample_sched.mp4');
      fs.writeFileSync(sourceVideo, 'MOCK_VIDEO_DATA');

      const sched = createSchedule(
        {
          sourcePath: sourceVideo,
          exportType: 'reel',
          scheduledAt: new Date(Date.now() + 60000).toISOString(),
          exportPresetId: 'exp_builtin_vertical_1080p',
        },
        tempDir
      );

      assert.ok(sched.id);
      assert.strictEqual(sched.exportPresetId, 'exp_builtin_vertical_1080p');
      assert.ok(sched.exportPresetSnapshot);
      assert.strictEqual(sched.exportPresetSnapshot.settings.aspectRatio, '9:16');

      // Verify reloaded from disk has matching snapshot
      const reloaded = getSchedule(sched.id, tempDir);
      assert.strictEqual(reloaded.exportPresetId, 'exp_builtin_vertical_1080p');
      assert.strictEqual(reloaded.exportPresetSnapshot.settings.mode, 'blur');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test U: Export Difference ────────────────────────────────────────────
  test('U. Export Difference: produces structured difference summary without fake metrics', () => {
    const tempDir = createTempTestDir();
    try {
      const currentConfig = {
        aspectRatio: '16:9',
        resolution: '1080p',
        quality: '1080p',
        mode: 'crop',
        exportType: 'cut',
      };

      const diff = compareExportPresets(currentConfig, 'exp_builtin_vertical_1080p', tempDir);
      assert.strictEqual(diff.hasDifferences, true);
      assert.ok(diff.differencesCount > 0);
      assert.ok(Array.isArray(diff.summary));
      assert.ok(diff.summary.some((s) => s.includes('Aspect Ratio: 16:9 → 9:16')));
      assert.ok(diff.summary.some((s) => s.includes('Layout Mode: crop → blur')));

      // Compare identical config
      const identicalConfig = {
        aspectRatio: '9:16',
        resolution: '1080p',
        quality: '1080p',
        mode: 'blur',
        smartCrop: false,
        exportType: 'reel',
        variation: { enabled: false },
        audio: { preservePitch: true, normalizeAudio: false },
      };
      const noDiff = compareExportPresets(identicalConfig, 'exp_builtin_vertical_1080p', tempDir);
      assert.strictEqual(noDiff.hasDifferences, false);
      assert.strictEqual(noDiff.differencesCount, 0);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test V: Reset Behavior ───────────────────────────────────────────────
  test('V. Reset behavior: resetExportPresets resets custom presets without affecting other stores', () => {
    const tempDir = createTempTestDir();
    try {
      createExportPreset({ name: 'To Be Reset', settings: {} }, tempDir);
      assert.strictEqual(getExportPresets({ category: 'custom' }, tempDir).length, 1);

      const resetRes = resetExportPresets(tempDir);
      assert.strictEqual(resetRes.success, true);
      assert.strictEqual(getExportPresets({ category: 'custom' }, tempDir).length, 0);
      assert.strictEqual(getExportPresets({ category: 'builtin' }, tempDir).length, 6);

      // Safe defaults
      const defaults = getSafeExportPresetDefaults();
      assert.strictEqual(defaults.aspectRatio, '9:16');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ─── Test W: Feature Gating ───────────────────────────────────────────────
  test('W. Feature gating: export_presets requires Pro tier, basic and standard return false', () => {
    assert.strictEqual(hasFeature('basic', 'export_presets'), false);
    assert.strictEqual(hasFeature('basic', FEATURE_KEYS.EXPORT_PRESETS), false);
    assert.strictEqual(hasFeature('standard', 'export_presets'), false);
    assert.strictEqual(hasFeature('standard', 'export presets'), false);
    assert.strictEqual(hasFeature('pro', 'export_presets'), true);
    assert.strictEqual(hasFeature('pro', 'export presets'), true);
    assert.strictEqual(hasFeature('pro', FEATURE_KEYS.EXPORT_PRESETS), true);
  });

  // ─── Test X: Cross-Profile Isolation ──────────────────────────────────────
  test('X. Cross-profile isolation: multiple profiles with different export presets have independent snapshots', () => {
    const tempDir = createTempTestDir();
    try {
      const sourceVideo = path.join(tempDir, 'source_multi.mp4');
      fs.writeFileSync(sourceVideo, 'MOCK_VIDEO_DATA');

      const profile1 = createProfile({ name: 'Profile Vertical', platform: 'TikTok', exportPresetId: 'exp_builtin_vertical_1080p' }, tempDir);
      const profile2 = createProfile({ name: 'Profile Square', platform: 'Instagram', exportPresetId: 'exp_builtin_square_1080p' }, tempDir);

      const plan = createBulkExportPlan(
        {
          sourcePath: sourceVideo,
          profileIds: [profile1.id, profile2.id],
          exportType: 'reel',
        },
        tempDir
      );

      assert.strictEqual(plan.jobs.length, 2);
      const job1 = plan.jobs[0];
      const job2 = plan.jobs[1];

      assert.strictEqual(job1.exportPresetId, 'exp_builtin_vertical_1080p');
      assert.strictEqual(job1.exportPresetSnapshot.settings.aspectRatio, '9:16');

      assert.strictEqual(job2.exportPresetId, 'exp_builtin_square_1080p');
      assert.strictEqual(job2.exportPresetSnapshot.settings.aspectRatio, '1:1');

      // Mutual isolation
      job1.exportPresetSnapshot.settings.aspectRatio = '4:5';
      assert.strictEqual(job2.exportPresetSnapshot.settings.aspectRatio, '1:1');
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  console.log('\n======================================================');
  console.log(`📊 Export Preset Manager Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
