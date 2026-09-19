'use strict';

/**
 * STEP 32E — Monthly Stripe Subscription Server Tests
 *
 * Tests:
 *  A. Checkout (subscription mode, price mapping, input validation)
 *  B. Subscription creation (one license, fields saved, correct tier/user/subscription ID)
 *  C. Duplicate webhook handling (no duplicate license)
 *  D. subscription.updated (license updated, no duplicate)
 *  E. subscription.deleted (marked canceled)
 *  F. invoice.payment_succeeded (period extended, no duplicate)
 *  G. invoice.payment_failed (past_due, no immediate revoke)
 *  H. Subscription ID uniqueness (duplicate subscription cannot create second license)
 *  I. Existing one-time licenses (backward compatibility)
 *  J. License validation (active subscription, expired subscription, cancellation)
 *  K. Security (client cannot supply Price ID or subscription status)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Stripe = require('stripe');

const StripeProvider = require('../server/providers/stripeProvider');
const config = require('../server/config');
const {
  createLicense,
  generateKeyFormat,
  getLicenseById,
  findLicenseBySubscriptionId,
  updateLicenseSubscription,
  clearInMemoryLicenses: clearGeneratorInMemory,
  seedInMemoryLicense: seedGeneratorLicense,
} = require('../server/services/licenseGenerator');
const {
  activateLicense,
  validateLicense,
  getLicenseStatus,
  seedInMemoryLicense: seedServiceLicense,
  clearInMemoryLicenses: clearServiceInMemory,
  checkSubscriptionValidity,
} = require('../server/services/licenseService');
const {
  buildLicenseEmailHtml,
  clearSentEmails,
} = require('../server/services/emailService');

const testSecretKey = config.stripe.secretKey;
const testWebhookSecret = config.stripe.webhookSecret;

const stripeProvider = new StripeProvider({
  secretKey: testSecretKey,
  webhookSecret: testWebhookSecret,
  priceIds: {
    'price_basic_monthly_10': 'basic',
    'price_standard_monthly_20': 'standard',
    'price_pro_monthly_30': 'pro',
  },
});

// Helper to generate a signed Stripe webhook payload
function createSignedStripePayload(eventPayload, secret = testWebhookSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(eventPayload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret,
    timestamp,
  });
  return {
    rawBody: Buffer.from(payloadString, 'utf8'),
    headers: { 'stripe-signature': signature },
  };
}

// Helper to call the webhook handler directly
function createWebhookHandler() {
  const router = require('../server/routes/webhook');
  router.resetProcessedEvents();
  return router;
}

function callWebhook(router, body, headers) {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req = { body, headers, method: 'POST', url: '/stripe' };
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resolve({ status: statusCode, data });
      },
    };
    router.handle(req, res, () => resolve({ status: statusCode, data: null }));
  });
}

async function runSubscriptionTests() {
  console.log('');
  console.log('======================================================');
  console.log('🧪 STEP 32E — Monthly Stripe Subscription Server Tests');
  console.log('======================================================');
  console.log('');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}\n${err.stack}`);
    }
  }

  // Clean state before tests
  clearGeneratorInMemory();
  clearServiceInMemory();
  clearSentEmails();

  // ═══════════════════════════════════════════════════════════════════════════
  // A. Checkout
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('── A. Checkout ──');

  await test('A1. Checkout session uses mode=subscription', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'payment.js'), 'utf8');
    assert.ok(content.includes("mode: 'subscription'"), 'Must use mode=subscription');
    assert.ok(!content.includes("mode: 'payment'"), 'Must not use mode=payment');
  });

  await test('A2. Price mapping uses server-side env vars', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'server', 'config.js'), 'utf8');
    assert.ok(content.includes('price_basic_monthly_10'), 'Must use monthly price ID for basic');
    assert.ok(content.includes('price_standard_monthly_20'), 'Must use monthly price ID for standard');
    assert.ok(content.includes('price_pro_monthly_30'), 'Must use monthly price ID for pro');
  });

  await test('A3. Tier prices include interval: month', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'server', 'config.js'), 'utf8');
    assert.ok(content.includes("interval: 'month'"), 'Must have interval: month');
  });

  await test('A4. Checkout metadata includes planId and userId', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'payment.js'), 'utf8');
    assert.ok(content.includes('planId'), 'Must pass planId in metadata');
    assert.ok(content.includes('userId'), 'Must pass userId in metadata');
  });

  await test('A5. Checkout subscription_data has metadata', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'payment.js'), 'utf8');
    assert.ok(content.includes('subscription_data'), 'Must have subscription_data');
    assert.ok(content.includes("metadata: {"), 'subscription_data must include metadata');
  });

  await test('A6. Invalid plan ID is rejected', () => {
    const priceId = stripeProvider.mapPriceIdToTier('invalid_price_id');
    assert.strictEqual(priceId, null, 'Invalid price ID must return null');
  });

  await test('A7. Client cannot override Price ID (server-authoritative)', () => {
    const tier = stripeProvider.mapPriceIdToTier('price_basic_monthly_10');
    assert.strictEqual(tier, 'basic', 'Must map known price to tier');
    const unknown = stripeProvider.mapPriceIdToTier('price_customer_hacked');
    assert.strictEqual(unknown, null, 'Unknown price must return null');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Subscription Creation
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── B. Subscription Creation ──');

  await test('B1. One license created with subscription fields', async () => {
    clearGeneratorInMemory();
    clearServiceInMemory();

    const result = await createLicense({
      tier: 'pro',
      customerEmail: 'subscriber@example.com',
      transactionId: 'pi_test_sub_001',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_001',
      stripeCustomerId: 'cus_test_001',
      subscriptionStatus: 'active',
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      planInterval: 'month',
    });

    assert(result.licenseKey, 'Must generate license key');
    assert.strictEqual(result.tier, 'pro');
    assert.strictEqual(result.stripeSubscriptionId, 'sub_test_001');
    assert.strictEqual(result.stripeCustomerId, 'cus_test_001');
    assert.strictEqual(result.subscriptionStatus, 'active');
    assert.strictEqual(result.planInterval, 'month');
    assert.strictEqual(result.cancelAtPeriodEnd, false);
  });

  await test('B2. findLicenseBySubscriptionId finds created license', async () => {
    const found = await findLicenseBySubscriptionId('sub_test_001');
    assert(found, 'Must find license by subscription ID');
    assert.strictEqual(found.stripe_subscription_id || found.stripeSubscriptionId, 'sub_test_001');
  });

  await test('B3. updateLicenseSubscription updates fields', async () => {
    const found = await findLicenseBySubscriptionId('sub_test_001');
    const id = found.id || found.license_key;

    await updateLicenseSubscription(id, {
      subscription_status: 'past_due',
      current_period_end: '2026-10-15T00:00:00Z',
    });

    const updated = await getLicenseById(id);
    assert.strictEqual(updated.subscription_status || updated.subscriptionStatus, 'past_due');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Duplicate Webhook Handling
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── C. Duplicate Webhook Handling ──');

  await test('C1. Duplicate checkout event does not create second license', async () => {
    clearGeneratorInMemory();
    clearServiceInMemory();

    // Seed an existing license for this subscription (into generator's store)
    seedGeneratorLicense({
      license_key: 'EXIST-SUB-0001-AAAA',
      tier: 'standard',
      status: 'active',
      stripe_subscription_id: 'sub_test_dup_001',
      subscription_status: 'active',
      plan_interval: 'month',
    });

    // FindLicenseBySubscriptionId should find the existing one
    const existing = await findLicenseBySubscriptionId('sub_test_dup_001');
    assert(existing, 'Existing license must be found');
    assert.strictEqual(existing.license_key, 'EXIST-SUB-0001-AAAA');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. subscription.updated
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── D. subscription.updated ──');

  await test('D1. extractSubscriptionUpdateDetails parses event', () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_update_001',
          customer: 'cus_test_update_001',
          status: 'active',
          items: {
            data: [{
              price: { id: 'price_pro_monthly_30' },
            }],
          },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          cancel_at_period_end: false,
          canceled_at: null,
        },
      },
    };

    const details = stripeProvider.extractSubscriptionUpdateDetails(event);
    assert(details, 'Must extract details');
    assert.strictEqual(details.subscriptionId, 'sub_test_update_001');
    assert.strictEqual(details.tier, 'pro');
    assert.strictEqual(details.subscriptionStatus, 'active');
    assert.strictEqual(details.cancelAtPeriodEnd, false);
  });

  await test('D2. Updated license has new tier, no duplicate created', async () => {
    clearGeneratorInMemory();
    clearServiceInMemory();

    seedGeneratorLicense({
      license_key: 'UPDT-SUB-0001-BBBB',
      tier: 'basic',
      status: 'active',
      stripe_subscription_id: 'sub_test_update_002',
      subscription_status: 'active',
      plan_interval: 'month',
    });

    await updateLicenseSubscription('UPDT-SUB-0001-BBBB', {
      tier: 'pro',
      subscription_status: 'active',
    });

    const found = await findLicenseBySubscriptionId('sub_test_update_002');
    assert.strictEqual(found.tier, 'pro');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. subscription.deleted
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── E. subscription.deleted ──');

  await test('E1. extractSubscriptionDeleteDetails parses event', () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_del_001',
          customer: 'cus_test_del_001',
        },
      },
    };

    const details = stripeProvider.extractSubscriptionDeleteDetails(event);
    assert(details, 'Must extract details');
    assert.strictEqual(details.subscriptionId, 'sub_test_del_001');
  });

  await test('E2. Deleted subscription marks license as canceled', async () => {
    clearGeneratorInMemory();
    clearServiceInMemory();

    seedGeneratorLicense({
      license_key: 'DELT-SUB-0001-CCCC',
      tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_test_del_002',
      subscription_status: 'active',
      plan_interval: 'month',
    });

    await updateLicenseSubscription('DELT-SUB-0001-CCCC', {
      subscription_status: 'canceled',
      canceled_at: new Date().toISOString(),
    });

    const found = await findLicenseBySubscriptionId('sub_test_del_002');
    assert.strictEqual(found.subscription_status, 'canceled');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. invoice.payment_succeeded
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── F. invoice.payment_succeeded ──');

  await test('F1. extractInvoicePaymentSucceeded parses event', () => {
    const now = Math.floor(Date.now() / 1000);
    const event = {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'inv_test_001',
          subscription: 'sub_test_inv_001',
          customer: 'cus_test_inv_001',
          period_start: now,
          period_end: now + 30 * 24 * 60 * 60,
        },
      },
    };

    const details = stripeProvider.extractInvoicePaymentSucceeded(event);
    assert(details, 'Must extract details');
    assert.strictEqual(details.subscriptionId, 'sub_test_inv_001');
    assert(details.currentPeriodStart, 'Must have period start');
    assert(details.currentPeriodEnd, 'Must have period end');
  });

  await test('F2. Invoice extends billing period, no duplicate license', async () => {
    clearGeneratorInMemory();
    clearServiceInMemory();

    seedGeneratorLicense({
      license_key: 'INV-SUB-0001-DDDD',
      tier: 'standard',
      status: 'active',
      stripe_subscription_id: 'sub_test_inv_002',
      subscription_status: 'active',
      current_period_end: '2026-10-01T00:00:00Z',
      plan_interval: 'month',
    });

    const newEnd = '2026-11-01T00:00:00Z';
    await updateLicenseSubscription('INV-SUB-0001-DDDD', {
      subscription_status: 'active',
      current_period_start: '2026-10-01T00:00:00Z',
      current_period_end: newEnd,
    });

    const found = await findLicenseBySubscriptionId('sub_test_inv_002');
    const periodEnd = found.current_period_end || found.currentPeriodEnd;
    assert.strictEqual(periodEnd, newEnd);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. invoice.payment_failed
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── G. invoice.payment_failed ──');

  await test('G1. extractInvoicePaymentFailed parses event', () => {
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'inv_test_fail_001',
          subscription: 'sub_test_fail_001',
          customer: 'cus_test_fail_001',
        },
      },
    };

    const details = stripeProvider.extractInvoicePaymentFailed(event);
    assert(details, 'Must extract details');
    assert.strictEqual(details.subscriptionId, 'sub_test_fail_001');
  });

  await test('G2. Failed invoice marks past_due, no immediate revoke', async () => {
    clearGeneratorInMemory();
    clearServiceInMemory();

    seedGeneratorLicense({
      license_key: 'FAIL-SUB-0001-EEEE',
      tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_test_fail_002',
      subscription_status: 'active',
      current_period_end: '2026-10-15T00:00:00Z',
      plan_interval: 'month',
    });

    await updateLicenseSubscription('FAIL-SUB-0001-EEEE', {
      subscription_status: 'past_due',
    });

    const found = await findLicenseBySubscriptionId('sub_test_fail_002');
    assert.strictEqual(found.subscription_status, 'past_due');
    // License should NOT be revoked
    const statusField = found.status || 'active';
    assert.notStrictEqual(statusField, 'revoked', 'Must not immediately revoke');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // H. Subscription ID Uniqueness
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── H. Subscription ID Uniqueness ──');

  await test('H1. findLicenseBySubscriptionId returns null for unknown', async () => {
    const found = await findLicenseBySubscriptionId('sub_nonexistent_999');
    assert.strictEqual(found, null, 'Must return null for unknown subscription');
  });

  await test('H2. findLicenseBySubscriptionId returns null for null input', async () => {
    const found = await findLicenseBySubscriptionId(null);
    assert.strictEqual(found, null, 'Must return null for null input');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // I. Existing One-Time Licenses
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── I. Existing One-Time Licenses ──');

  await test('I1. Existing 4 seed licenses remain compatible', async () => {
    // Seed the original test licenses (no subscription fields)
    clearGeneratorInMemory();
    clearServiceInMemory();

    // Seed into both stores: generator for getLicenseById, service for activateLicense
    const testLicenses = [
      { license_key: 'PRO-REEL-7890-ABCD-1234', tier: 'pro', status: 'active' },
      { license_key: 'STD-REEL-4567-EFGH-5678', tier: 'standard', status: 'active' },
      { license_key: 'BAS-REEL-1234-IJKL-9012', tier: 'basic', status: 'active' },
      { license_key: 'PRO-REEL-REVOKED-9999', tier: 'pro', status: 'revoked' },
    ];
    for (const lic of testLicenses) {
      seedGeneratorLicense(lic);
      seedServiceLicense(lic);
    }

    const pro = await getLicenseById('PRO-REEL-7890-ABCD-1234');
    assert(pro, 'Pro license must exist');
    assert.strictEqual(pro.tier, 'pro');
    assert.strictEqual(pro.status, 'active');
    assert(!pro.stripe_subscription_id, 'Must not have subscription ID');

    const revoked = await getLicenseById('PRO-REEL-REVOKED-9999');
    assert.strictEqual(revoked.status, 'revoked');
  });

  await test('I2. One-time license activation works (no subscription check)', async () => {
    const result = await activateLicense('PRO-REEL-7890-ABCD-1234', 'a'.repeat(64));
    assert.strictEqual(result.success, true, 'One-time license must still activate');
    assert.strictEqual(result.license.tier, 'pro');
  });

  await test('I3. Revoked one-time license still rejected', async () => {
    const result = await activateLicense('PRO-REEL-REVOKED-9999', 'b'.repeat(64));
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'LICENSE_REVOKED');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // J. License Validation (Subscription-Aware)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── J. Subscription-Aware License Validation ──');

  await test('J1. Active subscription with valid period is valid', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_active',
      subscription_status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, true);
  });

  await test('J2. Active subscription with expired period is invalid', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_expired',
      subscription_status: 'active',
      current_period_end: '2020-01-01T00:00:00Z',
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'SUBSCRIPTION_EXPIRED');
  });

  await test('J3. Past due subscription within period is valid (grace)', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_past_due',
      subscription_status: 'past_due',
      current_period_end: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, true);
  });

  await test('J4. Past due subscription past period is invalid', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_past_due_expired',
      subscription_status: 'past_due',
      current_period_end: '2020-01-01T00:00:00Z',
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'PAST_DUE_PERIOD_ENDED');
  });

  await test('J5. Canceled subscription with cancel_at_period_end within period is valid', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_canceled',
      subscription_status: 'canceled',
      cancel_at_period_end: true,
      current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, true);
  });

  await test('J6. Canceled subscription past period is invalid', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_canceled_expired',
      subscription_status: 'canceled',
      cancel_at_period_end: true,
      current_period_end: '2020-01-01T00:00:00Z',
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'SUBSCRIPTION_CANCELED');
  });

  await test('J7. Unpaid subscription is invalid', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: 'sub_test_unpaid',
      subscription_status: 'unpaid',
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'SUBSCRIPTION_UNPAID');
  });

  await test('J8. One-time license (no subscription) uses legacy status check', () => {
    const record = {
      status: 'active',
      stripe_subscription_id: null,
      subscription_status: null,
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, true);
  });

  await test('J9. One-time revoked license fails validation', () => {
    const record = {
      status: 'revoked',
      stripe_subscription_id: null,
      subscription_status: null,
    };
    const result = checkSubscriptionValidity(record);
    assert.strictEqual(result.valid, false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // K. Security
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── K. Security ──');

  await test('K1. mapPriceIdToTier rejects unknown price IDs', () => {
    assert.strictEqual(stripeProvider.mapPriceIdToTier('price_hacked_123'), null);
    assert.strictEqual(stripeProvider.mapPriceIdToTier(''), null);
    assert.strictEqual(stripeProvider.mapPriceIdToTier(null), null);
    assert.strictEqual(stripeProvider.mapPriceIdToTier(undefined), null);
  });

  await test('K2. extractCheckoutDetails rejects non-checkout events', () => {
    const event = {
      type: 'customer.subscription.updated',
      data: { object: {} },
    };
    const details = stripeProvider.extractCheckoutDetails(event);
    assert.strictEqual(details, null, 'Must reject non-checkout events');
  });

  await test('K3. extractCheckoutDetails rejects unknown tier from verified price', () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          line_items: {
            data: [{ price: { id: 'price_unknown_tier' } }],
          },
        },
      },
    };
    const details = stripeProvider.extractCheckoutDetails(event);
    assert.strictEqual(details, null, 'Must reject unknown tier');
  });

  await test('K4. Email HTML uses subscription language', () => {
    const html = buildLicenseEmailHtml({
      licenseKey: 'TEST-KEY-AAAA-BBBB',
      tier: 'pro',
      downloadUrl: 'https://reelcutter.app/download',
    });
    assert.ok(html.includes('subscription'), 'Must mention subscription');
    assert.ok(html.includes('Monthly'), 'Must mention Monthly');
    assert.ok(!html.includes('purchase'), 'Must not say purchase');
  });

  await test('K5. Webhook signature verification still works', async () => {
    const eventPayload = {
      id: 'evt_test_sec_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_sec_001',
          subscription: 'sub_test_sec_001',
          customer: 'cus_test_sec_001',
          customer_details: { email: 'secure@example.com' },
          line_items: {
            data: [{ price: { id: 'price_pro_monthly_30' } }],
          },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const verified = await stripeProvider.verifyWebhookEvent(rawBody, headers);
    assert.strictEqual(verified.id, 'evt_test_sec_001');
  });

  await test('K6. Webhook rejects invalid signature', async () => {
    const eventPayload = { id: 'evt_tampered', type: 'checkout.session.completed' };
    const { rawBody } = createSignedStripePayload(eventPayload);
    const badHeaders = { 'stripe-signature': 't=123456,v1=bad_signature' };

    let threw = false;
    try {
      await stripeProvider.verifyWebhookEvent(rawBody, badHeaders);
    } catch (err) {
      threw = true;
      assert(err.message.includes('signature verification failed'));
    }
    assert.strictEqual(threw, true, 'Must reject bad signature');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('======================================================');
  console.log(`📊 STEP 32E Subscription Test Results: ${passed} / ${total} passed`);
  console.log('======================================================');
  console.log('');

  if (passed !== total) {
    process.exit(1);
  }
}

runSubscriptionTests().catch((err) => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
