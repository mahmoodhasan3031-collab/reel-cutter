'use strict';

/**
 * STEP 76 — License Entitlement Hardening Tests
 *
 * Verifies the fixes for STEP 75 license-delivery-boundary findings:
 *   A. M-1 — Subscription entitlement enforcement (RPC columns + isActive)
 *   B. M-2 — Legacy HWID-keyed signature scheme removed
 *   C. L-1 — Anon EXECUTE revoked; client talks to backend API only
 *   D. L-2 — bind_license_hwid result verification (no blind success)
 *   E. L-3 — Admin license revoke / reset-hwid endpoints (+ audit trail)
 *   F. L-4 — Strict invalid-key rate limiting
 *   G. Migration shape guards
 *
 * Runs entirely offline against in-memory stores / injected fakes.
 * No production server, database, or .env file is touched.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = path.join(__dirname, '..');
const TMP_DIR = path.join(root, '.test-step76-entitlement');

// ─── Sources under test ──────────────────────────────────────────────────────

const MIGRATION_FILE = path.join(
  root,
  'supabase',
  'migrations',
  '20261002000000_step76_license_entitlement_hardening.sql'
);
const migrationSrc = fs.readFileSync(MIGRATION_FILE, 'utf8');
const storeSrc = fs.readFileSync(path.join(root, 'src', 'main', 'license', 'store.js'), 'utf8');
const viteSrc = fs.readFileSync(path.join(root, 'electron.vite.config.mjs'), 'utf8');

// ─── Modules under test ──────────────────────────────────────────────────────

const licenseRouter = require('../server/routes/license');
const adminRouter = require('../server/routes/admin');
const config = require('../server/config');
const {
  lookupLicense,
  bindLicense,
  activateLicense,
  getLicenseStatus,
  revokeLicenseKey,
  resetLicenseHwid,
  seedInMemoryLicense,
  clearInMemoryLicenses,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
} = require('../server/services/licenseService');
const { createSessionToken } = require('../server/services/adminAuth');
const { getInMemoryAuditLog, clearInMemoryAuditLog } = require('../server/services/auditLog');
const store = require('../src/main/license/store');
const { getHardwareId } = require('../src/main/license/hwid');
const { validateStartup } = require('../src/main/license/licenseManager');
const { setMockLicense, resetMockDb } = require('../src/main/license/supabaseClient');

// ─── Test harness ────────────────────────────────────────────────────────────

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

function callRoute(router, method, urlPath, body, headers = {}, ip = 'step76-test') {
  return new Promise((resolve) => {
    let statusCode = 200;
    const responseHeaders = {};
    const req = {
      method,
      url: urlPath,
      body,
      headers,
      query: {},
      ip,
    };
    const urlObj = new URL(urlPath, 'http://localhost');
    req.query = Object.fromEntries(urlObj.searchParams);

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => resolve({ status: statusCode, data, headers: responseHeaders }),
      set: (key, value) => {
        responseHeaders[key] = value;
        return res;
      },
      get: (key) => responseHeaders[key] || null,
    };

    router.handle(req, res, () => resolve({ status: statusCode, data: null, headers: responseHeaders }));
  });
}

const callLicenseRoute = (method, urlPath, body, headers = {}, ip = 'step76-test') =>
  callRoute(licenseRouter, method, urlPath, body, headers, ip);
const callAdminRoute = (method, urlPath, body, headers = {}, ip = 'step76-test') =>
  callRoute(adminRouter, method, urlPath, body, headers, ip);

function setupAdminSession() {
  const originalAdmin = { ...config.admin };
  config.admin = {
    ...config.admin,
    username: 'step76-test-admin',
    // Test-only placeholder — this suite never verifies a password.
    passwordHash: 'scrypt$0000$0000',
    sessionSecret: 'step76-test-session-secret-value',
  };
  const token = createSessionToken('step76-test-admin');
  return {
    headers: { authorization: `Bearer ${token.token}` },
    restore: () => {
      config.admin = originalAdmin;
    },
  };
}

function fakeSupabaseClient({ fetchRows = [], bindRows = [], bindError = null } = {}) {
  return {
    rpc: async (name) => {
      if (name === 'fetch_license_by_key') return { data: fetchRows, error: null };
      if (name === 'bind_license_hwid') return { data: bindRows, error: bindError };
      return { data: null, error: { message: `unexpected rpc: ${name}` } };
    },
  };
}

const HWID_A = 'a'.repeat(64);
const HWID_B = 'b'.repeat(64);

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function cleanupTmp() {
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n======================================================');
  console.log('🔐 STEP 76 — License Entitlement Hardening Tests');
  console.log('======================================================\n');

  cleanupTmp();
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // A. M-1 — Entitlement enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── A. M-1 — Entitlement enforcement ───');

  const fetchFnStart = migrationSrc.indexOf('CREATE OR REPLACE FUNCTION public.fetch_license_by_key');
  const fetchFnEnd = migrationSrc.indexOf(
    'REVOKE EXECUTE ON FUNCTION public.fetch_license_by_key(TEXT) FROM PUBLIC;'
  );
  const fetchFnSrc = migrationSrc.substring(fetchFnStart, fetchFnEnd);

  await test('A1. fetch_license_by_key exposes subscription entitlement columns', () => {
    assert.ok(fetchFnStart > -1 && fetchFnEnd > -1, 'fetch_license_by_key definition must exist');
    assert.ok(fetchFnSrc.includes('subscription_status TEXT'), 'Must return subscription_status');
    assert.ok(fetchFnSrc.includes('current_period_end TIMESTAMPTZ'), 'Must return current_period_end');
    assert.ok(fetchFnSrc.includes('cancel_at_period_end BOOLEAN'), 'Must return cancel_at_period_end');
    assert.ok(
      fetchFnSrc.includes('l.subscription_status') &&
        fetchFnSrc.includes('l.current_period_end') &&
        fetchFnSrc.includes('l.cancel_at_period_end'),
      'Must SELECT the subscription columns'
    );
    assert.ok(!fetchFnSrc.includes('stripe_subscription_id'), 'Must NOT expose stripe_subscription_id');
    assert.ok(!fetchFnSrc.includes('stripe_customer_id'), 'Must NOT expose stripe_customer_id');
    assert.ok(!fetchFnSrc.includes('customer_email'), 'Must NOT expose customer_email');
  });

  await test('A2. Status lookup reports isActive=false for dead subscription (status column stale)', () => {
    // The Stripe webhook updates subscription columns, never `status` —
    // a canceled subscription can still show status='active'.
    clearInMemoryLicenses();
    seedInMemoryLicense({
      license_key: 'M1A2-SUBS-0001-TEST',
      tier: 'pro',
      status: 'active',
      subscription_status: 'canceled',
      cancel_at_period_end: false,
    });
    return getLicenseStatus('M1A2-SUBS-0001-TEST').then((res) => {
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.license.isActive, false, 'canceled subscription must be inactive');
      assert.strictEqual(res.license.subscriptionStatus, 'canceled');
    });
  });

  await test('A3. computeIsActive honors subscription policy and status', () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const base = { status: 'active' };

    // One-time license — plain status check
    assert.strictEqual(computeIsActiveSafe({ ...base }), true);
    assert.strictEqual(computeIsActiveSafe({ status: 'revoked' }), false);
    assert.strictEqual(computeIsActiveSafe({ status: 'expired' }), false);

    // Active subscription within period
    assert.strictEqual(
      computeIsActiveSafe({ ...base, subscription_status: 'active', current_period_end: future }),
      true
    );
    // Active subscription but period already lapsed (webhook delay edge case)
    assert.strictEqual(
      computeIsActiveSafe({ ...base, subscription_status: 'active', current_period_end: past }),
      false
    );
    // past_due inside the paid period → grace allowed
    assert.strictEqual(
      computeIsActiveSafe({ ...base, subscription_status: 'past_due', current_period_end: future }),
      true
    );
    // past_due after period end → denied
    assert.strictEqual(
      computeIsActiveSafe({ ...base, subscription_status: 'past_due', current_period_end: past }),
      false
    );
    // canceled with cancel_at_period_end still inside period → allowed
    assert.strictEqual(
      computeIsActiveSafe({
        ...base,
        subscription_status: 'canceled',
        cancel_at_period_end: true,
        current_period_end: future,
      }),
      true
    );
    // canceled outside period → denied
    assert.strictEqual(
      computeIsActiveSafe({
        ...base,
        subscription_status: 'canceled',
        cancel_at_period_end: false,
        current_period_end: past,
      }),
      false
    );
    // unpaid → denied immediately
    assert.strictEqual(computeIsActiveSafe({ ...base, subscription_status: 'unpaid' }), false);
    // Revoked record with active subscription → denied
    assert.strictEqual(
      computeIsActiveSafe({ status: 'revoked', subscription_status: 'active', current_period_end: future }),
      false
    );
  });

  await test('A4. Production RPC shape: subscription-only record drives isActive', () => {
    const rpcRow = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      license_key: 'M1A4-RPCS-0002-TEST',
      hwid: null,
      tier: 'pro',
      status: 'active', // stale — webhook never writes this column
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      subscription_status: 'unpaid',
      current_period_end: '2099-01-01T00:00:00Z',
      cancel_at_period_end: false,
    };
    setSupabaseClientForTests(fakeSupabaseClient({ fetchRows: [rpcRow] }));
    return getLicenseStatus('M1A4-RPCS-0002-TEST')
      .then((res) => {
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.license.isActive, false, 'unpaid subscription must be inactive');
        assert.strictEqual(res.license.subscriptionStatus, 'unpaid');
      })
      .finally(() => resetSupabaseClientForTests());
  });

  await test('A5. License lookup never leaks payment metadata', () => {
    clearInMemoryLicenses();
    seedInMemoryLicense({
      license_key: 'M1A5-NOPA-0003-TEST',
      tier: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_should_not_leak',
      stripe_customer_id: 'cus_should_not_leak',
      subscription_status: 'active',
      current_period_end: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    return lookupLicense('M1A5-NOPA-0003-TEST').then((rec) => {
      assert.ok(rec, 'record must be found');
      assert.ok(!('stripe_subscription_id' in rec), 'stripe_subscription_id must not be returned');
      assert.ok(!('stripe_customer_id' in rec), 'stripe_customer_id must not be returned');
      assert.strictEqual(rec.subscription_status, 'active', 'entitlement columns must be returned');
      assert.ok('current_period_end' in rec, 'current_period_end must be returned');
      assert.ok('cancel_at_period_end' in rec, 'cancel_at_period_end must be returned');
    });
  });

  await test('A6. Status endpoint exposes isActive and never the raw hwid', () => {
    clearInMemoryLicenses();
    seedInMemoryLicense({
      license_key: 'M1A6-STAT-0004-TEST',
      tier: 'pro',
      status: 'active',
      subscription_status: 'active',
      current_period_end: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    return callLicenseRoute(
      'GET',
      '/status?licenseKey=M1A6-STAT-0004-TEST',
      null,
      {},
      'step76-m1-status'
    ).then((resp) => {
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.data.success, true);
      assert.strictEqual(typeof resp.data.license.isActive, 'boolean');
      assert.strictEqual(resp.data.license.isActive, true);
      assert.ok(!('hwid' in resp.data.license), 'status response must not contain hwid');
      assert.ok('hasHwid' in resp.data.license, 'status response exposes hasHwid boolean only');
    });
  });

  await test('A7. Electron startup denies entitlement when server says isActive=false', async () => {
    const key = 'M1EL-ELCT-0001-TEST';
    const hwidVal = await getHardwareId();
    const dir = path.join(TMP_DIR, 'm1-electron');
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date().toISOString();
    store.saveLicenseData(
      {
        licenseKey: key,
        hwid: hwidVal,
        tier: 'pro',
        status: 'active',
        activatedAt: now,
        lastValidatedAt: now,
        lastSeenAt: now,
      },
      dir
    );

    try {
      // Server-authoritative denial: subscription dead, status column stale
      setMockLicense(key, {
        id: '99999999-9999-9999-9999-999999999999',
        license_key: key,
        hwid: hwidVal,
        tier: 'pro',
        status: 'active',
        isActive: false,
        subscriptionStatus: 'canceled',
        created_at: now,
        updated_at: now,
      });
      const denied = await validateStartup(dir);
      assert.strictEqual(denied.isValid, false, 'inactive subscription must block startup');
      assert.strictEqual(denied.reason, 'SUBSCRIPTION_INACTIVE');

      // Positive control — entitlement restored
      setMockLicense(key, {
        id: '99999999-9999-9999-9999-999999999999',
        license_key: key,
        hwid: hwidVal,
        tier: 'pro',
        status: 'active',
        isActive: true,
        subscriptionStatus: 'active',
        created_at: now,
        updated_at: now,
      });
      const allowed = await validateStartup(dir);
      assert.strictEqual(allowed.isValid, true, 'active entitlement must allow startup');
      assert.strictEqual(allowed.isOffline, false);
    } finally {
      resetMockDb();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // B. M-2 — Legacy signature scheme removal
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── B. M-2 — Legacy signature scheme removal ───');

  await test('B1. store.js contains no legacy signature code', () => {
    assert.ok(!storeSrc.includes('computeSignatureLegacy'), 'computeSignatureLegacy must be removed');
    assert.ok(
      !/createHmac\(\s*'sha256'\s*,\s*hwid\s*\)/.test(storeSrc),
      'HWID-keyed HMAC must not exist in store.js'
    );
    assert.ok(storeSrc.includes('deriveSigningKey'), 'Current signing scheme must remain');
  });

  await test('B2. store exports no legacy signature API', () => {
    assert.strictEqual(store.computeSignatureLegacy, undefined, 'computeSignatureLegacy must not be exported');
    assert.strictEqual(typeof store.computeSignature, 'function');
    assert.strictEqual(typeof store.encryptData, 'function');
  });

  await test('B3. Legacy-signed license file is rejected (no transparent upgrade)', () => {
    const dir = path.join(TMP_DIR, 'legacy-sig');
    fs.mkdirSync(dir, { recursive: true });

    const payload = {
      licenseKey: 'M2LG-ACY2-0001-TEST',
      hwid: 'c'.repeat(64),
      tier: 'pro',
      status: 'active',
      activatedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    // Exactly what the removed legacy scheme would have produced
    payload.signature = crypto
      .createHmac('sha256', payload.hwid)
      .update(`${payload.licenseKey}:${payload.hwid}:${payload.tier}:${payload.status}:${payload.activatedAt}`)
      .digest('hex');
    payload.savedAt = new Date().toISOString();

    fs.writeFileSync(path.join(dir, 'license.enc'), store.encryptData(JSON.stringify(payload)));

    const loaded = store.loadLicenseData(dir);
    assert.strictEqual(loaded, null, 'Legacy-signed payload must not be trusted');
    const leftovers = fs.readdirSync(dir).filter((f) => f !== 'signing-secret.enc');
    assert.deepStrictEqual(leftovers, ['license.enc'], 'Must not re-save an upgraded record');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C. L-1 — Anon EXECUTE revoked; backend-API-only client
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── C. L-1 — Anon EXECUTE revoked; API-only client ───');

  await test('C1. License RPCs are revoked from PUBLIC/anon/authenticated', () => {
    for (const fn of ['fetch_license_by_key', 'bind_license_hwid']) {
      assert.ok(
        migrationSrc.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}(TEXT) FROM PUBLIC;`) ||
          migrationSrc.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}(TEXT, TEXT) FROM PUBLIC;`),
        `${fn} must be revoked from PUBLIC`
      );
      assert.ok(
        migrationSrc.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}(TEXT) FROM anon;`) ||
          migrationSrc.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}(TEXT, TEXT) FROM anon;`),
        `${fn} must be revoked from anon`
      );
      assert.ok(
        migrationSrc.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}(TEXT) FROM authenticated;`) ||
          migrationSrc.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}(TEXT, TEXT) FROM authenticated;`),
        `${fn} must be revoked from authenticated`
      );
      assert.ok(
        migrationSrc.includes(`GRANT EXECUTE ON FUNCTION public.${fn}(TEXT) TO service_role;`) ||
          migrationSrc.includes(`GRANT EXECUTE ON FUNCTION public.${fn}(TEXT, TEXT) TO service_role;`),
        `${fn} must be granted to service_role only`
      );
    }
  });

  await test('C2. Migration grants no EXECUTE to any public role', () => {
    const badGrant = /GRANT\s+EXECUTE[\s\S]{0,200}?\bTO\s+(anon|authenticated|PUBLIC)\b/i;
    assert.ok(!badGrant.test(migrationSrc), 'No EXECUTE grant may target anon/authenticated/PUBLIC');
  });

  await test('C3. Electron main process contains no Supabase client or key', () => {
    const offenders = [];
    for (const file of walkJsFiles(path.join(root, 'src', 'main'))) {
      const src = fs.readFileSync(file, 'utf8');
      if (/@supabase\/supabase-js|SUPABASE_ANON_KEY|\.rpc\(/.test(src)) {
        offenders.push(path.relative(root, file));
      }
    }
    assert.deepStrictEqual(offenders, [], `Supabase client residue found in: ${offenders.join(', ')}`);
  });

  await test('C4. Vite build injects backend API URL — never Supabase credentials', () => {
    assert.ok(viteSrc.includes('__API_BASE_URL__'), '__API_BASE_URL__ must be injected at build time');
    assert.ok(viteSrc.includes('REEL_CUTTER_API_URL'), 'Backend URL must be env-overridable');
    assert.ok(!viteSrc.includes('__SUPABASE_ANON_KEY__'), 'No anon key in build config');
    assert.ok(!viteSrc.includes('__SUPABASE_URL__'), 'No Supabase project URL in build config');
    assert.ok(!/SERVICE_ROLE/i.test(viteSrc), 'No service-role key in build config');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D. L-2 — bind result verification
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── D. L-2 — bind result verification ───');

  await test('D1. Empty RPC bind result is never reported as success', () => {
    setSupabaseClientForTests(fakeSupabaseClient({ bindRows: [] }));
    return bindLicense('D2A-BIND-0001-TEST', HWID_A)
      .then((result) => {
        assert.strictEqual(result.success, false, 'empty bind result must fail');
        assert.strictEqual(result.error, 'LICENSE_BIND_FAILED');
      })
      .finally(() => resetSupabaseClientForTests());
  });

  await test('D2. Bind returning a row for a different hwid is reported as HWID_MISMATCH', () => {
    setSupabaseClientForTests(
      fakeSupabaseClient({ bindRows: [{ license_key: 'D2B-BIND-0002-TEST', hwid: HWID_B, status: 'active' }] })
    );
    return bindLicense('D2B-BIND-0002-TEST', HWID_A)
      .then((result) => {
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error, 'HWID_MISMATCH');
      })
      .finally(() => resetSupabaseClientForTests());
  });

  await test('D3. Bind returning the requested hwid row succeeds', () => {
    setSupabaseClientForTests(
      fakeSupabaseClient({ bindRows: [{ license_key: 'D2C-BIND-0003-TEST', hwid: HWID_A, status: 'active' }] })
    );
    return bindLicense('D2C-BIND-0003-TEST', HWID_A)
      .then((result) => {
        assert.strictEqual(result.success, true);
      })
      .finally(() => resetSupabaseClientForTests());
  });

  await test('D4. Activation surfaces ACTIVATION_FAILED when the bind loses the race', () => {
    setSupabaseClientForTests(
      fakeSupabaseClient({
        fetchRows: [
          {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            license_key: 'D2D-RACE-0004-TEST',
            hwid: null,
            tier: 'pro',
            status: 'active',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            subscription_status: null,
            current_period_end: null,
            cancel_at_period_end: false,
          },
        ],
        bindRows: [],
      })
    );
    return activateLicense('D2D-RACE-0004-TEST', HWID_A)
      .then((result) => {
        assert.strictEqual(result.success, false, 'lost bind race must not activate');
        assert.strictEqual(result.code, 'ACTIVATION_FAILED');
      })
      .finally(() => resetSupabaseClientForTests());
  });

  await test('D5. Activation surfaces HWID_MISMATCH when bind confirms a foreign hwid', () => {
    setSupabaseClientForTests(
      fakeSupabaseClient({
        fetchRows: [
          {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            license_key: 'D2E-FORE-0005-TEST',
            hwid: null,
            tier: 'pro',
            status: 'active',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            subscription_status: null,
            current_period_end: null,
            cancel_at_period_end: false,
          },
        ],
        bindRows: [{ license_key: 'D2E-FORE-0005-TEST', hwid: HWID_B, status: 'active' }],
      })
    );
    return activateLicense('D2E-FORE-0005-TEST', HWID_A)
      .then((result) => {
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.code, 'HWID_MISMATCH');
      })
      .finally(() => resetSupabaseClientForTests());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E. L-3 — Admin revoke / reset-hwid endpoints
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── E. L-3 — Admin license revoke / reset-hwid ───');

  const adminSession = setupAdminSession();
  clearInMemoryAuditLog();
  clearInMemoryLicenses();

  await test('E1. Revoke requires a verified admin session', () =>
    callAdminRoute('POST', '/licenses/M1A6-STAT-0004-TEST/revoke', {}, {}, 'step76-e3').then((resp) => {
      assert.strictEqual(resp.status, 401);
      assert.strictEqual(resp.data.error.code, 'UNAUTHORIZED');
    }));

  await test('E2. Malformed license key in path is rejected with 400', () =>
    callAdminRoute('POST', '/licenses/not-a-valid-key/revoke', {}, adminSession.headers, 'step76-e3').then(
      (resp) => {
        assert.strictEqual(resp.status, 400);
        assert.strictEqual(resp.data.error.code, 'INVALID_INPUT');
      }
    ));

  await test('E3. Revoking an unknown key returns 404', () =>
    callAdminRoute('POST', '/licenses/ZZZZ-ZZZZ-9999-TEST/revoke', {}, adminSession.headers, 'step76-e3').then(
      (resp) => {
        assert.strictEqual(resp.status, 404);
        assert.strictEqual(resp.data.error.code, 'LICENSE_INVALID');
      }
    ));

  await test('E4. Revoke marks the license revoked and writes an audit record', async () => {
    const key = 'ADMN-RVK2-0001-TEST';
    seedInMemoryLicense({ license_key: key, tier: 'pro', status: 'active', hwid: HWID_A });
    clearInMemoryAuditLog();

    const resp = await callAdminRoute('POST', `/licenses/${key}/revoke`, {}, adminSession.headers, 'step76-e3');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.success, true);
    assert.strictEqual(resp.data.license.status, 'revoked');
    assert.strictEqual(resp.data.already_revoked, false);

    const rec = await lookupLicense(key);
    assert.strictEqual(rec.status, 'revoked');
    assert.strictEqual(rec.hwid, HWID_A, 'revoke must not touch the hwid binding');

    const audit = getInMemoryAuditLog();
    assert.strictEqual(audit.length, 1, 'exactly one audit record expected');
    assert.strictEqual(audit[0].action, 'license_revoked');
    assert.strictEqual(audit[0].target_type, 'license');
    assert.strictEqual(audit[0].target_id, null, 'license key is not a UUID — target_id must be null');
    assert.strictEqual(audit[0].metadata.license_key, key);
    assert.strictEqual(audit[0].metadata.already_revoked, false);
    assert.strictEqual(audit[0].admin_id, 'step76-test-admin');
  });

  await test('E5. Revoke is idempotent and audits the repeat', async () => {
    const key = 'ADMN-RVK2-0001-TEST';
    const resp = await callAdminRoute('POST', `/licenses/${key}/revoke`, {}, adminSession.headers, 'step76-e3');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.already_revoked, true);

    const audit = getInMemoryAuditLog();
    assert.strictEqual(audit.length, 2, 'repeat revoke must be audited too');
    assert.strictEqual(audit[1].metadata.already_revoked, true);
  });

  await test('E6. Reset-hwid clears the binding without touching status/tier', async () => {
    const key = 'ADMN-RST2-0002-TEST';
    seedInMemoryLicense({
      license_key: key,
      tier: 'standard',
      status: 'active',
      hwid: HWID_A,
      subscription_status: 'active',
      current_period_end: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const resp = await callAdminRoute(
      'POST',
      `/licenses/${key}/reset-hwid`,
      {},
      adminSession.headers,
      'step76-e3'
    );
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.had_hwid, true);
    assert.strictEqual(resp.data.already_unbound, false);

    const rec = await lookupLicense(key);
    assert.strictEqual(rec.hwid, null, 'hwid must be cleared');
    assert.strictEqual(rec.status, 'active', 'reset must not change status');
    assert.strictEqual(rec.tier, 'standard', 'reset must not change tier');
    assert.strictEqual(rec.subscription_status, 'active', 'reset must not change subscription columns');

    const audit = getInMemoryAuditLog();
    const resetAudit = audit.find((a) => a.action === 'license_hwid_reset');
    assert.ok(resetAudit, 'license_hwid_reset audit record expected');
    assert.strictEqual(resetAudit.metadata.license_key, key);
    assert.strictEqual(resetAudit.metadata.had_hwid, true);
    assert.strictEqual(resetAudit.target_id, null);
  });

  await test('E7. Reset-hwid is idempotent for unbound licenses', async () => {
    const key = 'ADMN-RST2-0002-TEST';
    const resp = await callAdminRoute(
      'POST',
      `/licenses/${key}/reset-hwid`,
      {},
      adminSession.headers,
      'step76-e3'
    );
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.already_unbound, true);
    assert.strictEqual(resp.data.had_hwid, false);
  });

  await test('E8. Reset-hwid on an unknown key returns 404', () =>
    callAdminRoute(
      'POST',
      '/licenses/ZZZZ-ZZZZ-9998-TEST/reset-hwid',
      {},
      adminSession.headers,
      'step76-e3'
    ).then((resp) => {
      assert.strictEqual(resp.status, 404);
      assert.strictEqual(resp.data.error.code, 'LICENSE_INVALID');
    }));

  await test('E9. Reset-hwid then admin revoke — full recovery flow over HTTP routes', async () => {
    const key = 'ADMN-E2E9-0003-TEST';
    seedInMemoryLicense({ license_key: key, tier: 'pro', status: 'active', hwid: HWID_A });

    // Device A holds the license; device B is rejected
    const denied = await callLicenseRoute(
      'POST',
      '/activate',
      { licenseKey: key, hwid: HWID_B },
      {},
      'step76-e9'
    );
    assert.strictEqual(denied.status, 403);
    assert.strictEqual(denied.data.error.code, 'HWID_MISMATCH');

    // Admin frees the license
    const reset = await callAdminRoute(
      'POST',
      `/licenses/${key}/reset-hwid`,
      {},
      adminSession.headers,
      'step76-e3'
    );
    assert.strictEqual(reset.status, 200);

    // Device B can now activate
    const activated = await callLicenseRoute(
      'POST',
      '/activate',
      { licenseKey: key, hwid: HWID_B },
      {},
      'step76-e9'
    );
    assert.strictEqual(activated.status, 200);
    assert.strictEqual(activated.data.success, true);

    // Admin revokes; device B is locked out
    const revoked = await callAdminRoute(
      'POST',
      `/licenses/${key}/revoke`,
      {},
      adminSession.headers,
      'step76-e3'
    );
    assert.strictEqual(revoked.status, 200);

    const locked = await callLicenseRoute(
      'POST',
      '/activate',
      { licenseKey: key, hwid: HWID_B },
      {},
      'step76-e9'
    );
    assert.strictEqual(locked.status, 403);
    assert.strictEqual(locked.data.error.code, 'LICENSE_REVOKED');
  });

  await test('E10. Audit metadata carries no secret-like keys', () => {
    const audit = getInMemoryAuditLog();
    assert.ok(audit.length > 0, 'audit records expected');
    const forbidden = /(password|secret|token|service_role|authorization|credential|session)/i;
    for (const record of audit) {
      const keys = Object.keys(record.metadata || {});
      const bad = keys.filter((k) => forbidden.test(k));
      assert.deepStrictEqual(bad, [], `forbidden metadata keys: ${bad.join(', ')}`);
    }
  });

  adminSession.restore();
  clearInMemoryAuditLog();

  // ═══════════════════════════════════════════════════════════════════════════
  // F. L-4 — Strict invalid-key rate limiting
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── F. L-4 — Strict invalid-key rate limiting ───');

  await test('F1. Sixth unknown key within a minute is rejected with 429', async () => {
    const ip = 'step76-l4-f1';
    const statuses = [];
    for (let i = 1; i <= 6; i++) {
      const key = `ZZ0${i}-AAAA-AAAA-AAAA`;
      const resp = await callLicenseRoute('GET', `/status?licenseKey=${key}`, null, {}, ip);
      statuses.push(resp);
    }
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(statuses[i].status, 404, `attempt ${i + 1} must return 404`);
      assert.strictEqual(statuses[i].data.error.code, 'LICENSE_INVALID');
    }
    assert.strictEqual(statuses[5].status, 429, 'sixth unknown key must be rate limited');
    assert.strictEqual(statuses[5].data.error.code, 'RATE_LIMITED');
    assert.ok(statuses[5].headers['Retry-After'], 'Retry-After header expected');
    assert.strictEqual(statuses[5].headers['X-RateLimit-Limit'], '5');
  });

  await test('F2. Format-invalid keys do not consume the invalid-key budget', async () => {
    const ip = 'step76-l4-f2';
    for (let i = 1; i <= 5; i++) {
      const resp = await callLicenseRoute(
        'GET',
        `/status?licenseKey=ZZ1${i}-AAAA-AAAA-AAAA`,
        null,
        {},
        ip
      );
      assert.strictEqual(resp.status, 404, `attempt ${i} must return 404`);
    }
    // Budget now full — a malformed key is still a plain 400 (never counted)
    const malformed = await callLicenseRoute('GET', '/status?licenseKey=not-a-key', null, {}, ip);
    assert.strictEqual(malformed.status, 400);
    assert.strictEqual(malformed.data.error.code, 'INVALID_INPUT');
    // Next format-valid unknown key trips the guard
    const tripped = await callLicenseRoute('GET', '/status?licenseKey=ZZ16-AAAA-AAAA-AAAA', null, {}, ip);
    assert.strictEqual(tripped.status, 429);
  });

  await test('F3. Unknown-key budget is shared across license endpoints', async () => {
    const ip = 'step76-l4-f3';
    // 3 unknown lookups on /status
    for (let i = 1; i <= 3; i++) {
      const resp = await callLicenseRoute(
        'GET',
        `/status?licenseKey=ZZ2${i}-AAAA-AAAA-AAAA`,
        null,
        {},
        ip
      );
      assert.strictEqual(resp.status, 404);
    }
    // 2 unknown activations on /activate (same strict bucket)
    for (let i = 4; i <= 5; i++) {
      const resp = await callLicenseRoute(
        'POST',
        '/activate',
        { licenseKey: `ZZ2${i}-AAAA-AAAA-AAAA`, hwid: HWID_A },
        {},
        ip
      );
      assert.strictEqual(resp.status, 404, `activation ${i} must return 404`);
      assert.strictEqual(resp.data.error.code, 'LICENSE_INVALID');
    }
    // 6th unknown attempt — any endpoint — is blocked
    const blocked = await callLicenseRoute(
      'POST',
      '/activate',
      { licenseKey: 'ZZ26-AAAA-AAAA-AAAA', hwid: HWID_A },
      {},
      ip
    );
    assert.strictEqual(blocked.status, 429);
    assert.strictEqual(blocked.data.error.code, 'RATE_LIMITED');
  });

  await test('F4. Budget exhaustion does not lock out valid license holders', async () => {
    const ip = 'step76-l4-f4';
    clearInMemoryLicenses();
    seedInMemoryLicense({ license_key: 'GOOD-KEY0-0001-TEST', tier: 'pro', status: 'active', hwid: HWID_A });

    for (let i = 1; i <= 6; i++) {
      await callLicenseRoute('GET', `/status?licenseKey=ZZ3${i}-AAAA-AAAA-AAAA`, null, {}, ip);
    }
    const valid = await callLicenseRoute(
      'GET',
      '/status?licenseKey=GOOD-KEY0-0001-TEST',
      null,
      {},
      ip
    );
    assert.strictEqual(valid.status, 200, 'valid keys must still resolve while budget is exhausted');
    assert.strictEqual(valid.data.success, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Migration shape guards
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── G. Migration shape guards ───');

  const bindFnStart = migrationSrc.indexOf('CREATE OR REPLACE FUNCTION public.bind_license_hwid');
  const bindFnEnd = migrationSrc.indexOf('-- L-1: service_role only');
  const bindFnSrc = migrationSrc.substring(bindFnStart, bindFnEnd);

  await test('G1. bind_license_hwid enforces format, status, and null-hwid guards', () => {
    assert.ok(bindFnStart > -1 && bindFnEnd > -1, 'bind_license_hwid definition must exist');
    assert.ok(bindFnSrc.includes(`!~ '^[a-f0-9]{64}$'`), 'Malformed hwid must be rejected');
    assert.ok(bindFnSrc.includes(`AND hwid IS NULL`), 'Bind must require an unbound license');
    assert.ok(bindFnSrc.includes(`AND status = 'active'`), 'Bind must require an active license');
    assert.ok(
      bindFnSrc.includes('AND l.hwid = v_normalized_hwid'),
      'Row must only be returned when bound to the REQUESTED hwid'
    );
  });

  await test('G2. Both RPCs pin SET search_path = public', () => {
    const pinned = migrationSrc.match(/SET search_path = public/g) || [];
    assert.ok(pinned.length >= 2, 'Each function must pin search_path');
  });

  await test('G3. Migration is self-describing about STEP 76 scope', () => {
    assert.ok(migrationSrc.includes('STEP 76'), 'Migration must identify STEP 76');
    assert.ok(migrationSrc.includes('L-1'), 'Must reference L-1');
    assert.ok(migrationSrc.includes('L-2'), 'Must reference L-2');
    assert.ok(migrationSrc.includes('M-1'), 'Must reference M-1');
  });

  // ─── Cleanup & summary ─────────────────────────────────────────────────────

  resetSupabaseClientForTests();
  clearInMemoryLicenses();
  clearInMemoryAuditLog();
  resetMockDb();
  cleanupTmp();

  console.log('\n======================================================');
  console.log(`🔐 STEP 76 Test Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('======================================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

function computeIsActiveSafe(record) {
  // Imported lazily to keep the helper next to its assertions
  const { computeIsActive } = require('../server/services/licenseService');
  return computeIsActive(record);
}

runTests().catch((err) => {
  console.error('STEP 76 test runner crashed:', err);
  process.exit(1);
});
