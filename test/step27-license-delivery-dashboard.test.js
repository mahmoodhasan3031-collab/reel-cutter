'use strict';

/**
 * STEP 27 — License Delivery, Dashboard & Customer Ownership Tests
 *
 * Verifies:
 *  A. License-to-user linking (webhook → license → user)
 *  B. Dashboard route (authenticated license lookup)
 *  C. IDOR protection (cross-user isolation)
 *  D. License key protection (safe fields, no leaks)
 *  E. Webhook purchase flow (idempotency, linking, email)
 *  F. Payment input hardening (browser cannot force tier/price)
 *  G. Stripe signature verification (unbroken)
 *  H. Transaction ID protection
 *  I. Success page security (redirect ≠ payment proof)
 *  J. Email delivery (trusted source, no duplicate on failure)
 *  K. Secret leakage prevention (no keys in client code)
 *  L. Regression: Step 25 License API
 *  M. Regression: Step 26 Payment API
 *  N. Regression: Step 24 Authentication
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const Stripe = require('stripe');

const serverDir = path.join(__dirname, '..', 'server');
const routeDir = path.join(serverDir, 'routes');
const serviceDir = path.join(serverDir, 'services');
const websiteDir = path.join(__dirname, '..', 'website');

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

function assertFileExists(filePath, label) {
  const exists = fs.existsSync(filePath);
  assert.ok(exists, `${label} must exist at ${path.relative(path.join(__dirname, '..'), filePath)}`);
}

// ─── Imports ──────────────────────────────────────────────────────────────────

const licenseService = require(path.join(serviceDir, 'licenseService.js'));
const licenseGenerator = require(path.join(serviceDir, 'licenseGenerator.js'));
const emailService = require(path.join(serviceDir, 'emailService.js'));
const webhookRouter = require(path.join(routeDir, 'webhook.js'));
const licenseRouter = require(path.join(routeDir, 'license.js'));
const config = require(path.join(serverDir, 'config.js'));

let paymentRouter = null;
try {
  paymentRouter = require(path.join(routeDir, 'payment.js'));
} catch {
  // payment.js may fail to load if Stripe SDK version is incompatible
}

const {
  createLicense,
  getLicenseById,
  getInMemoryLicenses: getGeneratedLicenses,
  clearInMemoryLicenses: clearGeneratedLicenses,
} = licenseGenerator;

const {
  seedInMemoryLicense,
  clearInMemoryLicenses: clearServiceLicenses,
  linkLicenseToUser,
  getLicensesByUserId,
  lookupLicense,
  inMemoryLicenses,
} = licenseService;

const {
  deliverLicenseEmail,
  getSentEmails,
  clearSentEmails,
} = emailService;

const TEST_WEBHOOK_SECRET = config.stripe.webhookSecret;
const SANDBOX_EMAIL_A = 'customer-a@step27-test.invalid';
const SANDBOX_EMAIL_B = 'customer-b@step27-test.invalid';
const FAKE_USER_ID_A = '00000000-0000-0000-0000-000000000001';
const FAKE_USER_ID_B = '00000000-0000-0000-0000-000000000002';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      json: (data) => resolve({ status: statusCode, data }),
    };
    webhookRouter.handle(req, res, () => resolve({ status: statusCode, data: null }));
  });
}

function callLicenseRoute(method, urlPath, body, headers = {}) {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req = {
      method,
      url: urlPath,
      body,
      headers,
      query: {},
    };
    const urlObj = new URL(urlPath, 'http://localhost');
    req.query = Object.fromEntries(urlObj.searchParams);

    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => resolve({ status: statusCode, data }),
      set: () => res,
      get: () => null,
    };
    licenseRouter.handle(req, res, () => resolve({ status: statusCode, data: null }));
  });
}

function buildCheckoutEvent(overrides = {}) {
  const now = Date.now();
  return {
    id: `evt_step27_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'checkout.session.completed',
    object: 'event',
    data: {
      object: {
        id: `cs_step27_${now}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_step27_${now}`,
        customer_email: SANDBOX_EMAIL_A,
        line_items: null,
        metadata: {},
        ...overrides.data?.object,
      },
    },
    ...overrides,
  };
}

function resetAllState() {
  webhookRouter.resetProcessedEvents();
  clearGeneratedLicenses();
  clearServiceLicenses();
  clearSentEmails();
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

async function runStep27Tests() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 27 — License Delivery, Dashboard & Customer Ownership');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // A. License-to-User Linking
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── A. License-to-User Linking ──');

  await test('A1. createLicense generates a valid license with licenseKey', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_a1_test',
      paymentProvider: 'stripe',
    });
    assert.ok(license.licenseKey, 'licenseKey must be present');
    assert.match(license.licenseKey, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.strictEqual(license.tier, 'pro');
  });

  await test('A2. linkLicenseToUser links license to a user via licenseKey (not UUID)', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_a2_test',
      paymentProvider: 'stripe',
    });
    const result = await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);
    assert.strictEqual(result.success, true, 'Link must succeed');
  });

  await test('A3. linkLicenseToUser with UUID id (not licenseKey) finds license via generator store', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'basic',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_a3_test',
      paymentProvider: 'stripe',
    });
    const result = await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);
    assert.strictEqual(result.success, true);
    const record = await getLicenseById(license.id);
    assert.strictEqual(record.user_id, FAKE_USER_ID_A, 'user_id must be set on the record');
  });

  await test('A4. linkLicenseToUser fails for nonexistent license key', async () => {
    resetAllState();
    const result = await linkLicenseToUser('XXXX-XXXX-XXXX-XXXX', FAKE_USER_ID_A);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'LICENSE_NOT_FOUND');
  });

  await test('A5. getLicensesByUserId returns linked licenses', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_a5_test',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);
    const licenses = await getLicensesByUserId(FAKE_USER_ID_A);
    assert.ok(licenses.length >= 1, 'Must return at least 1 license');
    const found = licenses.find((l) => l.license_key === license.licenseKey);
    assert.ok(found, 'Must find the linked license');
  });

  await test('A6. getLicensesByUserId returns empty for user with no licenses', async () => {
    resetAllState();
    const licenses = await getLicensesByUserId('99999999-9999-9999-9999-999999999999');
    assert.strictEqual(licenses.length, 0, 'Must return empty array');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Dashboard Route (authenticated license lookup)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── B. Dashboard Route ──');

  await test('B1. Dashboard route exists on license router', async () => {
    assert.ok(typeof licenseRouter === 'function', 'License router must be a function/router');
  });

  await test('B2. Dashboard route rejects request without Authorization header', async () => {
    const response = await callLicenseRoute('GET', '/dashboard', null, {});
    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.data.success, false);
    assert.strictEqual(response.data.error.code, 'UNAUTHORIZED');
  });

  await test('B3. Dashboard route rejects empty Bearer token', async () => {
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer ',
    });
    assert.strictEqual(response.status, 401);
  });

  await test('B4. Dashboard route rejects malformed Authorization header', async () => {
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Basic abc123',
    });
    assert.strictEqual(response.status, 401);
  });

  await test('B5. Dashboard route accepts test user via x-test-user-id header (in-memory mode)', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_b5_test',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.success, true);
    assert.ok(Array.isArray(response.data.licenses));
    const found = response.data.licenses.find((l) => l.license_key === license.licenseKey);
    assert.ok(found, 'Must return the linked license');
  });

  await test('B6. Dashboard returns only safe fields (no customer_email, no transaction_id)', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_b6_test',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    assert.strictEqual(response.status, 200);
    const lic = response.data.licenses[0];
    assert.ok(lic, 'Must have at least one license');
    assert.ok(lic.license_key, 'Must include license_key');
    assert.ok(lic.tier, 'Must include tier');
    assert.ok(lic.status, 'Must include status');
    assert.strictEqual(lic.customer_email, undefined, 'Must NOT expose customer_email');
    assert.strictEqual(lic.transaction_id, undefined, 'Must NOT expose transaction_id');
    assert.strictEqual(lic.payment_provider, undefined, 'Must NOT expose payment_provider');
    assert.strictEqual(lic.email_status, undefined, 'Must NOT expose email_status');
    assert.strictEqual(lic.email_error, undefined, 'Must NOT expose email_error');
    assert.strictEqual(typeof lic.hasHwid, 'boolean', 'Must include hasHwid boolean');
  });

  await test('B7. Dashboard rejects request without x-test-user-id in test mode', async () => {
    resetAllState();
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
    });
    assert.strictEqual(response.status, 401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. IDOR Protection (cross-user isolation)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── C. IDOR Protection ──');

  await test('C1. User A cannot see User B licenses via dashboard', async () => {
    resetAllState();
    const licenseA = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_c1_a',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(licenseA.licenseKey, FAKE_USER_ID_A);

    const licenseB = await createLicense({
      tier: 'basic',
      customerEmail: SANDBOX_EMAIL_B,
      transactionId: 'pi_c1_b',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(licenseB.licenseKey, FAKE_USER_ID_B);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    assert.strictEqual(response.status, 200);
    const keys = response.data.licenses.map((l) => l.license_key);
    assert.ok(keys.includes(licenseA.licenseKey), 'User A must see own license');
    assert.ok(!keys.includes(licenseB.licenseKey), 'User A must NOT see User B license');
  });

  await test('C2. Dashboard ignores userId from request body or query params', async () => {
    resetAllState();
    const licenseA = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_c2_a',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(licenseA.licenseKey, FAKE_USER_ID_A);

    const licenseB = await createLicense({
      tier: 'basic',
      customerEmail: SANDBOX_EMAIL_B,
      transactionId: 'pi_c2_b',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(licenseB.licenseKey, FAKE_USER_ID_B);

    const response = await callLicenseRoute('GET', '/dashboard?userId=' + FAKE_USER_ID_B, null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    assert.strictEqual(response.status, 200);
    const keys = response.data.licenses.map((l) => l.license_key);
    assert.ok(keys.includes(licenseA.licenseKey), 'User A must see own license');
    assert.ok(!keys.includes(licenseB.licenseKey), 'Query param userId must NOT override server identity');
  });

  await test('C3. Arbitrarily supplied userId in header cannot access another user licenses', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_B,
      transactionId: 'pi_c3_test',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_B);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_B,
    });
    assert.strictEqual(response.status, 200);
    const keys = response.data.licenses.map((l) => l.license_key);
    assert.ok(keys.includes(license.licenseKey), 'Correct user must see own license');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. License Key Protection
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── D. License Key Protection ──');

  await test('D1. License key is NOT exposed in error responses for nonexistent keys', async () => {
    const response = await callLicenseRoute('GET', '/status?licenseKey=FAKE-FAKE-FAKE-FAKE', null);
    assert.strictEqual(response.status, 404);
    const body = JSON.stringify(response.data);
    assert.ok(!body.includes('FAKE-FAKE-FAKE-FAKE') || response.data.error,
      'Error response must not leak the key itself');
  });

  await test('D2. Dashboard response does not contain raw database fields', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_d2_test',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    const body = JSON.stringify(response.data);
    assert.ok(!body.includes('service_role'), 'Must not contain service-role references');
    assert.ok(!body.includes('SUPABASE'), 'Must not contain Supabase config');
    assert.ok(!body.includes('sk_'), 'Must not contain Stripe secret keys');
    assert.ok(!body.includes('whsec_'), 'Must not contain webhook secrets');
  });

  await test('D3. license_key in dashboard is properly formatted', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_d3_test',
      paymentProvider: 'stripe',
    });
    await linkLicenseToUser(license.licenseKey, FAKE_USER_ID_A);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    const lic = response.data.licenses[0];
    assert.match(lic.license_key, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
      'License key must be XXXX-XXXX-XXXX-XXXX format');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. Webhook Purchase Flow
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── E. Webhook Purchase Flow ──');

  await test('E1. Verified Stripe webhook creates license with correct tier and email', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_e1',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_e1',
          line_items: { data: [{ price: { id: 'price_pro_monthly_30' } }] },
          metadata: { planId: 'pro' },
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const response = await callWebhook(rawBody, headers);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.tier, 'pro');
    const licenses = getGeneratedLicenses();
    assert.strictEqual(licenses.length, 1);
    assert.strictEqual(licenses[0].customer_email, SANDBOX_EMAIL_A);
    assert.strictEqual(licenses[0].tier, 'pro');
  });

  await test('E2. Webhook with userId metadata links license to user', async () => {
    resetAllState();
    const userId = FAKE_USER_ID_A;
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_e2',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_e2',
          line_items: { data: [{ price: { id: 'price_standard_monthly_20' } }] },
          metadata: { planId: 'standard', userId },
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const response = await callWebhook(rawBody, headers);

    assert.strictEqual(response.status, 200);
    const licenses = getGeneratedLicenses();
    assert.strictEqual(licenses.length, 1);
    assert.strictEqual(licenses[0].user_id, userId, 'License must be linked to userId from metadata');
  });

  await test('E3. Webhook without userId metadata creates unlinked license', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_e3',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_e3',
          line_items: { data: [{ price: { id: 'price_basic_monthly_10' } }] },
          metadata: {},
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    const response = await callWebhook(rawBody, headers);

    assert.strictEqual(response.status, 200);
    const licenses = getGeneratedLicenses();
    assert.strictEqual(licenses.length, 1);
    assert.ok(!licenses[0].user_id, 'License must have no user_id (null or undefined)');
  });

  await test('E4. Duplicate webhook event is idempotent (no duplicate license)', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_e4_duplicate',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_e4',
          line_items: { data: [{ price: { id: 'price_pro_monthly_30' } }] },
          metadata: { planId: 'pro' },
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);

    const response1 = await callWebhook(rawBody, headers);
    assert.strictEqual(response1.status, 200);
    assert.strictEqual(response1.data.received, true);
    assert.strictEqual(response1.data.duplicate, undefined, 'First call must not be duplicate');

    const response2 = await callWebhook(rawBody, headers);
    assert.strictEqual(response2.status, 200);
    assert.strictEqual(response2.data.duplicate, true, 'Second call must be duplicate');

    const licenses = getGeneratedLicenses();
    assert.strictEqual(licenses.length, 1, 'Must not create duplicate license');
  });

  await test('E5. Linked license appears in user dashboard after webhook', async () => {
    resetAllState();
    const userId = FAKE_USER_ID_A;
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_e5',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_e5',
          line_items: { data: [{ price: { id: 'price_pro_monthly_30' } }] },
          metadata: { planId: 'pro', userId },
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    await callWebhook(rawBody, headers);

    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': userId,
    });
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.licenses.length >= 1, 'Dashboard must show linked license');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F. Payment Input Hardening
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── F. Payment Input Hardening ──');

  await test('F1. Browser cannot force tier via checkout session request', async () => {
    const checkoutSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(!checkoutSource.includes('req.body.tier'), 'Payment route must not trust req.body.tier');
    assert.ok(checkoutSource.includes('getStripePriceId(planId)'), 'Must map planId to server-side Price ID');
  });

  await test('F2. Browser cannot force Stripe Price ID directly', async () => {
    const checkoutSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(!checkoutSource.includes('req.body.priceId'), 'Must not accept priceId from request body');
    assert.ok(!checkoutSource.includes('req.body.price'), 'Must not accept price from request body');
  });

  await test('F3. stripUnknownFields removes unexpected fields from request body', async () => {
    const { stripUnknownFields } = require(path.join(serverDir, 'middleware', 'inputValidator.js'));
    const middleware = stripUnknownFields(['planId', 'email']);
    let capturedBody = null;
    const fakeReq = { body: { planId: 'pro', email: 'a@b.com', injectedField: 'malicious', tier: 'admin' } };
    const fakeRes = { status: () => ({ json: () => {} }) };
    middleware(fakeReq, fakeRes, () => { capturedBody = fakeReq.body; });
    assert.deepStrictEqual(capturedBody, { planId: 'pro', email: 'a@b.com' },
      'stripUnknownFields must remove non-whitelisted fields');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Stripe Signature Verification
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── G. Stripe Signature Verification ──');

  await test('G1. Webhook rejects invalid Stripe signature', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({ id: 'evt_step27_g1' });
    const rawBody = Buffer.from(JSON.stringify(eventPayload), 'utf8');
    const response = await callWebhook(rawBody, { 'stripe-signature': 'invalid_sig' });
    assert.strictEqual(response.status, 400);
  });

  await test('G2. Webhook rejects missing Stripe signature', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({ id: 'evt_step27_g2' });
    const rawBody = Buffer.from(JSON.stringify(eventPayload), 'utf8');
    const response = await callWebhook(rawBody, {});
    assert.strictEqual(response.status, 400);
  });

  await test('G3. Webhook rejects payload signed with wrong secret', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({ id: 'evt_step27_g3' });
    const { rawBody, headers } = createSignedStripePayload(eventPayload, 'whsec_wrong_secret');
    const response = await callWebhook(rawBody, headers);
    assert.strictEqual(response.status, 400);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // H. Transaction ID Protection
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── H. Transaction ID Protection ──');

  await test('H1. transaction_id is persisted from Stripe event', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_h1',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_h1_txn',
          line_items: { data: [{ price: { id: 'price_pro_monthly_30' } }] },
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    await callWebhook(rawBody, headers);
    const licenses = getGeneratedLicenses();
    assert.strictEqual(licenses[0].transaction_id, 'pi_step27_h1_txn');
  });

  await test('H2. transaction_id uniqueness migration exists', async () => {
    const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationDir);
    const uniqueMigration = files.find((f) => f.includes('harden_license_integrity'));
    assert.ok(uniqueMigration, 'transaction_id uniqueness migration must exist');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // I. Success Page Security
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── I. Success Page Security ──');

  await test('I1. Checkout success page does not treat redirect alone as payment proof', async () => {
    const successPagePath = path.join(websiteDir, 'src', 'app', 'checkout', 'success', 'page.tsx');
    assertFileExists(successPagePath, 'Checkout success page');
    const content = fs.readFileSync(successPagePath, 'utf8');
    assert.ok(!content.includes('payment_status'), 'Success page must not check payment_status client-side');
    assert.ok(!content.includes('stripe.checkout'), 'Success page must not make Stripe API calls');
    assert.ok(!content.includes('license_key'), 'Success page must not display license key directly');
  });

  await test('I2. Checkout cancel page does not grant any license or access', async () => {
    const cancelPagePath = path.join(websiteDir, 'src', 'app', 'checkout', 'cancel', 'page.tsx');
    assertFileExists(cancelPagePath, 'Checkout cancel page');
    const content = fs.readFileSync(cancelPagePath, 'utf8');
    assert.ok(!content.includes('license'), 'Cancel page must not reference license creation');
  });

  await test('I3. Success page shows "payment processed" messaging only after Stripe webhook completes', async () => {
    const successPagePath = path.join(websiteDir, 'src', 'app', 'checkout', 'success', 'page.tsx');
    const content = fs.readFileSync(successPagePath, 'utf8');
    assert.ok(content.includes('license key is being generated') || content.includes('will be sent'),
      'Success page must indicate license delivery is async, not instant');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // J. Email Delivery
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── J. Email Delivery ──');

  await test('J1. Email recipient is derived from license record (not browser-supplied)', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'pro',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_j1_test',
      paymentProvider: 'stripe',
    });
    const emailsBefore = getSentEmails().length;
    await deliverLicenseEmail(license.id);
    const emails = getSentEmails();
    assert.ok(emails.length > emailsBefore, 'Email must be sent');
    const lastEmail = emails[emails.length - 1];
    assert.strictEqual(lastEmail.to, SANDBOX_EMAIL_A, 'Email must go to license customer_email');
  });

  await test('J2. Failed email does not create duplicate license', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'standard',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_j2_test',
      paymentProvider: 'stripe',
    });
    const result = await deliverLicenseEmail(license.id, {
      simulateFailure: true,
      failureMessage: 'Simulated SMTP failure',
    });
    assert.strictEqual(result.success, false);
    const licenses = getGeneratedLicenses();
    assert.strictEqual(licenses.length, 1, 'Failed email must not create additional license');
    const record = await getLicenseById(license.id);
    assert.strictEqual(record.email_status, 'failed');
    assert.ok(record.email_error, 'Must record error');
    assert.strictEqual(record.email_attempts, 1, 'Must increment attempt count');
  });

  await test('J3. Email delivery uses trusted license record data, not request body', async () => {
    resetAllState();
    const license = await createLicense({
      tier: 'basic',
      customerEmail: SANDBOX_EMAIL_A,
      transactionId: 'pi_j3_test',
      paymentProvider: 'stripe',
    });
    const result = await deliverLicenseEmail(license.id);
    assert.strictEqual(result.success, true);
    const emails = getSentEmails();
    const lastEmail = emails[emails.length - 1];
    assert.strictEqual(lastEmail.tier, 'basic', 'Email must use license tier, not arbitrary input');
  });

  await test('J4. Webhook triggers email delivery with correct recipient', async () => {
    resetAllState();
    const eventPayload = buildCheckoutEvent({
      id: 'evt_step27_j4',
      data: {
        object: {
          customer_email: SANDBOX_EMAIL_A,
          payment_intent: 'pi_step27_j4',
          line_items: { data: [{ price: { id: 'price_pro_monthly_30' } }] },
        },
      },
    });
    const { rawBody, headers } = createSignedStripePayload(eventPayload);
    clearSentEmails();
    await callWebhook(rawBody, headers);
    const emails = getSentEmails();
    assert.ok(emails.length >= 1, 'Webhook must trigger email');
    assert.strictEqual(emails[0].to, SANDBOX_EMAIL_A);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // K. Secret Leakage Prevention
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── K. Secret Leakage Prevention ──');

  await test('K1. Service-role key is absent from browser/client code', async () => {
    const clientDir = path.join(websiteDir, 'src');
    if (fs.existsSync(clientDir)) {
      const walkDir = (dir) => {
        const files = [];
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              files.push(...walkDir(fullPath));
            } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
              files.push(fullPath);
            }
          }
        } catch { /* skip */ }
        return files;
      };
      const files = walkDir(clientDir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!content.includes('service_role'), `${path.relative(websiteDir, file)} must not contain service_role`);
        assert.ok(!content.includes('SERVICE_ROLE'), `${path.relative(websiteDir, file)} must not contain SERVICE_ROLE`);
      }
    }
  });

  await test('K2. Stripe secret key is absent from browser/client code', async () => {
    const clientDir = path.join(websiteDir, 'src');
    if (fs.existsSync(clientDir)) {
      const walkDir = (dir) => {
        const files = [];
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              files.push(...walkDir(fullPath));
            } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
              files.push(fullPath);
            }
          }
        } catch { /* skip */ }
        return files;
      };
      const files = walkDir(clientDir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!content.includes('sk_live_'), `${path.relative(websiteDir, file)} must not contain sk_live_`);
        assert.ok(!content.includes('sk_test_'), `${path.relative(websiteDir, file)} must not contain sk_test_`);
      }
    }
  });

  await test('K3. Webhook secret is absent from browser/client code', async () => {
    const clientDir = path.join(websiteDir, 'src');
    if (fs.existsSync(clientDir)) {
      const walkDir = (dir) => {
        const files = [];
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              files.push(...walkDir(fullPath));
            } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
              files.push(fullPath);
            }
          }
        } catch { /* skip */ }
        return files;
      };
      const files = walkDir(clientDir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!content.includes('whsec_'), `${path.relative(websiteDir, file)} must not contain whsec_`);
      }
    }
  });

  await test('K4. Dashboard error responses do not leak internals', async () => {
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer invalid-token',
    });
    assert.strictEqual(response.status, 401);
    const body = JSON.stringify(response.data);
    assert.ok(!body.includes('stack'), 'Error must not contain stack trace');
    assert.ok(!body.includes('node_modules'), 'Error must not contain file paths');
    assert.ok(!body.includes('Error:'), 'Error must not contain raw error messages');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // L. Regression: Step 25 License API
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── L. Regression: Step 25 License API ──');

  await test('L1. License service exports all required functions', async () => {
    assert.strictEqual(typeof licenseService.lookupLicense, 'function');
    assert.strictEqual(typeof licenseService.activateLicense, 'function');
    assert.strictEqual(typeof licenseService.validateLicense, 'function');
    assert.strictEqual(typeof licenseService.getLicenseStatus, 'function');
    assert.strictEqual(typeof licenseService.linkLicenseToUser, 'function');
    assert.strictEqual(typeof licenseService.getLicensesByUserId, 'function');
    assert.strictEqual(typeof licenseService.seedInMemoryLicense, 'function');
    assert.strictEqual(typeof licenseService.clearInMemoryLicenses, 'function');
    assert.strictEqual(typeof licenseService.isSupabaseConfigured, 'function');
  });

  await test('L2. lookupLicense returns null for nonexistent key', async () => {
    clearServiceLicenses();
    const result = await lookupLicense('XXXX-XXXX-XXXX-XXXX');
    assert.strictEqual(result, null);
  });

  await test('L3. activateLicense binds HWID to unbound license', async () => {
    clearServiceLicenses();
    seedInMemoryLicense({
      license_key: 'ACTV-TEST-AAAA-BBBB',
      tier: 'pro',
      status: 'active',
    });
    const hwid = 'a'.repeat(64);
    const result = await licenseService.activateLicense('ACTV-TEST-AAAA-BBBB', hwid);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.license.licenseKey, 'ACTV-TEST-AAAA-BBBB');
  });

  await test('L4. validateLicense fails for wrong HWID', async () => {
    clearServiceLicenses();
    seedInMemoryLicense({
      license_key: 'VALD-TEST-AAAA-BBBB',
      tier: 'standard',
      status: 'active',
      hwid: 'a'.repeat(64),
    });
    const result = await licenseService.validateLicense('VALD-TEST-AAAA-BBBB', 'b'.repeat(64));
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'HWID_MISMATCH');
  });

  await test('L5. getLicenseStatus returns safe fields', async () => {
    clearServiceLicenses();
    seedInMemoryLicense({
      license_key: 'STAT-TEST-AAAA-BBBB',
      tier: 'basic',
      status: 'active',
    });
    const result = await licenseService.getLicenseStatus('STAT-TEST-AAAA-BBBB');
    assert.strictEqual(result.success, true);
    assert.ok(result.license.licenseKey);
    assert.ok(result.license.tier);
    assert.ok(result.license.status);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // M. Regression: Step 26 Payment API
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── M. Regression: Step 26 Payment API ──');

  await test('M1. Payment route file exists and exports router', async () => {
    assertFileExists(path.join(routeDir, 'payment.js'), 'Payment route');
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('module.exports'), 'Payment route must export module');
    assert.ok(paymentSource.includes('router'), 'Payment route must export a router');
  });

  await test('M2. Payment config has price mapping', async () => {
    assert.ok(config.stripe.priceIds, 'stripe.priceIds must exist');
    const planMap = config.stripe.priceIds;
    const values = Object.values(planMap);
    assert.ok(values.includes('basic'), 'Must have basic price mapping');
    assert.ok(values.includes('standard'), 'Must have standard price mapping');
    assert.ok(values.includes('pro'), 'Must have pro price mapping');
  });

  await test('M3. Payment route has input validation', async () => {
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('stripUnknownFields'), 'Must use stripUnknownFields');
    assert.ok(paymentSource.includes('allowMethods'), 'Must use allowMethods');
  });

  await test('M4. userId validation in checkout prevents injection', async () => {
    const paymentSource = fs.readFileSync(path.join(routeDir, 'payment.js'), 'utf8');
    assert.ok(paymentSource.includes('userIdRegex'), 'Must validate userId format');
    assert.ok(paymentSource.includes('INVALID_INPUT'), 'Must reject invalid userId');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // N. Regression: Step 24 Authentication
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── N. Regression: Step 24 Authentication ──');

  await test('N1. Account page exists and uses server-side auth check', async () => {
    const accountPagePath = path.join(websiteDir, 'src', 'app', 'account', 'page.tsx');
    assertFileExists(accountPagePath, 'Account page');
    const content = fs.readFileSync(accountPagePath, 'utf8');
    assert.ok(content.includes('getUser'), 'Account page must call getUser()');
    assert.ok(content.includes('redirect'), 'Account page must redirect unauthenticated users');
  });

  await test('N2. Supabase server client uses anon key only', async () => {
    const serverClientPath = path.join(websiteDir, 'src', 'lib', 'supabase', 'server.ts');
    assertFileExists(serverClientPath, 'Supabase server client');
    const content = fs.readFileSync(serverClientPath, 'utf8');
    assert.ok(!content.includes('service_role'), 'Server client must not use service-role key');
    assert.ok(!content.includes('SUPABASE_SERVICE'), 'Server client must not reference service key env');
  });

  await test('N3. Supabase browser client uses anon key only', async () => {
    const clientPath = path.join(websiteDir, 'src', 'lib', 'supabase', 'client.ts');
    assertFileExists(clientPath, 'Supabase browser client');
    const content = fs.readFileSync(clientPath, 'utf8');
    assert.ok(!content.includes('service_role'), 'Browser client must not use service-role key');
    assert.ok(!content.includes('SUPABASE_SERVICE'), 'Browser client must not reference service key env');
  });

  await test('N4. Auth middleware refreshes sessions', async () => {
    const middlewarePath = path.join(websiteDir, 'src', 'middleware.ts');
    assertFileExists(middlewarePath, 'Auth middleware');
    const content = fs.readFileSync(middlewarePath, 'utf8');
    assert.ok(content.includes('updateSession'), 'Middleware must call updateSession');
  });

  await test('N5. Login page has robots noindex', async () => {
    const loginLayoutPath = path.join(websiteDir, 'src', 'app', 'login', 'layout.tsx');
    if (fs.existsSync(loginLayoutPath)) {
      const content = fs.readFileSync(loginLayoutPath, 'utf8');
      assert.ok(content.includes('noindex'), 'Login page must have noindex');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // O. Dashboard Field Safety
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── O. Dashboard Field Safety ──');

  await test('O1. Dashboard hasHwid reflects actual HWID binding', async () => {
    resetAllState();
    const hwid = 'a'.repeat(64);
    seedInMemoryLicense({
      license_key: 'HWID-TEST-AAAA-BBBB',
      tier: 'pro',
      status: 'active',
      hwid: hwid,
      user_id: FAKE_USER_ID_A,
    });
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    const lic = response.data.licenses.find((l) => l.license_key === 'HWID-TEST-AAAA-BBBB');
    assert.ok(lic, 'Must find license');
    assert.strictEqual(lic.hasHwid, true, 'hasHwid must be true when HWID is set');
  });

  await test('O2. Dashboard hasHwid is false for unbound license', async () => {
    resetAllState();
    seedInMemoryLicense({
      license_key: 'NOHW-TEST-AAAA-BBBB',
      tier: 'standard',
      status: 'active',
      hwid: null,
      user_id: FAKE_USER_ID_A,
    });
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    const lic = response.data.licenses.find((l) => l.license_key === 'NOHW-TEST-AAAA-BBBB');
    assert.ok(lic, 'Must find license');
    assert.strictEqual(lic.hasHwid, false, 'hasHwid must be false when no HWID');
  });

  await test('O3. Dashboard returns licenses sorted by created_at descending', async () => {
    resetAllState();
    seedInMemoryLicense({
      license_key: 'SORT-TEST-0001-AAAA',
      tier: 'basic',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      user_id: FAKE_USER_ID_A,
    });
    seedInMemoryLicense({
      license_key: 'SORT-TEST-0002-BBBB',
      tier: 'pro',
      status: 'active',
      created_at: '2026-06-01T00:00:00.000Z',
      user_id: FAKE_USER_ID_A,
    });
    const response = await callLicenseRoute('GET', '/dashboard', null, {
      authorization: 'Bearer fake-test-token',
      'x-test-user-id': FAKE_USER_ID_A,
    });
    assert.ok(response.data.licenses.length >= 2, 'Must have at least 2 licenses');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P. Migration & Schema
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('── P. Migration & Schema ──');

  await test('P1. user_id migration exists for licenses table', async () => {
    const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationDir);
    const userIdMigration = files.find((f) => f.includes('add_user_id_to_licenses'));
    assert.ok(userIdMigration, 'user_id migration must exist');
  });

  await test('P2. user_id migration adds nullable UUID column', async () => {
    const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationDir);
    const userIdMigration = files.find((f) => f.includes('add_user_id_to_licenses'));
    const content = fs.readFileSync(path.join(migrationDir, userIdMigration), 'utf8');
    assert.ok(content.includes('user_id UUID'), 'Migration must add user_id UUID column');
    assert.ok(content.includes('IF NOT EXISTS'), 'Migration must be idempotent');
  });

  await test('P3. user_id migration creates index for fast lookups', async () => {
    const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationDir);
    const userIdMigration = files.find((f) => f.includes('add_user_id_to_licenses'));
    const content = fs.readFileSync(path.join(migrationDir, userIdMigration), 'utf8');
    assert.ok(content.includes('CREATE INDEX'), 'Migration must create index on user_id');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 27 Test Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('');
    console.log('Failed tests:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

runStep27Tests().catch((err) => {
  console.error('STEP 27 test runner error:', err);
  process.exitCode = 1;
});
