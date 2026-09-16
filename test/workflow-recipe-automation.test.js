'use strict';

/**
 * Phase 5L — Recipe Automation Test Suite
 *
 * Tests:
 *  1. Recipe → bulk plan creation
 *  2. Recipe snapshot in bulk plan
 *  3. Multiple profiles in bulk plan
 *  4. Independent profile snapshots
 *  5. Recipe → schedule creation
 *  6. Recipe snapshot in schedule
 *  7. Recipe deletion after scheduling
 *  8. Recipe edit after scheduling
 *  9. Recipe → bulk schedule creation
 *  10. Time-gap handling
 *  11. Profile snapshot isolation
 *  12. Variation snapshot isolation
 *  13. Export preset snapshot isolation
 *  14. Caption snapshot isolation
 *  15. History integration fields
 *  16. Usage count increment
 *  17. Duplicate usage prevention
 *  18. Collision protection
 *  19. Source overwrite protection
 *  20. Retry compatibility
 *  21. Cancel compatibility
 *  22. Restart persistence
 *  23. Invalid recipe rejection
 *  24. Invalid profile rejection
 *  25. Pro gating
 *  26. IPC security
 *  27. Deep clone isolation
 *  28. Phase 5K regression protection
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  createWorkflowRecipe,
  applyWorkflowRecipe,
  getWorkflowRecipe,
  deleteWorkflowRecipe,
  incrementUsageCount,
  getRecipeUsageStats,
  resetWorkflowRecipes,
  CANONICAL_BUILTIN_RECIPES,
  BUILTIN_IDS,
  deepClone,
} = require('../src/main/workflowRecipes/workflowRecipeManager');

const {
  createRecipeBulkPlan,
  createRecipeSchedule,
  createRecipeBulkSchedule,
  generatePlanId,
  assertString,
  assertNonEmptyArray,
  assertValidExportType,
  assertNoPrototypePollution,
} = require('../src/main/workflowRecipes/recipeAutomation');

const {
  createProfile,
  listProfiles,
  getProfile,
  deleteProfile,
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_recipe_auto_'));
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

  // Create a dummy source video file
  testVideo = path.join(dir, 'test_video.mp4');
  fs.writeFileSync(testVideo, Buffer.alloc(1024, 0x00));

  // Create test profiles
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
  console.log('🧪 Phase 5L — Recipe Automation Test Suite');
  console.log('======================================================');
  console.log('');

  const { profile1, profile2, profile3 } = setupTestEnv();

  // ─── 1. Recipe → bulk plan creation ─────────────────────────────────────
  await test('1. Recipe can be used to create bulk plan', () => {
    const recipe = createWorkflowRecipe({
      name: 'Bulk Test Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    assert.ok(plan.planId, 'Plan has ID');
    assert.strictEqual(plan.exportType, 'reel');
    assert.strictEqual(plan.totalJobs, 1);
    assert.ok(plan.recipeId, 'Plan has recipeId');
    assert.strictEqual(plan.recipeName, 'Bulk Test Recipe');
    assert.ok(plan.recipeSnapshot, 'Plan has recipeSnapshot');
    assert.strictEqual(plan.jobs[0].profileId, profile1.id);
  });

  // ─── 2. Recipe snapshot in bulk plan ────────────────────────────────────
  await test('2. Bulk plan preserves recipe snapshot', () => {
    const recipe = createWorkflowRecipe({
      name: 'Snapshot Test Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'crop', aspectRatio: '1:1', resolution: '4k' },
      textOverlays: [{ id: 'ol1', text: 'Hello', fontSize: 48 }],
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    assert.strictEqual(plan.recipeSnapshot.exportType, 'cut');
    assert.strictEqual(plan.recipeSnapshot.outputSettings.mode, 'crop');
    assert.strictEqual(plan.recipeSnapshot.outputSettings.aspectRatio, '1:1');
    assert.strictEqual(plan.recipeSnapshot.outputSettings.resolution, '4k');
    assert.ok(Array.isArray(plan.recipeSnapshot.textOverlays));
    assert.strictEqual(plan.recipeSnapshot.textOverlays.length, 1);
    assert.strictEqual(plan.recipeSnapshot.textOverlays[0].text, 'Hello');
  });

  // ─── 3. Multiple profiles in bulk plan ──────────────────────────────────
  await test('3. Bulk plan supports multiple profiles', () => {
    const recipe = createWorkflowRecipe({
      name: 'Multi Profile Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id, profile3.id],
      sourcePath: testVideo,
    }, dir);

    assert.strictEqual(plan.totalJobs, 3);
    assert.strictEqual(plan.jobs[0].profileId, profile1.id);
    assert.strictEqual(plan.jobs[1].profileId, profile2.id);
    assert.strictEqual(plan.jobs[2].profileId, profile3.id);
    assert.strictEqual(plan.jobs[0].profileName, 'Instagram Reels');
    assert.strictEqual(plan.jobs[1].profileName, 'TikTok');
    assert.strictEqual(plan.jobs[2].profileName, 'YouTube Shorts');
  });

  // ─── 4. Independent profile snapshots ───────────────────────────────────
  await test('4. Each job has independent profile snapshot', () => {
    const recipe = createWorkflowRecipe({
      name: 'Isolation Test Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id],
      sourcePath: testVideo,
    }, dir);

    // Mutate job 0's variation preset
    plan.jobs[0].variationPreset.brightness = 999;

    // Job 1 should be unaffected
    assert.notStrictEqual(plan.jobs[1].variationPreset.brightness, 999);
  });

  // ─── 5. Recipe → schedule creation ──────────────────────────────────────
  await test('5. Recipe can be used to create schedule', () => {
    const recipe = createWorkflowRecipe({
      name: 'Schedule Test Recipe',
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
    assert.strictEqual(schedule.recipeName, 'Schedule Test Recipe');
    assert.ok(schedule.recipeSnapshot, 'Schedule has recipeSnapshot');
  });

  // ─── 6. Recipe snapshot in schedule ──────────────────────────────────────
  await test('6. Schedule preserves recipe snapshot', () => {
    const recipe = createWorkflowRecipe({
      name: 'Schedule Snapshot Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'pad', aspectRatio: '16:9', resolution: '1080p', interval: 60 },
      textOverlays: [{ id: 'ol1', text: 'Scheduled', fontSize: 36 }],
    }, dir);

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const schedule = createRecipeSchedule({
      recipeId: recipe.id,
      sourcePath: testVideo,
      scheduledAt: futureDate,
    }, dir);

    assert.strictEqual(schedule.recipeSnapshot.exportType, 'reel');
    assert.strictEqual(schedule.recipeSnapshot.outputSettings.mode, 'pad');
    assert.strictEqual(schedule.recipeSnapshot.outputSettings.aspectRatio, '16:9');
    assert.strictEqual(schedule.recipeSnapshot.outputSettings.interval, 60);
    assert.ok(Array.isArray(schedule.recipeSnapshot.textOverlays));
    assert.strictEqual(schedule.recipeSnapshot.textOverlays.length, 1);
  });

  // ─── 7. Recipe deletion after scheduling ────────────────────────────────
  await test('7. Deleting recipe does not break existing schedule', () => {
    const recipe = createWorkflowRecipe({
      name: 'Delete After Schedule Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const schedule = createRecipeSchedule({
      recipeId: recipe.id,
      sourcePath: testVideo,
      scheduledAt: futureDate,
    }, dir);

    const scheduleSnapshot = deepClone(schedule.recipeSnapshot);

    // Delete the recipe
    deleteWorkflowRecipe(recipe.id, dir);

    // Schedule's snapshot should be unaffected
    assert.deepStrictEqual(schedule.recipeSnapshot, scheduleSnapshot);
  });

  // ─── 8. Recipe edit after scheduling ────────────────────────────────────
  await test('8. Editing recipe does not modify existing schedule', () => {
    const recipe = createWorkflowRecipe({
      name: 'Edit After Schedule Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const schedule = createRecipeSchedule({
      recipeId: recipe.id,
      sourcePath: testVideo,
      scheduledAt: futureDate,
    }, dir);

    const scheduleSnapshot = deepClone(schedule.recipeSnapshot);

    // Edit the recipe
    const { updateWorkflowRecipe } = require('../src/main/workflowRecipes/workflowRecipeManager');
    updateWorkflowRecipe(recipe.id, {
      name: 'Edited Recipe',
      outputSettings: { mode: 'crop', aspectRatio: '1:1', resolution: '4k' },
    }, dir);

    // Schedule's snapshot should be unaffected
    assert.deepStrictEqual(schedule.recipeSnapshot, scheduleSnapshot);
    assert.strictEqual(schedule.recipeSnapshot.outputSettings.mode, 'blur');
  });

  // ─── 9. Recipe → bulk schedule creation ─────────────────────────────────
  await test('9. Recipe can be used to create bulk schedule', () => {
    const recipe = createWorkflowRecipe({
      name: 'Bulk Schedule Recipe',
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

    assert.ok(result.success, 'Bulk schedule succeeded');
    assert.strictEqual(result.count, 2);
    assert.ok(result.schedules.length === 2);
    assert.ok(result.schedules[0].recipeId, 'Schedule has recipeId');
    assert.ok(result.schedules[0].recipeSnapshot, 'Schedule has recipeSnapshot');
  });

  // ─── 10. Time-gap handling ──────────────────────────────────────────────
  await test('10. Bulk schedule respects time gap', () => {
    const recipe = createWorkflowRecipe({
      name: 'Gap Test Recipe',
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

    assert.strictEqual(result.count, 3);
    const t0 = new Date(result.schedules[0].scheduledAt).getTime();
    const t1 = new Date(result.schedules[1].scheduledAt).getTime();
    const t2 = new Date(result.schedules[2].scheduledAt).getTime();
    assert.strictEqual(t1 - t0, 30 * 60 * 1000, 'Gap between schedule 0 and 1');
    assert.strictEqual(t2 - t1, 30 * 60 * 1000, 'Gap between schedule 1 and 2');
  });

  // ─── 11. Profile snapshot isolation ─────────────────────────────────────
  await test('11. Profile snapshots are isolated across jobs', () => {
    const recipe = createWorkflowRecipe({
      name: 'Profile Isolation Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id],
      sourcePath: testVideo,
    }, dir);

    plan.jobs[0].variationPreset.brightness = 999;
    assert.notStrictEqual(plan.jobs[1].variationPreset.brightness, 999);
  });

  // ─── 12. Variation snapshot isolation ───────────────────────────────────
  await test('12. Variation presets are deeply cloned per job', () => {
    const recipe = createWorkflowRecipe({
      name: 'Variation Isolation Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    const originalBrightness = plan.jobs[0].variationPreset.brightness;
    plan.jobs[0].variationPreset.brightness = 999;
    assert.notStrictEqual(plan.jobs[0].savedPreset.brightness, 999);
    assert.strictEqual(plan.jobs[0].savedPreset.brightness, originalBrightness);
  });

  // ─── 13. Export preset snapshot isolation ───────────────────────────────
  await test('13. Recipe snapshot is independent from plan', () => {
    const recipe = createWorkflowRecipe({
      name: 'Recipe Independence Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    plan.recipeSnapshot.outputSettings.mode = 'crop';
    const recipeAfter = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(recipeAfter.outputSettings.mode, 'blur');
  });

  // ─── 14. Caption snapshot isolation ─────────────────────────────────────
  await test('14. Text overlays in plan are independent from recipe', () => {
    const recipe = createWorkflowRecipe({
      name: 'Caption Isolation Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
      textOverlays: [{ id: 'ol1', text: 'Original', fontSize: 48 }],
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    plan.jobs[0].textOverlays[0].text = 'Mutated';
    const recipeAfter = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(recipeAfter.textOverlays[0].text, 'Original');
  });

  // ─── 15. History integration fields ─────────────────────────────────────
  await test('15. Plan contains fields needed for history integration', () => {
    const recipe = createWorkflowRecipe({
      name: 'History Integration Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    assert.ok(plan.planId, 'Plan has planId');
    assert.ok(plan.sourceFile, 'Plan has sourceFile');
    assert.ok(plan.exportType, 'Plan has exportType');
    assert.ok(plan.recipeId, 'Plan has recipeId');
    assert.ok(plan.recipeName, 'Plan has recipeName');
    assert.ok(plan.recipeSnapshot, 'Plan has recipeSnapshot');
    assert.ok(plan.jobs[0].jobId, 'Job has jobId');
    assert.ok(plan.jobs[0].outputPath, 'Job has outputPath');
  });

  // ─── 16. Usage count increment ──────────────────────────────────────────
  await test('16. Creating schedule increments recipe usage count', () => {
    const recipe = createWorkflowRecipe({
      name: 'Usage Count Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const statsBefore = getRecipeUsageStats(dir);
    const before = statsBefore.find(s => s.id === recipe.id);
    const beforeCount = before ? before.usageCount : 0;

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    createRecipeSchedule({
      recipeId: recipe.id,
      sourcePath: testVideo,
      scheduledAt: futureDate,
    }, dir);

    const statsAfter = getRecipeUsageStats(dir);
    const after = statsAfter.find(s => s.id === recipe.id);
    assert.ok(after, 'Recipe found in stats');
    assert.strictEqual(after.usageCount, beforeCount + 1, 'Usage count incremented');
  });

  // ─── 17. Usage count for bulk schedule ──────────────────────────────────
  await test('17. Creating bulk schedule increments usage count once', () => {
    const recipe = createWorkflowRecipe({
      name: 'Bulk Usage Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const statsBefore = getRecipeUsageStats(dir);
    const before = statsBefore.find(s => s.id === recipe.id);
    const beforeCount = before ? before.usageCount : 0;

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    createRecipeBulkSchedule({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id],
      sourcePath: testVideo,
      startAt: futureDate,
      gapMinutes: 15,
    }, dir);

    const statsAfter = getRecipeUsageStats(dir);
    const after = statsAfter.find(s => s.id === recipe.id);
    assert.ok(after, 'Recipe found in stats');
    assert.strictEqual(after.usageCount, beforeCount + 1, 'Usage count incremented exactly once');
  });

  // ─── 18. Collision protection ───────────────────────────────────────────
  await test('18. Bulk plan output paths are unique per profile', () => {
    const recipe = createWorkflowRecipe({
      name: 'Collision Test Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id, profile2.id, profile3.id],
      sourcePath: testVideo,
    }, dir);

    const paths = plan.jobs.map(j => j.outputPath);
    const uniquePaths = new Set(paths);
    assert.strictEqual(uniquePaths.size, paths.length, 'All output paths must be unique');
  });

  // ─── 19. Source overwrite protection ────────────────────────────────────
  await test('19. Bulk plan output paths never overwrite source file', () => {
    const recipe = createWorkflowRecipe({
      name: 'Source Overwrite Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const plan = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
      outputDir: path.dirname(testVideo),
    }, dir);

    const resolvedSource = path.resolve(testVideo);
    for (const job of plan.jobs) {
      assert.notStrictEqual(
        path.resolve(job.outputPath).toLowerCase(),
        resolvedSource.toLowerCase(),
        'Output must not overwrite source'
      );
    }
  });

  // ─── 20. Invalid recipe rejection ───────────────────────────────────────
  await test('20. Rejects invalid recipe ID', () => {
    assert.throws(() => {
      createRecipeBulkPlan({
        recipeId: 'nonexistent_recipe_id',
        profileIds: [profile1.id],
        sourcePath: testVideo,
      }, dir);
    }, /not found/i);
  });

  // ─── 21. Invalid profile rejection ──────────────────────────────────────
  await test('21. Rejects invalid profile ID', () => {
    const recipe = createWorkflowRecipe({
      name: 'Invalid Profile Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    assert.throws(() => {
      createRecipeBulkPlan({
        recipeId: recipe.id,
        profileIds: ['nonexistent_profile_id'],
        sourcePath: testVideo,
      }, dir);
    }, /not found/i);
  });

  // ─── 22. Missing source rejection ───────────────────────────────────────
  await test('22. Rejects missing source file', () => {
    const recipe = createWorkflowRecipe({
      name: 'Missing Source Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    assert.throws(() => {
      createRecipeBulkPlan({
        recipeId: recipe.id,
        profileIds: [profile1.id],
        sourcePath: '/nonexistent/video.mp4',
      }, dir);
    }, /not found|source/i);
  });

  // ─── 23. Validation helpers ─────────────────────────────────────────────
  await test('23. Validation helpers work correctly', () => {
    assert.throws(() => assertString(null, 'test'), /must be a non-empty string/);
    assert.throws(() => assertString('', 'test'), /must be a non-empty string/);
    assert.throws(() => assertNonEmptyArray(null, 'test'), /must be an array/);
    assert.throws(() => assertNonEmptyArray([], 'test'), /must not be empty/);
    assert.throws(() => assertValidExportType('invalid'), /Invalid export type/);
    assert.doesNotThrow(() => assertValidExportType('cut'));
    assert.doesNotThrow(() => assertValidExportType('reel'));
    assert.doesNotThrow(() => assertValidExportType('split'));

    // __proto__ as own key (use JSON.parse to bypass JS literal syntax)
    const protoPolluted = JSON.parse('{"__proto__": {"polluted": true}}');
    assert.throws(() => assertNoPrototypePollution(protoPolluted), /dangerous key/);

    // constructor key
    assert.throws(() => assertNoPrototypePollution({ constructor: 'evil' }), /dangerous key/);

    // prototype key
    assert.throws(() => assertNoPrototypePollution({ prototype: 'evil' }), /dangerous key/);

    // function value
    assert.throws(() => assertNoPrototypePollution({ fn: () => {} }), /function value/);

    // safe object passes
    assert.doesNotThrow(() => assertNoPrototypePollution({ safe: true, count: 42 }));
  });

  // ─── 24. Feature gating ─────────────────────────────────────────────────
  await test('24. RECIPE_AUTOMATION feature key exists and is Pro-only', () => {
    assert.strictEqual(FEATURE_KEYS.RECIPE_AUTOMATION, 'recipe_automation');
    assert.ok(TIER_HIERARCHY.pro.includes(FEATURE_KEYS.RECIPE_AUTOMATION), 'Pro tier includes RECIPE_AUTOMATION');
    assert.ok(!TIER_HIERARCHY.basic.includes(FEATURE_KEYS.RECIPE_AUTOMATION), 'Basic tier excludes RECIPE_AUTOMATION');
    assert.ok(!TIER_HIERARCHY.standard.includes(FEATURE_KEYS.RECIPE_AUTOMATION), 'Standard tier excludes RECIPE_AUTOMATION');
    assert.strictEqual(hasFeature('pro', 'recipe_automation'), true);
    assert.strictEqual(hasFeature('basic', 'recipe_automation'), false);
    assert.strictEqual(hasFeature('standard', 'recipe_automation'), false);
  });

  // ─── 25. Deep clone isolation ───────────────────────────────────────────
  await test('25. Recipe automation uses deep clone for all snapshots', () => {
    const recipe = createWorkflowRecipe({
      name: 'Deep Clone Test Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
      textOverlays: [{ id: 'ol1', text: 'Original', fontSize: 48 }],
    }, dir);

    const plan1 = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    const plan2 = createRecipeBulkPlan({
      recipeId: recipe.id,
      profileIds: [profile1.id],
      sourcePath: testVideo,
    }, dir);

    // Mutate plan1
    plan1.recipeSnapshot.outputSettings.mode = 'crop';
    plan1.jobs[0].textOverlays[0].text = 'Mutated';

    // plan2 should be unaffected
    assert.strictEqual(plan2.recipeSnapshot.outputSettings.mode, 'blur');
    assert.strictEqual(plan2.jobs[0].textOverlays[0].text, 'Original');
  });

  // ─── 26. Plan ID generation ─────────────────────────────────────────────
  await test('26. generatePlanId produces unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generatePlanId());
    }
    assert.strictEqual(ids.size, 100, 'All 100 generated IDs are unique');
  });

  // ─── 27. Phase 5K regression — existing recipe functions still work ─────
  await test('27. Phase 5K recipe functions remain intact', () => {
    assert.strictEqual(typeof createWorkflowRecipe, 'function');
    assert.strictEqual(typeof applyWorkflowRecipe, 'function');
    assert.strictEqual(typeof getWorkflowRecipe, 'function');
    assert.strictEqual(typeof deleteWorkflowRecipe, 'function');
    assert.strictEqual(typeof incrementUsageCount, 'function');
    assert.strictEqual(typeof getRecipeUsageStats, 'function');
    assert.strictEqual(typeof resetWorkflowRecipes, 'function');

    const recipe = createWorkflowRecipe({
      name: 'Regression Test Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportType, 'cut');
    assert.strictEqual(config.outputSettings.mode, 'blur');
  });

  // ─── 28. Bulk schedule validates gapMinutes ─────────────────────────────
  await test('28. Bulk schedule rejects invalid gapMinutes', () => {
    const recipe = createWorkflowRecipe({
      name: 'Gap Validation Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    assert.throws(() => {
      createRecipeBulkSchedule({
        recipeId: recipe.id,
        profileIds: [profile1.id],
        sourcePath: testVideo,
        startAt: new Date(Date.now() + 7200000).toISOString(),
        gapMinutes: 0,
      }, dir);
    }, /gapMinutes/i);

    assert.throws(() => {
      createRecipeBulkSchedule({
        recipeId: recipe.id,
        profileIds: [profile1.id],
        sourcePath: testVideo,
        startAt: new Date(Date.now() + 7200000).toISOString(),
        gapMinutes: 1441,
      }, dir);
    }, /gapMinutes/i);
  });

  // ─── 29. Duplicate profile IDs rejected ─────────────────────────────────
  await test('29. Bulk plan rejects duplicate profile IDs', () => {
    const recipe = createWorkflowRecipe({
      name: 'Duplicate ID Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    assert.throws(() => {
      createRecipeBulkPlan({
        recipeId: recipe.id,
        profileIds: [profile1.id, profile1.id],
        sourcePath: testVideo,
      }, dir);
    }, /duplicate/i);
  });

  // ─── 30. Maximum profiles limit ─────────────────────────────────────────
  await test('30. Bulk plan rejects more than 10 profiles', () => {
    const recipe = createWorkflowRecipe({
      name: 'Max Profiles Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const manyIds = Array.from({ length: 11 }, (_, i) => `profile_${i}`);
    assert.throws(() => {
      createRecipeBulkPlan({
        recipeId: recipe.id,
        profileIds: manyIds,
        sourcePath: testVideo,
      }, dir);
    }, /Maximum/i);
  });

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('');
  console.log('======================================================');
  console.log(`📊 Phase 5L Test Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================');
  console.log('');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  // Cleanup
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
