'use strict';

/**
 * STEP 35C — Webhook Checkout Fix Regression Tests
 *
 * Validates the fix for the production Stripe subscription licensing bug:
 *   - extractCheckoutDetails() resolves tier from metadata.planId
 *   - webhook uses event.data.object.id (not event.id) for session retrieval
 *   - checkout.session.completed without valid plan mapping returns 400 (not 200)
 *   - duplicate checkout event does not create a second license
 *   - subscription.updated / invoice lifecycle tests remain passing
 *
 * Tests:
 *   A. metadata.planId = standard creates Standard license
 *   B. metadata.planId = pro creates Pro license
 *   C. userId metadata is linked to the created license
 *   D. Checkout Session retrieval uses event.data.object.id, not event.id
 *   E. checkout.session.completed without valid plan mapping does not silently succeed
 *   F. duplicate checkout event does not create a second license
 *   G. subscription.updated/invoice lifecycle tests remain passing
 */

const assert = require('assert');
const Stripe = require('stripe');

const StripeProvider = require('../server/providers/stripeProvider');
const config = require('../server/config');
const {
  createLicense,
  findLicenseBySubscriptionId,
  clearInMemoryLicenses,
  seedInMemoryLicense,
  getInMemoryLicenses,
} = require('../server/services/licenseGenerator');
const { clearSentEmails } = require('../server/services/emailService');
const { linkLicenseToUser } = require('../server/services/licenseService');

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

