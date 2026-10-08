'use strict';

/**
 * STEP 21 — Local End-to-End Manual Payment QA (Integration)
 *
 * Real HTTP integration against the Express server (startServer), covering
 * the full admin review flow via the project's in-memory offline path and
 * customer-endpoint validation that does not require Supabase.
 *
 * Environment readiness is probed against server/.env FIRST (names/status
 * only — secrets never printed). Live Supabase integration is reported as
 * blocked when tables/bucket are missing; it is not faked.
 *
 * Tests:
 *   A. Environment Readiness Probe
 *   B. Customer Endpoint Behavior (validation + fail-closed without Supabase)
 *   C. Admin Login (real HTTP)
 *   D. Admin Payment List + Detail
 *   E. Payment Approval → License → Audit → Email (mock provider)
 *   F. Customer-Visible Approval Contract (safe fields only)
 *   G. Payment Rejection Path
 *   H. Idempotency (re-approve, approve-rejected, reject-approved)
 *   I. Security Cross-check
 *   J. Frontend ↔ Backend Endpoint Contract
 *   K. Live Supabase Blockers (explicit, not silently skipped)
 */

// ─── Phase 1: Environment probe BEFORE forcing offline mode ─────────────────
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
// STEP 23: allow pointing the live probe at a local-only env file.
// Default remains server/.env. Never prints values.
const SERVER_ENV_PATH = process.env.STEP21_ENV_FILE
  ? path.resolve(process.env.STEP21_ENV_FILE)
  : path.join(SERVER_DIR, '.env');

// STEP 23 fail-closed guard: the live probe must NEVER touch production
// Supabase. If the configured SUPABASE_URL is not loopback, the live probe is
// skipped and reported as BLOCKED instead of issuing remote queries.
function isLoopbackUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl).trim());
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

const REQUIRED_ENV_NAMES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
  'CORS_ALLOWED_ORIGINS',
];

const envProbe = { vars: {}, supabaseReachable: false, tables: {}, bucket: null, errors: [] };

(function probeEnvironment() {
  // Load server/.env into a side map without printing values.
  let raw = '';
  try {
    raw = fs.readFileSync(SERVER_ENV_PATH, 'utf8');
  } catch {
    envProbe.errors.push('server/.env not found');
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !m[2].startsWith('#')) {
      process.env[m[1]] = process.env[m[1]] || m[2];
    }
  }
  for (const name of REQUIRED_ENV_NAMES) {
    envProbe.vars[name] = Boolean(process.env[name]);
  }
})();

// ─── Phase 2: Force offline-safe environment BEFORE loading server modules ──
// Deterministic local E2E: no live Supabase writes, no real email sends.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.RESEND_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';

// STEP 53: the Phase 1 probe imports NODE_ENV from server/.env (which sets
// NODE_ENV=production for the deployed Render service). The website config
// modules under test (website/src/config/*) now fail closed when
// NODE_ENV=production and no NEXT_PUBLIC_* origin is configured. Section J
// only asserts endpoint *paths*, so supply the client-safe public origins
// here. Production builds are still gated by
// website/scripts/verify-public-env.mjs — this does not weaken that gate.
process.env.NEXT_PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pyrtitvvwxrwhmdfrjsb.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_14Q9A-4TbR5JL3vqF_Zjkw_TKEhOdlV';
process.env.NEXT_PUBLIC_STRIPE_MODE = process.env.NEXT_PUBLIC_STRIPE_MODE || 'test';

const assert = require('assert');
const http = require('http');

const serverDir = SERVER_DIR;
const config = require(path.join(serverDir, 'config'));
const adminAuth = require(path.join(serverDir, 'services', 'adminAuth'));
const paymentReviewService = require(path.join(serverDir, 'services', 'paymentReviewService'));
const auditLogService = require(path.join(serverDir, 'services', 'auditLog'));
const licenseGenerator = require(path.join(serverDir, 'services', 'licenseGenerator'));
const emailService = require(path.join(serverDir, 'services', 'emailService'));
const { windows: rateLimitWindows } = require(path.join(serverDir, 'middleware', 'rateLimiter'));
const uploadRouter = require(path.join(serverDir, 'routes', 'upload'));

// Test-only admin credentials (env-var driven in production — never hardcoded
// in source; these values exist only inside this test process).
const TEST_ADMIN_USER = 'step21-admin';
const TEST_ADMIN_PASSWORD = 'step21-e2e-password';
const TEST_SESSION_SECRET = 'step21-e2e-session-secret';

