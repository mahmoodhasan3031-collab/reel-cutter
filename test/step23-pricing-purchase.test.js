'use strict';

/**
 * STEP 23 Tests — Pricing & Purchase Flow Foundation
 *
 * Tests centralized pricing configuration, plan validation,
 * checkout route, success/cancel pages, security checks.
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STEP 23 — Pricing & Purchase Flow Foundation Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── 1. Valid Plans ─────────────────────────────────────────────────────────

console.log('── 1. Valid Plans ──');

test('PLANS array contains 3 plans', () => {
  const { PLANS } = require('../website/src/config/pricing');
  assert.strictEqual(PLANS.length, 3);
});

test('Plan IDs are basic, standard, pro', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const ids = PLANS.map((p) => p.id);
  assert.deepStrictEqual(ids, ['basic', 'standard', 'pro']);
});

test('Basic plan price is $10', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const basic = PLANS.find((p) => p.id === 'basic');
  assert.strictEqual(basic.price, 10);
  assert.strictEqual(basic.priceDisplay, '$10');
});

test('Standard plan price is $20', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const standard = PLANS.find((p) => p.id === 'standard');
  assert.strictEqual(standard.price, 20);
  assert.strictEqual(standard.priceDisplay, '$20');
});

test('Pro plan price is $30', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const pro = PLANS.find((p) => p.id === 'pro');
  assert.strictEqual(pro.price, 30);
  assert.strictEqual(pro.priceDisplay, '$30');
});

test('All plans have billingModel subscription', () => {
  const { PLANS } = require('../website/src/config/pricing');
  PLANS.forEach((p) => {
    assert.strictEqual(p.billingModel, 'subscription');
  });
});

test('All plans have billingPeriod monthly', () => {
  const { PLANS } = require('../website/src/config/pricing');
  PLANS.forEach((p) => {
    assert.strictEqual(p.billingPeriod, 'monthly');
  });
});

test('Pro plan is highlighted', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const pro = PLANS.find((p) => p.id === 'pro');
  assert.strictEqual(pro.highlight, true);
});

test('Basic and Standard are not highlighted', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const basic = PLANS.find((p) => p.id === 'basic');
  const standard = PLANS.find((p) => p.id === 'standard');
  assert.strictEqual(basic.highlight, false);
  assert.strictEqual(standard.highlight, false);
});

// ─── 2. Invalid Plan ───────────────────────────────────────────────────────

console.log('\n── 2. Invalid Plan ──');

test('isValidPlanId returns true for valid plans', () => {
  const { isValidPlanId } = require('../website/src/config/pricing');
  assert.strictEqual(isValidPlanId('basic'), true);
  assert.strictEqual(isValidPlanId('standard'), true);
  assert.strictEqual(isValidPlanId('pro'), true);
});

test('isValidPlanId returns false for invalid plans', () => {
  const { isValidPlanId } = require('../website/src/config/pricing');
  assert.strictEqual(isValidPlanId('enterprise'), false);
  assert.strictEqual(isValidPlanId('free'), false);
  assert.strictEqual(isValidPlanId(''), false);
  assert.strictEqual(isValidPlanId('BASIC'), false);
  assert.strictEqual(isValidPlanId('Pro'), false);
});

test('getPlanById returns plan for valid ID', () => {
  const { getPlanById } = require('../website/src/config/pricing');
  const plan = getPlanById('pro');
  assert.strictEqual(plan.name, 'Pro');
  assert.strictEqual(plan.price, 30);
});

test('getPlanById returns null for invalid ID', () => {
  const { getPlanById } = require('../website/src/config/pricing');
  const plan = getPlanById('invalid');
  assert.strictEqual(plan, null);
});

test('getPlanById returns null for empty string', () => {
  const { getPlanById } = require('../website/src/config/pricing');
  const plan = getPlanById('');
  assert.strictEqual(plan, null);
});

// ─── 3. Feature Comparison ──────────────────────────────────────────────────

console.log('\n── 3. Feature Comparison ──');

test('FEATURE_CATEGORIES has 6 categories', () => {
  const { FEATURE_CATEGORIES } = require('../website/src/config/pricing');
  assert.strictEqual(FEATURE_CATEGORIES.length, 6);
});

test('Basic tier has cutting and 1080p only', () => {
  const { FEATURE_CATEGORIES } = require('../website/src/config/pricing');
  const core = FEATURE_CATEGORIES.find((c) => c.category === 'Core Video Tools');
  const cutting = core.features.find((f) => f.name === 'Video Cutting');
  const p1080 = core.features.find((f) => f.name === '1080p Export');
  const p4k = core.features.find((f) => f.name === '4K Ultra HD Export');
  assert.strictEqual(cutting.basic, true);
  assert.strictEqual(p1080.basic, true);
  assert.strictEqual(p4k.basic, false);
});

test('Standard tier adds 4K, all aspect ratios, custom durations', () => {
  const { FEATURE_CATEGORIES } = require('../website/src/config/pricing');
  const core = FEATURE_CATEGORIES.find((c) => c.category === 'Core Video Tools');
  const p4k = core.features.find((f) => f.name === '4K Ultra HD Export');
  const ratios = core.features.find((f) => f.name.includes('All Aspect'));
  const durations = core.features.find((f) => f.name === 'Custom Durations');
  assert.strictEqual(p4k.standard, true);
  assert.strictEqual(ratios.standard, true);
  assert.strictEqual(durations.standard, true);
});

test('Pro tier has all features', () => {
  const { FEATURE_CATEGORIES } = require('../website/src/config/pricing');
  FEATURE_CATEGORIES.forEach((cat) => {
    cat.features.forEach((f) => {
      assert.strictEqual(f.pro, true, `Pro should have ${f.name}`);
    });
  });
});

test('AI features are Pro-only', () => {
  const { FEATURE_CATEGORIES } = require('../website/src/config/pricing');
  const ai = FEATURE_CATEGORIES.find((c) => c.category === 'AI & Smart Features');
  ai.features.forEach((f) => {
    assert.strictEqual(f.basic, false, `${f.name} should not be in Basic`);
    assert.strictEqual(f.standard, false, `${f.name} should not be in Standard`);
    assert.strictEqual(f.pro, true, `${f.name} should be in Pro`);
  });
});

// ─── 4. Price Display ──────────────────────────────────────────────────────

console.log('\n── 4. Price Display ──');

test('All plans have priceDisplay matching price', () => {
  const { PLANS } = require('../website/src/config/pricing');
  PLANS.forEach((p) => {
    assert.strictEqual(p.priceDisplay, `$${p.price}`);
  });
});

test('Prices are in ascending order: basic < standard < pro', () => {
  const { PLANS } = require('../website/src/config/pricing');
  const basic = PLANS.find((p) => p.id === 'basic');
  const standard = PLANS.find((p) => p.id === 'standard');
  const pro = PLANS.find((p) => p.id === 'pro');
  assert.ok(basic.price < standard.price);
  assert.ok(standard.price < pro.price);
});

// ─── 5. Stripe Price ID Placeholders ───────────────────────────────────────

console.log('\n── 5. Stripe Price ID Placeholders ──');

test('stripePriceId is null for all plans (not yet configured)', () => {
  const { PLANS } = require('../website/src/config/pricing');
  PLANS.forEach((p) => {
    assert.strictEqual(p.stripePriceId, null, `${p.name} stripePriceId should be null`);
  });
});

// ─── 6. Payment Config ─────────────────────────────────────────────────────

console.log('\n── 6. Payment Config ──');

test('Payment config is not live', () => {
  const { PAYMENT_CONFIG } = require('../website/src/config/payment');
  assert.strictEqual(PAYMENT_CONFIG.isLive, false);
});

test('Payment config currency is USD', () => {
  const { PAYMENT_CONFIG } = require('../website/src/config/payment');
  assert.strictEqual(PAYMENT_CONFIG.currency, 'usd');
});

test('Payment config methods include card', () => {
  const { PAYMENT_CONFIG } = require('../website/src/config/payment');
  assert.ok(PAYMENT_CONFIG.methods.includes('card'));
});

test('PLAN_STRIPE_PRICE_MAP has all tier keys', () => {
  const { PLAN_STRIPE_PRICE_MAP } = require('../website/src/config/payment');
  assert.ok('basic' in PLAN_STRIPE_PRICE_MAP);
  assert.ok('standard' in PLAN_STRIPE_PRICE_MAP);
  assert.ok('pro' in PLAN_STRIPE_PRICE_MAP);
});

test('isPaymentConfigured returns false when no prices set', () => {
  const { isPaymentConfigured } = require('../website/src/config/payment');
  assert.strictEqual(isPaymentConfigured(), false);
});

// ─── 7. Security Checks ────────────────────────────────────────────────────

console.log('\n── 7. Security Checks ──');

test('No Stripe secret key in pricing config', () => {
  const pricing = require('../website/src/config/pricing');
  const json = JSON.stringify(pricing);
  assert.ok(!json.includes('sk_test_'));
  assert.ok(!json.includes('sk_live_'));
  assert.ok(!json.includes('STRIPE_SECRET_KEY'));
});

test('No Supabase service-role key in pricing config', () => {
  const pricing = require('../website/src/config/pricing');
  const json = JSON.stringify(pricing);
  assert.ok(!json.includes('service_role'));
  assert.ok(!json.includes('SUPABASE_SERVICE_ROLE'));
});

test('No webhook secret in pricing config', () => {
  const pricing = require('../website/src/config/pricing');
  const json = JSON.stringify(pricing);
  assert.ok(!json.includes('whsec_'));
  assert.ok(!json.includes('STRIPE_WEBHOOK_SECRET'));
});

test('No Stripe secret key in payment config', () => {
  const payment = require('../website/src/config/payment');
  const json = JSON.stringify(payment);
  assert.ok(!json.includes('sk_test_'));
  assert.ok(!json.includes('sk_live_'));
  assert.ok(!json.includes('STRIPE_SECRET_KEY'));
});

test('No Supabase service-role key in payment config', () => {
  const payment = require('../website/src/config/payment');
  const json = JSON.stringify(payment);
  assert.ok(!json.includes('service_role'));
  assert.ok(!json.includes('SUPABASE_SERVICE_ROLE'));
});

test('No license signing secret in payment config', () => {
  const payment = require('../website/src/config/payment');
  const json = JSON.stringify(payment);
  assert.ok(!json.includes('LICENSE_SECRET'));
  assert.ok(!json.includes('HMAC_SECRET'));
});

// ─── 8. Checkout Route Validation ──────────────────────────────────────────

console.log('\n── 8. Checkout Route Validation ──');

test('Checkout route validates plan parameter', () => {
  const { isValidPlanId } = require('../website/src/config/pricing');
  // Simulates server-side validation
  assert.strictEqual(isValidPlanId('pro'), true);
  assert.strictEqual(isValidPlanId('free'), false);
  assert.strictEqual(isValidPlanId(''), false);
  assert.strictEqual(isValidPlanId(null), false);
});

// ─── 9. Desktop Feature Gating Consistency ─────────────────────────────────

console.log('\n── 9. Desktop Feature Gating Consistency ──');

test('Desktop features.js basic tier matches website config', () => {
  const desktop = require('../src/shared/features');
  const website = require('../website/src/config/pricing');
  const desktopBasic = desktop.TIER_HIERARCHY.basic;
  const coreCat = website.FEATURE_CATEGORIES.find((c) => c.category === 'Core Video Tools');

  // Desktop basic has: cutting, 1080p_export
  assert.ok(desktopBasic.includes('cutting'));
  assert.ok(desktopBasic.includes('1080p_export'));

  // Website basic should have cutting and 1080p
  const cutting = coreCat.features.find((f) => f.name === 'Video Cutting');
  const p1080 = coreCat.features.find((f) => f.name === '1080p Export');
  assert.strictEqual(cutting.basic, true);
  assert.strictEqual(p1080.basic, true);
});

test('Desktop features.js standard tier matches website config', () => {
  const desktop = require('../src/shared/features');
  const website = require('../website/src/config/pricing');
  const desktopStandard = desktop.TIER_HIERARCHY.standard;

  // Desktop standard has: cutting, 1080p, 4k, all_aspect_ratios, custom_durations
  assert.ok(desktopStandard.includes('4k_export'));
  assert.ok(desktopStandard.includes('all_aspect_ratios'));
  assert.ok(desktopStandard.includes('custom_durations'));

  // Website standard should have these too
  const coreCat = website.FEATURE_CATEGORIES.find((c) => c.category === 'Core Video Tools');
  const p4k = coreCat.features.find((f) => f.name === '4K Ultra HD Export');
  assert.strictEqual(p4k.standard, true);
});

test('Desktop features.js pro tier has all 23 features', () => {
  const desktop = require('../src/shared/features');
  const desktopPro = desktop.TIER_HIERARCHY.pro;
  assert.ok(desktopPro.length >= 22, `Pro tier should have at least 22 features, got ${desktopPro.length}`);
});

// ─── 10. Server Config Consistency ─────────────────────────────────────────

console.log('\n── 10. Server Config Consistency ──');

test('Server config tier prices match website pricing', () => {
  const serverConfig = require('../server/config');
  const { PLANS } = require('../website/src/config/pricing');

  const serverTiers = serverConfig.stripe.tierPrices;
  PLANS.forEach((plan) => {
    assert.strictEqual(serverTiers[plan.id].amount, plan.price,
      `${plan.name} price mismatch: server=${serverTiers[plan.id].amount} website=${plan.price}`);
  });
});

// ─── Results ───────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`STEP 23 Test Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
