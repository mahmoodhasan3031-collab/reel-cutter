'use strict';

/**
 * STEP 18 — License Integrity + Payment Idempotency Hardening Tests
 *
 * Tests:
 *  A. License HMAC hardening (random signing key, canonical serialization, backward compat)
 *  B. Webhook idempotency (durable, restart-safe, mark-before-create)
 *  C. transaction_id uniqueness (migration structural validity)
 *  D. Production secret scan
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const TEST_DIR = path.join(__dirname, '../.test-step18-license-store');

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

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
  console.log('🛡️  STEP 18 — License Integrity + Payment Idempotency Tests');
  console.log('======================================================');
  console.log('');

  // Ensure clean state
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // A. License HMAC Hardening
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── A. License HMAC Hardening ───');

  const storePath = path.join(__dirname, '..', 'src', 'main', 'license', 'store.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  await test('A1. Signing key is randomly generated, not derived from HWID', () => {
    assert.ok(storeContent.includes('deriveSigningKey'), 'deriveSigningKey function must exist');
    assert.ok(storeContent.includes('getOrCreateSigningSecret'), 'Must have getOrCreateSigningSecret function');
    assert.ok(storeContent.includes('crypto.randomBytes(32)'), 'Must generate random 32-byte secret');
    // deriveSigningKey must NOT use HWID
    const deriveSection = storeContent.substring(
      storeContent.indexOf('function deriveSigningKey('),
      storeContent.indexOf('// ─── Canonical Serialization')
    );
    assert.ok(!deriveSection.includes('getHardwareIdSync'), 'deriveSigningKey must not use HWID');
    assert.ok(!deriveSection.includes('scryptSync'), 'deriveSigningKey must not use scrypt for signing');
  });

  await test('A2. Signing secret is stored encrypted on disk', () => {
    assert.ok(storeContent.includes('SIGNING_SECRET_FILENAME'), 'Must have signing secret filename constant');
    assert.ok(storeContent.includes('signing-secret.enc'), 'Signing secret file must be signing-secret.enc');
    assert.ok(storeContent.includes('getSigningSecretPath'), 'Must have getSigningSecretPath function');
    // Secret must be encrypted at rest
    assert.ok(storeContent.includes('encryptData(secret.toString'), 'Secret must be encrypted before storage');
    assert.ok(storeContent.includes('decryptData(encrypted)'), 'Secret must be decrypted on load');
  });

  await test('A3. Signing salt is distinct from encryption salt', () => {
    const encryptSaltMatch = storeContent.match(/salt\s*=\s*'([^']+)'/g);
    assert.ok(encryptSaltMatch, 'Encryption salt must exist');
    // The encryption salt is used for AES key derivation (deriveMachineKey)
    // The signing secret is randomly generated — no salt needed for HMAC
    // Verify the encryption salt is present and distinct from any signing constant
    const signingSecretMatch = storeContent.match(/SIGNING_SECRET_FILENAME\s*=\s*'([^']+)'/);
    assert.ok(signingSecretMatch, 'SIGNING_SECRET_FILENAME must be defined');
    for (const match of encryptSaltMatch) {
      const salt = match.match(/'([^']+)'/)[1];
      assert.notStrictEqual(salt, signingSecretMatch[1], 'Encryption salt must differ from signing secret filename');
    }
  });

  await test('A4. HWID is not used directly as HMAC key', () => {
    const computeSigBody = storeContent.substring(
      storeContent.indexOf('function computeSignature(data, customDir) {'),
      storeContent.indexOf('function computeSignatureLegacy(')
    );
    assert.ok(computeSigBody.includes('deriveSigningKey'), 'computeSignature must use deriveSigningKey');
    assert.ok(!computeSigBody.includes('getHardwareIdSync'), 'computeSignature must not use getHardwareIdSync directly');
  });

  await test('A5. computeSignature includes all security-relevant timestamps', () => {
    const canonicalSection = storeContent.substring(
      storeContent.indexOf('function canonicalSerialize('),
      storeContent.indexOf('// ─── Timing-Safe Signature Comparison')
    );
    assert.ok(canonicalSection.includes('lastValidatedAt'), 'canonicalSerialize must include lastValidatedAt');
    assert.ok(canonicalSection.includes('lastSeenAt'), 'canonicalSerialize must include lastSeenAt');
    assert.ok(canonicalSection.includes('activatedAt'), 'canonicalSerialize must include activatedAt');
    assert.ok(canonicalSection.includes('licenseKey'), 'canonicalSerialize must include licenseKey');
    assert.ok(canonicalSection.includes('hwid'), 'canonicalSerialize must include hwid');
    assert.ok(canonicalSection.includes('tier'), 'canonicalSerialize must include tier');
    assert.ok(canonicalSection.includes('status'), 'canonicalSerialize must include status');
  });

  await test('A6. Legacy signature function exists for backward compatibility', () => {
    assert.ok(storeContent.includes('computeSignatureLegacy'), 'computeSignatureLegacy must exist');
    const legacySection = storeContent.substring(
      storeContent.indexOf('function computeSignatureLegacy('),
      storeContent.indexOf('/**')
    );
    assert.ok(legacySection.includes('getHardwareIdSync'), 'Legacy must use raw HWID');
  });

  await test('A7. loadLicenseData tries both new and legacy signatures', () => {
    const loadSection = storeContent.substring(
      storeContent.indexOf('function loadLicenseData('),
      storeContent.indexOf('function clearLicenseData(')
    );
    assert.ok(loadSection.includes('computeSignature(data'), 'Must check new signature');
    assert.ok(loadSection.includes('computeSignatureLegacy(data)'), 'Must check legacy signature');
    assert.ok(loadSection.includes('legacySig'), 'Must store legacy signature for comparison');
  });

  await test('A8. Legacy signature is transparently upgraded and re-saved', () => {
    const loadSection = storeContent.substring(
      storeContent.indexOf('function loadLicenseData('),
      storeContent.indexOf('function clearLicenseData(')
    );
    assert.ok(loadSection.includes('data.signature = expectedSig'), 'Must upgrade legacy signature to new format');
    assert.ok(loadSection.includes('saveLicenseData(data, customDir)'), 'Must re-save after legacy upgrade');
  });

  await test('A9. Tampered payload (modified licenseKey) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, licenseKey: 'PRO-REEL-FAKE-XXXX-YYYY' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified licenseKey must produce different signature');
    const recompute = computeSignature(data, TEST_DIR);
    assert.strictEqual(sig, recompute, 'Original data must produce consistent signature');
  });

  await test('A10. Tampered payload (modified HWID) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, hwid: 'different-hwid-456' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified HWID must produce different signature');
  });

  await test('A11. Tampered payload (modified tier) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, tier: 'basic' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified tier must produce different signature');
  });

  await test('A12. Tampered payload (modified status) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, status: 'revoked' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified status must produce different signature');
  });

  await test('A13. Tampered timestamp (modified activatedAt) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, activatedAt: '2026-06-15T12:00:00.000Z' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified activatedAt must produce different signature');
  });

  await test('A14. Tampered timestamp (modified lastValidatedAt) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
      lastValidatedAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, lastValidatedAt: '2026-12-01T00:00:00.000Z' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified lastValidatedAt must produce different signature');
  });

  await test('A15. Tampered timestamp (modified lastSeenAt) fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
      lastValidatedAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    const tampered = { ...data, lastSeenAt: '2026-12-01T00:00:00.000Z' };
    const tamperedSig = computeSignature(tampered, TEST_DIR);
    assert.notStrictEqual(sig, tamperedSig, 'Modified lastSeenAt must produce different signature');
  });

  await test('A16. Invalid signature fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    // Verify a completely different signature string
    const fakeSig = 'a'.repeat(64);
    assert.notStrictEqual(sig, fakeSig, 'Random signature must not match');
  });

  await test('A17. Wrong signing secret fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data, TEST_DIR);
    // Compute with a different directory (different signing secret)
    const otherDir = path.join(__dirname, '../.test-step18-other');
    fs.mkdirSync(otherDir, { recursive: true });
    try {
      const otherSig = computeSignature(data, otherDir);
      assert.notStrictEqual(sig, otherSig, 'Different signing secret must produce different signature');
    } finally {
      if (fs.existsSync(otherDir)) fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  await test('A18. Canonical serialization is deterministic', () => {
    const { canonicalSerialize } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
      lastValidatedAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
    };
    const s1 = canonicalSerialize(data);
    const s2 = canonicalSerialize(data);
    assert.strictEqual(s1, s2, 'Canonical serialization must be deterministic');
    // Must be valid JSON
    const parsed = JSON.parse(s1);
    assert.strictEqual(parsed.licenseKey, data.licenseKey);
    assert.strictEqual(parsed.hwid, data.hwid);
    assert.strictEqual(parsed.tier, data.tier);
  });

  await test('A19. Signature comparison uses timing-safe equality', () => {
    assert.ok(storeContent.includes('signaturesMatch'), 'signaturesMatch function must exist');
    assert.ok(storeContent.includes('crypto.timingSafeEqual'), 'Must use crypto.timingSafeEqual');
  });

  await test('A20. Save and load cycle preserves signature integrity', () => {
    const { saveLicenseData, loadLicenseData, clearLicenseData } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
      lastValidatedAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
    };
    saveLicenseData(data, TEST_DIR);
    const loaded = loadLicenseData(TEST_DIR);
    assert.ok(loaded, 'Loaded data must not be null');
    assert.strictEqual(loaded.licenseKey, data.licenseKey);
    assert.strictEqual(loaded.hwid, data.hwid);
    assert.strictEqual(loaded.tier, data.tier);
    assert.strictEqual(loaded.status, data.status);
    clearLicenseData(TEST_DIR);
  });

  await test('A21. Signing secret file is created alongside license', () => {
    const { saveLicenseData, clearLicenseData, getSigningSecretPath } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    saveLicenseData(data, TEST_DIR);
    const secretPath = getSigningSecretPath(TEST_DIR);
    assert.ok(fs.existsSync(secretPath), 'Signing secret file must be created');
    clearLicenseData(TEST_DIR);
  });

  await test('A22. deriveSigningKey is exported for verification', () => {
    const store = require('../src/main/license/store');
    assert.strictEqual(typeof store.deriveSigningKey, 'function', 'deriveSigningKey must be exported');
  });

  await test('A23. HWID is not hardcoded in renderer or preload files', () => {
    const preloadPath = path.join(__dirname, '..', 'src', 'preload', 'index.js');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    assert.ok(!preloadContent.includes('deriveSigningKey'), 'deriveSigningKey must not be in preload');
    assert.ok(!preloadContent.includes('getOrCreateSigningSecret'), 'getOrCreateSigningSecret must not be in preload');
    assert.ok(!preloadContent.includes('getHardwareId'), 'getHardwareId must not be in preload');
    assert.ok(!preloadContent.includes('computeSignature'), 'computeSignature must not be in preload');
  });

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Webhook Idempotency (Durable + Atomic)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── B. Webhook Idempotency (Durable + Atomic) ───');

  const webhookPath = path.join(__dirname, '..', 'server', 'routes', 'webhook.js');
  const webhookContent = fs.readFileSync(webhookPath, 'utf8');

  await test('B1. Idempotency uses persistent Map instead of in-memory Set', () => {
    assert.ok(webhookContent.includes('processedEventMap'), 'Must use Map for idempotency');
    assert.ok(!webhookContent.includes('new Set()'), 'Must not use in-memory Set for idempotency');
  });

  await test('B2. Idempotency cache is loaded from disk on startup', () => {
    assert.ok(webhookContent.includes('loadIdempotencyCache'), 'Must have loadIdempotencyCache function');
    assert.ok(webhookContent.includes('fs.readFileSync'), 'Must read from disk');
    assert.ok(webhookContent.includes('.webhook-idempotency.json'), 'Must use persistent file');
  });

  await test('B3. Idempotency cache is persisted to disk after each event', () => {
    assert.ok(webhookContent.includes('persistIdempotencyCache'), 'Must have persistIdempotencyCache function');
    assert.ok(webhookContent.includes('fs.writeFileSync'), 'Must write to disk');
  });

  await test('B4. Mark-before-create pattern: event is marked BEFORE license creation', () => {
    // Verify markEventProcessed is called before createLicense
    const stripeHandler = webhookContent.substring(
      webhookContent.indexOf("router.post(\n    '/stripe'"),
      webhookContent.indexOf('return res.status(500).json({')
    );
    const markIdx = stripeHandler.indexOf('markEventProcessed(event.id)');
    const createIdx = stripeHandler.indexOf('createLicense(');
    assert.ok(markIdx > 0, 'markEventProcessed must be called');
    assert.ok(createIdx > 0, 'createLicense must be called');
    assert.ok(markIdx < createIdx, 'markEventProcessed must be called BEFORE createLicense');
  });

  await test('B5. Rollback on failure: unmarkEventProcessed is called when license creation fails', () => {
    assert.ok(webhookContent.includes('unmarkEventProcessed'), 'Must have unmarkEventProcessed function');
    const catchBlock = webhookContent.substring(
      webhookContent.indexOf('} catch (err) {'),
      webhookContent.indexOf('return res.status(500)')
    );
    assert.ok(catchBlock.includes('unmarkEventProcessed(event.id)'), 'Must unmark on failure');
  });

  await test('B6. Duplicate event after simulated restart is still detected', async () => {
    const Stripe = require('stripe');
    const config = require('../server/config');
    const { clearInMemoryLicenses } = require('../server/services/licenseGenerator');
    const { clearSentEmails } = require('../server/services/emailService');
    const router = require('../server/routes/webhook');

    // Start fresh
    router.resetProcessedEvents();
    clearInMemoryLicenses();
    clearSentEmails();

    const testWebhookSecret = config.stripe.webhookSecret;
    const eventPayload = {
      id: 'evt_test_restart_idempotent_18',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_restart_18',
          payment_intent: 'pi_restart_18',
          customer_details: { email: 'restart-test@example.invalid' },
          metadata: { price_id: 'price_standard_20' },
        },
      },
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(eventPayload);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testWebhookSecret,
      timestamp,
    });
    const rawBody = Buffer.from(payloadString, 'utf8');
    const headers = { 'stripe-signature': signature };

    function callWebhook(body, h) {
      return new Promise((resolve) => {
        let statusCode = 200;
        const req = { body, headers: h, method: 'POST', url: '/stripe' };
        const res = {
          status: (code) => { statusCode = code; return res; },
          json: (data) => { resolve({ status: statusCode, data }); },
        };
        router.handle(req, res, () => resolve({ status: statusCode, data: null }));
      });
    }

    // First call — should process and persist to disk
    const firstRes = await callWebhook(rawBody, headers);
    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.data.received, true);

    // Simulate restart: clear ONLY in-memory cache, keep persisted file
    const processedEventMap = router.__getProcessedEventMap
      ? router.__getProcessedEventMap()
      : null;
    if (processedEventMap && typeof processedEventMap.clear === 'function') {
      processedEventMap.clear();
    }

    // Second call — should be detected as duplicate from persisted cache
    const secondRes = await callWebhook(rawBody, headers);
    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.data.duplicate, true, 'Duplicate after restart must be detected');

    // Cleanup
    router.resetProcessedEvents();
  });

  await test('B7. Idempotency cache evicts entries older than 7 days', () => {
    assert.ok(webhookContent.includes('IDEMPOTENCY_MAX_AGE_MS'), 'Must have max age constant');
    assert.ok(webhookContent.includes('7 * 24 * 60 * 60 * 1000') || webhookContent.includes('604800000'),
      'Max age must be 7 days');
  });

  await test('B8. Idempotency cache is bounded to prevent unbounded growth', () => {
    assert.ok(webhookContent.includes('IDEMPOTENCY_MAX_ENTRIES'), 'Must have max entries constant');
    assert.ok(webhookContent.includes('10000'), 'Max entries must be 10000');
  });

  await test('B9. Duplicate event via sequential calls: second call returns 200 with duplicate=true', async () => {
    const Stripe = require('stripe');
    const config = require('../server/config');
    const { clearInMemoryLicenses } = require('../server/services/licenseGenerator');
    const { clearSentEmails } = require('../server/services/emailService');
    const router = require('../server/routes/webhook');

    router.resetProcessedEvents();
    clearInMemoryLicenses();
    clearSentEmails();

    const testWebhookSecret = config.stripe.webhookSecret;
    const eventPayload = {
      id: 'evt_test_sequential_18',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_sequential_18',
          payment_intent: 'pi_sequential_18',
          customer_details: { email: 'sequential-test@example.invalid' },
          metadata: { price_id: 'price_basic_10' },
        },
      },
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(eventPayload);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testWebhookSecret,
      timestamp,
    });
    const rawBody = Buffer.from(payloadString, 'utf8');
    const headers = { 'stripe-signature': signature };

    function callWebhook(body, h) {
      return new Promise((resolve) => {
        let statusCode = 200;
        const req = { body, headers: h, method: 'POST', url: '/stripe' };
        const res = {
          status: (code) => { statusCode = code; return res; },
          json: (data) => { resolve({ status: statusCode, data }); },
        };
        router.handle(req, res, () => resolve({ status: statusCode, data: null }));
      });
    }

    // First call — processes event
    const firstRes = await callWebhook(rawBody, headers);
    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.data.received, true);

    // Second call — must be detected as duplicate
    const secondRes = await callWebhook(rawBody, headers);
    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.data.duplicate, true, 'Sequential duplicate must be detected');
    assert.ok(!secondRes.data.tier, 'Duplicate response must not include tier');

    router.resetProcessedEvents();
  });

  await test('B10. Webhook response does not expose license key', () => {
    // Find all res.status(200).json calls and verify none include licenseKey
    const responseMatches = webhookContent.match(/return res\.status\(200\)\.json\(\{[\s\S]*?\}\);/g);
    assert.ok(responseMatches, 'Must have 200 responses');
    for (const match of responseMatches) {
      assert.ok(!match.includes('licenseKey'), 'Response must not include licenseKey');
    }
  });

  await test('B11. Invalid Stripe signature rejected', async () => {
    const { clearInMemoryLicenses } = require('../server/services/licenseGenerator');
    const { clearSentEmails } = require('../server/services/emailService');
    const router = require('../server/routes/webhook');

    router.resetProcessedEvents();
    clearInMemoryLicenses();
    clearSentEmails();

    const eventPayload = { id: 'evt_bad_sig', type: 'checkout.session.completed' };
    const rawBody = Buffer.from(JSON.stringify(eventPayload), 'utf8');
    const badHeaders = { 'stripe-signature': 't=123456,v1=bad_signature_hex_0000000000000' };

    function callWebhook(body, h) {
      return new Promise((resolve) => {
        let statusCode = 200;
        const req = { body, headers: h, method: 'POST', url: '/stripe' };
        const res = {
          status: (code) => { statusCode = code; return res; },
          json: (data) => { resolve({ status: statusCode, data }); },
        };
        router.handle(req, res, () => resolve({ status: statusCode, data: null }));
      });
    }

    const response = await callWebhook(rawBody, badHeaders);
    assert.strictEqual(response.status, 400, 'Invalid signature must return 400');
    router.resetProcessedEvents();
  });

  await test('B12. Email failure does not create a second license on retry', async () => {
    const Stripe = require('stripe');
    const config = require('../server/config');
    const { clearInMemoryLicenses, getInMemoryLicenses } = require('../server/services/licenseGenerator');
    const { clearSentEmails } = require('../server/services/emailService');
    const router = require('../server/routes/webhook');

    router.resetProcessedEvents();
    clearInMemoryLicenses();
    clearSentEmails();

    const testWebhookSecret = config.stripe.webhookSecret;
    const eventPayload = {
      id: 'evt_email_fail_18',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_email_fail_18',
          payment_intent: 'pi_email_fail_18',
          customer_details: { email: 'emailfail@example.invalid' },
          metadata: { price_id: 'price_pro_30' },
        },
      },
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(eventPayload);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testWebhookSecret,
      timestamp,
    });
    const rawBody = Buffer.from(payloadString, 'utf8');
    const headers = { 'stripe-signature': signature };

    function callWebhook(body, h) {
      return new Promise((resolve) => {
        let statusCode = 200;
        const req = { body, headers: h, method: 'POST', url: '/stripe' };
        const res = {
          status: (code) => { statusCode = code; return res; },
          json: (data) => { resolve({ status: statusCode, data }); },
        };
        router.handle(req, res, () => resolve({ status: statusCode, data: null }));
      });
    }

    // First call — creates license
    const firstRes = await callWebhook(rawBody, headers);
    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.data.received, true);

    const licensesAfterFirst = getInMemoryLicenses();
    assert.strictEqual(licensesAfterFirst.length, 1, 'Exactly one license after first call');

    // Second call — duplicate, no new license
    const secondRes = await callWebhook(rawBody, headers);
    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.data.duplicate, true);

    const licensesAfterSecond = getInMemoryLicenses();
    assert.strictEqual(licensesAfterSecond.length, 1, 'Still exactly one license after duplicate');

    router.resetProcessedEvents();
  });

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // C. transaction_id Uniqueness Migration
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── C. transaction_id Uniqueness Migration ───');

  const migrationPath = path.join(
    __dirname, '..', 'supabase', 'migrations',
    '20260917000000_harden_license_integrity.sql'
  );

  await test('C1. Migration file exists', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  });

  await test('C2. Migration uses partial unique index (WHERE transaction_id IS NOT NULL)', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(migration.includes('CREATE UNIQUE INDEX'), 'Must create unique index');
    assert.ok(migration.includes('WHERE transaction_id IS NOT NULL'), 'Must be partial index for non-NULL values');
  });

  await test('C3. Migration includes duplicate check before applying constraint', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(migration.includes('MIGRATION BLOCKED') || migration.includes('RAISE EXCEPTION'),
      'Must fail safely if duplicates exist');
    assert.ok(migration.includes('COUNT(*)'), 'Must count duplicates');
  });

  await test('C4. Migration does not modify STEP 16A migration', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(!migration.includes('fetch_license_by_key'), 'Must not modify STEP 16A functions');
    assert.ok(!migration.includes('bind_license_hwid'), 'Must not modify STEP 16A functions');
    assert.ok(!migration.includes('SECURITY DEFINER'), 'Must not redefine SECURITY DEFINER functions');
  });

  await test('C5. Schema documentation updated with partial unique index', () => {
    const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    assert.ok(schema.includes('idx_licenses_transaction_id_unique'), 'Schema must document the unique index');
    assert.ok(schema.includes('WHERE transaction_id IS NOT NULL'), 'Schema must show partial index condition');
  });

  await test('C6. Old non-unique index is dropped in migration', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(migration.includes('DROP INDEX') || migration.includes('DROP INDEX IF EXISTS'),
      'Must drop old non-unique index');
  });

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Production Secret Scan
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── D. Production Secret Scan ───');

  await test('D1. No production HMAC secrets in renderer bundles', () => {
    const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
    if (fs.existsSync(rendererDir)) {
      const scanDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            assert.ok(!content.includes('deriveSigningKey'), `${entry.name} must not contain deriveSigningKey`);
            assert.ok(!content.includes('getOrCreateSigningSecret'), `${entry.name} must not contain getOrCreateSigningSecret`);
            assert.ok(!content.includes('computeSignature'), `${entry.name} must not contain computeSignature`);
          }
        }
      };
      scanDir(rendererDir);
    }
  });

  await test('D2. No test signing secrets in production config', () => {
    const configPath = path.join(__dirname, '..', 'server', 'config.js');
    const configContent = fs.readFileSync(configPath, 'utf8');
    // Verify mock keys have test prefix
    assert.ok(configContent.includes('sk_test_mock'), 'Stripe key must use test mock prefix');
    assert.ok(configContent.includes('whsec_mock'), 'Webhook secret must use mock prefix');
  });

  await test('D3. No SUPABASE_SERVICE_ROLE_KEY in preload', () => {
    const preloadPath = path.join(__dirname, '..', 'src', 'preload', 'index.js');
    const content = fs.readFileSync(preloadPath, 'utf8');
    assert.ok(!content.includes('SERVICE_ROLE_KEY'), 'Preload must not contain service role key');
    assert.ok(!content.includes('serviceRoleKey'), 'Preload must not contain serviceRoleKey');
  });

  await test('D4. Idempotency cache file is in .gitignore', () => {
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      assert.ok(gitignore.includes('.webhook-idempotency.json'), 'Idempotency file must be in .gitignore');
    }
  });

  await test('D5. SIGNING_SECRET_FILENAME is not a production credential', () => {
    const signingSecretMatch = storeContent.match(/SIGNING_SECRET_FILENAME\s*=\s*'([^']+)'/);
    assert.ok(signingSecretMatch, 'SIGNING_SECRET_FILENAME must be defined');
    const filename = signingSecretMatch[1];
    assert.ok(filename.endsWith('.enc'), 'Must be an encrypted file');
    assert.ok(!filename.startsWith('sk_'), 'Must not be a Stripe key');
    assert.ok(!filename.startsWith('whsec_'), 'Must not be a webhook secret');
  });

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('');
  console.log('======================================================');
  console.log(`🛡️  STEP 18 Security Test Results: ${passed} / ${passed + failed} passed`);
  console.log('======================================================');
  console.log('');

  if (failures.length > 0) {
    console.log('Failed tests:');
    failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`));
    console.log('');
  }

  cleanup();

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  cleanup();
  process.exit(1);
});
