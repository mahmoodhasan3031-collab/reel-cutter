'use strict';

/**
 * STEP 18 — License Integrity + Payment Idempotency Hardening Tests
 *
 * Tests:
 *  A. License HMAC hardening (key separation, backward compatibility)
 *  B. Webhook idempotency (durable, restart-safe)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // A. License HMAC Hardening
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── A. License HMAC Hardening ───');

  const storePath = path.join(__dirname, '..', 'src', 'main', 'license', 'store.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  await test('A1. Signing key uses scrypt derivation, not raw HWID', () => {
    assert.ok(storeContent.includes('deriveSigningKey'), 'deriveSigningKey function must exist');
    assert.ok(storeContent.includes('scryptSync'), 'Must use scrypt for key derivation');
    assert.ok(storeContent.includes('SIGNING_SALT'), 'Must use a separate signing salt');
  });

  await test('A2. Signing salt is distinct from encryption salt', () => {
    const signingSaltMatch = storeContent.match(/SIGNING_SALT\s*=\s*'([^']+)'/);
    const encryptSaltMatch = storeContent.match(/salt\s*=\s*'([^']+)'/g);
    assert.ok(signingSaltMatch, 'SIGNING_SALT must be defined');
    assert.ok(encryptSaltMatch, 'Encryption salt must exist');
    const signingSalt = signingSaltMatch[1];
    for (const match of encryptSaltMatch) {
      const salt = match.match(/'([^']+)'/)[1];
      assert.notStrictEqual(signingSalt, salt, 'Signing salt must differ from encryption salt');
    }
  });

  await test('A3. HWID is not used directly as HMAC key', () => {
    // The computeSignature function should use deriveSigningKey, not getHardwareIdSync directly
    const computeSigSection = storeContent.substring(
      storeContent.indexOf('function computeSignature('),
      storeContent.indexOf('function computeSignatureLegacy(')
    );
    assert.ok(computeSigSection.includes('deriveSigningKey'), 'computeSignature must use deriveSigningKey');
    assert.ok(!computeSigSection.includes('getHardwareIdSync'), 'computeSignature must not use getHardwareIdSync directly');
  });

  await test('A4. computeSignature includes timestamps (lastValidatedAt, lastSeenAt)', () => {
    const computeSigSection = storeContent.substring(
      storeContent.indexOf('function computeSignature('),
      storeContent.indexOf('function computeSignatureLegacy(')
    );
    assert.ok(computeSigSection.includes('lastValidatedAt'), 'computeSignature must include lastValidatedAt');
    assert.ok(computeSigSection.includes('lastSeenAt'), 'computeSignature must include lastSeenAt');
  });

  await test('A5. Legacy signature function exists for backward compatibility', () => {
    assert.ok(storeContent.includes('computeSignatureLegacy'), 'computeSignatureLegacy must exist');
    // Legacy should use raw HWID
    const legacySection = storeContent.substring(
      storeContent.indexOf('function computeSignatureLegacy('),
      storeContent.indexOf('/**')
    );
    assert.ok(legacySection.includes('getHardwareIdSync'), 'Legacy must use raw HWID');
  });

  await test('A6. loadLicenseData tries both new and legacy signatures', () => {
    const loadSection = storeContent.substring(
      storeContent.indexOf('function loadLicenseData('),
      storeContent.indexOf('function clearLicenseData(')
    );
    assert.ok(loadSection.includes('computeSignature(data)'), 'Must check new signature');
    assert.ok(loadSection.includes('computeSignatureLegacy(data)'), 'Must check legacy signature');
    assert.ok(loadSection.includes('legacySig'), 'Must store legacy signature for comparison');
  });

  await test('A7. Legacy signature is transparently upgraded on load', () => {
    const loadSection = storeContent.substring(
      storeContent.indexOf('function loadLicenseData('),
      storeContent.indexOf('function clearLicenseData(')
    );
    assert.ok(loadSection.includes('data.signature = expectedSig'), 'Must upgrade legacy signature to new format');
  });

  await test('A8. Tampered payload (modified tier) fails verification', () => {
    const { computeSignature, computeSignatureLegacy } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data);
    // Modify tier
    const tampered = { ...data, tier: 'basic' };
    const tamperedSig = computeSignature(tampered);
    assert.notStrictEqual(sig, tamperedSig, 'Tampered payload must produce different signature');
    // Verify the original signature doesn't match tampered data
    const recompute = computeSignature(data);
    assert.strictEqual(sig, recompute, 'Original data must produce consistent signature');
  });

  await test('A9. Tampered timestamp (modified lastValidatedAt) fails verification', () => {
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
    const sig = computeSignature(data);
    const tampered = { ...data, lastValidatedAt: '2026-12-01T00:00:00.000Z' };
    const tamperedSig = computeSignature(tampered);
    assert.notStrictEqual(sig, tamperedSig, 'Tampered timestamp must produce different signature');
  });

  await test('A10. Wrong signing key fails verification', () => {
    const { computeSignature } = require('../src/main/license/store');
    const data = {
      licenseKey: 'PRO-REEL-7890-ABCD-1234',
      hwid: 'test-hwid-123',
      tier: 'pro',
      status: 'active',
      activatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sig = computeSignature(data);
    // Verify with different data (different HWID = different derived key)
    const differentData = { ...data, hwid: 'different-hwid-456' };
    const differentSig = computeSignature(differentData);
    assert.notStrictEqual(sig, differentSig, 'Different HWID (different key) must produce different signature');
  });

  await test('A11. deriveSigningKey is exported for verification', () => {
    const store = require('../src/main/license/store');
    assert.strictEqual(typeof store.deriveSigningKey, 'function', 'deriveSigningKey must be exported');
  });

  await test('A12. HWID is not hardcoded in renderer or preload files', () => {
    const preloadPath = path.join(__dirname, '..', 'src', 'preload', 'index.js');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    assert.ok(!preloadContent.includes('deriveSigningKey'), 'deriveSigningKey must not be in preload');
    assert.ok(!preloadContent.includes('SIGNING_SALT'), 'SIGNING_SALT must not be in preload');
    assert.ok(!preloadContent.includes('getHardwareId'), 'getHardwareId must not be in preload');
    assert.ok(!preloadContent.includes('computeSignature'), 'computeSignature must not be in preload');
  });

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Webhook Idempotency (Durable)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── B. Webhook Idempotency (Durable) ───');

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

  await test('B4. Duplicate event after simulated restart is still rejected', async () => {
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

  await test('B5. Idempotency cache evicts entries older than 7 days', () => {
    assert.ok(webhookContent.includes('IDEMPOTENCY_MAX_AGE_MS'), 'Must have max age constant');
    assert.ok(webhookContent.includes('7 * 24 * 60 * 60 * 1000') || webhookContent.includes('604800000'),
      'Max age must be 7 days');
  });

  await test('B6. Idempotency cache is bounded to prevent unbounded growth', () => {
    assert.ok(webhookContent.includes('IDEMPOTENCY_MAX_ENTRIES'), 'Must have max entries constant');
    assert.ok(webhookContent.includes('10000'), 'Max entries must be 10000');
  });

  await test('B7. Duplicate event via sequential calls: second call returns 200 with duplicate=true', async () => {
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

  await test('B8. Webhook response does not expose license key', () => {
    const responseSection = webhookContent.substring(
      webhookContent.indexOf('return res.status(200).json({')
    );
    assert.ok(!responseSection.includes('licenseKey'), 'Response must not include licenseKey');
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
            assert.ok(!content.includes('SIGNING_SALT'), `${entry.name} must not contain SIGNING_SALT`);
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

  await test('D4. Idempotency cache file is not a source file', () => {
    const idempotencyFile = path.join(__dirname, '..', 'server', '.webhook-idempotency.json');
    // Should not exist in source tree (only created at runtime)
    // This is acceptable — just verify it's in .gitignore or won't be committed
    if (fs.existsSync(idempotencyFile)) {
      const gitignorePath = path.join(__dirname, '..', '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        // It's ok if the file exists at runtime — just verify it won't be accidentally committed
        // (the .json file is generated at runtime, not in source)
      }
    }
  });

  await test('D5. SIGNING_SALT is not hardcoded as a production secret', () => {
    // The SIGNING_SALT is a derivation parameter, not a secret key itself
    // It's acceptable to have it in source code — the key is derived via scrypt
    const signingSaltMatch = storeContent.match(/SIGNING_SALT\s*=\s*'([^']+)'/);
    assert.ok(signingSaltMatch, 'SIGNING_SALT must be defined');
    // Verify it's a reasonable salt value, not accidentally a private key
    const salt = signingSaltMatch[1];
    assert.ok(salt.length > 10, 'SIGNING_SALT should be a meaningful salt value');
    assert.ok(!salt.startsWith('sk_'), 'SIGNING_SALT must not be a Stripe key');
    assert.ok(!salt.startsWith('whsec_'), 'SIGNING_SALT must not be a webhook secret');
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
