'use strict';

/**
 * STEP 25 — License API Foundation Tests
 *
 * Tests:
 *  A. License Lookup
 *  B. License Activation
 *  C. License Validation
 *  D. HWID Handling
 *  E. Revoked License Handling
 *  F. Rate Limiting
 *  G. Input Validation
 *  H. Error Response Security
 *  I. CORS Policy
 *  J. Secret Leakage Prevention
 *  K. Server Architecture
 *  L. Status Endpoint
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

const serverDir = path.join(__dirname, '..', 'server');
const routeDir = path.join(serverDir, 'routes');
const serviceDir = path.join(serverDir, 'services');
const middlewareDir = path.join(serverDir, 'middleware');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assertFileExists(filePath, label) {
  const exists = fs.existsSync(filePath);
  assert.ok(exists, `${label} must exist at ${path.relative(path.join(__dirname, '..'), filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function httpRequest(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Main Test Suite ──────────────────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 25 — License API Foundation Tests');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ─── A. License Lookup ───────────────────────────────────────────────────

  console.log('── A. License Lookup ──');

  await test('A1. License service file exists', () => {
    assertFileExists(path.join(serviceDir, 'licenseService.js'), 'licenseService.js');
  });

  await test('A2. License route file exists', () => {
    assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
  });

  await test('A3. License service exports lookupLicense', () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    assert.strictEqual(typeof svc.lookupLicense, 'function', 'lookupLicense must be exported');
  });

  await test('A4. License service exports activateLicense', () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    assert.strictEqual(typeof svc.activateLicense, 'function', 'activateLicense must be exported');
  });

  await test('A5. License service exports validateLicense', () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    assert.strictEqual(typeof svc.validateLicense, 'function', 'validateLicense must be exported');
  });

  await test('A6. License service exports getLicenseStatus', () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    assert.strictEqual(typeof svc.getLicenseStatus, 'function', 'getLicenseStatus must be exported');
  });

  await test('A7. lookupLicense returns null for nonexistent key', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    const result = await svc.lookupLicense('XXXX-XXXX-XXXX-XXXX');
    assert.strictEqual(result, null, 'Nonexistent key must return null');
  });

  await test('A8. lookupLicense returns safe fields only', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'TEST-LOOKUP-AAAA-BBBB',
      tier: 'pro',
      status: 'active',
      hwid: 'a'.repeat(64),
    });
    const result = await svc.lookupLicense('TEST-LOOKUP-AAAA-BBBB');
    assert.ok(result, 'License must be found');
    assert.strictEqual(result.license_key, 'TEST-LOOKUP-AAAA-BBBB');
    assert.strictEqual(result.tier, 'pro');
    assert.strictEqual(result.status, 'active');
    // Must NOT expose internal fields
    assert.strictEqual(result.customer_email, undefined, 'Must not expose customer_email');
    assert.strictEqual(result.transaction_id, undefined, 'Must not expose transaction_id');
    assert.strictEqual(result.payment_provider, undefined, 'Must not expose payment_provider');
    svc.clearInMemoryLicenses();
  });

  // ─── B. License Activation ───────────────────────────────────────────────

  console.log('');
  console.log('── B. License Activation ──');

  await test('B1. Activation binds HWID to unbound license', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'ACTV-TEST-1111-2222',
      tier: 'standard',
      status: 'active',
      hwid: null,
    });
    const result = await svc.activateLicense('ACTV-TEST-1111-2222', 'a'.repeat(64));
    assert.strictEqual(result.success, true, 'Activation must succeed');
    assert.strictEqual(result.license.tier, 'standard');
    assert.strictEqual(result.license.status, 'active');
    svc.clearInMemoryLicenses();
  });

  await test('B2. Activation allows same-HWID reactivation', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    const hwid = 'b'.repeat(64);
    svc.seedInMemoryLicense({
      license_key: 'REAC-TEST-3333-4444',
      tier: 'pro',
      status: 'active',
      hwid: hwid,
    });
    const result = await svc.activateLicense('REAC-TEST-3333-4444', hwid);
    assert.strictEqual(result.success, true, 'Same-HWID reactivation must succeed');
    svc.clearInMemoryLicenses();
  });

  await test('B3. Activation rejects different HWID', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'DIFF-TEST-5555-6666',
      tier: 'basic',
      status: 'active',
      hwid: 'c'.repeat(64),
    });
    const result = await svc.activateLicense('DIFF-TEST-5555-6666', 'd'.repeat(64));
    assert.strictEqual(result.success, false, 'Different HWID must fail');
    assert.strictEqual(result.code, 'HWID_MISMATCH');
    svc.clearInMemoryLicenses();
  });

  await test('B4. Activation rejects nonexistent key', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    const result = await svc.activateLicense('NOPE-FAKE-0000-1111', 'e'.repeat(64));
    assert.strictEqual(result.success, false, 'Nonexistent key must fail');
    assert.strictEqual(result.code, 'LICENSE_INVALID');
  });

  await test('B5. Activation rejects revoked license', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'REVK-TEST-2222-3333',
      tier: 'pro',
      status: 'revoked',
      hwid: null,
    });
    const result = await svc.activateLicense('REVK-TEST-2222-3333', 'f'.repeat(64));
    assert.strictEqual(result.success, false, 'Revoked license must fail');
    assert.strictEqual(result.code, 'LICENSE_REVOKED');
    svc.clearInMemoryLicenses();
  });

  await test('B6. Activation response does not expose sensitive fields', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'SAFE-TEST-4444-5555',
      tier: 'pro',
      status: 'active',
      hwid: null,
    });
    const result = await svc.activateLicense('SAFE-TEST-4444-5555', 'g'.repeat(64));
    assert.strictEqual(result.success, true);
    assert.ok(result.license, 'Must have license object');
    assert.strictEqual(result.license.customerEmail, undefined, 'Must not expose customerEmail');
    assert.strictEqual(result.license.transactionId, undefined, 'Must not expose transactionId');
    assert.strictEqual(result.license.hwid, undefined, 'Must not expose hwid in response');
    svc.clearInMemoryLicenses();
  });

  // ─── C. License Validation ───────────────────────────────────────────────

  console.log('');
  console.log('── C. License Validation ──');

  await test('C1. Validation succeeds for bound license with correct HWID', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    const hwid = 'h'.repeat(64);
    svc.seedInMemoryLicense({
      license_key: 'VALD-TEST-1111-2222',
      tier: 'pro',
      status: 'active',
      hwid: hwid,
    });
    const result = await svc.validateLicense('VALD-TEST-1111-2222', hwid);
    assert.strictEqual(result.success, true, 'Validation must succeed');
    assert.strictEqual(result.license.tier, 'pro');
    svc.clearInMemoryLicenses();
  });

  await test('C2. Validation fails for wrong HWID', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'VALW-TEST-3333-4444',
      tier: 'basic',
      status: 'active',
      hwid: 'i'.repeat(64),
    });
    const result = await svc.validateLicense('VALW-TEST-3333-4444', 'j'.repeat(64));
    assert.strictEqual(result.success, false, 'Wrong HWID must fail');
    assert.strictEqual(result.code, 'HWID_MISMATCH');
    svc.clearInMemoryLicenses();
  });

  await test('C3. Validation fails for revoked license', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'VALR-TEST-5555-6666',
      tier: 'standard',
      status: 'revoked',
      hwid: 'k'.repeat(64),
    });
    const result = await svc.validateLicense('VALR-TEST-5555-6666', 'k'.repeat(64));
    assert.strictEqual(result.success, false, 'Revoked must fail');
    assert.strictEqual(result.code, 'LICENSE_REVOKED');
    svc.clearInMemoryLicenses();
  });

  await test('C4. Validation fails for nonexistent key', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    const result = await svc.validateLicense('NOPE-FAKE-9999-0000', 'l'.repeat(64));
    assert.strictEqual(result.success, false, 'Nonexistent must fail');
    assert.strictEqual(result.code, 'LICENSE_INVALID');
  });

  // ─── D. HWID Handling ────────────────────────────────────────────────────

  console.log('');
  console.log('── D. HWID Handling ──');

  await test('D1. HWID must be 64-character hex string', () => {
    const { validateHwid } = require(path.join(middlewareDir, 'inputValidator.js'));
    assert.strictEqual(validateHwid('a'.repeat(64)).valid, true, 'Valid HWID accepted');
    assert.strictEqual(validateHwid('g'.repeat(64)).valid, false, 'Non-hex rejected');
    assert.strictEqual(validateHwid('abc').valid, false, 'Too short rejected');
    assert.strictEqual(validateHwid('a'.repeat(65)).valid, false, 'Too long rejected');
    assert.strictEqual(validateHwid('').valid, false, 'Empty rejected');
    assert.strictEqual(validateHwid(null).valid, false, 'Null rejected');
    assert.strictEqual(validateHwid(undefined).valid, false, 'Undefined rejected');
  });

  await test('D2. License key must be XXXX-XXXX-XXXX-XXXX format', () => {
    const { validateLicenseKey } = require(path.join(middlewareDir, 'inputValidator.js'));
    assert.strictEqual(validateLicenseKey('ABCD-EFGH-IJKL-MNOP').valid, true, 'Valid key accepted');
    assert.strictEqual(validateLicenseKey('abcd-efgh-ijkl-mnop').valid, false, 'Lowercase rejected');
    assert.strictEqual(validateLicenseKey('ABCD-EFGH-IJKL').valid, false, 'Too short rejected');
    assert.strictEqual(validateLicenseKey('ABCD-EFGH-IJKL-MNOP-QRS').valid, false, 'Too long rejected');
    assert.strictEqual(validateLicenseKey('').valid, false, 'Empty rejected');
    assert.strictEqual(validateLicenseKey(null).valid, false, 'Null rejected');
    assert.strictEqual(validateLicenseKey('ABCD_EFGH_IJKL_MNOP').valid, false, 'Underscore rejected');
  });

  await test('D3. bindLicense handles already-bound same HWID', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    const hwid = 'm'.repeat(64);
    svc.seedInMemoryLicense({
      license_key: 'BIND-TEST-1111-2222',
      tier: 'standard',
      status: 'active',
      hwid: hwid,
    });
    const result = await svc.bindLicense('BIND-TEST-1111-2222', hwid);
    assert.strictEqual(result.success, true, 'Same HWID bind must succeed');
    svc.clearInMemoryLicenses();
  });

  await test('D4. bindLicense rejects different HWID when already bound', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'BIND-TEST-3333-4444',
      tier: 'basic',
      status: 'active',
      hwid: 'n'.repeat(64),
    });
    const result = await svc.bindLicense('BIND-TEST-3333-4444', 'o'.repeat(64));
    assert.strictEqual(result.success, false, 'Different HWID bind must fail');
    assert.strictEqual(result.error, 'HWID_MISMATCH');
    svc.clearInMemoryLicenses();
  });

  // ─── E. Revoked License Handling ─────────────────────────────────────────

  console.log('');
  console.log('── E. Revoked License Handling ──');

  await test('E1. Revoked license lookup returns status=revoked', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'REVK-LOOKUP-1111-2222',
      tier: 'pro',
      status: 'revoked',
    });
    const result = await svc.lookupLicense('REVK-LOOKUP-1111-2222');
    assert.ok(result, 'Revoked license must be found');
    assert.strictEqual(result.status, 'revoked');
    svc.clearInMemoryLicenses();
  });

  await test('E2. Status endpoint returns revoked status', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'REVK-STATS-3333-4444',
      tier: 'standard',
      status: 'revoked',
    });
    const result = await svc.getLicenseStatus('REVK-STATS-3333-4444');
    assert.strictEqual(result.success, true, 'Status lookup must succeed');
    assert.strictEqual(result.license.status, 'revoked');
    svc.clearInMemoryLicenses();
  });

  // ─── F. Rate Limiting ────────────────────────────────────────────────────

  console.log('');
  console.log('── F. Rate Limiting ──');

  await test('F1. Rate limiter module exists', () => {
    assertFileExists(path.join(middlewareDir, 'rateLimiter.js'), 'rateLimiter.js');
  });

  await test('F2. Rate limiter exports activateLimiter', () => {
    const rl = require(path.join(middlewareDir, 'rateLimiter.js'));
    assert.strictEqual(typeof rl.activateLimiter, 'function');
  });

  await test('F3. Rate limiter exports validateLimiter', () => {
    const rl = require(path.join(middlewareDir, 'rateLimiter.js'));
    assert.strictEqual(typeof rl.validateLimiter, 'function');
  });

  await test('F4. Rate limiter exports statusLimiter', () => {
    const rl = require(path.join(middlewareDir, 'rateLimiter.js'));
    assert.strictEqual(typeof rl.statusLimiter, 'function');
  });

  await test('F5. Rate limiter blocks after max requests', () => {
    const { createRateLimiter } = require(path.join(middlewareDir, 'rateLimiter.js'));
    const testLimiter = createRateLimiter({ name: 'test_block', maxRequests: 3, windowMs: 60_000 });

    let blocked = false;
    const fakeReq = { ip: '127.0.0.1' };
    const fakeRes = {
      headers: {},
      set(k, v) { this.headers[k] = v; },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(obj) {
        if (obj.error && obj.error.code === 'RATE_LIMITED') blocked = true;
        return this;
      },
    };

    // First 3 should pass
    for (let i = 0; i < 3; i++) {
      let nextCalled = false;
      testLimiter(fakeReq, fakeRes, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true, `Request ${i + 1} should pass`);
    }

    // 4th should be blocked
    let nextCalled = false;
    testLimiter(fakeReq, fakeRes, () => { nextCalled = true; });
    assert.strictEqual(blocked, true, 'Request 4 should be blocked');
    assert.strictEqual(nextCalled, false, 'Next should not be called when blocked');
  });

  await test('F6. Rate limiter sets X-RateLimit headers', () => {
    const { createRateLimiter } = require(path.join(middlewareDir, 'rateLimiter.js'));
    const testLimiter = createRateLimiter({ name: 'test_headers', maxRequests: 10, windowMs: 60_000 });

    const fakeReq = { ip: '127.0.0.2' };
    const fakeRes = {
      headers: {},
      set(k, v) { this.headers[k] = v; },
    };

    testLimiter(fakeReq, fakeRes, () => {});
    assert.ok(fakeRes.headers['X-RateLimit-Limit'], 'Must set X-RateLimit-Limit');
    assert.ok(fakeRes.headers['X-RateLimit-Remaining'], 'Must set X-RateLimit-Remaining');
    assert.ok(fakeRes.headers['X-RateLimit-Reset'], 'Must set X-RateLimit-Reset');
  });

  // ─── G. Input Validation ─────────────────────────────────────────────────

  console.log('');
  console.log('── G. Input Validation ──');

  await test('G1. Input validator module exists', () => {
    assertFileExists(path.join(middlewareDir, 'inputValidator.js'), 'inputValidator.js');
  });

  await test('G2. allowMethods rejects disallowed methods', () => {
    const { allowMethods } = require(path.join(middlewareDir, 'inputValidator.js'));
    const middleware = allowMethods(['POST']);

    let rejected = false;
    middleware(
      { method: 'GET' },
      {
        status(code) { this.statusCode = code; return this; },
        json(obj) { if (this.statusCode === 405) rejected = true; },
      },
      () => {}
    );
    assert.strictEqual(rejected, true, 'GET must be rejected for POST-only route');
  });

  await test('G3. allowMethods allows correct methods', () => {
    const { allowMethods } = require(path.join(middlewareDir, 'inputValidator.js'));
    const middleware = allowMethods(['POST']);

    let nextCalled = false;
    middleware(
      { method: 'POST' },
      {},
      () => { nextCalled = true; }
    );
    assert.strictEqual(nextCalled, true, 'POST must be allowed');
  });

  await test('G4. stripUnknownFields removes unexpected fields', () => {
    const { stripUnknownFields } = require(path.join(middlewareDir, 'inputValidator.js'));
    const middleware = stripUnknownFields(['licenseKey', 'hwid']);

    const req = {
      body: {
        licenseKey: 'ABCD-EFGH-IJKL-MNOP',
        hwid: 'a'.repeat(64),
        evilField: 'injected',
        anotherEvil: true,
      },
    };

    middleware(req, {}, () => {});
    assert.strictEqual(req.body.licenseKey, 'ABCD-EFGH-IJKL-MNOP', 'Allowed field preserved');
    assert.strictEqual(req.body.hwid, 'a'.repeat(64), 'Allowed field preserved');
    assert.strictEqual(req.body.evilField, undefined, 'Unknown field stripped');
    assert.strictEqual(req.body.anotherEvil, undefined, 'Unknown field stripped');
  });

  await test('G5. License key validator rejects oversized input', () => {
    const { validateLicenseKey } = require(path.join(middlewareDir, 'inputValidator.js'));
    const longKey = 'A'.repeat(200);
    assert.strictEqual(validateLicenseKey(longKey).valid, false, 'Oversized key rejected');
  });

  await test('G6. HWID validator rejects oversized input', () => {
    const { validateHwid } = require(path.join(middlewareDir, 'inputValidator.js'));
    const longHwid = 'a'.repeat(200);
    assert.strictEqual(validateHwid(longHwid).valid, false, 'Oversized HWID rejected');
  });

  // ─── H. Error Response Security ──────────────────────────────────────────

  console.log('');
  console.log('── H. Error Response Security ──');

  await test('H1. License route has safe error response format', () => {
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    // Must have error response helper
    assert.ok(routeCode.includes('errorResponse'), 'Must have errorResponse helper');
    assert.ok(routeCode.includes('INTERNAL_ERROR'), 'Must have generic INTERNAL_ERROR');
    assert.ok(routeCode.includes('An unexpected error occurred'), 'Must have safe generic message');
  });

  await test('H2. License route does not expose stack traces', () => {
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    assert.ok(!routeCode.includes('err.stack'), 'Must not expose stack traces');
    assert.ok(!routeCode.includes('stackTrace'), 'Must not expose stack traces');
  });

  await test('H3. License service does not expose SQL/Supabase errors to client', () => {
    const serviceCode = assertFileExists(path.join(serviceDir, 'licenseService.js'), 'licenseService.js');
    // The service should catch errors and return safe messages
    assert.ok(!serviceCode.includes('res.status(500).json'), 'Service must not send HTTP responses directly');
  });

  await test('H4. Error responses have consistent structure', () => {
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    // Verify the error response structure
    assert.ok(routeCode.includes('success: false'), 'Error must have success: false');
    assert.ok(routeCode.includes('code,'), 'Error must have code');
    // message appears as shorthand: { code, message }
    assert.ok(routeCode.includes('message') && routeCode.includes('error:'), 'Error must have message');
  });

  // ─── I. CORS Policy ──────────────────────────────────────────────────────

  console.log('');
  console.log('── I. CORS Policy ──');

  await test('I1. Server index.js has CORS configuration', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('Access-Control-Allow-Origin'), 'Must set CORS headers');
    assert.ok(indexCode.includes('CORS_ALLOWED_ORIGINS'), 'Must use configurable origins');
  });

  await test('I2. Server does NOT use wildcard origin', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(!indexCode.includes("'*'"), 'Must not use wildcard origin');
    assert.ok(!indexCode.includes('"*"'), 'Must not use wildcard origin');
  });

  await test('I3. Server handles OPTIONS preflight', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('OPTIONS'), 'Must handle OPTIONS preflight');
    assert.ok(indexCode.includes('204') || indexCode.includes('200'), 'Must respond to preflight');
  });

  // ─── J. Secret Leakage Prevention ────────────────────────────────────────

  console.log('');
  console.log('── J. Secret Leakage Prevention ──');

  await test('J1. License service uses only server-side Supabase client', () => {
    const serviceCode = assertFileExists(path.join(serviceDir, 'licenseService.js'), 'licenseService.js');
    // The service SHOULD use config.supabase (which has serviceRoleKey) for server-side operations
    // This is correct — the key must only be used server-side, never exposed to browser
    assert.ok(serviceCode.includes('config.supabase'), 'Must use server-side config for Supabase');
    // Must NOT create a client with anon key (desktop uses anon key, server uses service-role)
    assert.ok(!serviceCode.includes('SUPABASE_ANON_KEY'), 'Must not use anon key in server service');
    // Must NOT expose the key to HTTP responses
    assert.ok(!serviceCode.includes('res.json'), 'Must not send HTTP responses directly');
    assert.ok(!serviceCode.includes('res.status'), 'Must not send HTTP responses directly');
  });

  await test('J2. License route does not reference Stripe secrets', () => {
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    assert.ok(!routeCode.includes('STRIPE_SECRET'), 'Must not reference Stripe secret');
    assert.ok(!routeCode.includes('sk_'), 'Must not reference Stripe secret key');
    assert.ok(!routeCode.includes('whsec_'), 'Must not reference webhook secret');
  });

  await test('J3. License service does not expose customer_email', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'SECR-TEST-1111-2222',
      tier: 'pro',
      status: 'active',
      hwid: 'a'.repeat(64),
    });
    // The lookup function returns safe fields only
    const lookup = await svc.lookupLicense('SECR-TEST-1111-2222');
    assert.ok(lookup, 'License must be found');
    assert.strictEqual(lookup.customer_email, undefined, 'Must not expose customer_email');
    assert.strictEqual(lookup.transaction_id, undefined, 'Must not expose transaction_id');
    assert.strictEqual(lookup.email_status, undefined, 'Must not expose email_status');
    svc.clearInMemoryLicenses();
  });

  await test('J4. No signing secrets in license service or route', () => {
    const serviceCode = assertFileExists(path.join(serviceDir, 'licenseService.js'), 'licenseService.js');
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    assert.ok(!serviceCode.includes('signing-secret'), 'Must not reference signing secret');
    assert.ok(!serviceCode.includes('SIGNING_SECRET'), 'Must not reference signing secret');
    assert.ok(!routeCode.includes('signing-secret'), 'Must not reference signing secret');
    assert.ok(!routeCode.includes('SIGNING_SECRET'), 'Must not reference signing secret');
  });

  await test('J5. No encryption keys in license API files', () => {
    const serviceCode = assertFileExists(path.join(serviceDir, 'licenseService.js'), 'licenseService.js');
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    assert.ok(!serviceCode.includes('ENCRYPTION_KEY'), 'Must not reference encryption key');
    assert.ok(!serviceCode.includes('encryption_key'), 'Must not reference encryption key');
    assert.ok(!routeCode.includes('ENCRYPTION_KEY'), 'Must not reference encryption key');
  });

  // ─── K. Server Architecture ──────────────────────────────────────────────

  console.log('');
  console.log('── K. Server Architecture ──');

  await test('K1. Server index mounts license routes at /api/license', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('/api/license'), 'Must mount license routes at /api/license');
  });

  await test('K2. Server has JSON body size limit', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('limit'), 'Must have JSON body size limit');
  });

  await test('K3. Server has 404 handler', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('404'), 'Must have 404 handler');
  });

  await test('K4. Server has global error handler', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('err') && indexCode.includes('500'), 'Must have global error handler');
  });

  await test('K5. Server sets security headers', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('X-Content-Type-Options'), 'Must set X-Content-Type-Options');
    assert.ok(indexCode.includes('X-Frame-Options'), 'Must set X-Frame-Options');
  });

  await test('K6. Server trusts proxy for req.ip', () => {
    const indexCode = assertFileExists(path.join(serverDir, 'index.js'), 'server/index.js');
    assert.ok(indexCode.includes('trust proxy'), 'Must configure trust proxy');
  });

  // ─── L. Status Endpoint ──────────────────────────────────────────────────

  console.log('');
  console.log('── L. Status Endpoint ──');

  await test('L1. Status lookup returns safe license info', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    svc.clearInMemoryLicenses();
    svc.seedInMemoryLicense({
      license_key: 'STAT-TEST-1111-2222',
      tier: 'pro',
      status: 'active',
      hwid: 'a'.repeat(64),
    });
    const result = await svc.getLicenseStatus('STAT-TEST-1111-2222');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.license.licenseKey, 'STAT-TEST-1111-2222');
    assert.strictEqual(result.license.tier, 'pro');
    assert.strictEqual(result.license.status, 'active');
    assert.strictEqual(result.license.hasHwid, true);
    // Must not expose sensitive fields
    assert.strictEqual(result.license.hwid, undefined, 'Must not expose hwid');
    assert.strictEqual(result.license.customerEmail, undefined, 'Must not expose customerEmail');
    svc.clearInMemoryLicenses();
  });

  await test('L2. Status lookup for nonexistent key returns not found', async () => {
    const svc = require(path.join(serviceDir, 'licenseService.js'));
    const result = await svc.getLicenseStatus('NOPE-FAKE-0000-1111');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'LICENSE_INVALID');
  });

  await test('L3. Status endpoint requires GET method', () => {
    const routeCode = assertFileExists(path.join(routeDir, 'license.js'), 'license.js');
    // Find the GET /status route
    assert.ok(routeCode.includes("router.get('/status'"), 'Must have GET /status route');
  });

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`STEP 25 Test Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('');
    console.log('Failed tests:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