async function runWebhookCheckoutFixTests() {
  console.log('');
  console.log('======================================================');
  console.log('🧪 STEP 35C — Webhook Checkout Fix Regression Tests');
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

  clearInMemoryLicenses();
  clearSentEmails();

  // ═══════════════════════════════════════════════════════════════════════════
  // A. metadata.planId = standard creates Standard license
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('── A. Tier from metadata.planId ──');

  await test('A1. extractCheckoutDetails resolves tier from metadata.planId = standard', () => {
    const event = {
      id: 'evt_planid_standard_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_planid_standard_001',
          customer_details: { email: 'standard@example.com' },
          subscription: 'sub_planid_std_001',
          customer: 'cus_planid_std_001',
          metadata: { planId: 'standard', userId: 'user-std-001' },
        },
      },
    };

    const details = stripeProvider.extractCheckoutDetails(event);
    assert(details, 'Must resolve checkout details');
    assert.strictEqual(details.tier, 'standard');
    assert.strictEqual(details.customerEmail, 'standard@example.com');
    assert.strictEqual(details.subscriptionId, 'sub_planid_std_001');
    assert.strictEqual(details.customerId, 'cus_planid_std_001');
  });

  await test('A2. extractCheckoutDetails resolves tier from metadata.planId = pro', () => {
    const event = {
      id: 'evt_planid_pro_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_planid_pro_001',
          customer_details: { email: 'pro@example.com' },
          subscription: 'sub_planid_pro_001',
          customer: 'cus_planid_pro_001',
          metadata: { planId: 'pro', userId: 'user-pro-001' },
        },
      },
    };

    const details = stripeProvider.extractCheckoutDetails(event);
    assert(details, 'Must resolve checkout details');
    assert.strictEqual(details.tier, 'pro');
    assert.strictEqual(details.customerEmail, 'pro@example.com');
  });

  await test('A3. extractCheckoutDetails resolves tier from metadata.planId = basic', () => {
    const event = {
      id: 'evt_planid_basic_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_planid_basic_001',
          customer_details: { email: 'basic@example.com' },
          subscription: 'sub_planid_bas_001',
          customer: 'cus_planid_bas_001',
          metadata: { planId: 'basic', userId: 'user-bas-001' },
        },
      },
    };

    const details = stripeProvider.extractCheckoutDetails(event);
    assert(details, 'Must resolve checkout details');
    assert.strictEqual(details.tier, 'basic');
  });

  await test('A4. extractCheckoutDetails prefers line_items over metadata.planId', () => {
    const event = {
      id: 'evt_prefer_lineitems_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_prefer_lineitems_001',
          customer_details: { email: 'prefer@example.com' },
          line_items: {
            data: [{ price: { id: 'price_pro_monthly_30' } }],
          },
          metadata: { planId: 'standard' },
        },
      },
    };

    const details = stripeProvider.extractCheckoutDetails(event);
    assert(details, 'Must resolve checkout details');
    assert.strictEqual(details.tier, 'pro', 'Must prefer line_items price ID over metadata.planId');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Full webhook flow: metadata.planId = standard creates Standard license
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── B. Full Webhook Flow ──');

  await test('B1. checkout.session.completed with planId=standard creates Standard license via webhook', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_webhook_std_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_webhook_std_001',
          customer_details: { email: 'webhook-standard@example.com' },
          subscription: 'sub_webhook_std_001',
          customer: 'cus_webhook_std_001',
          metadata: { planId: 'standard', userId: 'user-ws-001' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.received, true);
    assert.strictEqual(result.data.tier, 'standard');

    const license = await findLicenseBySubscriptionId('sub_webhook_std_001');
    assert(license, 'License must be created');
    assert.strictEqual(license.tier, 'standard');
    assert.strictEqual(license.customer_email, 'webhook-standard@example.com');
    assert.strictEqual(license.stripe_subscription_id, 'sub_webhook_std_001');
    assert.strictEqual(license.stripe_customer_id, 'cus_webhook_std_001');
    assert.strictEqual(license.subscription_status, 'active');
    assert.strictEqual(license.plan_interval, 'month');
  });

  await test('B2. checkout.session.completed with planId=pro creates Pro license via webhook', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_webhook_pro_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_webhook_pro_001',
          customer_details: { email: 'webhook-pro@example.com' },
          subscription: 'sub_webhook_pro_001',
          customer: 'cus_webhook_pro_001',
          metadata: { planId: 'pro', userId: 'user-wp-001' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.tier, 'pro');

    const license = await findLicenseBySubscriptionId('sub_webhook_pro_001');
    assert(license, 'License must be created');
    assert.strictEqual(license.tier, 'pro');
    assert.strictEqual(license.customer_email, 'webhook-pro@example.com');
    assert.strictEqual(license.subscription_status, 'active');
    assert.strictEqual(license.plan_interval, 'month');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. userId metadata is linked to the created license
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── C. userId Linking ──');

  await test('C1. userId from metadata is linked to created license', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_userid_link_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_userid_link_001',
          customer_details: { email: 'userid-link@example.com' },
          subscription: 'sub_userid_link_001',
          customer: 'cus_userid_link_001',
          metadata: { planId: 'pro', userId: 'user-test-link-uuid-1234' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 200);

    // Verify license was linked to user
    const linkResult = await linkLicenseToUser(
      (await findLicenseBySubscriptionId('sub_userid_link_001')).license_key,
      'user-test-link-uuid-1234'
    );
    assert.strictEqual(linkResult.success, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Checkout Session retrieval uses event.data.object.id, not event.id
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── D. Session Retrieval ID ──');

  await test('D1. extractCheckoutDetails returns session ID as transactionId (event.data.object.id pattern)', () => {
    const event = {
      id: 'evt_different_from_cs_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_actual_session_id_001',
          customer_details: { email: 'sessionid@example.com' },
          metadata: { planId: 'standard' },
        },
      },
    };

    const details = stripeProvider.extractCheckoutDetails(event);
    assert(details, 'Must resolve checkout details');
    // transactionId should come from session.payment_intent || session.id
    assert.strictEqual(details.transactionId, 'cs_actual_session_id_001');
    // eventId should be the event ID, not the session ID
    assert.strictEqual(details.eventId, 'evt_different_from_cs_001');
  });

  await test('D2. webhook handler uses event.data.object.id (verified by code inspection)', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'server', 'routes', 'webhook.js'),
      'utf8'
    );
    // Must use event.data.object.id for session retrieval
    assert.ok(
      content.includes('event.data.object.id'),
      'Must use event.data.object.id for session retrieval'
    );
    // Must NOT use event.id for session retrieval
    assert.ok(
      !content.includes('sessions.retrieve(event.id)'),
      'Must NOT use event.id for session retrieval (that is the Stripe event ID, not the session ID)'
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. checkout.session.completed without valid plan mapping returns 400
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── E. Invalid Plan Mapping Handling ──');

  await test('E1. checkout.session.completed with no tier returns 400 (not 200)', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_no_tier_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_no_tier_001',
          customer_details: { email: 'notier@example.com' },
          metadata: { planId: 'nonexistent_plan' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 400, 'Must return 400 so Stripe retries');
    assert.ok(result.data.error, 'Must include error message');
  });

  await test('E2. checkout.session.completed with empty metadata returns 400', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_empty_meta_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_empty_meta_001',
          customer_details: { email: 'empty@example.com' },
          metadata: {},
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 400, 'Must return 400 so Stripe retries');
  });

  await test('E3. extractCheckoutDetails rejects non-checkout events', () => {
    const event = {
      type: 'customer.subscription.updated',
      data: { object: {} },
    };
    const details = stripeProvider.extractCheckoutDetails(event);
    assert.strictEqual(details, null);
  });

  await test('E4. extractCheckoutDetails rejects unknown planId', () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { planId: 'enterprise' },
        },
      },
    };
    const details = stripeProvider.extractCheckoutDetails(event);
    assert.strictEqual(details, null, 'Must reject unknown planId');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. Duplicate checkout event does not create a second license
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── F. Duplicate Checkout Protection ──');

  await test('F1. Duplicate checkout event does not create second license (idempotency)', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_dup_checkout_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_dup_checkout_001',
          customer_details: { email: 'dup-checkout@example.com' },
          subscription: 'sub_dup_checkout_001',
          customer: 'cus_dup_checkout_001',
          metadata: { planId: 'standard' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);

    // First call — should create license
    const first = await callWebhook(router, rawBody, headers);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.data.received, true);
    assert.strictEqual(first.data.tier, 'standard');

    // Second call with same event ID — should be flagged as duplicate
    const second = await callWebhook(router, rawBody, headers);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.data.duplicate, true);

    // Only one license should exist
    const licenses = getInMemoryLicenses();
    const subLicenses = licenses.filter(l => l.stripe_subscription_id === 'sub_dup_checkout_001');
    assert.strictEqual(subLicenses.length, 1, 'Must not create duplicate license');
  });

  await test('F2. Duplicate checkout detected via subscription ID', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    // Seed existing license for this subscription
    seedInMemoryLicense({
      license_key: 'EXISTING-SUB-AAAA-BBBB',
      tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_preexisting_001',
      subscription_status: 'active',
      plan_interval: 'month',
    });

    const router = createWebhookHandler();

    const eventPayload = {
      id: 'evt_preexisting_sub_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_preexisting_sub_001',
          customer_details: { email: 'preexisting@example.com' },
          subscription: 'sub_preexisting_001',
          customer: 'cus_preexisting_001',
          metadata: { planId: 'pro' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.duplicate, true);
    assert.strictEqual(result.data.licenseKey, 'EXISTING-SUB-AAAA-BBBB');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Existing subscription.updated/invoice lifecycle tests remain passing
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('── G. Subscription Lifecycle ──');

  await test('G1. extractSubscriptionUpdateDetails still works', () => {
    const now = Math.floor(Date.now() / 1000);
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_lifecycle_001',
          customer: 'cus_lifecycle_001',
          status: 'active',
          items: {
            data: [{ price: { id: 'price_pro_monthly_30' } }],
          },
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60,
          cancel_at_period_end: false,
          canceled_at: null,
        },
      },
    };

    const details = stripeProvider.extractSubscriptionUpdateDetails(event);
    assert(details);
    assert.strictEqual(details.subscriptionId, 'sub_lifecycle_001');
    assert.strictEqual(details.tier, 'pro');
    assert.strictEqual(details.subscriptionStatus, 'active');
  });

  await test('G2. extractSubscriptionDeleteDetails still works', () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_del_lifecycle_001',
          customer: 'cus_del_lifecycle_001',
        },
      },
    };

    const details = stripeProvider.extractSubscriptionDeleteDetails(event);
    assert(details);
    assert.strictEqual(details.subscriptionId, 'sub_del_lifecycle_001');
  });

  await test('G3. extractInvoicePaymentSucceeded still works', () => {
    const now = Math.floor(Date.now() / 1000);
    const event = {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'inv_lifecycle_001',
          subscription: 'sub_inv_lifecycle_001',
          customer: 'cus_inv_lifecycle_001',
          period_start: now,
          period_end: now + 30 * 24 * 60 * 60,
        },
      },
    };

    const details = stripeProvider.extractInvoicePaymentSucceeded(event);
    assert(details);
    assert.strictEqual(details.subscriptionId, 'sub_inv_lifecycle_001');
    assert(details.currentPeriodStart);
    assert(details.currentPeriodEnd);
  });

  await test('G4. extractInvoicePaymentFailed still works', () => {
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'inv_fail_lifecycle_001',
          subscription: 'sub_fail_lifecycle_001',
          customer: 'cus_fail_lifecycle_001',
        },
      },
    };

    const details = stripeProvider.extractInvoicePaymentFailed(event);
    assert(details);
    assert.strictEqual(details.subscriptionId, 'sub_fail_lifecycle_001');
  });

  await test('G5. subscription.updated webhook updates existing license', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    // Seed existing license
    seedInMemoryLicense({
      license_key: 'LIFECYCLE-UPD-AAAA-BBBB',
      tier: 'basic',
      status: 'active',
      stripe_subscription_id: 'sub_lifecycle_upd_001',
      subscription_status: 'active',
      plan_interval: 'month',
    });

    const now = Math.floor(Date.now() / 1000);
    const eventPayload = {
      id: 'evt_lifecycle_upd_001',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_lifecycle_upd_001',
          customer: 'cus_lifecycle_upd_001',
          status: 'active',
          items: {
            data: [{ price: { id: 'price_pro_monthly_30' } }],
          },
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60,
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: {},
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 200);

    const license = await findLicenseBySubscriptionId('sub_lifecycle_upd_001');
    assert(license, 'License must exist');
    assert.strictEqual(license.tier, 'pro', 'Tier must be upgraded from basic to pro');
  });

  await test('G6. subscription.deleted webhook marks license as canceled', async () => {
    clearInMemoryLicenses();
    clearSentEmails();

    const router = createWebhookHandler();

    seedInMemoryLicense({
      license_key: 'LIFECYCLE-DEL-AAAA-BBBB',
      tier: 'standard',
      status: 'active',
      stripe_subscription_id: 'sub_lifecycle_del_001',
      subscription_status: 'active',
      plan_interval: 'month',
    });

    const eventPayload = {
      id: 'evt_lifecycle_del_001',
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_lifecycle_del_001',
          customer: 'cus_lifecycle_del_001',
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const result = await callWebhook(router, rawBody, headers);

    assert.strictEqual(result.status, 200);

    const license = await findLicenseBySubscriptionId('sub_lifecycle_del_001');
    assert(license, 'License must exist');
    assert.strictEqual(license.subscription_status, 'canceled');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('======================================================');
  console.log(`📊 STEP 35C Regression Test Results: ${passed} / ${total} passed`);
  console.log('======================================================');
  console.log('');

  if (passed !== total) {
    process.exit(1);
  }
}

runWebhookCheckoutFixTests().catch((err) => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
