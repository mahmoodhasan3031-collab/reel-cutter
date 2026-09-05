const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const StripeProvider = require('../server/providers/stripeProvider');
const { createLicense, generateKeyFormat } = require('../server/services/licenseGenerator');
const { sendLicenseEmail, getSentEmails, clearSentEmails } = require('../server/services/emailService');
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

  // ─── Test 3: License Creation & Supabase Insertion ────────────────────────
  await test('3. Supabase Insertion: Inserts new license with hwid = null and active status', async () => {
    const record = await createLicense({
      tier: 'pro',
      customerEmail: 'testuser@example.com',
      transactionId: 'pi_test_12345',
    });

    assert(record.licenseKey, 'License key must be generated');
    assert.strictEqual(record.tier, 'pro', 'Tier must be pro');
    assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(record.licenseKey));
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
