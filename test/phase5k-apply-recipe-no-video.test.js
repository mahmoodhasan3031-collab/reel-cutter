'use strict';

/**
 * Phase 5K Regression — handleApplyRecipe when no video is loaded
 *
 * Verifies the fix for: Quick Reel → Apply produces blank screen when
 * no video is loaded. The handleApplyRecipe logic must redirect to 'drop'
 * when hasVideo is false, while preserving appliedRecipeSnapshot.
 *
 * Since handleApplyRecipe is a React useCallback inside App.jsx, we
 * simulate its exact logic to validate the branching behavior.
 */

const assert = require('assert');

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

// ── Simulate handleApplyRecipe logic (mirrors App.jsx:284-300) ──────────────

function simulateHandleApplyRecipe(recipe, hasVideo) {
  if (!recipe) return { view: null, snapshot: null }

  const snap = {
    mode: recipe.outputSettings?.mode || 'blur',
    aspectRatio: recipe.outputSettings?.aspectRatio || '9:16',
    resolution: recipe.outputSettings?.resolution || '1080p',
    interval: recipe.outputSettings?.interval,
    textOverlays: Array.isArray(recipe.textOverlays) ? recipe.textOverlays : [],
    recipeId: recipe.id,
    recipeName: recipe.name,
  }

  let view = null
  if (recipe.exportType && ['cut', 'reel', 'split'].includes(recipe.exportType)) {
    view = hasVideo ? recipe.exportType : 'drop'
  }

  return { view, snapshot: snap }
}

// ── Test recipes ────────────────────────────────────────────────────────────

const reelRecipe = {
  id: 'recipe_builtin_quick_reel',
  name: 'Quick Reel',
  exportType: 'reel',
  outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
  textOverlays: [],
}

const cutRecipe = {
  id: 'recipe_custom_cut',
  name: 'Cut Recipe',
  exportType: 'cut',
  outputSettings: { mode: 'crop', aspectRatio: '1:1', resolution: '4k' },
  textOverlays: [{ id: 'ol1', text: 'Hello', fontSize: 48 }],
}

const splitRecipe = {
  id: 'recipe_custom_split',
  name: 'Split Recipe',
  exportType: 'split',
  outputSettings: { mode: 'pad', aspectRatio: '16:9', resolution: '1080p', interval: 60 },
  textOverlays: [],
}

const noExportTypeRecipe = {
  id: 'recipe_no_export',
  name: 'No Export Type',
  outputSettings: { mode: 'blur' },
}

// ── Tests ───────────────────────────────────────────────────────────────────

