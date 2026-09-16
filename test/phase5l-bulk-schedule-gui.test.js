'use strict';

/**
 * Phase 5L — Bulk Schedule GUI Bug Fix Regression Tests
 *
 * Tests:
 *  A. Bulk Schedule backend creates correct schedule records from recipe
 *  B. Recipe snapshot is preserved in bulk schedule records
 *  C. Multiple profiles generate independent schedule records
 *  D. Schedule gap configuration is respected
 *  E. Bulk schedule preview data matches created schedules
 *  F. Existing normal single schedule from recipe still works
 *  G. Recipe snapshot remains immutable after bulk schedule creation
 *  H. Pro feature gating remains intact for recipe_automation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  createWorkflowRecipe,
  getWorkflowRecipe,
  deepClone,
  incrementUsageCount,
  getRecipeUsageStats,
} = require('../src/main/workflowRecipes/workflowRecipeManager');

const {
  createRecipeBulkSchedule,
  createRecipeSchedule,
  createRecipeBulkPlan,
} = require('../src/main/workflowRecipes/recipeAutomation');

const {
  createProfile,
  listProfiles,
} = require('../src/main/profiles/profileManager');

const {
  hasFeature,
  FEATURE_KEYS,
  TIER_HIERARCHY,
} = require('../src/shared/features');

let dir;
let testVideo;
let passed = 0;
let failed = 0;
const failures = [];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_bulk_sched_gui_'));
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

function setupTestEnv() {
  dir = tempDir();
  testVideo = path.join(dir, 'test_video.mp4');
  fs.writeFileSync(testVideo, Buffer.alloc(1024, 0x00));

  const profile1 = createProfile({
    name: 'Instagram Reels',
    platform: 'Instagram',
    variationPreset: { brightness: 0.1, saturation: 1.2 },
  }, dir);

  const profile2 = createProfile({
    name: 'TikTok',
    platform: 'TikTok',
    variationPreset: { brightness: 0.0, saturation: 1.0 },
  }, dir);

  const profile3 = createProfile({
    name: 'YouTube Shorts',
    platform: 'YouTube',
    variationPreset: { brightness: -0.1, saturation: 0.9 },
  }, dir);

  return { profile1, profile2, profile3 };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('======================================================');
  console.log('🧪 Phase 5L — Bulk Schedule GUI Bug Fix Regression');
  console.log('======================================================');
  console.log('');

  const { profile1, profile2, profile3 } = setupTestEnv();

  // ─── A. Bulk Schedule creates correct schedule records ───────────────────
  await test('A. Bulk schedule from recipe creates correct schedule records', () => {
    const recipe = createWorkflowRecipe({
      name: 'Bulk Schedule GUI Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    const result = createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id],
      sourcePath: testVideo,
      startAt: futureDate,
      gapMinutes: 15,
    }, dir);

    assert.strictEqual(result.success, true, 'Result indicates success');
    assert.strictEqual(result.count, 2, 'Two schedules created');
    assert.ok(result.schedules.length === 2, 'Schedules array has 2 entries');

    for (const sched of result.schedules) {
      assert.ok(sched.id, 'Schedule has ID');
      assert.strictEqual(sched.status, 'SCHEDULED');
      assert.ok(sched.scheduledAt, 'Schedule has scheduledAt');
      assert.ok(sched.recipeId, 'Schedule has recipeId');
      assert.ok(sched.recipeSnapshot, 'Schedule has recipeSnapshot');
    }
  });

  // ─── B. Recipe snapshot preserved in bulk schedule records ────────────────
  await test('B. Recipe snapshot is preserved correctly in each schedule', () => {
    const recipe = createWorkflowRecipe({
      name: 'Snapshot Preserved Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'crop', aspectRatio: '1:1', resolution: '4k' },
      textOverlays: [{ id: 'ol1', text: 'Test Overlay', fontSize: 48 }],
    }, dir);

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    const result = createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
      startAt: futureDate,
      gapMinutes: 15,
    }, dir);

    const sched = result.schedules[0];
    assert.strictEqual(sched.recipeId, recipe.id, 'Schedule has correct recipeId');
    assert.strictEqual(sched.recipeName, recipe.name, 'Schedule has correct recipeName');
    assert.strictEqual(sched.recipeSnapshot.exportType, 'cut');
    assert.strictEqual(sched.recipeSnapshot.outputSettings.mode, 'crop');
    assert.strictEqual(sched.recipeSnapshot.outputSettings.aspectRatio, '1:1');
    assert.strictEqual(sched.recipeSnapshot.outputSettings.resolution, '4k');
    assert.ok(Array.isArray(sched.recipeSnapshot.textOverlays));
    assert.strictEqual(sched.recipeSnapshot.textOverlays[0].text, 'Test Overlay');
  });

  // ─── C. Multiple profiles generate independent schedule records ───────────
  await test('C. Multiple profiles generate independent schedule records', () => {
    const recipe = createWorkflowRecipe({
      name: 'Multi Profile Schedule Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    const result = createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id, profile3.id],
      sourcePath: testVideo,
      startAt: futureDate,
      gapMinutes: 10,
    }, dir);

    assert.strictEqual(result.count, 3, 'Three schedules created');

    const profileIds = result.schedules.map(s => s.profileSnapshot?.id || s.profileId);
    assert.ok(profileIds.includes(profile1.id), 'Has profile1');
    assert.ok(profileIds.includes(profile2.id), 'Has profile2');
    assert.ok(profileIds.includes(profile3.id), 'Has profile3');

    // Each schedule has its own snapshot — mutation of one doesn't affect others
    result.schedules[0].recipeSnapshot.outputSettings.mode = 'MUTATED';
    assert.notStrictEqual(
      result.schedules[1].recipeSnapshot.outputSettings.mode,
      'MUTATED',
      'Schedule 1 snapshot is independent'
    );
  });

  // ─── D. Schedule gap configuration is respected ──────────────────────────
  await test('D. Schedule gap configuration creates correct time intervals', () => {
    const recipe = createWorkflowRecipe({
      name: 'Gap Config Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    const result = createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id, profile3.id],
      sourcePath: testVideo,
      startAt: futureDate,
      gapMinutes: 30,
    }, dir);

    const t0 = new Date(result.schedules[0].scheduledAt).getTime();
    const t1 = new Date(result.schedules[1].scheduledAt).getTime();
    const t2 = new Date(result.schedules[2].scheduledAt).getTime();

    assert.strictEqual(t1 - t0, 30 * 60 * 1000, 'Gap between schedule 0 and 1 is 30 min');
    assert.strictEqual(t2 - t1, 30 * 60 * 1000, 'Gap between schedule 1 and 2 is 30 min');
  });

  // ─── E. Bulk schedule preview data matches created schedules ──────────────
  await test('E. Preview data matches created schedule records', () => {
    const recipe = createWorkflowRecipe({
      name: 'Preview Match Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    // Simulate what the modal preview would compute
    const profiles = [profile1, profile2];
    const startAt = new Date(Date.now() + 7200000);
    const gapMinutes = 15;

    const previewData = profiles.map((p, i) => ({
      profileId: p.id,
      profileName: p.name,
      platform: p.platform,
      scheduledAt: new Date(startAt.getTime() + i * gapMinutes * 60 * 1000).toISOString(),
    }));

    // Now create the actual bulk schedule
    const result = createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: profiles.map(p => p.id),
      sourcePath: testVideo,
      startAt: startAt.toISOString(),
      gapMinutes,
    }, dir);

    // Verify the created schedules match the preview
    assert.strictEqual(result.count, previewData.length, 'Same count');

    for (let i = 0; i < previewData.length; i++) {
      const preview = previewData[i];
      const actual = result.schedules[i];

      assert.strictEqual(actual.profileSnapshot?.id, preview.profileId, `Schedule ${i} profile ID matches`);
      assert.strictEqual(actual.profileSnapshot?.name, preview.profileName, `Schedule ${i} profile name matches`);
      assert.strictEqual(
        new Date(actual.scheduledAt).getTime(),
        new Date(preview.scheduledAt).getTime(),
        `Schedule ${i} scheduledAt matches preview`
      );
    }
  });

  // ─── F. Existing normal single schedule from recipe still works ───────────
  await test('F. Existing normal schedule from recipe still works', () => {
    const recipe = createWorkflowRecipe({
      name: 'Normal Schedule Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const schedule = createRecipeSchedule({
      recipeId: recipe.id,
      sourcePath: testVideo,
      scheduledAt: futureDate,
    }, dir);

    assert.ok(schedule.id, 'Schedule has ID');
    assert.strictEqual(schedule.status, 'SCHEDULED');
    assert.ok(schedule.recipeId, 'Schedule has recipeId');
    assert.ok(schedule.recipeSnapshot, 'Schedule has recipeSnapshot');
    assert.strictEqual(schedule.recipeSnapshot.exportType, 'cut');
  });

  // ─── G. Recipe snapshot remains immutable after bulk schedule creation ────
  await test('G. Recipe snapshot is immutable after bulk schedule creation', () => {
    const recipe = createWorkflowRecipe({
      name: 'Immutable Snapshot Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
      textOverlays: [{ id: 'ol1', text: 'Original', fontSize: 48 }],
    }, dir);

    const recipeBefore = getWorkflowRecipe(recipe.id, dir);
    const snapshotBefore = deepClone(recipeBefore);

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    const result = createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
      startAt: futureDate,
      gapMinutes: 15,
    }, dir);

    // Mutate the schedule's snapshot
    result.schedules[0].recipeSnapshot.outputSettings.mode = 'MUTATED';
    result.schedules[0].recipeSnapshot.textOverlays[0].text = 'MUTATED';

    // Original recipe must be unchanged
    const recipeAfter = getWorkflowRecipe(recipe.id, dir);
    assert.deepStrictEqual(recipeAfter.outputSettings, snapshotBefore.outputSettings, 'Recipe outputSettings unchanged');
    assert.deepStrictEqual(recipeAfter.textOverlays, snapshotBefore.textOverlays, 'Recipe textOverlays unchanged');
    assert.strictEqual(recipeAfter.name, snapshotBefore.name, 'Recipe name unchanged');
  });

  // ─── H. Pro feature gating remains intact ────────────────────────────────
  await test('H. Pro feature gating for recipe_automation remains intact', () => {
    assert.strictEqual(FEATURE_KEYS.RECIPE_AUTOMATION, 'recipe_automation');
    assert.ok(TIER_HIERARCHY.pro.includes('recipe_automation'), 'Pro tier includes recipe_automation');
    assert.ok(!TIER_HIERARCHY.basic.includes('recipe_automation'), 'Basic tier excludes recipe_automation');
    assert.ok(!TIER_HIERARCHY.standard.includes('recipe_automation'), 'Standard tier excludes recipe_automation');
    assert.strictEqual(hasFeature('pro', 'recipe_automation'), true);
    assert.strictEqual(hasFeature('basic', 'recipe_automation'), false);
    assert.strictEqual(hasFeature('standard', 'recipe_automation'), false);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('======================================================');
  console.log(`📊 Phase 5L GUI Bug Fix Regression: ${passed} / ${passed + failed} passed`);
  console.log('======================================================');
  console.log('');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
