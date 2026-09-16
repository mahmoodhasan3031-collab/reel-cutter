/**
 * STEP 2D — End-to-End Sandbox Simulation & Verification
 *
 * Verifies the complete payment fulfillment pipeline in a SAFE SANDBOX environment:
 *
 *   Mock Stripe webhook payload
 *     ↓ Stripe webhook signature verification
 *     ↓ Payment event processing
 *     ↓ License creation (in-memory, no production DB)
 *     ↓ customer_email / transaction_id / payment_provider persistence
 *     ↓ email_status = pending
 *     ↓ License email dispatch (no real email sent)
 *     ↓ email_status = sent OR failed
 *     ↓ In-memory verification (no production records touched)
 *
 * SAFETY GUARANTEES:
 *   - Uses ONLY the mock Stripe webhook secret from config fallback (whsec_mock_...)
 *   - No production Stripe secret keys, no real Stripe API calls
 *   - Sandbox email addresses only (*.invalid domain)
 *   - No real SMTP / Resend calls — falls back to in-memory capture
 *   - No Supabase credentials in test env → all records stored in generatedLicensesRegistry (in-memory Map)
 *   - No production customer or license records are touched
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const router = require('../server/routes/webhook');
const config = require('../server/config');

const {
  createLicense,
  getLicenseById,
  clearInMemoryLicenses,
  getInMemoryLicenses,
} = require('../server/services/licenseGenerator');

const {
  deliverLicenseEmail,
  retryLicenseEmail,
  getSentEmails,
  clearSentEmails,
  MAX_EMAIL_ATTEMPTS,
  sanitizeErrorMessage,
} = require('../server/services/emailService');

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Mock webhook secret — matches config.js fallback (non-production, safe for tests)
 * Must NEVER be a real whsec_ production secret
 */
const TEST_WEBHOOK_SECRET = config.stripe.webhookSecret;

/** Safe sandbox email — uses .invalid TLD, will never reach a real inbox */
const SANDBOX_EMAIL = 'sandbox-e2e@example.invalid';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds and signs a mock Stripe webhook payload.
 * @param {Object} eventPayload  Raw Stripe event object
 * @param {string} [secret]      Webhook secret to sign with (default: TEST_WEBHOOK_SECRET)
 * @returns {{ rawBody: Buffer, headers: Object }}
 */
function createSignedStripePayload(eventPayload, secret = TEST_WEBHOOK_SECRET) {
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

/**
 * Simulates an HTTP POST to the Stripe webhook route via the Express router.
 * Mirrors the pattern used in payment.test.js — no real HTTP call.
 * @param {Buffer} body      Raw body buffer
 * @param {Object} headers   Request headers
 * @returns {Promise<{ status: number, data: Object|null }>}
 */
function callWebhook(body, headers) {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req = {
      body,
      headers,
      method: 'POST',
      url: '/stripe',
    };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json:   (data)  => resolve({ status: statusCode, data }),
    };
    router.handle(req, res, () => resolve({ status: statusCode, data: null }));
  });
}

/**
 * Builds a minimal checkout.session.completed Stripe event.
 * @param {Object} overrides  Fields to override on the event object
 */
