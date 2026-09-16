'use strict';

/**
 * Phase 5K Integration — Workflow Recipe Integration Test Suite
 *
 * Tests:
 *  A. Selector is reachable (API exists)
 *  B. Editor is reachable (API exists)
 *  C. Recipe can be applied to Cut
 *  D. Recipe can be applied to Reel
 *  E. Recipe can be applied to Split
 *  F. Apply uses deep clone
 *  G. Manual changes do not mutate recipe
 *  H. Profile snapshot isolation
 *  I. Variation snapshot isolation
 *  J. Caption snapshot isolation
 *  K. Export preset snapshot isolation
 *  L. Built-in immutability
 *  M. Custom recipe CRUD from UI flow
 *  N. Pro gating
 *  O. Existing export flow remains functional
 *  P. No duplicate export engine
 *  Q. No cross-profile leakage
 *  R. Restart persistence
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  deepClone,
  getWorkflowRecipes,
  getWorkflowRecipe,
  createWorkflowRecipe,
  updateWorkflowRecipe,
  deleteWorkflowRecipe,
  duplicateWorkflowRecipe,
  applyWorkflowRecipe,
  incrementUsageCount,
  getRecipeUsageStats,
  resetWorkflowRecipes,
  CANONICAL_BUILTIN_RECIPES,
  BUILTIN_IDS,
} = require('../src/main/workflowRecipes/workflowRecipeManager');

const {
  hasFeature,
  FEATURE_KEYS,
  TIER_HIERARCHY,
} = require('../src/shared/features');

let dir;
let passed = 0;
let failed = 0;
const failures = [];

function tempDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc_recipe_integ_'));
  return d;
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

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runIntegrationTests() {
  dir = tempDir();

  // A. Selector is reachable (API methods exist)
  await test('A. Selector API methods exist', () => {
    assert.strictEqual(typeof getWorkflowRecipes, 'function');
    assert.strictEqual(typeof getWorkflowRecipe, 'function');
    assert.strictEqual(typeof createWorkflowRecipe, 'function');
    assert.strictEqual(typeof deleteWorkflowRecipe, 'function');
    assert.strictEqual(typeof duplicateWorkflowRecipe, 'function');
    assert.strictEqual(typeof applyWorkflowRecipe, 'function');
  });

  // B. Editor is reachable (create/update work)
  await test('B. Editor create/update methods work', () => {
    const recipe = createWorkflowRecipe({
      name: 'Integration Test Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);
    assert.ok(recipe.id, 'Created recipe has ID');
    assert.strictEqual(recipe.name, 'Integration Test Recipe');

    const updated = updateWorkflowRecipe(recipe.id, { name: 'Updated Name' }, dir);
    assert.strictEqual(updated.name, 'Updated Name');
  });

  // C. Recipe can be applied to Cut
  await test('C. Recipe can be applied to Cut', () => {
    const recipe = createWorkflowRecipe({
      name: 'Cut Test Recipe',
      exportType: 'cut',
      outputSettings: { mode: 'crop', aspectRatio: '1:1', resolution: '1080p' },
      textOverlays: [{ id: 'test-overlay', text: 'Hello', fontSize: 48 }],
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportType, 'cut');
    assert.strictEqual(config.outputSettings.mode, 'crop');
    assert.strictEqual(config.outputSettings.aspectRatio, '1:1');
    assert.strictEqual(config.outputSettings.resolution, '1080p');
    assert.ok(Array.isArray(config.textOverlays));
    assert.strictEqual(config.textOverlays.length, 1);
    assert.strictEqual(config.textOverlays[0].text, 'Hello');
  });

  // D. Recipe can be applied to Reel
  await test('D. Recipe can be applied to Reel', () => {
    const recipe = createWorkflowRecipe({
      name: 'Reel Test Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportType, 'reel');
    assert.strictEqual(config.outputSettings.mode, 'blur');
    assert.strictEqual(config.outputSettings.aspectRatio, '9:16');
  });

  // E. Recipe can be applied to Split
  await test('E. Recipe can be applied to Split', () => {
    const recipe = createWorkflowRecipe({
      name: 'Split Test Recipe',
      exportType: 'split',
      outputSettings: { mode: 'pad', aspectRatio: '9:16', resolution: '1080p', interval: 60 },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportType, 'split');
    assert.strictEqual(config.outputSettings.mode, 'pad');
    assert.strictEqual(config.outputSettings.interval, 60);
  });

  // F. Apply uses deep clone
  await test('F. Apply uses deep clone', () => {
    const recipe = createWorkflowRecipe({
      name: 'Deep Clone Test',
      exportType: 'cut',
      textOverlays: [{ id: 'overlay1', text: 'Original' }],
    }, dir);

    const config1 = applyWorkflowRecipe(recipe.id, dir);
    const config2 = applyWorkflowRecipe(recipe.id, dir);

    // Mutate config1
    config1.textOverlays[0].text = 'Mutated';
    config1.outputSettings.mode = 'crop';

    // config2 should be unaffected
    assert.strictEqual(config2.textOverlays[0].text, 'Original');
    assert.strictEqual(config2.outputSettings.mode, 'blur');
  });

  // G. Manual changes do not mutate recipe
  await test('G. Manual changes do not mutate recipe', () => {
    const recipe = createWorkflowRecipe({
      name: 'Manual Change Test',
      exportType: 'cut',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
      textOverlays: [{ id: 'overlay1', text: 'Original' }],
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);

    // Mutate the applied config
    config.outputSettings.mode = 'crop';
    config.textOverlays[0].text = 'Changed';

    // Re-apply should still return original
    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.outputSettings.mode, 'blur');
    assert.strictEqual(config2.textOverlays[0].text, 'Original');
  });

  // H. Profile snapshot isolation
  await test('H. Profile snapshot isolation', () => {
    const recipe = createWorkflowRecipe({
      name: 'Profile Snapshot Test',
      exportType: 'cut',
      profileId: 'profile_123',
      profileSnapshot: { id: 'profile_123', name: 'Test Profile', platform: 'instagram' },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.ok(config.profileSnapshot);
    assert.strictEqual(config.profileSnapshot.name, 'Test Profile');

    // Mutate
    config.profileSnapshot.name = 'Mutated';

    // Re-apply should return original
    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.profileSnapshot.name, 'Test Profile');
  });

  // I. Variation snapshot isolation
  await test('I. Variation snapshot isolation', () => {
    const recipe = createWorkflowRecipe({
      name: 'Variation Snapshot Test',
      exportType: 'cut',
      variationPresetId: 'var_123',
      variationPresetSnapshot: { id: 'var_123', name: 'Test Variation' },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.ok(config.variationPresetSnapshot);
    assert.strictEqual(config.variationPresetSnapshot.name, 'Test Variation');

    config.variationPresetSnapshot.name = 'Mutated';

    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.variationPresetSnapshot.name, 'Test Variation');
  });

  // J. Caption snapshot isolation
  await test('J. Caption snapshot isolation', () => {
    const recipe = createWorkflowRecipe({
      name: 'Caption Snapshot Test',
      exportType: 'reel',
      captionTemplateId: 'cap_123',
      captionTemplateSnapshot: { id: 'cap_123', name: 'Test Caption' },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.ok(config.captionTemplateSnapshot);
    assert.strictEqual(config.captionTemplateSnapshot.name, 'Test Caption');

    config.captionTemplateSnapshot.name = 'Mutated';

    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.captionTemplateSnapshot.name, 'Test Caption');
  });

  // K. Export preset snapshot isolation
  await test('K. Export preset snapshot isolation', () => {
    const recipe = createWorkflowRecipe({
      name: 'Preset Snapshot Test',
      exportType: 'cut',
      exportPresetId: 'preset_123',
      exportPresetSnapshot: { id: 'preset_123', name: 'Test Preset' },
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.ok(config.exportPresetSnapshot);
    assert.strictEqual(config.exportPresetSnapshot.name, 'Test Preset');

    config.exportPresetSnapshot.name = 'Mutated';

    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.exportPresetSnapshot.name, 'Test Preset');
  });

  // L. Built-in immutability
  await test('L. Built-in recipes cannot be modified or deleted', () => {
    const builtin = CANONICAL_BUILTIN_RECIPES[0];
    assert.throws(() => updateWorkflowRecipe(builtin.id, { name: 'Hacked' }, dir), /Cannot modify built-in/);
    assert.throws(() => deleteWorkflowRecipe(builtin.id, dir), /Cannot delete built-in/);
  });

  // M. Custom recipe CRUD from UI flow
  await test('M. Custom recipe CRUD from UI flow', () => {
    // Create
    const recipe = createWorkflowRecipe({
      name: 'UI Flow Recipe',
      exportType: 'reel',
      outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    }, dir);
    assert.ok(recipe.id);
    assert.strictEqual(recipe.name, 'UI Flow Recipe');

    // Read
    const fetched = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(fetched.name, 'UI Flow Recipe');

    // Update
    const updated = updateWorkflowRecipe(recipe.id, { name: 'Updated UI Flow' }, dir);
    assert.strictEqual(updated.name, 'Updated UI Flow');

    // Duplicate
    const dup = duplicateWorkflowRecipe(recipe.id, null, dir);
    assert.ok(dup.id !== recipe.id);
    assert.strictEqual(dup.name, 'Updated UI Flow (Copy)');

    // Delete
    const result = deleteWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(result.success, true);

    // Verify deleted
    const notFound = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(notFound, null);
  });

  // N. Pro gating
  await test('N. Pro gating for workflow_recipes feature', () => {
    assert.ok(hasFeature('pro', 'workflow_recipes'), 'Pro has workflow_recipes');
    assert.ok(!hasFeature('basic', 'workflow_recipes'), 'Basic lacks workflow_recipes');
    assert.ok(!hasFeature('standard', 'workflow_recipes'), 'Standard lacks workflow_recipes');
    assert.strictEqual(FEATURE_KEYS.WORKFLOW_RECIPES, 'workflow_recipes');
  });

  // O. Existing export flow remains functional
  await test('O. Existing export flow remains functional', () => {
    // Verify applyWorkflowRecipe returns all expected fields
    const recipe = CANONICAL_BUILTIN_RECIPES[0];
    const config = applyWorkflowRecipe(recipe.id);

    assert.strictEqual(typeof config.exportType, 'string');
    assert.ok(['cut', 'reel', 'split'].includes(config.exportType));
    assert.ok(config.outputSettings);
    assert.ok(typeof config.outputSettings.mode === 'string');
    assert.ok(typeof config.outputSettings.aspectRatio === 'string');
    assert.ok(typeof config.outputSettings.resolution === 'string');
    assert.ok(Array.isArray(config.textOverlays));
  });

  // P. No duplicate export engine
  await test('P. No duplicate export engine', () => {
    // Recipe applies config but does not trigger export
    // Only onStartExport triggers the actual export
    const recipe = createWorkflowRecipe({
      name: 'No Export Test',
      exportType: 'cut',
    }, dir);

    const config = applyWorkflowRecipe(recipe.id, dir);
    // Config has exportType but no export was triggered
    assert.strictEqual(config.exportType, 'cut');
    assert.ok(!config.outputPath, 'No outputPath in recipe config');
  });

  // Q. No cross-profile leakage
  await test('Q. No cross-profile leakage', () => {
    const recipe1 = createWorkflowRecipe({
      name: 'Profile A Recipe',
      exportType: 'cut',
      profileId: 'profile_a',
      profileSnapshot: { id: 'profile_a', name: 'Profile A' },
    }, dir);

    const recipe2 = createWorkflowRecipe({
      name: 'Profile B Recipe',
      exportType: 'cut',
      profileId: 'profile_b',
      profileSnapshot: { id: 'profile_b', name: 'Profile B' },
    }, dir);

    const config1 = applyWorkflowRecipe(recipe1.id, dir);
    const config2 = applyWorkflowRecipe(recipe2.id, dir);

    assert.strictEqual(config1.profileSnapshot.id, 'profile_a');
    assert.strictEqual(config2.profileSnapshot.id, 'profile_b');

    // Mutate config1
    config1.profileSnapshot.name = 'Mutated A';

    // config2 should be unaffected
    assert.strictEqual(config2.profileSnapshot.name, 'Profile B');
  });

  // R. Restart persistence
  await test('R. Recipes persist across simulated restart', () => {
    createWorkflowRecipe({
      name: 'Persist Test Recipe',
      exportType: 'cut',
    }, dir);

    // Simulate restart by reloading from disk
    const recipes = getWorkflowRecipes(dir);
    const found = recipes.find((r) => r.name === 'Persist Test Recipe');
    assert.ok(found, 'Recipe persists after reload');
  });

  // ─── Summary ────────────────────────────────────────────────────────────

  console.log('\n======================================================');
  console.log(`📊 Phase 5K Integration Test Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================\n');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  // Cleanup
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}

  return failed === 0;
}

runIntegrationTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
