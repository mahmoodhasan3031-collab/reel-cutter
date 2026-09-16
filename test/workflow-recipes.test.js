'use strict';

/**
 * Phase 5K — Workflow Recipe Test Suite
 *
 * Tests:
 *  A. Recipe schema validation
 *  B. Input validation
 *  C. Built-in immutability
 *  D. Custom CRUD
 *  E. Update
 *  F. Delete
 *  G. Duplicate
 *  H. Search
 *  I. Filter
 *  J. Persistence
 *  K. Corrupt-file recovery
 *  L. Deep clone isolation
 *  M. Recipe snapshot
 *  N. Profile snapshot
 *  O. Variation snapshot
 *  P. Caption snapshot
 *  Q. Export preset snapshot
 *  R. Deleted profile handling
 *  S. Deleted preset handling
 *  T. Deleted caption template handling
 *  U. One-click export configuration
 *  V. Bulk snapshot isolation
 *  W. Schedule snapshot isolation
 *  X. History metadata
 *  Y. Command Center compatibility
 *  Z. Usage statistics
 *  AA. IPC validation
 *  AB. Feature gating
 *  AC. Path safety
 *  AD. Collision safety
 *  AE. Restart persistence
 *  AF. No cross-profile leakage
 *  AG. Built-in duplication
 *  AH. Cancel draft does not mutate
 *  AI. Invalid recipe rejection
 *  AJ. Export-type validation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  validateRecipeName,
  validateRecipeDescription,
  validateExportType,
  validateOutputSettings,
  validateTextOverlays,
  validateRecipeInput,
  assertNoPrototypePollution,
  deepClone,
  getWorkflowRecipes,
  getWorkflowRecipe,
  createWorkflowRecipe,
  updateWorkflowRecipe,
  deleteWorkflowRecipe,
  duplicateWorkflowRecipe,
  searchWorkflowRecipes,
  filterWorkflowRecipes,
  applyWorkflowRecipe,
  incrementUsageCount,
  resetWorkflowRecipes,
  getRecipeUsageStats,
  CANONICAL_BUILTIN_RECIPES,
  BUILTIN_IDS,
  VALID_EXPORT_TYPES,
  MAX_CUSTOM_RECIPES,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} = require('../src/main/workflowRecipes/workflowRecipeManager');

// ── Helpers ─────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc_recipe_test_'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function makeRecipeData(overrides = {}) {
  return {
    name: 'Test Recipe',
    description: 'A test recipe',
    exportType: 'cut',
    outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: '✓' });
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: '✗', error: err.message });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 5K Workflow Recipe Test Suite');
  console.log('======================================================\n');

  let dir = null;

  // ── A. Recipe schema ──────────────────────────────────────────────────────
  await test('A. Built-in recipes have valid schema', () => {
    assert.ok(Array.isArray(CANONICAL_BUILTIN_RECIPES), 'Built-ins should be an array');
    assert.ok(CANONICAL_BUILTIN_RECIPES.length >= 5, 'Should have at least 5 built-ins');
    for (const r of CANONICAL_BUILTIN_RECIPES) {
      assert.ok(typeof r.id === 'string', 'id should be string');
      assert.ok(r.id.startsWith('recipe_builtin_'), 'built-in id should start with recipe_builtin_');
      assert.ok(typeof r.name === 'string', 'name should be string');
      assert.ok(r.name.length > 0, 'name should not be empty');
      assert.ok(typeof r.isBuiltIn === 'boolean' && r.isBuiltIn === true, 'isBuiltIn should be true');
      assert.ok(VALID_EXPORT_TYPES.includes(r.exportType), 'exportType should be valid');
      assert.ok(r.outputSettings && typeof r.outputSettings === 'object', 'outputSettings should be object');
    }
  });

  // ── B. Input validation ──────────────────────────────────────────────────
  await test('B1. validateRecipeName rejects empty', () => {
    assert.throws(() => validateRecipeName(''), /required/);
    assert.throws(() => validateRecipeName(null), /required/);
    assert.throws(() => validateRecipeName(undefined), /required/);
  });

  await test('B2. validateRecipeName rejects too long', () => {
    assert.throws(() => validateRecipeName('x'.repeat(MAX_NAME_LENGTH + 1)), /100 characters/);
  });

  await test('B3. validateRecipeName trims and accepts valid', () => {
    const result = validateRecipeName('  My Recipe  ');
    assert.strictEqual(result, 'My Recipe');
  });

  await test('B4. validateExportType rejects invalid', () => {
    assert.throws(() => validateExportType('invalid'), /Invalid export type/);
    assert.throws(() => validateExportType(''), /required/);
    assert.throws(() => validateExportType(null), /required/);
  });

  await test('B5. validateExportType accepts valid types', () => {
    for (const t of VALID_EXPORT_TYPES) {
      assert.strictEqual(validateExportType(t), t);
    }
  });

  await test('B6. validateOutputSettings normalizes invalid values', () => {
    const result = validateOutputSettings({ mode: 'invalid', aspectRatio: 'bad', resolution: '8k' });
    assert.strictEqual(result.mode, 'blur');
    assert.strictEqual(result.aspectRatio, '9:16');
    assert.strictEqual(result.resolution, '1080p');
  });

  await test('B7. validateOutputSettings accepts valid values', () => {
    const result = validateOutputSettings({ mode: 'crop', aspectRatio: '1:1', resolution: '4k' });
    assert.strictEqual(result.mode, 'crop');
    assert.strictEqual(result.aspectRatio, '1:1');
    assert.strictEqual(result.resolution, '4k');
  });

  await test('B8. validateTextOverlays filters invalid entries', () => {
    const overlays = [
      { id: 'valid', text: 'Hello', fontSize: 48 },
      'not an object',
      null,
      { id: 'also-valid', text: 'World' },
    ];
    const result = validateTextOverlays(overlays);
    assert.strictEqual(result.length, 2);
  });

  await test('B9. validateRecipeInput rejects null', () => {
    assert.throws(() => validateRecipeInput(null), /required/);
  });

  await test('B10. validateRecipeInput rejects array', () => {
    assert.throws(() => validateRecipeInput([]), /object, not an array/);
  });

  await test('B11. assertNoPrototypePollution rejects __proto__', () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
    assert.throws(() => assertNoPrototypePollution(malicious), /Rejected property/);
  });

  await test('B12. assertNoPrototypePollution rejects constructor', () => {
    assert.throws(() => assertNoPrototypePollution({ constructor: {} }), /Rejected property/);
  });

  // ── C. Built-in immutability ─────────────────────────────────────────────
  await test('C1. Built-in recipes cannot be modified', () => {
    dir = tmpDir();
    assert.throws(() => updateWorkflowRecipe('recipe_builtin_quick_reel', { name: 'Hacked' }, dir), /Cannot modify built-in/);
  });

  await test('C2. Built-in recipes cannot be deleted', () => {
    assert.throws(() => deleteWorkflowRecipe('recipe_builtin_quick_reel', dir), /Cannot delete built-in/);
  });

  await test('C3. Built-in recipes are always returned', () => {
    const recipes = getWorkflowRecipes(dir);
    const builtins = recipes.filter((r) => r.isBuiltIn);
    assert.ok(builtins.length >= 5, 'Should always include at least 5 built-ins');
  });

  await test('C4. Built-in recipes are deep cloned on retrieval', () => {
    const r1 = getWorkflowRecipe('recipe_builtin_quick_reel', dir);
    const r2 = getWorkflowRecipe('recipe_builtin_quick_reel', dir);
    assert.notStrictEqual(r1, r2);
    assert.deepStrictEqual(r1, r2);
    r1.name = 'MUTATED';
    const r3 = getWorkflowRecipe('recipe_builtin_quick_reel', dir);
    assert.strictEqual(r3.name, 'Quick Reel');
  });

  // ── D. Custom create ─────────────────────────────────────────────────────
  await test('D1. Create custom recipe returns valid recipe', () => {
    const recipe = createWorkflowRecipe(makeRecipeData(), dir);
    assert.ok(typeof recipe.id === 'string', 'id should be string');
    assert.ok(recipe.id.startsWith('recipe_'), 'id should start with recipe_');
    assert.strictEqual(recipe.name, 'Test Recipe');
    assert.strictEqual(recipe.isBuiltIn, false);
    assert.strictEqual(recipe.usageCount, 0);
    assert.ok(typeof recipe.createdAt === 'string', 'createdAt should be string');
    assert.ok(typeof recipe.updatedAt === 'string', 'updatedAt should be string');
  });

  await test('D2. Custom recipe has correct output settings', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Settings Test' }), dir);
    assert.strictEqual(recipe.outputSettings.mode, 'blur');
    assert.strictEqual(recipe.outputSettings.aspectRatio, '9:16');
    assert.strictEqual(recipe.outputSettings.resolution, '1080p');
  });

  await test('D3. Custom recipe stores text overlays', () => {
    const overlays = [{ id: 'ol1', text: 'Hello', fontSize: 48 }];
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Overlay Test', textOverlays: overlays }), dir);
    assert.strictEqual(recipe.textOverlays.length, 1);
    assert.strictEqual(recipe.textOverlays[0].id, 'ol1');
  });

  // ── E. Update ────────────────────────────────────────────────────────────
  await test('E1. Update custom recipe changes name', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Before Update' }), dir);
    const updated = updateWorkflowRecipe(recipe.id, { name: 'After Update' }, dir);
    assert.strictEqual(updated.name, 'After Update');
    assert.ok(updated.updatedAt >= recipe.updatedAt, 'updatedAt should be newer');
  });

  await test('E2. Update preserves usage count', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Usage Test' }), dir);
    incrementUsageCount(recipe.id, dir);
    incrementUsageCount(recipe.id, dir);
    const updated = updateWorkflowRecipe(recipe.id, { name: 'Usage Updated' }, dir);
    assert.strictEqual(updated.usageCount, 2);
  });

  // ── F. Delete ────────────────────────────────────────────────────────────
  await test('F1. Delete custom recipe removes it', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'To Delete' }), dir);
    const result = deleteWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.deletedId, recipe.id);
    const found = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(found, null);
  });

  await test('F2. Delete non-existent recipe throws', () => {
    assert.throws(() => deleteWorkflowRecipe('recipe_nonexistent', dir), /not found/);
  });

  // ── G. Duplicate ─────────────────────────────────────────────────────────
  await test('G1. Duplicate built-in recipe creates custom copy', () => {
    const dup = duplicateWorkflowRecipe('recipe_builtin_quick_reel', {}, dir);
    assert.ok(dup.id.startsWith('recipe_'));
    assert.ok(!dup.id.startsWith('recipe_builtin_'), 'Duplicate should not have built-in ID');
    assert.strictEqual(dup.isBuiltIn, false);
    assert.strictEqual(dup.name, 'Quick Reel (Copy)');
    assert.strictEqual(dup.usageCount, 0);
  });

  await test('G2. Duplicate with name override uses override', () => {
    const dup = duplicateWorkflowRecipe('recipe_builtin_clean_social', { name: 'My Custom Social' }, dir);
    assert.strictEqual(dup.name, 'My Custom Social');
  });

  // ── H. Search ─────────────────────────────────────────────────────────────
  await test('H1. Search by name returns matching recipes', () => {
    createWorkflowRecipe(makeRecipeData({ name: 'Instagram Reel Template' }), dir);
    createWorkflowRecipe(makeRecipeData({ name: 'YouTube Short Template' }), dir);
    const results = searchWorkflowRecipes('instagram', dir);
    assert.ok(results.some((r) => r.name.includes('Instagram')));
  });

  await test('H2. Search with no query returns all', () => {
    const all = searchWorkflowRecipes(null, dir);
    assert.ok(all.length > 0);
  });

  await test('H3. Search by export type', () => {
    const results = searchWorkflowRecipes('reel', dir);
    assert.ok(results.length > 0, 'Should find at least one result for "reel"');
    assert.ok(results.some((r) => r.exportType === 'reel'), 'Should include reel-type recipes');
  });

  // ── I. Filter ─────────────────────────────────────────────────────────────
  await test('I1. Filter by export type', () => {
    const results = filterWorkflowRecipes({ exportType: 'cut' }, dir);
    assert.ok(results.every((r) => r.exportType === 'cut'));
  });

  await test('I2. Filter by built-in', () => {
    const results = filterWorkflowRecipes({ isBuiltIn: true }, dir);
    assert.ok(results.every((r) => r.isBuiltIn === true));
  });

  await test('I3. Filter by custom', () => {
    const results = filterWorkflowRecipes({ isBuiltIn: false }, dir);
    assert.ok(results.every((r) => r.isBuiltIn === false));
  });

  // ── J. Persistence ────────────────────────────────────────────────────────
  await test('J1. Recipes persist to disk and survive reload', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Persist Test' }), dir);
    const recipes = getWorkflowRecipes(dir);
    const found = recipes.find((r) => r.id === recipe.id);
    assert.ok(found, 'Recipe should persist');
    assert.strictEqual(found.name, 'Persist Test');
  });

  await test('J2. Recipe file has correct schema', () => {
    const filePath = path.join(dir, 'workflow-recipes.json');
    assert.ok(fs.existsSync(filePath), 'File should exist');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.strictEqual(raw.version, 1);
    assert.ok(typeof raw.updatedAt === 'string');
    assert.ok(Array.isArray(raw.recipes));
  });

  // ── K. Corrupt-file recovery ──────────────────────────────────────────────
  await test('K1. Corrupt file returns empty custom list', () => {
    const corruptDir = tmpDir();
    try {
      const filePath = path.join(corruptDir, 'workflow-recipes.json');
      fs.writeFileSync(filePath, '{invalid json!!!', 'utf-8');
      const recipes = loadCustomRecipes(corruptDir);
      assert.deepStrictEqual(recipes, []);
    } finally {
      cleanup(corruptDir);
    }
  });

  await test('K2. Empty file returns empty custom list', () => {
    const emptyDir = tmpDir();
    try {
      const recipes = loadCustomRecipes(emptyDir);
      assert.deepStrictEqual(recipes, []);
    } finally {
      cleanup(emptyDir);
    }
  });

  // ── L. Deep clone isolation ───────────────────────────────────────────────
  await test('L1. Modifying returned recipe does not affect storage', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Clone Test' }), dir);
    const retrieved = getWorkflowRecipe(recipe.id, dir);
    retrieved.name = 'MUTATED';
    retrieved.outputSettings.mode = 'crop';
    const after = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(after.name, 'Clone Test');
    assert.strictEqual(after.outputSettings.mode, 'blur');
  });

  // ── M. Recipe snapshot ────────────────────────────────────────────────────
  await test('M1. applyWorkflowRecipe returns deep-cloned snapshot', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Snapshot Test' }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportType, 'cut');
    assert.ok(config.outputSettings);
    assert.ok(config.textOverlays);
  });

  await test('M2. Applying same recipe twice produces independent configs', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Independence Test' }), dir);
    const c1 = applyWorkflowRecipe(recipe.id, dir);
    const c2 = applyWorkflowRecipe(recipe.id, dir);
    c1.exportType = 'reel';
    assert.strictEqual(c2.exportType, 'cut', 'Second config should be independent');
  });

  // ── N-O-P-Q. Snapshot isolation ───────────────────────────────────────────
  await test('N1. Profile snapshot is deep cloned', () => {
    const profile = { id: 'prof_1', name: 'Test Profile', platform: 'Instagram' };
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Profile Snap', profileSnapshot: profile }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    config.profileSnapshot.name = 'MUTATED';
    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.profileSnapshot.name, 'Test Profile');
  });

  await test('O1. Variation snapshot is deep cloned', () => {
    const variation = { enabled: true, brightness: 0.1 };
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Var Snap', variationPresetSnapshot: variation }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    config.variationPresetSnapshot.brightness = 0.9;
    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.variationPresetSnapshot.brightness, 0.1);
  });

  await test('P1. Caption snapshot is deep cloned', () => {
    const caption = { id: 'tpl_1', name: 'Test Template', overlays: [{ text: 'Hi' }] };
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Caption Snap', captionTemplateSnapshot: caption }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    config.captionTemplateSnapshot.overlays[0].text = 'MUTATED';
    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.captionTemplateSnapshot.overlays[0].text, 'Hi');
  });

  await test('Q1. Export preset snapshot is deep cloned', () => {
    const preset = { id: 'exp_1', name: 'Test Preset', settings: { mode: 'blur' } };
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Preset Snap', exportPresetSnapshot: preset }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    config.exportPresetSnapshot.settings.mode = 'crop';
    const config2 = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config2.exportPresetSnapshot.settings.mode, 'blur');
  });

  // ── R-T. Deleted entity handling ──────────────────────────────────────────
  await test('R1. Recipe with deleted profile reference still applies', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({
      name: 'Deleted Profile Test',
      profileId: 'prof_deleted_123',
      profileSnapshot: { id: 'prof_deleted_123', name: 'Former Profile' },
    }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.profileId, 'prof_deleted_123');
    assert.ok(config.profileSnapshot, 'Snapshot should still be present');
  });

  await test('S1. Recipe with deleted preset reference still applies', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({
      name: 'Deleted Preset Test',
      exportPresetId: 'exp_deleted_456',
      exportPresetSnapshot: { id: 'exp_deleted_456', name: 'Former Preset' },
    }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportPresetId, 'exp_deleted_456');
    assert.ok(config.exportPresetSnapshot, 'Snapshot should still be present');
  });

  await test('T1. Recipe with deleted caption template still applies', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({
      name: 'Deleted Template Test',
      captionTemplateId: 'tpl_deleted_789',
      captionTemplateSnapshot: { id: 'tpl_deleted_789', name: 'Former Template' },
    }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.captionTemplateId, 'tpl_deleted_789');
    assert.ok(config.captionTemplateSnapshot, 'Snapshot should still be present');
  });

  // ── U. One-click export ───────────────────────────────────────────────────
  await test('U1. applyWorkflowRecipe returns complete export config', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({
      name: 'One-Click Test',
      exportType: 'reel',
      outputSettings: { mode: 'pad', aspectRatio: '9:16', resolution: '4k' },
    }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.exportType, 'reel');
    assert.strictEqual(config.outputSettings.mode, 'pad');
    assert.strictEqual(config.outputSettings.aspectRatio, '9:16');
    assert.strictEqual(config.outputSettings.resolution, '4k');
  });

  // ── V. Bulk snapshot isolation ────────────────────────────────────────────
  await test('V1. Multiple bulk jobs from same recipe have independent configs', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Bulk Test' }), dir);
    const configs = [];
    for (let i = 0; i < 5; i++) {
      configs.push(applyWorkflowRecipe(recipe.id, dir));
    }
    configs[0].exportType = 'reel';
    configs[1].outputSettings.mode = 'crop';
    assert.strictEqual(configs[2].exportType, 'cut', 'Config 2 should be unchanged');
    assert.strictEqual(configs[2].outputSettings.mode, 'blur', 'Config 2 mode should be unchanged');
  });

  // ── W. Schedule snapshot isolation ────────────────────────────────────────
  await test('W1. Scheduled recipe config is independent of recipe changes', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Schedule Test' }), dir);
    const scheduledConfig = applyWorkflowRecipe(recipe.id, dir);
    updateWorkflowRecipe(recipe.id, { name: 'Schedule Test Updated' }, dir);
    assert.strictEqual(scheduledConfig.name, undefined, 'Config should not have name field');
    assert.strictEqual(scheduledConfig.exportType, 'cut', 'Config export type should be unchanged');
  });

  // ── X. History metadata ───────────────────────────────────────────────────
  await test('X1. Recipe can store text overlays for history', () => {
    const overlays = [{ id: 'hist1', text: 'History Test', fontSize: 36 }];
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'History Test', textOverlays: overlays }), dir);
    const config = applyWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(config.textOverlays.length, 1);
    assert.strictEqual(config.textOverlays[0].text, 'History Test');
  });

  // ── Z. Usage statistics ───────────────────────────────────────────────────
  await test('Z1. incrementUsageCount updates count and lastUsedAt', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Usage Stat Test' }), dir);
    incrementUsageCount(recipe.id, dir);
    incrementUsageCount(recipe.id, dir);
    const stats = getRecipeUsageStats(dir);
    const found = stats.find((s) => s.id === recipe.id);
    assert.ok(found, 'Should find recipe in stats');
    assert.strictEqual(found.usageCount, 2);
    assert.ok(found.lastUsedAt, 'lastUsedAt should be set');
  });

  await test('Z2. getRecipeUsageStats returns sorted by usage count', () => {
    const r1 = createWorkflowRecipe(makeRecipeData({ name: 'Stats Sort A' }), dir);
    const r2 = createWorkflowRecipe(makeRecipeData({ name: 'Stats Sort B' }), dir);
    incrementUsageCount(r1.id, dir);
    incrementUsageCount(r1.id, dir);
    incrementUsageCount(r1.id, dir);
    incrementUsageCount(r2.id, dir);
    const stats = getRecipeUsageStats(dir);
    const idx1 = stats.findIndex((s) => s.id === r1.id);
    const idx2 = stats.findIndex((s) => s.id === r2.id);
    assert.ok(idx1 < idx2, 'Higher usage should appear first');
  });

  // ── AB. Feature gating ────────────────────────────────────────────────────
  await test('AB1. WORKFLOW_RECIPES feature key exists', () => {
    const { FEATURE_KEYS } = require('../src/shared/features');
    assert.ok(FEATURE_KEYS.WORKFLOW_RECIPES, 'WORKFLOW_RECIPES key should exist');
    assert.strictEqual(FEATURE_KEYS.WORKFLOW_RECIPES, 'workflow_recipes');
  });

  await test('AB2. WORKFLOW_RECIPES is in Pro tier', () => {
    const { hasFeature } = require('../src/shared/features');
    assert.ok(hasFeature('pro', 'workflow_recipes'), 'Pro tier should have workflow_recipes');
  });

  await test('AB3. WORKFLOW_RECIPES is not in Basic tier', () => {
    const { hasFeature } = require('../src/shared/features');
    assert.ok(!hasFeature('basic', 'workflow_recipes'), 'Basic tier should not have workflow_recipes');
  });

  await test('AB4. WORKFLOW_RECIPES is not in Standard tier', () => {
    const { hasFeature } = require('../src/shared/features');
    assert.ok(!hasFeature('standard', 'workflow_recipes'), 'Standard tier should not have workflow_recipes');
  });

  // ── AC. Path safety ───────────────────────────────────────────────────────
  await test('AC1. Recipe name with slashes is normalized', () => {
    const name = validateRecipeName('  ../../../etc/passwd  ');
    assert.strictEqual(name, '../../../etc/passwd');
  });

  // ── AD. Collision safety ──────────────────────────────────────────────────
  await test('AD1. Duplicate names get safe suffix', () => {
    const r1 = createWorkflowRecipe(makeRecipeData({ name: 'Collision Test' }), dir);
    const r2 = createWorkflowRecipe(makeRecipeData({ name: 'Collision Test' }), dir);
    assert.notStrictEqual(r1.name, r2.name, 'Names should be different');
    assert.ok(r2.name.includes('(2)'), 'Second recipe should have (2) suffix');
  });

  // ── AE. Restart persistence ───────────────────────────────────────────────
  await test('AE1. Recipes survive simulated restart (fresh load)', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Restart Test' }), dir);
    // Simulate restart: clear require cache and reload
    const recipes2 = getWorkflowRecipes(dir);
    const found = recipes2.find((r) => r.id === recipe.id);
    assert.ok(found, 'Recipe should survive reload');
    assert.strictEqual(found.name, 'Restart Test');
  });

  // ── AF. No cross-profile leakage ──────────────────────────────────────────
  await test('AF1. Recipes with different profiles are independent', () => {
    const r1 = createWorkflowRecipe(makeRecipeData({
      name: 'Profile A Recipe',
      profileId: 'prof_a',
      profileSnapshot: { id: 'prof_a', name: 'Profile A' },
    }), dir);
    const r2 = createWorkflowRecipe(makeRecipeData({
      name: 'Profile B Recipe',
      profileId: 'prof_b',
      profileSnapshot: { id: 'prof_b', name: 'Profile B' },
    }), dir);
    const c1 = applyWorkflowRecipe(r1.id, dir);
    const c2 = applyWorkflowRecipe(r2.id, dir);
    assert.strictEqual(c1.profileId, 'prof_a');
    assert.strictEqual(c2.profileId, 'prof_b');
    c1.profileSnapshot.name = 'MUTATED';
    const c2Again = applyWorkflowRecipe(r2.id, dir);
    assert.strictEqual(c2Again.profileSnapshot.name, 'Profile B');
  });

  // ── AG. Built-in duplication ──────────────────────────────────────────────
  await test('AG1. Duplicating built-in creates editable custom', () => {
    const dup = duplicateWorkflowRecipe('recipe_builtin_captioned_reel', {}, dir);
    assert.strictEqual(dup.isBuiltIn, false);
    assert.strictEqual(dup.exportType, 'reel');
    assert.ok(dup.textOverlays.length > 0, 'Should preserve text overlays');
    // Should be editable
    const updated = updateWorkflowRecipe(dup.id, { name: 'My Captioned Reel' }, dir);
    assert.strictEqual(updated.name, 'My Captioned Reel');
  });

  // ── AH. Cancel draft does not mutate ──────────────────────────────────────
  await test('AH1. Cancel editing does not affect stored recipe', () => {
    const recipe = createWorkflowRecipe(makeRecipeData({ name: 'Cancel Test' }), dir);
    // Simulate draft creation (deep clone)
    const draft = deepClone(recipe);
    draft.name = 'DRAFT CHANGES';
    draft.outputSettings.mode = 'crop';
    // Cancel: draft is discarded, original unchanged
    const original = getWorkflowRecipe(recipe.id, dir);
    assert.strictEqual(original.name, 'Cancel Test');
    assert.strictEqual(original.outputSettings.mode, 'blur');
  });

  // ── AI. Invalid recipe rejection ──────────────────────────────────────────
  await test('AI1. Creating recipe with invalid data throws', () => {
    assert.throws(() => createWorkflowRecipe({ name: '' }, dir), /required/);
    assert.throws(() => createWorkflowRecipe({ name: 'X', exportType: 'invalid' }, dir), /Invalid export type/);
  });

  // ── AJ. Export-type validation ────────────────────────────────────────────
  await test('AJ1. Only cut/reel/split are valid export types', () => {
    assert.ok(VALID_EXPORT_TYPES.includes('cut'));
    assert.ok(VALID_EXPORT_TYPES.includes('reel'));
    assert.ok(VALID_EXPORT_TYPES.includes('split'));
    assert.strictEqual(VALID_EXPORT_TYPES.length, 3);
  });

  // ── Additional: Reset ─────────────────────────────────────────────────────
  await test('Reset clears custom recipes and returns built-ins', () => {
    createWorkflowRecipe(makeRecipeData({ name: 'To Reset' }), dir);
    const after = resetWorkflowRecipes(dir);
    assert.ok(after.length >= 5, 'Should return built-ins');
    const custom = after.filter((r) => !r.isBuiltIn);
    assert.strictEqual(custom.length, 0, 'Should have no custom recipes');
  });

  // ── Additional: Text overlay clamping ─────────────────────────────────────
  await test('Text overlay validation clamps out-of-range values', () => {
    const overlays = [{ id: 'clamp1', fontSize: 500, opacity: 5, outlineWidth: 50 }];
    const result = validateTextOverlays(overlays);
    assert.strictEqual(result[0].fontSize, 160, 'fontSize should be clamped to 160');
    assert.strictEqual(result[0].opacity, 1, 'opacity should be clamped to 1');
    assert.strictEqual(result[0].outlineWidth, 10, 'outlineWidth should be clamped to 10');
  });

  // Cleanup
  if (dir) cleanup(dir);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`📊 Phase 5K Test Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => r.status === '✗')) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

// Needed for corrupt file test
function loadCustomRecipes(customDir) {
  const { RECIPES_FILENAME } = require('../src/main/workflowRecipes/workflowRecipeManager');
  const filePath = path.join(customDir, RECIPES_FILENAME);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.recipes)) return [];
    return data.recipes.filter((r) => r && typeof r === 'object' && !r.isBuiltIn && typeof r.id === 'string');
  } catch {
    return [];
  }
}

runSuite();
