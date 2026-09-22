const assert = require('assert');
const { hasFeature, FEATURE_KEYS, getTierFeatureList, TIER_PRICING } = require('../src/shared/features');

async function runFeatureTests() {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 4 Feature Gating & Tier Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}\n${err.stack}`);
    }
  }

  // ─── 1. Basic Tier Feature Checks ──────────────────────────────────────────
  test('1. Basic Tier: Video cutting is enabled', () => {
    assert.strictEqual(hasFeature('basic', 'cutting'), true);
    assert.strictEqual(hasFeature('basic', FEATURE_KEYS.CUTTING), true);
  });

  test('2. Basic Tier: 1080p export is enabled', () => {
    assert.strictEqual(hasFeature('basic', '1080p export'), true);
    assert.strictEqual(hasFeature('basic', '1080p'), true);
    assert.strictEqual(hasFeature('basic', FEATURE_KEYS.EXPORT_1080P), true);
  });

  test('3. Basic Tier: 4K export is locked', () => {
    assert.strictEqual(hasFeature('basic', '4K export'), false);
    assert.strictEqual(hasFeature('basic', '4k'), false);
  });

  test('4. Basic Tier: Custom durations are locked', () => {
    assert.strictEqual(hasFeature('basic', 'custom durations'), false);
  });

  test('5. Basic Tier: All aspect ratios are locked', () => {
    assert.strictEqual(hasFeature('basic', 'all aspect ratios'), false);
  });

  test('6. Basic Tier: Pro features (AI thumbnails, smart crop, batch queue) are locked', () => {
    assert.strictEqual(hasFeature('basic', 'ai thumbnails'), false);
    assert.strictEqual(hasFeature('basic', 'smart crop'), false);
    assert.strictEqual(hasFeature('basic', 'batch queue'), false);
  });

  // ─── 2. Standard Tier Feature Checks ───────────────────────────────────────
  test('7. Standard Tier: Basic features (cutting, 1080p) are enabled', () => {
    assert.strictEqual(hasFeature('standard', 'cutting'), true);
    assert.strictEqual(hasFeature('standard', '1080p export'), true);
  });

  test('8. Standard Tier: 4K export is enabled', () => {
    assert.strictEqual(hasFeature('standard', '4K export'), true);
    assert.strictEqual(hasFeature('standard', '4k'), true);
  });

  test('9. Standard Tier: All aspect ratios and custom durations are enabled', () => {
    assert.strictEqual(hasFeature('standard', 'all aspect ratios'), true);
    assert.strictEqual(hasFeature('standard', 'custom durations'), true);
  });

  test('10. Standard Tier: Pro features (AI thumbnails, smart crop, batch queue) remain locked', () => {
    assert.strictEqual(hasFeature('standard', 'ai thumbnails'), false);
    assert.strictEqual(hasFeature('standard', 'smart crop'), false);
    assert.strictEqual(hasFeature('standard', 'batch queue'), false);
  });

  // ─── 3. Pro Tier Feature Checks ───────────────────────────────────────────
  test('11. Pro Tier: All standard features are enabled', () => {
    assert.strictEqual(hasFeature('pro', 'cutting'), true);
    assert.strictEqual(hasFeature('pro', '1080p export'), true);
    assert.strictEqual(hasFeature('pro', '4K export'), true);
    assert.strictEqual(hasFeature('pro', 'all aspect ratios'), true);
    assert.strictEqual(hasFeature('pro', 'custom durations'), true);
  });

  test('12. Pro Tier: AI Thumbnails access is enabled', () => {
    assert.strictEqual(hasFeature('pro', 'ai thumbnails'), true);
    assert.strictEqual(hasFeature('pro', FEATURE_KEYS.AI_THUMBNAILS), true);
  });

  test('13. Pro Tier: Smart Crop access is enabled', () => {
    assert.strictEqual(hasFeature('pro', 'smart crop'), true);
    assert.strictEqual(hasFeature('pro', FEATURE_KEYS.SMART_CROP), true);
  });

  test('14. Pro Tier: Batch Queue access is enabled', () => {
    assert.strictEqual(hasFeature('pro', 'batch queue'), true);
    assert.strictEqual(hasFeature('pro', FEATURE_KEYS.BATCH_QUEUE), true);
  });

  // ─── 4. Command Center & Dashboard Feature Gating ─────────────────────────
  test('15. Command Center: Locked on Basic tier', () => {
    assert.strictEqual(hasFeature('basic', 'export command center'), false);
    assert.strictEqual(hasFeature('basic', 'export_command_center'), false);
    assert.strictEqual(hasFeature('basic', FEATURE_KEYS.EXPORT_COMMAND_CENTER), false);
  });

  test('16. Command Center: Locked on Standard tier', () => {
    assert.strictEqual(hasFeature('standard', 'export command center'), false);
    assert.strictEqual(hasFeature('standard', 'export_command_center'), false);
  });

  test('17. Command Center: Unlocked on Pro tier', () => {
    assert.strictEqual(hasFeature('pro', 'export command center'), true);
    assert.strictEqual(hasFeature('pro', 'export_command_center'), true);
    assert.strictEqual(hasFeature('pro', FEATURE_KEYS.EXPORT_COMMAND_CENTER), true);
  });

  test('18. Dashboard: Locked on Basic tier', () => {
    assert.strictEqual(hasFeature('basic', 'export intelligence dashboard'), false);
    assert.strictEqual(hasFeature('basic', 'export_intelligence_dashboard'), false);
    assert.strictEqual(hasFeature('basic', FEATURE_KEYS.EXPORT_INTELLIGENCE_DASHBOARD), false);
  });

  test('19. Dashboard: Locked on Standard tier', () => {
    assert.strictEqual(hasFeature('standard', 'export intelligence dashboard'), false);
    assert.strictEqual(hasFeature('standard', 'export_intelligence_dashboard'), false);
  });

  test('20. Dashboard: Unlocked on Pro tier', () => {
    assert.strictEqual(hasFeature('pro', 'export intelligence dashboard'), true);
    assert.strictEqual(hasFeature('pro', 'export_intelligence_dashboard'), true);
    assert.strictEqual(hasFeature('pro', FEATURE_KEYS.EXPORT_INTELLIGENCE_DASHBOARD), true);
  });

  // ─── 5. Pricing Labels (monthly subscription) ──────────────────────────────
  test('21. TIER_PRICING labels use monthly subscription, not one-time', () => {
    assert.ok(!TIER_PRICING.basic.label.includes('one-time'), 'Basic label must not say one-time');
    assert.ok(!TIER_PRICING.standard.label.includes('one-time'), 'Standard label must not say one-time');
    assert.ok(!TIER_PRICING.pro.label.includes('one-time'), 'Pro label must not say one-time');
    assert.ok(TIER_PRICING.basic.label.includes('month'), 'Basic label must include month');
    assert.ok(TIER_PRICING.standard.label.includes('month'), 'Standard label must include month');
    assert.ok(TIER_PRICING.pro.label.includes('month'), 'Pro label must include month');
  });

  // ─── 6. Edge Cases & Security ─────────────────────────────────────────────
  test('22. Invalid / null / empty tier returns false for all features', () => {
    assert.strictEqual(hasFeature(null, 'cutting'), false);
    assert.strictEqual(hasFeature(undefined, 'cutting'), false);
    assert.strictEqual(hasFeature('', 'cutting'), false);
    assert.strictEqual(hasFeature('hacker_tier', 'cutting'), false);
  });

  test('23. Feature list generation accurately marks unlocked flags per tier', () => {
    const basicList = getTierFeatureList('basic');
    const basicUnlocked = basicList.filter((f) => f.unlocked).map((f) => f.key);
    assert.deepStrictEqual(basicUnlocked.sort(), [FEATURE_KEYS.CUTTING, FEATURE_KEYS.EXPORT_1080P].sort());

    const proList = getTierFeatureList('pro');
    assert.strictEqual(proList.every((f) => f.unlocked), true);
  });

  console.log('\n======================================================');
  console.log(`📊 Feature Gating Results: ${passed} / ${total} passed`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runFeatureTests().catch((err) => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
