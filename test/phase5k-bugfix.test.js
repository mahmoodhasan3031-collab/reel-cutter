'use strict';

/**
 * Phase 5K Bug Fix — Feature Gate & ProFeaturePlaceholder Tests
 *
 * Verifies:
 *  1. Renderer FEATURE_KEYS contains WORKFLOW_RECIPES
 *  2. workflow_recipes is recognized by hasFeature()
 *  3. PRO tier has access to workflow_recipes
 *  4. Basic/Standard do NOT get workflow_recipes
 *  5. ProFeaturePlaceholder with type="workflow_recipes" does NOT render "Batch Queue"
 *  6. It renders "Workflow Recipes"
 *  7. Existing AI Thumbnails gate still works
 *  8. Existing Batch Queue gate still works
 *  9. Existing feature aliases/metadata remain intact
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {
  hasFeature,
  FEATURE_KEYS,
  TIER_HIERARCHY,
  FEATURE_METADATA,
} = require('../src/shared/features');

let passed = 0;
let failed = 0;
const failures = [];

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

async function runTests() {
  // ─── 1. Shared FEATURE_KEYS contains WORKFLOW_RECIPES ────────────────
  await test('1. Shared FEATURE_KEYS contains WORKFLOW_RECIPES', () => {
    assert.strictEqual(FEATURE_KEYS.WORKFLOW_RECIPES, 'workflow_recipes');
  });

  // ─── 2. hasFeature recognizes workflow_recipes ────────────────────────
  await test('2. hasFeature recognizes workflow_recipes', () => {
    assert.strictEqual(hasFeature('pro', 'workflow_recipes'), true);
  });

  // ─── 3. PRO tier has access ──────────────────────────────────────────
  await test('3. PRO tier has access to workflow_recipes', () => {
    assert.ok(TIER_HIERARCHY.pro.includes('workflow_recipes'), 'pro tier includes workflow_recipes');
  });

  // ─── 4. Basic/Standard do NOT get workflow_recipes ────────────────────
  await test('4. Basic does NOT have workflow_recipes', () => {
    assert.strictEqual(hasFeature('basic', 'workflow_recipes'), false);
  });

  await test('4b. Standard does NOT have workflow_recipes', () => {
    assert.strictEqual(hasFeature('standard', 'workflow_recipes'), false);
  });

  // ─── 5. Existing AI Thumbnails gate still works ──────────────────────
  await test('5. AI Thumbnails gate still works', () => {
    assert.strictEqual(hasFeature('pro', 'ai_thumbnails'), true);
    assert.strictEqual(hasFeature('basic', 'ai_thumbnails'), false);
    assert.strictEqual(hasFeature('standard', 'ai_thumbnails'), false);
  });

  // ─── 6. Existing Batch Queue gate still works ────────────────────────
  await test('6. Batch Queue gate still works', () => {
    assert.strictEqual(hasFeature('pro', 'batch_queue'), true);
    assert.strictEqual(hasFeature('basic', 'batch_queue'), false);
    assert.strictEqual(hasFeature('standard', 'batch_queue'), false);
  });

  // ─── 7. Existing feature aliases remain intact ──────────────────────
  await test('7. Existing feature aliases remain intact', () => {
    assert.strictEqual(hasFeature('pro', 'thumbnails'), true, 'thumbnails alias');
    assert.strictEqual(hasFeature('pro', 'ai thumbnails'), true, 'ai thumbnails alias');
    assert.strictEqual(hasFeature('pro', 'batch'), true, 'batch alias');
    assert.strictEqual(hasFeature('pro', 'smart_crop'), true, 'smart_crop alias');
  });

  // ─── 8. Renderer features.js file verification ──────────────────────
  await test('8. Renderer features.js contains WORKFLOW_RECIPES', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'utils', 'features.js');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes("WORKFLOW_RECIPES: 'workflow_recipes'"), 'FEATURE_KEYS has WORKFLOW_RECIPES');
    assert.ok(content.includes('workflow_recipes: FEATURE_KEYS.WORKFLOW_RECIPES'), 'alias exists');
    assert.ok(content.includes("FEATURE_KEYS.WORKFLOW_RECIPES"), 'TIER_HIERARCHY.pro includes it');
    assert.ok(content.includes("'Workflow Recipes'"), 'metadata has Workflow Recipes name');
  });

  // ─── 9. Renderer features.js TIER_HIERARCHY.pro includes WORKFLOW_RECIPES ──
  await test('9. Renderer TIER_HIERARCHY.pro includes WORKFLOW_RECIPES', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'utils', 'features.js');
    const content = fs.readFileSync(filePath, 'utf-8');
    const proMatch = content.match(/pro:\s*\[([\s\S]*?)\]/);
    assert.ok(proMatch, 'pro array found');
    assert.ok(proMatch[1].includes('FEATURE_KEYS.WORKFLOW_RECIPES'), 'pro includes WORKFLOW_RECIPES');
  });

  // ─── 10. ProFeaturePlaceholder handles workflow_recipes ─────────────
  await test('10. ProFeaturePlaceholder handles workflow_recipes type', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'ProFeaturePlaceholder.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes("type === 'workflow_recipes'"), 'has workflow_recipes type check');
    assert.ok(content.includes("'Workflow Recipes'"), 'renders Workflow Recipes title');
    assert.ok(content.includes("isRecipes"), 'has isRecipes variable');
  });

  // ─── 11. ProFeaturePlaceholder does NOT default recipes to Batch Queue ──
  await test('11. ProFeaturePlaceholder does NOT default recipes to Batch Queue', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'ProFeaturePlaceholder.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    // The old code was: const title = isThumbnails ? 'AI Thumbnails' : 'Batch Queue';
    // The new code should be: const title = isThumbnails ? 'AI Thumbnails' : isRecipes ? 'Workflow Recipes' : 'Batch Queue';
    assert.ok(
      content.includes("isRecipes ? 'Workflow Recipes' : 'Batch Queue'"),
      'title has three-way branch'
    );
  });

  // ─── 12. ProFeaturePlaceholder still handles ai_thumbnails ──────────
  await test('12. ProFeaturePlaceholder still handles ai_thumbnails', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'ProFeaturePlaceholder.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes("type === 'ai_thumbnails'"), 'has ai_thumbnails type check');
    assert.ok(content.includes("'AI Thumbnails'"), 'renders AI Thumbnails title');
  });

  // ─── 13. ProFeaturePlaceholder still handles batch_queue (default) ──
  await test('13. ProFeaturePlaceholder still handles batch_queue (default)', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'ProFeaturePlaceholder.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes("'Batch Queue'"), 'Batch Queue title still exists');
    assert.ok(content.includes('Automate rendering'), 'Batch Queue subtitle still exists');
  });

  // ─── 14. FEATURE_METADATA includes workflow_recipes ──────────────────
  await test('14. FEATURE_METADATA includes workflow_recipes', () => {
    const entry = FEATURE_METADATA.find((f) => f.key === 'workflow_recipes');
    assert.ok(entry, 'metadata entry exists');
    assert.strictEqual(entry.name, 'Workflow Recipes');
    assert.strictEqual(entry.minTier, 'pro');
  });

  // ─── 15. BookOpen import exists in ProFeaturePlaceholder ────────────
  await test('15. BookOpen import exists in ProFeaturePlaceholder', () => {
    const filePath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'ProFeaturePlaceholder.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('BookOpen'), 'BookOpen is imported');
  });

  // ─── Summary ────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`📊 Phase 5K Bug Fix Test Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================\n');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