function buildCheckoutEvent(overrides = {}) {
  const now = Date.now();
  return {
    id: `evt_e2e_sandbox_${now}`,
    type: 'checkout.session.completed',
    object: 'event',
    data: {
      object: {
        id: `cs_e2e_${now}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_e2e_${now}`,
        customer_email: SANDBOX_EMAIL,
        line_items: null,
        metadata: {},
        ...overrides.data?.object,
      },
    },
    ...overrides,
  };
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

async function runE2ETests() {
  console.log('\n======================================================');
  console.log('🧪 STEP 2D — E2E Payment & Email Pipeline Tests');
  console.log('======================================================\n');

  let passed = 0;
  let total  = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}`);
      if (process.env.E2E_VERBOSE) console.error(err.stack);
    }
  }

  // Reset all sandbox state before each test suite run
  function resetSandbox() {
    router.resetProcessedEvents();
    clearInMemoryLicenses();
    clearSentEmails();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-1: Full Happy Path — Webhook → License → Email Sent
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-1. Happy Path: Stripe webhook → license created → email_status = sent', async () => {
    resetSandbox();

    const eventPayload = buildCheckoutEvent({
      id: 'evt_e2e_sandbox_001',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL,
          payment_intent:  'pi_e2e_happy_001',
          payment_status:  'paid',
          line_items: {
            data: [{ price: { id: 'price_pro_30' } }],
          },
        },
      },
    });

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const response = await callWebhook(rawBody, headers);

    // Webhook must acknowledge with 200
    assert.strictEqual(response.status, 200, `Expected 200, got ${response.status}`);
    assert.strictEqual(response.data.received, true);

    // Tier must be included in response
    const { tier, emailStatus } = response.data;
    assert.strictEqual(tier, 'pro', 'Tier must be pro');

    // email_status in response must be sent OR pending (email delivered synchronously via deliverLicenseEmail)
    assert(['sent', 'pending'].includes(emailStatus),
      `emailStatus must be sent or pending, got: ${emailStatus}`);

    // Verify record in in-memory storage
    const licenses = getInMemoryLicenses();
    assert.strictEqual(licenses.length, 1);
    assert.ok(licenses[0].license_key, 'License key must be created');
    assert.match(licenses[0].license_key, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
      'License key must match XXXX-XXXX-XXXX-XXXX format');
    assert.strictEqual(licenses[0].customer_email, SANDBOX_EMAIL);
    assert.strictEqual(licenses[0].transaction_id, 'pi_e2e_happy_001');
    assert.strictEqual(licenses[0].payment_provider, 'stripe');
    assert.strictEqual(licenses[0].email_status, 'sent');
    assert.strictEqual(licenses[0].email_attempts, 1);
    assert.ok(licenses[0].email_sent_at);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-2: Customer Data Persistence — email / transaction_id / payment_provider
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-2. Persistence: customer_email, transaction_id, payment_provider written to license record', async () => {
    resetSandbox();

    const transactionId = 'pi_e2e_persist_002';
    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL,
      transactionId,
      paymentProvider: 'stripe',
    });

    // Verify returned fields
    assert.strictEqual(license.customerEmail, SANDBOX_EMAIL,    'customerEmail must match');
    assert.strictEqual(license.transactionId, transactionId,    'transactionId must match');
    assert.strictEqual(license.paymentProvider, 'stripe',       'paymentProvider must be stripe');

    // Verify raw record in in-memory store
    const record = await getLicenseById(license.id);
    assert.ok(record, 'License record must be retrievable');
    assert.strictEqual(record.customer_email,   SANDBOX_EMAIL,  'record.customer_email must match');
    assert.strictEqual(record.transaction_id,   transactionId,  'record.transaction_id must match');
    assert.strictEqual(record.payment_provider, 'stripe',       'record.payment_provider must be stripe');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-3: email_status Starts as Pending
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-3. Initial State: Newly created license has email_status = pending and email_attempts = 0', async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'basic',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_pending_003',
    });

    const record = await getLicenseById(license.id);
    assert.ok(record, 'Record must exist');
    assert.strictEqual(record.email_status,          'pending', 'email_status must default to pending');
    assert.strictEqual(record.email_attempts,         0,        'email_attempts must default to 0');
    assert.strictEqual(record.email_sent_at,          null,     'email_sent_at must be null initially');
    assert.strictEqual(record.email_error,            null,     'email_error must be null initially');
    assert.strictEqual(record.email_last_attempt_at,  null,     'email_last_attempt_at must be null initially');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-4: Successful Email Delivery — email_status transitions to sent
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-4. Delivery Success: deliverLicenseEmail sets email_status → sent, records sent_at, increments attempts', async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_deliver_004',
    });

    const result = await deliverLicenseEmail(license.id);

    assert.strictEqual(result.success,        true,   'Delivery must succeed');
    assert.strictEqual(result.email_status,   'sent', 'email_status must be sent');
    assert.strictEqual(result.email_attempts, 1,      'email_attempts must be 1 after first delivery');
    assert.ok(result.email_sent_at,                   'email_sent_at must be populated');

    // Verify persisted record
    const record = await getLicenseById(license.id);
    assert.strictEqual(record.email_status,   'sent', 'Persisted email_status must be sent');
    assert.strictEqual(record.email_attempts, 1,      'Persisted email_attempts must be 1');
    assert.ok(record.email_sent_at,                   'Persisted email_sent_at must be set');
    assert.strictEqual(record.email_error,    null,   'email_error must be null on success');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-5: Failed Email Delivery — email_status transitions to failed
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-5. Delivery Failure: simulateFailure sets email_status → failed, persists error, no real email sent', async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_fail_005',
    });

    const result = await deliverLicenseEmail(license.id, {
      simulateFailure: true,
      failureMessage: 'Sandbox SMTP connection refused',
    });

    assert.strictEqual(result.success,        false,    'Delivery must report failure');
    assert.strictEqual(result.email_status,   'failed', 'email_status must be failed');
    assert.strictEqual(result.email_attempts, 1,        'email_attempts must be 1 after first attempt');
    assert.ok(result.error.includes('Sandbox SMTP connection refused'), 'Error message must be preserved');

    // Verify persisted record
    const record = await getLicenseById(license.id);
    assert.strictEqual(record.email_status,   'failed',   'Persisted email_status must be failed');
    assert.strictEqual(record.email_attempts, 1,          'Persisted email_attempts must be 1');
    assert.ok(record.email_error,                         'email_error must be recorded');
    assert.strictEqual(record.email_sent_at,  null,       'email_sent_at must be null on failure');

    // Confirm no real email was dispatched
    const sent = getSentEmails();
    assert.strictEqual(sent.length, 0, 'No emails must be dispatched on simulated failure');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-6: Retry Path — failed → retried → sent
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-6. Retry Path: retryLicenseEmail succeeds after prior failure, email_status → sent', async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_retry_006',
    });

    // First attempt — fail intentionally
    const failResult = await deliverLicenseEmail(license.id, {
      simulateFailure: true,
      failureMessage: 'Transient network error',
    });
    assert.strictEqual(failResult.success,      false,    'First attempt must fail');
    assert.strictEqual(failResult.email_status, 'failed', 'Status must be failed after first attempt');

    // Retry attempt — succeed (no simulateFailure)
    const retryResult = await retryLicenseEmail(license.id);
    assert.strictEqual(retryResult.success,        true,   'Retry must succeed');
    assert.strictEqual(retryResult.email_status,   'sent', 'email_status must be sent after retry');
    assert.strictEqual(retryResult.email_attempts, 2,      'email_attempts must be 2 after retry');

    // Verify persisted state
    const record = await getLicenseById(license.id);
    assert.strictEqual(record.email_status,   'sent', 'Persisted status must be sent');
    assert.strictEqual(record.email_attempts, 2,      'Persisted attempts must be 2');
    assert.ok(record.email_sent_at,                   'email_sent_at must be set');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-7: Already-Sent Guard — retrying a sent license is rejected
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-7. Already-Sent Guard: retryLicenseEmail rejects retry when email_status is already sent', async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'basic',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_already_007',
    });

    // Deliver successfully
    const deliverResult = await deliverLicenseEmail(license.id);
    assert.strictEqual(deliverResult.success,      true,   'Initial delivery must succeed');
    assert.strictEqual(deliverResult.email_status, 'sent', 'email_status must be sent');

    // Attempt retry on already-sent license
    const retryResult = await retryLicenseEmail(license.id);
    assert.strictEqual(retryResult.success,     false,  'Retry must be rejected');
    assert.strictEqual(retryResult.alreadySent, true,   'alreadySent flag must be set');
    assert.strictEqual(retryResult.email_status,'sent', 'email_status must still report sent');

    // Verify attempts count did NOT increment
    const record = await getLicenseById(license.id);
    assert.strictEqual(record.email_attempts, 1, 'Attempts must not increment on already-sent guard');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-8: Max Retry Safety — 4th attempt rejected after MAX_EMAIL_ATTEMPTS
  // ═══════════════════════════════════════════════════════════════════════════
  await test(`E2E-8. Max Retry Safety: ${MAX_EMAIL_ATTEMPTS + 1}th attempt rejected, maxAttemptsReached = true`, async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_maxretry_008',
    });

    // Exhaust all attempts via deliberate failures
    for (let i = 0; i < MAX_EMAIL_ATTEMPTS; i++) {
      const r = await deliverLicenseEmail(license.id, {
        simulateFailure: true,
        failureMessage: `Deliberate failure attempt ${i + 1}`,
      });
      assert.strictEqual(r.success, false, `Attempt ${i + 1} must fail`);
      assert.strictEqual(r.email_attempts, i + 1, `email_attempts must be ${i + 1}`);
    }

    // Verify attempts have been exhausted
    const exhaustedRecord = await getLicenseById(license.id);
    assert.strictEqual(exhaustedRecord.email_attempts, MAX_EMAIL_ATTEMPTS,
      `email_attempts must be exactly ${MAX_EMAIL_ATTEMPTS}`);

    // The (MAX_EMAIL_ATTEMPTS + 1)th attempt must be blocked
    const blocked = await retryLicenseEmail(license.id);
    assert.strictEqual(blocked.success,           false, 'Over-limit attempt must be rejected');
    assert.strictEqual(blocked.maxAttemptsReached, true, 'maxAttemptsReached must be true');
    assert.ok(blocked.error.includes(`${MAX_EMAIL_ATTEMPTS}`),
      'Error message must mention max attempt count');

    // Attempts count must NOT increment beyond MAX
    const finalRecord = await getLicenseById(license.id);
    assert.strictEqual(finalRecord.email_attempts, MAX_EMAIL_ATTEMPTS,
      'email_attempts must not exceed MAX_EMAIL_ATTEMPTS');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-9: Idempotency — duplicate Stripe webhook event is ignored
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-9. Idempotency: Duplicate Stripe webhook event is silently deduplicated (no double license)', async () => {
    resetSandbox();

    const eventPayload = buildCheckoutEvent({
      id: 'evt_e2e_sandbox_idempotent_009',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL,
          payment_intent:  'pi_e2e_idempotent_009',
          payment_status:  'paid',
          line_items: {
            data: [{ price: { id: 'price_standard_20' } }],
          },
        },
      },
    });

    const { rawBody, headers } = createSignedStripePayload(eventPayload);

    // First call — must succeed and create license
    const firstResponse = await callWebhook(rawBody, headers);
    assert.strictEqual(firstResponse.status, 200, 'First call must be 200');
    assert.strictEqual(firstResponse.data.received, true, 'First call must be received');
    assert.ok(firstResponse.data.tier, 'First call must include tier');

    // Second call — same event ID must be deduplicated
    const { rawBody: rawBody2, headers: headers2 } = createSignedStripePayload(eventPayload);
    const secondResponse = await callWebhook(rawBody2, headers2);
    assert.strictEqual(secondResponse.status, 200,   'Duplicate must return 200');
    assert.strictEqual(secondResponse.data.received,  true, 'Duplicate must be marked received');
    assert.strictEqual(secondResponse.data.duplicate, true, 'Duplicate must set duplicate = true');

    // Ensure only one license was created
    const licenses = getInMemoryLicenses();
    assert.strictEqual(licenses.length, 1, 'Exactly one license must be created for one payment event');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-10: Webhook Signature Rejection — tampered payload is rejected
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-10. Signature Rejection: Tampered or unsigned payload returns 400', async () => {
    resetSandbox();

    const eventPayload = buildCheckoutEvent({ id: 'evt_e2e_sandbox_tamper_010' });
    const tamperSecret = 'whsec_wrong_secret_that_will_not_match';
    const { rawBody, headers } = createSignedStripePayload(eventPayload, tamperSecret);

    const response = await callWebhook(rawBody, headers);
    assert.strictEqual(response.status, 400, 'Tampered payload must return 400');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-11: Secret Safety Audit — no production secrets appear in test output
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-11. Secret Safety: No production secrets, real email addresses, or real Stripe keys in test constants', () => {
    // Verify sandbox email is non-deliverable
    assert.ok(
      SANDBOX_EMAIL.endsWith('.invalid'),
      'Sandbox email must use .invalid TLD to guarantee non-delivery'
    );

    // Verify webhook secret is not a real production whsec
    assert.ok(
      TEST_WEBHOOK_SECRET.startsWith('whsec_'),
      'Test webhook secret must start with whsec_'
    );
    assert.ok(
      !TEST_WEBHOOK_SECRET.includes('live'),
      'Test webhook secret must not contain "live" (production secret detected)'
    );

    // Verify no real Stripe live secret keys in config or environment
    const currentStripeKey = config.stripe.secretKey || '';
    assert.ok(!currentStripeKey.includes('live'), 'Stripe key in config must not be a live key');
    assert.ok(
      !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.includes('live'),
      'STRIPE_SECRET_KEY env var must not be a live key'
    );

    // Verify test email addresses used in tests are strictly non-deliverable sandbox domains
    assert.ok(SANDBOX_EMAIL.endsWith('.invalid'), 'SANDBOX_EMAIL must use .invalid TLD');
    assert.ok(!SANDBOX_EMAIL.includes('gmail'),   'SANDBOX_EMAIL must not use gmail domain');
    assert.ok(!SANDBOX_EMAIL.includes('yahoo'),   'SANDBOX_EMAIL must not use yahoo domain');
    assert.ok(!SANDBOX_EMAIL.includes('hotmail'), 'SANDBOX_EMAIL must not use hotmail domain');

    // Verify client renderer files do not leak webhook secrets or API keys
    const clientFiles = [
      path.join(__dirname, '../src/renderer/src/components/SettingsPanel.jsx'),
      path.join(__dirname, '../src/renderer/src/components/UpgradeModal.jsx'),
      path.join(__dirname, '../src/preload/index.js'),
    ];
    for (const clientFile of clientFiles) {
      if (fs.existsSync(clientFile)) {
        const content = fs.readFileSync(clientFile, 'utf8');
        assert.ok(!content.includes('whsec_'), `${path.basename(clientFile)} must not expose webhook secret`);
        assert.ok(!content.includes('sk_live_'), `${path.basename(clientFile)} must not expose live secret`);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E-12: Error Sanitization in Delivery Path
  // ═══════════════════════════════════════════════════════════════════════════
  await test('E2E-12. Error Sanitization: API keys and tokens are scrubbed before being persisted to email_error', async () => {
    resetSandbox();

    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL,
      transactionId: 'pi_e2e_sanitize_012',
    });

    const leakyErrorMsg = 'Request failed: Bearer re_live_FAKE123456 and sk_live_FAKE987654 and whsec_FAKESECRET';
    const result = await deliverLicenseEmail(license.id, {
      simulateFailure: true,
      failureMessage:  leakyErrorMsg,
    });

    assert.strictEqual(result.success, false, 'Delivery must report failure');

    // Verify persisted error is sanitized
    const record = await getLicenseById(license.id);
    assert.ok(record.email_error,                              'email_error must be set');
    assert.ok(!record.email_error.includes('re_live_FAKE'),    'Resend key must be scrubbed');
    assert.ok(!record.email_error.includes('sk_live_FAKE'),    'Stripe key must be scrubbed');
    assert.ok(!record.email_error.includes('whsec_FAKESECRET'),'Webhook secret must be scrubbed');
    assert.ok(record.email_error.includes('[REDACTED'),        'Redaction marker must be present');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  // Always clean up sandbox state after all tests
  resetSandbox();

  console.log('\n======================================================');
  console.log(`📊 E2E Payment & Email Results: ${passed} / ${total} passed`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error('Unhandled E2E test failure:', err);
  process.exit(1);
});