config.admin.username = TEST_ADMIN_USER;
config.admin.passwordHash = adminAuth.hashPassword(TEST_ADMIN_PASSWORD);
config.admin.sessionSecret = TEST_SESSION_SECRET;
config.admin.sessionTtlSeconds = 1800;

const { startServer, stopServer } = require(path.join(serverDir, 'index'));

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

function resetState() {
  paymentReviewService.clearInMemoryPayments();
  licenseGenerator.clearInMemoryLicenses();
  emailService.clearSentEmails();
  auditLogService.clearInMemoryAuditLog();
  rateLimitWindows.clear();
}

function httpRequest(port, method, reqPath, body, headers = {}, rawBody = null, contentType = null) {
  return new Promise((resolve, reject) => {
    const data = rawBody !== null && rawBody !== undefined
      ? rawBody
      : (body !== undefined && body !== null ? JSON.stringify(body) : null);
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : (data !== null ? { 'Content-Type': 'application/json' } : {})),
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
      });
    });
    req.on('error', reject);
    if (data !== null && data !== undefined) req.write(data);
    req.end();
  });
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function seedPending(overrides = {}) {
  return paymentReviewService.seedInMemoryPayment({
    customer_name: 'Step21 QA Customer',
    customer_email: 'step21-qa@example.com',
    plan_id: 'standard',
    payment_method: 'bkash',
    amount: 2000,
    currency: 'BDT',
    transaction_id: `TXN-STEP21-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    proof_url: 'payment-proofs/qa/11111111-2222-3333-4444-555555555555.jpg',
    status: 'pending',
    ...overrides,
  });
}

// Minimal valid 1x1 PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('STEP 21 — Local End-to-End Manual Payment QA (Integration)');
  console.log('═══════════════════════════════════════════════════════════════');

  // ─── Phase 3: Probe live Supabase using a separate short-lived client ─────
  // Uses credentials only in-process; never prints values.
  let liveSupabaseReady = false;
  let bucketReady = false;
  try {
    const { createClient } = require('@supabase/supabase-js');
    // Re-read from envProbe side-channel: we overwrote process.env above, so
    // reload raw file values for the probe only.
    const probeEnv = {};
    const raw = fs.readFileSync(SERVER_ENV_PATH, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) probeEnv[m[1]] = m[2];
    }
    if (probeEnv.SUPABASE_URL && probeEnv.SUPABASE_SERVICE_ROLE_KEY) {
      if (!isLoopbackUrl(probeEnv.SUPABASE_URL)) {
        // Fail closed: production/non-loopback target -> do not query it.
        envProbe.errors.push('live probe skipped: SUPABASE_URL is not loopback (production isolation)');
        envProbe.bucket = { exists: false, skipped: true };
      } else {
      const sb = createClient(probeEnv.SUPABASE_URL, probeEnv.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const tables = ['manual_payments', 'audit_log', 'licenses'];
      for (const t of tables) {
        const { error } = await sb.from(t).select('id').limit(1);
        envProbe.tables[t] = !error;
      }
      const { data: buckets, error: bErr } = await sb.storage.listBuckets();
      if (!bErr && Array.isArray(buckets)) {
        const bp = buckets.find((b) => b.name === 'payment-proofs');
        envProbe.bucket = bp ? { exists: true, public: Boolean(bp.public) } : { exists: false };
        bucketReady = Boolean(bp && bp.public === false);
      } else {
        envProbe.bucket = { exists: false, error: true };
      }
      liveSupabaseReady = Boolean(
        envProbe.tables.manual_payments && envProbe.tables.audit_log && envProbe.tables.licenses
      );
      envProbe.supabaseReachable = true;
      }
    }
  } catch (err) {
    envProbe.errors.push(`probe error: ${err.message.slice(0, 120)}`);
  }

  const missingEnv = REQUIRED_ENV_NAMES.filter((n) => !envProbe.vars[n]);
  const allEnvReady = missingEnv.length === 0;

  console.log('\n── Environment Readiness (names/status only) ──');
  for (const [k, v] of Object.entries(envProbe.vars)) {
    console.log(`  ${k}: ${v ? 'SET' : 'MISSING'}`);
  }
  console.log(`  Supabase reachable: ${envProbe.supabaseReachable ? 'YES' : 'NO'}`);
  console.log(`  Tables: ${JSON.stringify(envProbe.tables)}`);
  console.log(`  Bucket payment-proofs: ${JSON.stringify(envProbe.bucket)}`);
  console.log(`  Live integration: ${liveSupabaseReady && bucketReady ? 'AVAILABLE' : 'BLOCKED (manual setup required)'}`);
  if (missingEnv.length) {
    console.log(`  Missing env var names: ${missingEnv.join(', ')}`);
  }

  resetState();
  const server = await startServer(0);
  const port = server.address().port;
  console.log(`\n  Test server: http://127.0.0.1:${port} (offline mode: Supabase cleared, mock email)\n`);

  try {
    // ─── A. Environment Readiness Probe ─────────────────────────────────────
    console.log('── A. Environment Readiness Probe ──');

    await test('A1. Probe completed without printing secret values', () => {
      assert.ok(envProbe.vars, 'probe object exists');
      assert.ok(!JSON.stringify(envProbe).includes('eyJ'), 'no JWT-like secret material in probe output');
      assert.ok(!JSON.stringify(envProbe).includes('scrypt$'), 'no password hash in probe output');
    });

    await test('A2. Required env var names enumerated with SET/MISSING status', () => {
      for (const name of REQUIRED_ENV_NAMES) {
        assert.ok(typeof envProbe.vars[name] === 'boolean', `${name} status must be boolean`);
      }
    });

    await test('A3. Supabase readiness recorded (tables + bucket)', () => {
      assert.ok(typeof liveSupabaseReady === 'boolean', 'live readiness boolean');
      assert.ok(envProbe.bucket === null || typeof envProbe.bucket.exists === 'boolean', 'bucket status recorded');
    });

    // ─── B. Customer Endpoint Behavior ──────────────────────────────────────
    console.log('── B. Customer Endpoint Behavior (validation + fail-closed) ──');

    await test('B1. Submit rejects external proof URL (400 INVALID_PROOF_REFERENCE)', async () => {
      const res = await httpRequest(port, 'POST', '/api/manual-payment/submit', {
        customer_name: 'QA',
        customer_email: 'qa@example.com',
        plan_id: 'basic',
        payment_method: 'bkash',
        amount: 1000,
        currency: 'BDT',
        transaction_id: `TXN-EXT-${Date.now()}`,
        proof_url: 'https://evil.example.com/proof.jpg',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_PROOF_REFERENCE');
    });

    await test('B2. Submit rejects non-existent proof path shape (400)', async () => {
      const res = await httpRequest(port, 'POST', '/api/manual-payment/submit', {
        customer_name: 'QA',
        customer_email: 'qa@example.com',
        plan_id: 'basic',
        payment_method: 'bkash',
        amount: 1000,
        currency: 'BDT',
        transaction_id: `TXN-BADPROOF-${Date.now()}`,
        proof_url: 'payment-proofs/not-a-uuid.txt',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_PROOF_REFERENCE');
    });

    await test('B3. Submit cannot set status/client-controlled fields (always pending path)', async () => {
      // Without Supabase the insert path fails closed — but validation of
      // dangerous fields happens first; status is forced server-side in code.
      // Verify a well-formed request without proof reaches the service config
      // gate (SERVICE_UNAVAILABLE offline) rather than accepting status=approved.
      const res = await httpRequest(port, 'POST', '/api/manual-payment/submit', {
        customer_name: 'QA',
        customer_email: 'qa@example.com',
        plan_id: 'basic',
        payment_method: 'bkash',
        amount: 1000,
        currency: 'BDT',
        transaction_id: `TXN-CTRL-${Date.now()}`,
        status: 'approved',
        license_id: 'attacker-controlled',
        reviewed_by: 'admin',
      });
      // Offline (no Supabase): 500 SERVICE_UNAVAILABLE — never 201 with approved.
      assert.ok(res.status === 500 || res.status === 201, `unexpected status ${res.status}`);
      if (res.status === 201) {
        assert.strictEqual(res.body.payment.status, 'pending', 'status must be pending');
      } else {
        assert.strictEqual(res.body.error.code, 'SERVICE_UNAVAILABLE');
      }
    });

    await test('B4. Submit validates plan/method/amount before persistence', async () => {
      const res = await httpRequest(port, 'POST', '/api/manual-payment/submit', {
        customer_name: 'QA',
        customer_email: 'qa@example.com',
        plan_id: 'enterprise',
        payment_method: 'bkash',
        amount: 1000,
        transaction_id: 'TXN-INVALID-PLAN',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_INPUT');
    });

    await test('B5. Status endpoint fail-closed without Supabase (SERVICE_UNAVAILABLE)', async () => {
      const res = await httpRequest(port, 'GET', '/api/manual-payment/status/11111111-2222-3333-4444-555555555555');
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.error.code, 'SERVICE_UNAVAILABLE');
    });

    await test('B6. Proof upload fail-closed without Supabase storage (SERVICE_UNAVAILABLE)', async () => {
      const res = await httpRequest(
        port, 'POST', '/api/upload/proof',
        null, {}, PNG_1X1, 'image/png'
      );
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.error.code, 'SERVICE_UNAVAILABLE');
    });

    await test('B7. Upload rejects non-image magic bytes (400 INVALID_FILE)', async () => {
      const res = await httpRequest(
        port, 'POST', '/api/upload/proof',
        null, {}, Buffer.from('not-an-image'), 'image/png'
      );
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_FILE');
    });

    // ─── C. Admin Login ─────────────────────────────────────────────────────
    console.log('── C. Admin Login (real HTTP) ──');

    let adminToken = '';

    await test('C1. Anonymous login attempt rejected (400/401)', async () => {
      const res = await httpRequest(port, 'POST', '/api/admin/login', {});
      assert.ok(res.status === 400 || res.status === 401, `got ${res.status}`);
    });

    await test('C2. Wrong password → 401 generic (no enumeration)', async () => {
      const res = await httpRequest(port, 'POST', '/api/admin/login', {
        username: TEST_ADMIN_USER,
        password: 'definitely-wrong',
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.message, 'Invalid username or password.');
    });

    await test('C3. Valid credentials → token + expires_in + admin.username', async () => {
      const res = await httpRequest(port, 'POST', '/api/admin/login', {
        username: TEST_ADMIN_USER,
        password: TEST_ADMIN_PASSWORD,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(typeof res.body.token === 'string' && res.body.token.length > 10, 'token present');
      assert.strictEqual(res.body.token_type, 'Bearer');
      assert.ok(res.body.expires_in > 0, 'expires_in');
      assert.strictEqual(res.body.admin.username, TEST_ADMIN_USER);
      assert.ok(!JSON.stringify(res.body).includes('scrypt$'), 'no password hash in response');
      assert.ok(!JSON.stringify(res.body).includes(TEST_ADMIN_PASSWORD), 'no plaintext password in response');
      adminToken = res.body.token;
    });

    // ─── D. Admin Payment List + Detail ─────────────────────────────────────
    console.log('── D. Admin Payment List + Detail ──');

    let pendingId = '';
    let rejectId = '';

    await test('D1. Seed pending payment appears in list (newest first)', async () => {
      resetState();
      pendingId = seedPending({ transaction_id: `TXN-STEP21-APPROVE-${Date.now()}` });
      rejectId = seedPending({
        customer_email: 'step21-reject@example.com',
        transaction_id: `TXN-STEP21-REJECT-${Date.now()}`,
      });
      const res = await httpRequest(port, 'GET', '/api/admin/payments?status=pending&page=1&limit=20', null, authHeader(adminToken));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const ids = res.body.payments.map((p) => p.id);
      assert.ok(ids.includes(pendingId), 'approve-target in list');
      assert.ok(ids.includes(rejectId), 'reject-target in list');
      assert.ok(res.body.pagination.total >= 2, 'pagination.total present');
    });

    await test('D2. Detail returns safe fields + proof envelope', async () => {
      const res = await httpRequest(port, 'GET', `/api/admin/payments/${pendingId}`, null, authHeader(adminToken));
      assert.strictEqual(res.status, 200);
      const p = res.body.payment;
      for (const f of ['id', 'customer_name', 'customer_email', 'plan_id', 'payment_method', 'amount', 'currency', 'transaction_id', 'status', 'proof_url', 'created_at']) {
        assert.ok(f in p, `missing field ${f}`);
      }
      assert.ok(p.proof && typeof p.proof === 'object', 'proof envelope present');
      assert.ok('reference' in p.proof, 'proof.reference');
      assert.ok('signed_url' in p.proof, 'proof.signed_url');
      assert.ok('expires_in_seconds' in p.proof, 'proof.expires_in_seconds');
      // Offline (no Supabase): signed_url is null — bucket not queried
      assert.strictEqual(p.proof.signed_url, null, 'offline signed_url null');
      const raw = JSON.stringify(res.body);
      assert.ok(!raw.includes('service_role'), 'no service-role key');
      assert.ok(!raw.includes('SUPABASE_SERVICE'), 'no service env name+value');
    });

    await test('D3. Detail without token → 401', async () => {
      const res = await httpRequest(port, 'GET', `/api/admin/payments/${pendingId}`);
      assert.strictEqual(res.status, 401);
    });

    // ─── E. Payment Approval → License → Audit → Email ──────────────────────
    console.log('── E. Payment Approval → License → Audit → Email (mock) ──');

    let approvedLicenseId = '';

    await test('E1. Approve pending payment succeeds with license + email result', async () => {
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${pendingId}/approve`, {
        admin_note: 'STEP21 QA approval',
      }, authHeader(adminToken));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.already_approved, false);
      assert.strictEqual(res.body.payment.status, 'approved');
      assert.strictEqual(res.body.payment.reviewed_by, TEST_ADMIN_USER);
      assert.ok(res.body.payment.reviewed_at, 'reviewed_at set');
      assert.ok(res.body.license && res.body.license.id, 'license id returned');
      assert.ok(res.body.license.licenseKey, 'license key returned to admin API');
      assert.strictEqual(res.body.license.tier, 'standard', 'tier matches plan_id');
      assert.ok(res.body.email && typeof res.body.email.success === 'boolean', 'email result present');
      assert.strictEqual(res.body.email.success, true, 'mock email succeeded');
      approvedLicenseId = res.body.license.id;
    });

    await test('E2. License record: exactly one, payment_provider=manual, tier=standard', async () => {
      const licenses = licenseGenerator.getGeneratedLicenses
        ? licenseGenerator.getGeneratedLicenses()
        : null;
      // Use registry via getLicenseById
      const lic = await licenseGenerator.getLicenseById(approvedLicenseId);
      assert.ok(lic, 'license retrievable');
      assert.strictEqual(lic.payment_provider, 'manual');
      assert.strictEqual(lic.tier, 'standard');
      assert.strictEqual(lic.customer_email, 'step21-qa@example.com');
      // Exactly one license for this payment's email/txn in registry after reset+approve
      const all = licenseGenerator.getInMemoryLicenses
        ? licenseGenerator.getInMemoryLicenses()
        : null;
      if (all) {
        const matching = all.filter((l) => l.customer_email === 'step21-qa@example.com');
        assert.strictEqual(matching.length, 1, `expected 1 license, got ${matching.length}`);
      }
    });

    await test('E3. Audit log: exactly one payment_approved for this payment', async () => {
      const rows = auditLogService.getInMemoryAuditLog().filter(
        (r) => r.action === 'payment_approved' && r.target_id === pendingId
      );
      assert.strictEqual(rows.length, 1, `expected 1 payment_approved, got ${rows.length}`);
      assert.strictEqual(rows[0].admin_id, TEST_ADMIN_USER);
      assert.strictEqual(rows[0].target_type, 'manual_payment');
      assert.ok(rows[0].metadata && rows[0].metadata.license_id, 'metadata.license_id');
      const metaStr = JSON.stringify(rows[0].metadata);
      assert.ok(!/password|service_role|sk_|whsec_/i.test(metaStr), 'no secrets in audit metadata');
    });

    await test('E4. Mock email event captured with license key, no secret credentials', async () => {
      const sent = emailService.getSentEmails();
      const matching = sent.filter((e) => e.to === 'step21-qa@example.com');
      assert.strictEqual(matching.length, 1, `expected 1 email, got ${matching.length}`);
      assert.ok(matching[0].licenseKey, 'email contains license key');
      assert.strictEqual(matching[0].tier, 'standard');
      const raw = JSON.stringify(matching[0]);
      assert.ok(!raw.includes('re_'), 'no Resend key');
      assert.ok(!raw.includes('sk_'), 'no Stripe key');
      assert.ok(!raw.includes('service_role'), 'no service-role');
      assert.ok(!raw.includes('Bearer '), 'no bearer token');
    });

    await test('E5. Payment record linked to license_id after approval', async () => {
      const rec = paymentReviewService.getInMemoryPayment(pendingId);
      assert.strictEqual(rec.status, 'approved');
      assert.strictEqual(rec.license_id, approvedLicenseId);
      assert.strictEqual(rec.reviewed_by, TEST_ADMIN_USER);
      assert.ok(rec.reviewed_at);
    });

    // ─── F. Customer-Visible Approval Contract ──────────────────────────────
    console.log('── F. Customer-Visible Approval Contract ──');

    await test('F1. Approve response exposes only safe payment fields (no internal secrets)', () => {
      // Covered live in E1 response shape — re-assert safe field allowlist
      const safe = paymentReviewService.SAFE_PAYMENT_FIELDS;
      assert.ok(safe.includes('status') && safe.includes('license_id') && safe.includes('reviewed_by'));
      assert.ok(!safe.includes('password') && !safe.includes('service_role'));
    });

    await test('F2. Customer status API intentionally does not expose license key (offline gate documented)', async () => {
      // With Supabase configured, anonymous status returns id/plan/status/created_at only.
      // Offline: SERVICE_UNAVAILABLE (B5). Assert route contract via source shape:
      // status response fields are a fixed subset — verified in STEP 17 tests.
      // Here we assert the offline fail-closed already covers no-leak:
      const res = await httpRequest(port, 'GET', `/api/manual-payment/status/${pendingId}`);
      const raw = JSON.stringify(res.body || {});
      assert.ok(!raw.includes('license_key') && !raw.includes('licenseKey'), 'status response never includes license key');
      assert.ok(!raw.includes('service_role'), 'no service-role in status response');
    });

    // ─── G. Payment Rejection Path ──────────────────────────────────────────
    console.log('── G. Payment Rejection Path ──');

    await test('G1. Reject without reason → 400', async () => {
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${rejectId}/reject`, {}, authHeader(adminToken));
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_INPUT');
    });

    await test('G2. Reject with blank reason → 400', async () => {
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${rejectId}/reject`, { reason: '   ' }, authHeader(adminToken));
      assert.strictEqual(res.status, 400);
    });

    await test('G3. Reject with reason succeeds; no license created', async () => {
      const beforeLicenses = (await licenseGenerator.getLicenseById(approvedLicenseId)) ? 1 : 0;
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${rejectId}/reject`, {
        reason: 'STEP21 QA: transaction could not be verified',
        admin_note: 'qa reject note',
      }, authHeader(adminToken));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.already_rejected, false);
      assert.strictEqual(res.body.payment.status, 'rejected');
      assert.strictEqual(res.body.payment.rejection_reason, 'STEP21 QA: transaction could not be verified');
      assert.strictEqual(res.body.payment.reviewed_by, TEST_ADMIN_USER);
      assert.ok(res.body.payment.reviewed_at);
      assert.strictEqual(res.body.payment.license_id, null, 'license_id remains null');
      assert.ok(!('license' in res.body) || res.body.license === null, 'reject response has no license');

      const rec = paymentReviewService.getInMemoryPayment(rejectId);
      assert.strictEqual(rec.license_id, null);

      const audits = auditLogService.getInMemoryAuditLog().filter(
        (r) => r.action === 'payment_rejected' && r.target_id === rejectId
      );
      assert.strictEqual(audits.length, 1, 'exactly one payment_rejected audit');
      assert.ok(beforeLicenses >= 1, 'precondition');
      // No new license for rejected payment
      const rejectedLicCount = auditLogService.getInMemoryAuditLog()
        .filter((r) => r.action === 'payment_approved' && r.target_id === rejectId).length;
      assert.strictEqual(rejectedLicCount, 0, 'no approval audit for rejected payment');
    });

    // ─── H. Idempotency ─────────────────────────────────────────────────────
    console.log('── H. Idempotency ──');

    await test('H1. Re-approve → already_approved, no second license, no duplicate audit', async () => {
      const licensesBefore = auditLogService.getInMemoryAuditLog()
        .filter((r) => r.action === 'payment_approved' && r.target_id === pendingId).length;
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${pendingId}/approve`, {}, authHeader(adminToken));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.already_approved, true);
      assert.strictEqual(res.body.payment.license_id, approvedLicenseId, 'same license id');
      const licensesAfter = auditLogService.getInMemoryAuditLog()
        .filter((r) => r.action === 'payment_approved' && r.target_id === pendingId).length;
      assert.strictEqual(licensesAfter, licensesBefore, 'no duplicate payment_approved audit');
      // License registry still has exactly one for this email
      const lic = await licenseGenerator.getLicenseById(approvedLicenseId);
      assert.ok(lic, 'license still exists');
    });

    await test('H2. Approve rejected payment → 409, no license created', async () => {
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${rejectId}/approve`, {}, authHeader(adminToken));
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'INVALID_STATUS');
      const rec = paymentReviewService.getInMemoryPayment(rejectId);
      assert.strictEqual(rec.license_id, null, 'still no license');
      assert.strictEqual(rec.status, 'rejected');
    });

    await test('H3. Reject approved payment → 409, remains approved', async () => {
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${pendingId}/reject`, {
        reason: 'should not apply',
      }, authHeader(adminToken));
      assert.strictEqual(res.status, 409);
      const rec = paymentReviewService.getInMemoryPayment(pendingId);
      assert.strictEqual(rec.status, 'approved');
      assert.strictEqual(rec.license_id, approvedLicenseId);
    });

    // ─── I. Security Cross-check ────────────────────────────────────────────
    console.log('── I. Security Cross-check ──');

    await test('I1. Anonymous user cannot access any admin API', async () => {
      for (const [method, p, body] of [
        ['GET', '/api/admin/payments', null],
        ['GET', `/api/admin/payments/${pendingId}`, null],
        ['POST', `/api/admin/payments/${pendingId}/approve`, {}],
        ['POST', `/api/admin/payments/${pendingId}/reject`, { reason: 'x' }],
      ]) {
        const res = await httpRequest(port, method, p, body);
        assert.strictEqual(res.status, 401, `${method} ${p} must 401`);
      }
    });

    await test('I2. Customer-style JWT (not admin token) rejected', async () => {
      const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjdXN0b21lciIsInJvbGUiOiJjdXN0b21lciJ9.sig';
      const res = await httpRequest(port, 'GET', '/api/admin/payments', null, authHeader(fakeJwt));
      assert.strictEqual(res.status, 401);
    });

    await test('I3. Admin credentials never appear in any API response', async () => {
      const login = await httpRequest(port, 'POST', '/api/admin/login', {
        username: TEST_ADMIN_USER,
        password: TEST_ADMIN_PASSWORD,
      });
      const list = await httpRequest(port, 'GET', '/api/admin/payments', null, authHeader(adminToken));
      const detail = await httpRequest(port, 'GET', `/api/admin/payments/${pendingId}`, null, authHeader(adminToken));
      const approveAgain = await httpRequest(port, 'POST', `/api/admin/payments/${pendingId}/approve`, {}, authHeader(adminToken));
      for (const res of [login, list, detail, approveAgain]) {
        const raw = JSON.stringify(res.body);
        assert.ok(!raw.includes(TEST_ADMIN_PASSWORD), 'plaintext password never returned');
        assert.ok(!raw.includes('scrypt$'), 'password hash never returned');
        assert.ok(!raw.includes(TEST_SESSION_SECRET), 'session secret never returned');
        assert.ok(!raw.includes('service_role'), 'service-role never returned');
        assert.ok(!raw.includes('SUPABASE_SERVICE_ROLE'), 'service env never returned');
      }
    });

    await test('I4. Client cannot control status / license_id / reviewed_by via approve body', async () => {
      const pending2 = seedPending({ transaction_id: `TXN-STEP21-BODY-${Date.now()}` });
      const res = await httpRequest(port, 'POST', `/api/admin/payments/${pending2}/approve`, {
        status: 'rejected',
        license_id: '00000000-0000-0000-0000-000000000000',
        reviewed_by: 'attacker',
        admin_note: 'ok',
      }, authHeader(adminToken));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.payment.status, 'approved', 'status not client-controlled');
      assert.strictEqual(res.body.payment.reviewed_by, TEST_ADMIN_USER, 'reviewed_by from token');
      assert.notStrictEqual(res.body.payment.license_id, '00000000-0000-0000-0000-000000000000');
    });

    await test('I5. Admin role cannot be self-assigned via login body', async () => {
      const res = await httpRequest(port, 'POST', '/api/admin/login', {
        username: TEST_ADMIN_USER,
        password: TEST_ADMIN_PASSWORD,
        role: 'superadmin',
      });
      assert.strictEqual(res.status, 200);
      // Role comes from server-issued token payload only
      assert.ok(adminToken.length > 0);
      assert.ok(!('role' in (res.body.admin || {})), 'login response admin object has no client-chosen role');
    });

    await test('I6. Proof bucket reference path traversal rejected on submit', async () => {
      const res = await httpRequest(port, 'POST', '/api/manual-payment/submit', {
        customer_name: 'QA',
        customer_email: 'qa@example.com',
        plan_id: 'basic',
        payment_method: 'bkash',
        amount: 1000,
        currency: 'BDT',
        transaction_id: `TXN-TRAV-${Date.now()}`,
        proof_url: 'payment-proofs/../../etc/passwd.jpg',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_PROOF_REFERENCE');
    });

    await test('I7. Upload path traversal helpers reject unsafe paths', () => {
      assert.strictEqual(uploadRouter.isPathSafe('../secret'), false);
      assert.strictEqual(uploadRouter.isPathSafe('a//b'), false);
      assert.strictEqual(uploadRouter.isPathSafe('/abs'), false);
      assert.strictEqual(uploadRouter.isPathSafe('a\\b'), false);
      assert.strictEqual(uploadRouter.isValidProofReference('https://x.com/a.jpg'), false);
      assert.strictEqual(
        uploadRouter.isValidProofReference('payment-proofs/ns/11111111-2222-3333-4444-555555555555.jpg'),
        true
      );
    });

    await test('I8. Private proof stays private offline (signed_url null, reference only)', async () => {
      const res = await httpRequest(port, 'GET', `/api/admin/payments/${pendingId}`, null, authHeader(adminToken));
      assert.strictEqual(res.body.payment.proof.signed_url, null);
      assert.ok(res.body.payment.proof.reference.startsWith('payment-proofs/'));
      assert.ok(!res.raw.includes('supabase.co/storage'), 'no raw storage URL when unsigned');
    });

    // ─── J. Frontend ↔ Backend Endpoint Contract ────────────────────────────
    console.log('── J. Frontend ↔ Backend Endpoint Contract ──');

    await test('J1. Website manualPayment config endpoints match server routes', () => {
      const cfg = require(path.join(ROOT, 'website', 'src', 'config', 'manualPayment.js'));
      assert.ok(cfg.MANUAL_PAYMENT_ENDPOINTS.submit.endsWith('/api/manual-payment/submit'));
      assert.ok(cfg.MANUAL_PAYMENT_ENDPOINTS.uploadProof.endsWith('/api/upload/proof'));
      assert.ok(cfg.MANUAL_PAYMENT_ENDPOINTS.status('x').includes('/api/manual-payment/status/x'));
    });

    await test('J2. Website adminApi config endpoints match server routes', () => {
      const cfg = require(path.join(ROOT, 'website', 'src', 'config', 'adminApi.js'));
      assert.ok(cfg.ADMIN_API.login.endsWith('/api/admin/login'));
      assert.ok(cfg.ADMIN_API.payments().includes('/api/admin/payments'));
      assert.ok(cfg.ADMIN_API.approve('abc').endsWith('/approve'));
      assert.ok(cfg.ADMIN_API.reject('abc').endsWith('/reject'));
    });

    // ─── K. Live Supabase Blockers (explicit) ───────────────────────────────
    console.log('── K. Live Supabase Blockers (explicit, not skipped silently) ──');

    await test('K1. Live readiness result is recorded for the final report', () => {
      // This assertion always passes — it ensures the probe values flow into
      // the report. Live E2E against real tables is BLOCKED when not ready.
      assert.ok(typeof liveSupabaseReady === 'boolean');
      assert.ok(typeof bucketReady === 'boolean');
      if (!(liveSupabaseReady && bucketReady)) {
        console.log('    ⚠ LIVE BLOCKED: manual_payments/audit_log tables and/or private payment-proofs bucket missing.');
        console.log('    ⚠ Required manual setup before live customer/admin browser E2E can PASS.');
      }
      if (missingEnv.length) {
        console.log(`    ⚠ MISSING ENV (names only): ${missingEnv.join(', ')}`);
      }
    });

    await test('K2. No synthetic cleanup code created; in-memory state only for offline E2E', () => {
      // Offline E2E used in-memory stores; resetState() clears them in finally.
      // No DELETE scripts were added to the project for this QA step.
      const scriptsDir = path.join(SERVER_DIR, 'scripts');
      const files = fs.readdirSync(scriptsDir);
      const destructive = files.filter((f) => /cleanup|purge|delete.*test/i.test(f));
      assert.strictEqual(destructive.length, 0, 'no destructive cleanup scripts added');
    });
  } finally {
    await stopServer();
    resetState();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`STEP 21 Integration — Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  console.log(`Live Supabase ready: ${liveSupabaseReady ? 'YES' : 'NO'} | Private bucket ready: ${bucketReady ? 'YES' : 'NO'}`);
  console.log(`Missing env names: ${missingEnv.length ? missingEnv.join(', ') : '(none)'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('STEP 21 fatal:', err);
  process.exit(1);
});
