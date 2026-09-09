const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const StripeProvider = require('../server/providers/stripeProvider');
const { createLicense, generateKeyFormat, getLicenseById, clearInMemoryLicenses } = require('../server/services/licenseGenerator');
const {
  sendLicenseEmail,
  deliverLicenseEmail,
  retryLicenseEmail,
  sanitizeErrorMessage,
  MAX_EMAIL_ATTEMPTS,
  getSentEmails,
  clearSentEmails,
} = require('../server/services/emailService');
const config = require('../server/config');

async function runPaymentTests() {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 4 Payment & Webhook Test Suite');
  console.log('======================================================\n');

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

  const testSecretKey = config.stripe.secretKey;
  const testWebhookSecret = config.stripe.webhookSecret;
  const stripeProvider = new StripeProvider({
    secretKey: testSecretKey,
    webhookSecret: testWebhookSecret,
    priceIds: {
      price_basic_10: 'basic',
      price_standard_20: 'standard',
      price_pro_30: 'pro',
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

  // ─── Test 1: Price ID to Tier Mapping (Basic, Standard, Pro) ──────────────
  await test('1. Price ID Mapping: Maps verified Price IDs strictly on the server', () => {
    assert.strictEqual(stripeProvider.mapPriceIdToTier('price_basic_10'), 'basic');
    assert.strictEqual(stripeProvider.mapPriceIdToTier('price_standard_20'), 'standard');
    assert.strictEqual(stripeProvider.mapPriceIdToTier('price_pro_30'), 'pro');
    assert.strictEqual(stripeProvider.mapPriceIdToTier('unknown_price_id'), null);
  });

  // ─── Test 2: License Key Format (XXXX-XXXX-XXXX-XXXX) ────────────────────
  await test('2. License Key Format: Generates unique XXXX-XXXX-XXXX-XXXX keys', () => {
    const key = generateKeyFormat();
    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    assert(pattern.test(key), `Key "${key}" must match XXXX-XXXX-XXXX-XXXX pattern`);

    // Verify uniqueness over 100 keys
    const generated = new Set();
    for (let i = 0; i < 100; i++) {
      const k = generateKeyFormat();
      assert(!generated.has(k), 'Keys must be unique');
      generated.add(k);
    }
  });

  // ─── Test 3: License Creation & Customer Data Persistence ────────────────
  await test('3. Supabase Insertion: Inserts new license with customer email, transaction ID, and payment provider', async () => {
    const record = await createLicense({
      tier: 'pro',
      customerEmail: 'testuser@example.com',
      transactionId: 'pi_test_12345',
      paymentProvider: 'stripe',
    });

    assert(record.licenseKey, 'License key must be generated');
    assert.strictEqual(record.tier, 'pro', 'Tier must be pro');
    assert.strictEqual(record.customerEmail, 'testuser@example.com', 'customerEmail must match');
    assert.strictEqual(record.transactionId, 'pi_test_12345', 'transactionId must match');
    assert.strictEqual(record.paymentProvider, 'stripe', 'paymentProvider must be stripe');
    assert.strictEqual(record.record.customer_email, 'testuser@example.com', 'record.customer_email must be persisted');
    assert.strictEqual(record.record.transaction_id, 'pi_test_12345', 'record.transaction_id must be persisted');
    assert.strictEqual(record.record.payment_provider, 'stripe', 'record.payment_provider must be persisted');
    assert.strictEqual(record.record.hwid, null, 'hwid must initially be null');
    assert.strictEqual(record.record.status, 'active', 'status must be active');
    assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(record.licenseKey));
  });

  // ─── Test 3b: Backward Compatibility ──────────────────────────────────────
  await test('3b. Backward Compatibility: Generates active license even when customer email / transaction ID are omitted', async () => {
    const record = await createLicense({
      tier: 'standard',
    });

    assert(record.licenseKey, 'License key must be generated');
    assert.strictEqual(record.tier, 'standard');
    assert.strictEqual(record.customerEmail, null);
    assert.strictEqual(record.transactionId, null);
    assert.strictEqual(record.paymentProvider, 'stripe');
    assert.strictEqual(record.record.customer_email, null);
    assert.strictEqual(record.record.transaction_id, null);
    assert.strictEqual(record.record.payment_provider, 'stripe');
  });

  // ─── Test 3c: Email Status Defaults to Pending ────────────────────────────
  await test('3c. Email Status Initialization: New license email_status defaults to pending', async () => {
    const record = await createLicense({
      tier: 'pro',
      customerEmail: 'pending@example.com',
      transactionId: 'pi_pending_123',
    });

    assert.strictEqual(record.emailStatus, 'pending');
    assert.strictEqual(record.emailAttempts, 0);
    assert.strictEqual(record.emailSentAt, null);
    assert.strictEqual(record.emailError, null);
    assert.strictEqual(record.emailLastAttemptAt, null);
  });

  // ─── Test 4: Customer Email Dispatch ──────────────────────────────────────
  await test('4. Email Dispatch: Dispatches email containing license key, tier, and installer link', async () => {
    clearSentEmails();
    const testKey = 'PRO-TEST-AAAA-BBBB';
    const result = await sendLicenseEmail({
      to: 'buyer@example.com',
      licenseKey: testKey,
      tier: 'pro',
      downloadUrl: 'https://reelcutter.app/download',
    });

    assert.strictEqual(result.success, true, 'Email dispatch must succeed');
    const sent = getSentEmails();
    assert.strictEqual(sent.length, 1, 'One email must be recorded');
    assert.strictEqual(sent[0].to, 'buyer@example.com');
    assert.strictEqual(sent[0].licenseKey, testKey);
    assert.strictEqual(sent[0].tier, 'pro');
    assert.strictEqual(sent[0].downloadUrl, 'https://reelcutter.app/download');
  });

  // ─── Test 4b: deliverLicenseEmail Status Transition to Sent ───────────────
  await test('4b. Delivery Success: deliverLicenseEmail updates email_status to sent and records sent_at', async () => {
    clearSentEmails();
    const license = await createLicense({
      tier: 'standard',
      customerEmail: 'delivered@example.com',
      transactionId: 'pi_deliv_123',
    });

    const result = await deliverLicenseEmail(license.id);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.email_status, 'sent');
    assert.strictEqual(result.email_attempts, 1);
    assert(result.email_sent_at, 'email_sent_at must be recorded');

    // Verify persisted record
    const updated = await getLicenseById(license.id);
    assert.strictEqual(updated.email_status, 'sent');
    assert.strictEqual(updated.email_attempts, 1);
    assert(updated.email_sent_at);
    assert.strictEqual(updated.email_error, null);
  });

  // ─── Test 4c: deliverLicenseEmail Status Transition to Failed ─────────────
  await test('4c. Delivery Failure: Failed email delivery sets email_status to failed and records error', async () => {
    const license = await createLicense({
      tier: 'basic',
      customerEmail: 'failed@example.com',
      transactionId: 'pi_fail_123',
    });

    const result = await deliverLicenseEmail(license.id, {
      simulateFailure: true,
      failureMessage: 'SMTP connection timeout on host mail.example.com',
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.email_status, 'failed');
    assert.strictEqual(result.email_attempts, 1);
    assert(result.error.includes('SMTP connection timeout'));

    // Verify persisted record
    const updated = await getLicenseById(license.id);
    assert.strictEqual(updated.email_status, 'failed');
    assert.strictEqual(updated.email_attempts, 1);
    assert(updated.email_error.includes('SMTP connection timeout'));
    assert.strictEqual(updated.email_sent_at, null);
  });

  // ─── Test 4d: Error Sanitization ──────────────────────────────────────────
  await test('4d. Credential Scrubbing: sanitizeErrorMessage strips API keys, tokens, and passwords', () => {
    const leakedMsg = 'Error sending via Resend: Bearer re_live_secret123456789 with password=supersecretpass and sk_live_99999999';
    const sanitized = sanitizeErrorMessage(leakedMsg);
    assert(!sanitized.includes('re_live_secret'), 'Must scrub Resend keys');
    assert(!sanitized.includes('supersecretpass'), 'Must scrub passwords');
    assert(!sanitized.includes('sk_live_99999999'), 'Must scrub Stripe keys');
    assert(sanitized.includes('Bearer [REDACTED]'), 'Must replace Bearer token');
  });

  // ─── Test 4e: Retry Mechanism ─────────────────────────────────────────────
  await test('4e. Retry Mechanism: Retries failed email without creating duplicate license, enforces max attempts', async () => {
    const license = await createLicense({
      tier: 'pro',
      customerEmail: 'retryuser@example.com',
      transactionId: 'pi_retry_123',
    });

    // 1. Initial attempt fails
    const firstAttempt = await deliverLicenseEmail(license.id, { simulateFailure: true, failureMessage: 'Network blip' });
    assert.strictEqual(firstAttempt.email_status, 'failed');
    assert.strictEqual(firstAttempt.email_attempts, 1);

    // 2. Retry 1 (attempt 2) fails
    const retry1 = await retryLicenseEmail(license.id, { simulateFailure: true, failureMessage: 'Still down' });
    assert.strictEqual(retry1.email_status, 'failed');
    assert.strictEqual(retry1.email_attempts, 2);
    // Verify license key is unchanged
    const afterRetry1 = await getLicenseById(license.id);
    assert.strictEqual(afterRetry1.license_key, license.licenseKey, 'License key must remain unchanged');

    // 3. Retry 2 (attempt 3) succeeds!
    const retry2 = await retryLicenseEmail(license.id);
    assert.strictEqual(retry2.success, true);
    assert.strictEqual(retry2.email_status, 'sent');
    assert.strictEqual(retry2.email_attempts, 3);
    assert(retry2.email_sent_at);

    // 4. Retry already-sent email is rejected
    const retryAlreadySent = await retryLicenseEmail(license.id);
    assert.strictEqual(retryAlreadySent.success, false);
    assert.strictEqual(retryAlreadySent.alreadySent, true);
    assert(retryAlreadySent.error.includes('already sent'));

    // 5. Test max attempts limit (attempt >= 3 when failed)
    const exhaustedLicense = await createLicense({
      tier: 'basic',
      customerEmail: 'exhausted@example.com',
    });
    await deliverLicenseEmail(exhaustedLicense.id, { simulateFailure: true }); // attempt 1
    await retryLicenseEmail(exhaustedLicense.id, { simulateFailure: true });   // attempt 2
    await retryLicenseEmail(exhaustedLicense.id, { simulateFailure: true });   // attempt 3

    const finalRetry = await retryLicenseEmail(exhaustedLicense.id);
    assert.strictEqual(finalRetry.success, false);
    assert.strictEqual(finalRetry.maxAttemptsReached, true);
    assert(finalRetry.error.includes('Maximum delivery attempts (3) reached'));
  });

  // ─── Test 5: Stripe Webhook Signature Verification ────────────────────────
  await test('5. Webhook Signature: Verifies valid Stripe webhook signatures', async () => {
    const eventPayload = {
      id: 'evt_test_valid_signature_001',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_001',
          payment_intent: 'pi_test_001',
          customer_details: { email: 'verified@example.com' },
          line_items: {
            data: [{ price: { id: 'price_pro_30' } }],
          },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const verifiedEvent = await stripeProvider.verifyWebhookEvent(rawBody, headers);

    assert.strictEqual(verifiedEvent.id, 'evt_test_valid_signature_001');
    const details = stripeProvider.extractPaymentDetails(verifiedEvent);
    assert.strictEqual(details.tier, 'pro');
    assert.strictEqual(details.customerEmail, 'verified@example.com');
  });

  // ─── Test 6: Invalid Stripe Signature Rejection ───────────────────────────
  await test('6. Webhook Security: Rejects invalid or tampered signatures with error', async () => {
    const eventPayload = { id: 'evt_tampered', type: 'checkout.session.completed' };
    const { rawBody } = createSignedStripePayload(eventPayload);

    // Provide forged signature
    const badHeaders = { 'stripe-signature': 't=123456,v1=bad_signature_hex_0000000000000' };

    let threw = false;
    try {
      await stripeProvider.verifyWebhookEvent(rawBody, badHeaders);
    } catch (err) {
      threw = true;
      assert(err.message.includes('signature verification failed'), 'Error should mention signature failure');
    }
    assert.strictEqual(threw, true, 'Must reject bad signature');
  });

  // ─── Test 7: Idempotent Duplicate Event Handling ──────────────────────────
  await test('7. Idempotency: Handles duplicate events safely without duplicate fulfillment', async () => {
    const router = require('../server/routes/webhook');
    router.resetProcessedEvents();

    const eventPayload = {
      id: 'evt_test_duplicate_id_999',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_dup_999',
          payment_intent: 'pi_dup_999',
          customer_details: { email: 'dup@example.com' },
          metadata: { price_id: 'price_standard_20' },
        },
      },
    };

    const { rawBody, headers } = createSignedStripePayload(eventPayload);

    function callWebhook(body, h) {
      return new Promise((resolve) => {
        let statusCode = 200;
        const req = { body, headers: h, method: 'POST', url: '/stripe' };
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

    // First call
    const firstRes = await callWebhook(rawBody, headers);
    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.data.received, true);
    assert(firstRes.data.licenseKey, 'License key should be created on first call');

    // Duplicate call with exact same event ID
    const secondRes = await callWebhook(rawBody, headers);
    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.data.duplicate, true, 'Duplicate call must be flagged as duplicate');
  });

  // ─── Test 8: Client Price Tampering Prevention ────────────────────────────
  await test('8. Price Tampering Defense: Server ignores client price amounts and strictly enforces Price ID', () => {
    // Client tries to spoof amount as $30 but passed basic price ID
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          amount_total: 3000, // Client tries to spoof $30
          line_items: {
            data: [{ price: { id: 'price_basic_10' } }], // Verified Stripe Price ID is $10 Basic
          },
        },
      },
    };

    const details = stripeProvider.extractPaymentDetails(event);
    assert.strictEqual(details.tier, 'basic', 'Must strictly bind to Price ID tier, not amount');
  });

  // ─── Test 9: Renderer Secret Leakage Audit ────────────────────────────────
  await test('9. Credential Audit: Verifies no Stripe secret or Supabase service-role keys in renderer files', () => {
    const rendererFiles = [
      path.join(__dirname, '../src/renderer/src/App.jsx'),
      path.join(__dirname, '../src/renderer/src/components/CutPanel.jsx'),
      path.join(__dirname, '../src/renderer/src/components/ReelPanel.jsx'),
      path.join(__dirname, '../src/renderer/src/components/SettingsPanel.jsx'),
      path.join(__dirname, '../src/renderer/src/components/UpgradeModal.jsx'),
      path.join(__dirname, '../src/preload/index.js'),
    ];

    for (const filePath of rendererFiles) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert(!content.includes('sk_test_'), `File ${path.basename(filePath)} must not contain Stripe secret key`);
        assert(!content.includes('whsec_'), `File ${path.basename(filePath)} must not contain Stripe webhook secret`);
        assert(!content.includes('SERVICE_ROLE_KEY'), `File ${path.basename(filePath)} must not contain service role key`);
      }
    }
  });

  console.log('\n======================================================');
  console.log(`📊 Payment & Webhook Results: ${passed} / ${total} passed`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPaymentTests().catch((err) => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
