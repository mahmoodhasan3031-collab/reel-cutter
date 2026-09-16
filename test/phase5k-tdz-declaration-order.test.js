'use strict';

/**
 * Phase 5K TDZ Regression — Declaration Order Guard
 *
 * Protects against the ReferenceError: Cannot access 'hasVideo' before
 * initialization bug. This test reads the actual App.jsx source and verifies
 * that `const hasVideo` is declared BEFORE the `handleApplyRecipe` useCallback
 * that depends on it via [hasVideo].
 *
 * This prevents the exact TDZ bug that caused the ErrorBoundary fallback:
 * "Something went wrong — An unexpected error occurred in the interface."
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const APP_JSX = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.jsx');

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
  console.log('');
  console.log('======================================================');
  console.log('🧪 Phase 5K TDZ Declaration Order Regression Tests');
  console.log('======================================================');
  console.log('');

  const source = fs.readFileSync(APP_JSX, 'utf-8');
  const lines = source.split('\n');

  // ─── 1. hasVideo declared before handleApplyRecipe ──────────────────────
  await test('1. const hasVideo declared BEFORE handleApplyRecipe useCallback', () => {
    let hasVideoLine = -1;
    let handleApplyRecipeLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('const hasVideo = !!videoPath') && hasVideoLine === -1) {
        hasVideoLine = i;
      }
      if (line.includes('const handleApplyRecipe = useCallback') && handleApplyRecipeLine === -1) {
        handleApplyRecipeLine = i;
      }
    }

    assert.ok(hasVideoLine > -1, 'const hasVideo = !!videoPath not found in App.jsx');
    assert.ok(handleApplyRecipeLine > -1, 'handleApplyRecipe useCallback not found in App.jsx');
    assert.ok(
      hasVideoLine < handleApplyRecipeLine,
      `const hasVideo (line ${hasVideoLine + 1}) must be declared BEFORE handleApplyRecipe (line ${handleApplyRecipeLine + 1}). ` +
      `Currently: hasVideo is at line ${hasVideoLine + 1}, handleApplyRecipe at line ${handleApplyRecipeLine + 1}. ` +
      `This causes ReferenceError: Cannot access 'hasVideo' before initialization (TDZ).`
    );
  });

  // ─── 2. handleApplyRecipe dependency array contains hasVideo ─────────────
  await test('2. handleApplyRecipe useCallback dependency array contains [hasVideo]', () => {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('const handleApplyRecipe = useCallback')) {
        // Search forward up to 25 lines for the closing }, [hasVideo])
        for (let j = i; j < Math.min(i + 25, lines.length); j++) {
          if (lines[j].includes('[hasVideo]')) {
            found = true;
            break;
          }
        }
        break;
      }
    }
    assert.ok(found, 'handleApplyRecipe must depend on [hasVideo] in its dependency array');
  });

  // ─── 3. No duplicate hasVideo declarations ──────────────────────────────
  await test('3. No duplicate const hasVideo declarations in App component', () => {
    const count = lines.filter(l => l.trim().startsWith('const hasVideo = !!videoPath')).length;
    assert.strictEqual(count, 1, `Expected exactly 1 const hasVideo declaration, found ${count}`);
  });

  // ─── 4. hasVideo used in handleApplyRecipe callback body ────────────────
  await test('4. handleApplyRecipe callback body references hasVideo', () => {
    let inHandleApply = false;
    let found = false;
    for (const line of lines) {
      if (line.includes('const handleApplyRecipe = useCallback')) {
        inHandleApply = true;
      }
      if (inHandleApply && line.includes('hasVideo')) {
        found = true;
        break;
      }
      if (inHandleApply && line.includes('}, [hasVideo])')) {
        break;
      }
    }
    assert.ok(found, 'handleApplyRecipe callback must reference hasVideo');
  });

  // ─── 5. hasVideo still used in rendering section ────────────────────────
  await test('5. hasVideo is still used in rendering condition', () => {
    const renderingUses = lines.filter(l =>
      l.includes('hasVideo &&') || l.includes('hasVideo={hasVideo}')
    ).length;
    assert.ok(renderingUses >= 1, 'hasVideo must be used in the JSX rendering section');
  });

  // ─── 6. TDZ would throw if hasVideo declared after handleApplyRecipe ────
  await test('6. TDZ pattern verification: would throw if reversed', () => {
    // Simulate the broken pattern
    try {
      // eslint-disable-next-line no-eval
      const fn = new Function(`
        // BROKEN: hasVideo used in deps array BEFORE declaration
        const deps = [hasVideo];
        const hasVideo = true;
      `);
      fn();
      // If we reach here, the test itself is broken
      assert.fail('TDZ simulation did not throw — test logic error');
    } catch (e) {
      assert.ok(
        e instanceof ReferenceError,
        `TDZ should throw ReferenceError, got: ${e.constructor.name}: ${e.message}`
      );
    }
  });

  // ─── 7. Correct pattern does NOT throw ──────────────────────────────────
  await test('7. Correct declaration order does NOT throw TDZ error', () => {
    try {
      const fn = new Function(`
        const hasVideo = false;
        const deps = [hasVideo];
        return deps[0];
      `);
      const result = fn();
      assert.strictEqual(result, false, 'Correct pattern should evaluate without error');
    } catch (e) {
      assert.fail(`Correct pattern should not throw: ${e.message}`);
    }
  });

  // ─── 8. Quick Reel recipe test still works with correct ordering ────────
  await test('8. Quick Reel appliedRecipeSnapshot is not involved in TDZ', () => {
    let recipeSnapshotLine = -1;
    let handleApplyLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('const [appliedRecipeSnapshot') && recipeSnapshotLine === -1) {
        recipeSnapshotLine = i;
      }
      if (lines[i].includes('handleApplyRecipe') && handleApplyLine === -1) {
        handleApplyLine = i;
      }
    }
    assert.ok(recipeSnapshotLine > -1, 'appliedRecipeSnapshot state not found');
    assert.ok(
      recipeSnapshotLine < handleApplyLine,
      'appliedRecipeSnapshot should be declared before handleApplyRecipe (useState hoisting order)'
    );
  });

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('');
  console.log('======================================================');
  console.log(`📊 Phase 5K TDZ Regression Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================');
  console.log('');

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