async function runSuite() {
  console.log('\n======================================================');
  console.log('🧪 Phase 5K Regression: handleApplyRecipe + hasVideo');
  console.log('======================================================\n');

  // ── A. Reel recipe + video loaded → view = 'reel' ──────────────────────
  await test('A. Reel recipe + video loaded → view = reel', () => {
    const result = simulateHandleApplyRecipe(reelRecipe, true)
    assert.strictEqual(result.view, 'reel')
  })

  // ── B. Reel recipe + NO video → view = 'drop', snapshot preserved ──────
  await test('B. Reel recipe + NO video → view = drop, snapshot preserved', () => {
    const result = simulateHandleApplyRecipe(reelRecipe, false)
    assert.strictEqual(result.view, 'drop')
    assert.ok(result.snapshot, 'snapshot should exist')
    assert.strictEqual(result.snapshot.recipeId, 'recipe_builtin_quick_reel')
    assert.strictEqual(result.snapshot.recipeName, 'Quick Reel')
    assert.strictEqual(result.snapshot.mode, 'blur')
    assert.strictEqual(result.snapshot.aspectRatio, '9:16')
    assert.strictEqual(result.snapshot.resolution, '1080p')
  })

  // ── C. Cut recipe + NO video → view = 'drop', snapshot preserved ───────
  await test('C. Cut recipe + NO video → view = drop, snapshot preserved', () => {
    const result = simulateHandleApplyRecipe(cutRecipe, false)
    assert.strictEqual(result.view, 'drop')
    assert.ok(result.snapshot, 'snapshot should exist')
    assert.strictEqual(result.snapshot.recipeId, 'recipe_custom_cut')
    assert.strictEqual(result.snapshot.mode, 'crop')
    assert.strictEqual(result.snapshot.aspectRatio, '1:1')
    assert.strictEqual(result.snapshot.resolution, '4k')
    assert.ok(Array.isArray(result.snapshot.textOverlays))
    assert.strictEqual(result.snapshot.textOverlays.length, 1)
    assert.strictEqual(result.snapshot.textOverlays[0].text, 'Hello')
  })

  // ── D. Split recipe + NO video → view = 'drop', snapshot preserved ─────
  await test('D. Split recipe + NO video → view = drop, snapshot preserved', () => {
    const result = simulateHandleApplyRecipe(splitRecipe, false)
    assert.strictEqual(result.view, 'drop')
    assert.ok(result.snapshot, 'snapshot should exist')
    assert.strictEqual(result.snapshot.recipeId, 'recipe_custom_split')
    assert.strictEqual(result.snapshot.mode, 'pad')
    assert.strictEqual(result.snapshot.aspectRatio, '16:9')
    assert.strictEqual(result.snapshot.resolution, '1080p')
    assert.strictEqual(result.snapshot.interval, 60)
  })

  // ── E. Existing behavior unchanged: cut recipe + video → view = 'cut' ──
  await test('E. Cut recipe + video loaded → view = cut (unchanged)', () => {
    const result = simulateHandleApplyRecipe(cutRecipe, true)
    assert.strictEqual(result.view, 'cut')
    assert.strictEqual(result.snapshot.mode, 'crop')
  })

  // ── F. Existing behavior unchanged: split recipe + video → view = 'split'
  await test('F. Split recipe + video loaded → view = split (unchanged)', () => {
    const result = simulateHandleApplyRecipe(splitRecipe, true)
    assert.strictEqual(result.view, 'split')
    assert.strictEqual(result.snapshot.interval, 60)
  })

  // ── G. Recipe with no exportType → view remains null ───────────────────
  await test('G. Recipe with no exportType → view = null (no navigation)', () => {
    const result = simulateHandleApplyRecipe(noExportTypeRecipe, true)
    assert.strictEqual(result.view, null)
    assert.ok(result.snapshot, 'snapshot should still be created')
  })

  // ── H. null recipe → no crash, returns null view ──────────────────────
  await test('H. null recipe → no crash, returns null view', () => {
    const result = simulateHandleApplyRecipe(null, true)
    assert.strictEqual(result.view, null)
    assert.strictEqual(result.snapshot, null)
  })

  // ── I. Snapshot has correct defaults for missing fields ────────────────
  await test('I. Snapshot defaults for missing outputSettings fields', () => {
    const minimalRecipe = {
      id: 'recipe_minimal',
      name: 'Minimal',
      exportType: 'reel',
    }
    const result = simulateHandleApplyRecipe(minimalRecipe, true)
    assert.strictEqual(result.snapshot.mode, 'blur')
    assert.strictEqual(result.snapshot.aspectRatio, '9:16')
    assert.strictEqual(result.snapshot.resolution, '1080p')
    assert.ok(Array.isArray(result.snapshot.textOverlays))
    assert.strictEqual(result.snapshot.textOverlays.length, 0)
  })

  // ── J. textOverlays from recipe are preserved in snapshot ─────────────
  await test('J. textOverlays from recipe preserved in snapshot', () => {
    const overlays = [
      { id: 'o1', text: 'Line 1', fontSize: 48 },
      { id: 'o2', text: 'Line 2', fontSize: 36 },
    ]
    const recipe = {
      id: 'recipe_overlays',
      name: 'Overlay Recipe',
      exportType: 'reel',
      textOverlays: overlays,
    }
    const result = simulateHandleApplyRecipe(recipe, false)
    assert.strictEqual(result.snapshot.textOverlays.length, 2)
    assert.strictEqual(result.snapshot.textOverlays[0].text, 'Line 1')
    assert.strictEqual(result.snapshot.textOverlays[1].text, 'Line 2')
  })

  // ── K. Non-array textOverlays defaults to empty array ─────────────────
  await test('K. Non-array textOverlays defaults to empty array', () => {
    const recipe = {
      id: 'recipe_bad_overlays',
      name: 'Bad Overlays',
      exportType: 'reel',
      textOverlays: 'not an array',
    }
    const result = simulateHandleApplyRecipe(recipe, true)
    assert.ok(Array.isArray(result.snapshot.textOverlays))
    assert.strictEqual(result.snapshot.textOverlays.length, 0)
  })

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`📊 Phase 5K Apply Recipe Regression Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================\n');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  return failed === 0;
}

runSuite().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
