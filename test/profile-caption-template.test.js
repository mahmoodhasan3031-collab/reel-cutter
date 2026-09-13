'use strict';

/**
 * Phase 4B-3 — Per-Profile Caption Templates Test Suite
 *
 * Covers:
 *  A. Existing profile without captionTemplateId migrates to null
 *  B. Create profile with null captionTemplateId
 *  C. Create profile with valid built-in template
 *  D. Create profile with valid custom template
 *  E. Invalid template ID rejected
 *  F. Edit profile caption template
 *  G. Clear caption template
 *  H. Duplicate profile preserves captionTemplateId
 *  I. Delete profile does not delete template
 *  J. Disabled profile behavior remains correct
 *  K. Template list is refreshed
 *  L. Export selector resolves caption template
 *  M. No-template profile resolves to no overlays
 *  N. Valid template overlays are deep cloned
 *  O. Mutating resolved overlays does not mutate stored template
 *  P. Bulk export plan includes captionTemplateId
 *  Q. Bulk export plan includes captionTemplateName
 *  R. Bulk export plan includes textOverlays snapshot
 *  S. Plan snapshot remains unchanged after template mutation
 *  T. Plan snapshot remains unchanged after profile mutation
 *  U. Cut receives caption snapshot
 *  V. Reel receives caption snapshot
 *  W. Split receives caption snapshot
 *  X. Schedule receives caption snapshot
 *  Y. Schedule remains unchanged after template mutation
 *  Z. Built-in template association works
 *  AA. Custom template association works
 *  AB. Deleted template is handled safely
 *  AC. Renderer cannot inject arbitrary caption configuration
 *  AD. Invalid overlay snapshot rejected
 *  AE. Existing profile tests still pass
 *  AF. Existing bulk export tests still pass
 *  AG. Existing scheduler tests still pass
 *  AH. Existing text overlay tests still pass
 *  AI. Existing caption template tests still pass
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  loadProfiles,
  saveProfiles,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  validateCaptionTemplateId,
  resolveProfileCaptionTemplate,
} = require('../src/main/profiles/profileManager');

const {
  CANONICAL_BUILTINS,
  getCaptionTemplates,
  getCaptionTemplate,
  createCaptionTemplate,
  updateCaptionTemplate,
  deleteCaptionTemplate,
} = require('../src/main/captions/captionTemplateManager');

const {
  createBulkExportPlan,
  planToBatchQueueItems,
} = require('../src/main/profiles/exportPlan');

const {
  validateBulkExportPlan,
} = require('../src/main/profiles/bulkExecutor');

const {
  createBulkSchedule,
} = require('../src/main/scheduler/bulkScheduleManager');

const {
  getSchedule,
} = require('../src/main/scheduler/scheduleManager');

console.log('======================================================');
console.log('🧪 Running Phase 4B-3 Per-Profile Caption Template Tests');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_profile_caption_test_'));
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

const sampleOverlay = {
  id: 'ovl_sample_1',
  text: 'Sample Subtitle',
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 'normal',
  color: '#FFFFFF',
  opacity: 1,
  backgroundColor: '#000000',
  backgroundOpacity: 0.4,
  outlineColor: '#000000',
  outlineWidth: 1,
  position: 'bottom',
  x: 0.5,
  y: 0.9,
  alignment: 'center',
  startTime: 0,
  endTime: null,
  enabled: true,
};

// ── Tests A through AI ────────────────────────────────────────────────────────

// A. Existing profile without captionTemplateId migrates to null
test('A. Existing profile without captionTemplateId migrates to null', () => {
  const tmp = makeTmpDir();
  try {
    const legacyPath = path.join(tmp, 'profiles.json');
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        selectedProfileId: 'prof_legacy_1',
        profiles: [
          {
            id: 'prof_legacy_1',
            name: 'Legacy Profile',
            platform: 'Facebook',
            enabled: true,
            variationPreset: { brightness: 0 },
          },
        ],
      }),
      'utf8'
    );

    const loaded = loadProfiles(tmp);
    assert.strictEqual(loaded.profiles.length, 1);
    assert.strictEqual(loaded.profiles[0].id, 'prof_legacy_1');
    assert.strictEqual(loaded.profiles[0].captionTemplateId, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// B. Create profile with null captionTemplateId
test('B. Create profile with null captionTemplateId', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Profile Without Caption',
        platform: 'YouTube',
        captionTemplateId: null,
      },
      tmp
    );
    assert.strictEqual(prof.captionTemplateId, null);

    const list = listProfiles(tmp);
    const found = list.find((p) => p.id === prof.id);
    assert.strictEqual(found.captionTemplateId, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// C. Create profile with valid built-in template
test('C. Create profile with valid built-in template', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Profile Clean Minimal',
        platform: 'Instagram',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );
    assert.strictEqual(prof.captionTemplateId, 'tpl_builtin_clean');

    const loaded = loadProfiles(tmp);
    const found = loaded.profiles.find((p) => p.id === prof.id);
    assert.strictEqual(found.captionTemplateId, 'tpl_builtin_clean');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// D. Create profile with valid custom template
test('D. Create profile with valid custom template', () => {
  const tmp = makeTmpDir();
  try {
    const customTpl = createCaptionTemplate(
      {
        name: 'Custom Brand Preset',
        description: 'Brand colors',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Brand Profile',
        platform: 'TikTok',
        captionTemplateId: customTpl.id,
      },
      tmp
    );
    assert.strictEqual(prof.captionTemplateId, customTpl.id);

    const loaded = loadProfiles(tmp);
    const found = loaded.profiles.find((p) => p.id === prof.id);
    assert.strictEqual(found.captionTemplateId, customTpl.id);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// E. Invalid template ID rejected
test('E. Invalid template ID rejected', () => {
  const tmp = makeTmpDir();
  try {
    assert.throws(() => {
      createProfile(
        {
          name: 'Invalid Template Profile',
          captionTemplateId: 'non_existent_template_id_123',
        },
        tmp
      );
    }, /Caption template not found/);

    assert.throws(() => {
      validateCaptionTemplateId(12345, tmp);
    }, /must be a string or null/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// F. Edit profile caption template
test('F. Edit profile caption template', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Editable Profile',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const updated = updateProfile(
      prof.id,
      {
        captionTemplateId: 'tpl_builtin_bold',
      },
      tmp
    );
    assert.strictEqual(updated.captionTemplateId, 'tpl_builtin_bold');

    const loaded = loadProfiles(tmp);
    const found = loaded.profiles.find((p) => p.id === prof.id);
    assert.strictEqual(found.captionTemplateId, 'tpl_builtin_bold');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// G. Clear caption template
test('G. Clear caption template', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Profile To Clear',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );
    assert.strictEqual(prof.captionTemplateId, 'tpl_builtin_clean');

    const updated = updateProfile(
      prof.id,
      {
        captionTemplateId: null,
      },
      tmp
    );
    assert.strictEqual(updated.captionTemplateId, null);

    const loaded = loadProfiles(tmp);
    const found = loaded.profiles.find((p) => p.id === prof.id);
    assert.strictEqual(found.captionTemplateId, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// H. Duplicate profile preserves captionTemplateId
test('H. Duplicate profile preserves captionTemplateId', () => {
  const tmp = makeTmpDir();
  try {
    const orig = createProfile(
      {
        name: 'Original Profile',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const dup = duplicateProfile(orig.id, tmp);
    assert.strictEqual(dup.captionTemplateId, 'tpl_builtin_clean');
    assert.notStrictEqual(dup.id, orig.id);
    assert.strictEqual(dup.name, 'Original Profile Copy');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// I. Delete profile does not delete template
test('I. Delete profile does not delete template', () => {
  const tmp = makeTmpDir();
  try {
    const customTpl = createCaptionTemplate(
      {
        name: 'Independent Template',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Profile To Delete',
        captionTemplateId: customTpl.id,
      },
      tmp
    );

    deleteProfile(prof.id, tmp);

    // Profile deleted
    const loaded = loadProfiles(tmp);
    assert.strictEqual(loaded.profiles.some((p) => p.id === prof.id), false);

    // Template remains safe and accessible
    const tplAfter = getCaptionTemplate(customTpl.id, tmp);
    assert.ok(tplAfter);
    assert.strictEqual(tplAfter.id, customTpl.id);
    assert.strictEqual(tplAfter.name, 'Independent Template');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// J. Disabled profile behavior remains correct
test('J. Disabled profile behavior remains correct', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'source.mp4');
    fs.writeFileSync(fakeMedia, 'video data');

    const prof = createProfile(
      {
        name: 'Disabled Profile',
        enabled: false,
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    assert.throws(() => {
      createBulkExportPlan(
        {
          sourcePath: fakeMedia,
          exportType: 'cut',
          profileIds: [prof.id],
        },
        tmp
      );
    }, /is disabled/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// K. Template list is refreshed
test('K. Template list is refreshed', () => {
  const tmp = makeTmpDir();
  try {
    const initialList = getCaptionTemplates(tmp);
    assert.strictEqual(initialList.length, CANONICAL_BUILTINS.length);

    const created = createCaptionTemplate(
      {
        name: 'Refreshed Template',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const refreshedList = getCaptionTemplates(tmp);
    assert.strictEqual(refreshedList.length, CANONICAL_BUILTINS.length + 1);
    assert.ok(refreshedList.some((t) => t.id === created.id));
  } finally {
    cleanupTmpDir(tmp);
  }
});

// L. Export selector resolves caption template
test('L. Export selector resolves caption template', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Selector Test Profile',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const resolved = resolveProfileCaptionTemplate(prof, tmp);
    assert.strictEqual(resolved.templateId, 'tpl_builtin_clean');
    assert.strictEqual(resolved.templateName, 'Clean');
    assert.ok(Array.isArray(resolved.overlays));
    assert.strictEqual(resolved.overlays.length, 1);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// M. No-template profile resolves to no overlays
test('M. No-template profile resolves to no overlays', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'No Template Profile',
        captionTemplateId: null,
      },
      tmp
    );

    const resolved = resolveProfileCaptionTemplate(prof, tmp);
    assert.strictEqual(resolved.templateId, null);
    assert.strictEqual(resolved.templateName, null);
    assert.strictEqual(resolved.overlays, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// N. Valid template overlays are deep cloned
test('N. Valid template overlays are deep cloned', () => {
  const tmp = makeTmpDir();
  try {
    const prof = createProfile(
      {
        name: 'Clone Test Profile',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const res1 = resolveProfileCaptionTemplate(prof, tmp);
    const res2 = resolveProfileCaptionTemplate(prof, tmp);

    assert.notStrictEqual(res1.overlays, res2.overlays);
    assert.notStrictEqual(res1.overlays[0], res2.overlays[0]);
    assert.deepStrictEqual(res1.overlays, res2.overlays);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// O. Mutating resolved overlays does not mutate stored template
test('O. Mutating resolved overlays does not mutate stored template', () => {
  const tmp = makeTmpDir();
  try {
    const customTpl = createCaptionTemplate(
      {
        name: 'Immutable Template',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Isolation Profile',
        captionTemplateId: customTpl.id,
      },
      tmp
    );

    const resolved = resolveProfileCaptionTemplate(prof, tmp);
    resolved.overlays[0].text = 'HACKED TEXT';
    resolved.overlays[0].fontSize = 999;

    const pristine = getCaptionTemplate(customTpl.id, tmp);
    assert.strictEqual(pristine.overlays[0].text, sampleOverlay.text);
    assert.strictEqual(pristine.overlays[0].fontSize, sampleOverlay.fontSize);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// P. Bulk export plan includes captionTemplateId
test('P. Bulk export plan includes captionTemplateId', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Plan Profile',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs.length, 1);
    assert.strictEqual(plan.jobs[0].captionTemplateId, 'tpl_builtin_clean');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Q. Bulk export plan includes captionTemplateName
test('Q. Bulk export plan includes captionTemplateName', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Plan Profile Q',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateName, 'Clean');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// R. Bulk export plan includes textOverlays snapshot
test('R. Bulk export plan includes textOverlays snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Plan Profile R',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.ok(Array.isArray(plan.jobs[0].textOverlays));
    assert.strictEqual(plan.jobs[0].textOverlays.length, 1);
    assert.strictEqual(plan.jobs[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// S. Plan snapshot remains unchanged after template mutation
test('S. Plan snapshot remains unchanged after template mutation', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const customTpl = createCaptionTemplate(
      {
        name: 'Mutating Template S',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Plan Profile S',
        captionTemplateId: customTpl.id,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    // Mutate the stored template on disk
    updateCaptionTemplate(
      customTpl.id,
      {
        name: 'Mutated Template Name',
        overlays: [
          {
            ...sampleOverlay,
            text: 'Completely altered text',
          },
        ],
      },
      tmp
    );

    // Verify existing plan snapshot remains pristine
    assert.strictEqual(plan.jobs[0].captionTemplateName, 'Mutating Template S');
    assert.strictEqual(plan.jobs[0].textOverlays[0].text, sampleOverlay.text);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// T. Plan snapshot remains unchanged after profile mutation
test('T. Plan snapshot remains unchanged after profile mutation', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Plan Profile T',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    // Mutate the profile (clear its caption template)
    updateProfile(
      prof.id,
      {
        captionTemplateId: null,
      },
      tmp
    );

    // Plan snapshot preserved
    assert.strictEqual(plan.jobs[0].captionTemplateId, 'tpl_builtin_clean');
    assert.ok(Array.isArray(plan.jobs[0].textOverlays));
  } finally {
    cleanupTmpDir(tmp);
  }
});

// U. Cut receives caption snapshot
test('U. Cut receives caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Cut',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan, {
      exportType: 'cut',
      start: 0,
      end: 10,
    });

    assert.strictEqual(items.length, 1);
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// V. Reel receives caption snapshot
test('V. Reel receives caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Reel',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'reel',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan, {
      exportType: 'reel',
      aspectRatio: '9:16',
      mode: 'blur',
    });

    assert.strictEqual(items.length, 1);
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// W. Split receives caption snapshot
test('W. Split receives caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Split',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'split',
        profileIds: [prof.id],
      },
      tmp
    );

    const items = planToBatchQueueItems(plan, {
      exportType: 'split',
      interval: 30,
    });

    assert.strictEqual(items.length, 1);
    assert.ok(Array.isArray(items[0].textOverlays));
    assert.strictEqual(items[0].textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// X. Schedule receives caption snapshot
test('X. Schedule receives caption snapshot', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const prof = createProfile(
      {
        name: 'Profile Schedule X',
        captionTemplateId: 'tpl_builtin_clean',
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const futureTime = new Date(Date.now() + 3600000).toISOString();
    const result = createBulkSchedule(
      {
        plan,
        startAt: futureTime,
        gapMinutes: 15,
        rawOptions: { start: 0, end: 5 },
      },
      tmp
    );

    assert.strictEqual(result.count, 1);
    const sched = getSchedule(result.schedules[0].id, tmp);
    assert.ok(sched);
    assert.ok(Array.isArray(sched.exportOptions.textOverlays));
    assert.strictEqual(sched.exportOptions.textOverlays[0].id, 'clean_ov_1');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Y. Schedule remains unchanged after template mutation
test('Y. Schedule remains unchanged after template mutation', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const customTpl = createCaptionTemplate(
      {
        name: 'Template For Schedule Y',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Profile Sched Y',
        captionTemplateId: customTpl.id,
      },
      tmp
    );

    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    const futureTime = new Date(Date.now() + 3600000).toISOString();
    const result = createBulkSchedule(
      {
        plan,
        startAt: futureTime,
        gapMinutes: 15,
      },
      tmp
    );

    const schedId = result.schedules[0].id;

    // Mutate the custom template
    updateCaptionTemplate(
      customTpl.id,
      {
        name: 'Altered Template',
        overlays: [{ ...sampleOverlay, text: 'MODIFIED SCHEDULE TEXT' }],
      },
      tmp
    );

    // Schedule should retain original snapshot
    const sched = getSchedule(schedId, tmp);
    assert.strictEqual(sched.exportOptions.textOverlays[0].text, sampleOverlay.text);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// Z. Built-in template association works
test('Z. Built-in template association works for all canonical built-ins', () => {
  const tmp = makeTmpDir();
  try {
    for (const b of CANONICAL_BUILTINS) {
      const prof = createProfile(
        {
          name: `Profile for ${b.name}`,
          captionTemplateId: b.id,
        },
        tmp
      );
      const res = resolveProfileCaptionTemplate(prof, tmp);
      assert.strictEqual(res.templateId, b.id);
      assert.strictEqual(res.templateName, b.name);
      assert.ok(Array.isArray(res.overlays));
      assert.strictEqual(res.overlays.length, b.overlays.length);
    }
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AA. Custom template association works
test('AA. Custom template association works with multi-overlay templates', () => {
  const tmp = makeTmpDir();
  try {
    const customTpl = createCaptionTemplate(
      {
        name: 'Dual Overlay Custom',
        overlays: [
          sampleOverlay,
          {
            ...sampleOverlay,
            id: 'ovl_sample_2',
            text: 'Top Header',
            position: 'top',
            y: 0.1,
          },
        ],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Dual Overlay Profile',
        captionTemplateId: customTpl.id,
      },
      tmp
    );

    const res = resolveProfileCaptionTemplate(prof, tmp);
    assert.strictEqual(res.templateId, customTpl.id);
    assert.strictEqual(res.overlays.length, 2);
    assert.strictEqual(res.overlays[0].id, 'ovl_sample_1');
    assert.strictEqual(res.overlays[1].id, 'ovl_sample_2');
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AB. Deleted template is handled safely
test('AB. Deleted template is handled safely without crashing', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const customTpl = createCaptionTemplate(
      {
        name: 'Ephemeral Template',
        overlays: [sampleOverlay],
      },
      tmp
    );

    const prof = createProfile(
      {
        name: 'Profile Referencing Ephemeral',
        captionTemplateId: customTpl.id,
      },
      tmp
    );

    // Delete the template
    deleteCaptionTemplate(customTpl.id, tmp);

    // Resolving caption template falls back safely to null
    const res = resolveProfileCaptionTemplate(prof, tmp);
    assert.strictEqual(res.templateId, null);
    assert.strictEqual(res.templateName, null);
    assert.strictEqual(res.overlays, null);

    // Creating export plan handles deleted template safely
    const plan = createBulkExportPlan(
      {
        sourcePath: fakeMedia,
        exportType: 'cut',
        profileIds: [prof.id],
      },
      tmp
    );

    assert.strictEqual(plan.jobs[0].captionTemplateId, null);
    assert.strictEqual(plan.jobs[0].captionTemplateName, null);
    assert.strictEqual(plan.jobs[0].textOverlays, null);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AC. Renderer cannot inject arbitrary caption configuration
test('AC. Renderer cannot inject arbitrary caption configuration', () => {
  const tmp = makeTmpDir();
  try {
    // Only template ID or null is accepted, objects/arrays/functions rejected
    assert.throws(() => {
      createProfile(
        {
          name: 'Injection Attempt',
          captionTemplateId: { overlays: [{ text: 'malicious' }] },
        },
        tmp
      );
    }, /must be a string or null/);

    assert.throws(() => {
      createProfile(
        {
          name: 'Injection Attempt Array',
          captionTemplateId: [{ text: 'malicious' }],
        },
        tmp
      );
    }, /must be a string or null/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AD. Invalid overlay snapshot rejected
test('AD. Invalid overlay snapshot rejected by bulk plan validator', () => {
  const tmp = makeTmpDir();
  try {
    const fakeMedia = path.join(tmp, 'video.mp4');
    fs.writeFileSync(fakeMedia, 'fake video content');

    const plan = {
      planId: 'plan_invalid_overlay',
      sourceFile: fakeMedia,
      exportType: 'cut',
      jobs: [
        {
          jobId: 'job_1',
          profileId: 'prof_1',
          profileName: 'P1',
          outputPath: path.join(tmp, 'out_1.mp4'),
          variationPreset: {
            brightness: 0,
            saturation: 1,
            hue: 0,
            pitch: 0,
            speed: 1.0,
            mode: 'center',
            crop: 0,
            cleanMetadata: true,
          },
          textOverlays: 'NOT_AN_ARRAY_MALICIOUS_STRING',
        },
      ],
    };

    assert.throws(() => {
      validateBulkExportPlan(plan);
    }, /invalid textOverlays format/);
  } finally {
    cleanupTmpDir(tmp);
  }
});

// AE. Existing profile tests still pass
test('AE. Existing profile tests still pass (profiles.test.js)', () => {
  const testPath = path.join(__dirname, 'profiles.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `profiles.test.js failed:\n${res.stderr.toString()}`);
});

// AF. Existing bulk export tests still pass
test('AF. Existing bulk export tests still pass (bulk-export-executor.test.js)', () => {
  const testPath = path.join(__dirname, 'bulk-export-executor.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `bulk-export-executor.test.js failed:\n${res.stderr.toString()}`);
});

// AG. Existing scheduler tests still pass
test('AG. Existing scheduler tests still pass (scheduler.test.js)', () => {
  const testPath = path.join(__dirname, 'scheduler.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `scheduler.test.js failed:\n${res.stderr.toString()}`);
});

// AH. Existing text overlay tests still pass
test('AH. Existing text overlay tests still pass (text-overlay.test.js)', () => {
  const testPath = path.join(__dirname, 'text-overlay.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `text-overlay.test.js failed:\n${res.stderr.toString()}`);
});

// AI. Existing caption template tests still pass
test('AI. Existing caption template tests still pass (caption-template.test.js)', () => {
  const testPath = path.join(__dirname, 'caption-template.test.js');
  const res = spawnSync(process.execPath, [testPath], { stdio: 'pipe' });
  assert.strictEqual(res.status, 0, `caption-template.test.js failed:\n${res.stderr.toString()}`);
});

// ── Test Runner ──────────────────────────────────────────────────────────────

async function runAll() {
  for (const t of testQueue) {
    totalCount++;
    try {
      await t.fn();
      passedCount++;
      console.log(`  ✓ PASS: ${totalCount}. ${t.name}`);
    } catch (err) {
      console.error(`  ✗ FAIL: ${totalCount}. ${t.name}`);
      console.error(err);
      process.exit(1);
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 Phase 4B-3 Test Results: ${passedCount} / ${totalCount} passed`);
  console.log(`======================================================\n`);
}

runAll().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
