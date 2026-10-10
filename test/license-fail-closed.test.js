'use strict';

/**
 * License Production Fail-Closed Tests
 *
 * Verifies that server/services/licenseService.js never answers a production
 * license operation from the in-memory stores:
 *
 *   A. Production + Supabase unconfigured  → fail closed (no in-memory use)
 *   B. Production + Supabase RPC/DB errors → fail closed (no false success)
 *   C. Production + Supabase working (injected fakes) → normal behavior
 *   D. Development/test in-memory behavior unchanged
 *   E. Route surface stays a safe generic 500 (no internals leaked)
 *
 * Runs entirely offline against injected fake Supabase clients. No production
 * server, database, or .env file is touched.
 */

const assert = require('assert');

// Modules MUST be loaded before any NODE_ENV=production toggle — server/config
// resolves Stripe secrets at require time and throws when production vars are
// missing.
const licenseService = require('../server/services/licenseService');
const licenseRouter = require('../server/routes/license');

const {
  lookupLicense,
  bindLicense,
  activateLicense,
  validateLicense,
  getLicenseStatus,
  linkLicenseToUser,
  getLicensesByUserId,
  revokeLicenseKey,
  resetLicenseHwid,
  seedInMemoryLicense,
  clearInMemoryLicenses,
  inMemoryLicenses,
  LicenseServiceUnavailableError,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
} = licenseService;

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

/**
 * Runs fn with NODE_ENV=production and the given Supabase client injected
 * (null simulates a production deployment with no Supabase configuration).
 * Restores both afterwards.
 */
async function inProduction(client, fn) {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  setSupabaseClientForTests(client);
  try {
    return await fn();
  } finally {
    resetSupabaseClientForTests();
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
}

/**
 * Runs fn as a development/test process (NODE_ENV=test) with the Supabase
 * client forced to null so the in-memory path is exercised hermetically.
 */
async function inDev(fn) {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  setSupabaseClientForTests(null);
  try {
    return await fn();
  } finally {
    resetSupabaseClientForTests();
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
}

// ─── Fakes ───────────────────────────────────────────────────────────────────

const RPC_DOWN = { message: 'internal error: could not connect to database' };
const TABLE_DOWN = { message: 'internal error: permission denied for table licenses' };

const HWID_A = 'a'.repeat(64);
const HWID_B = 'b'.repeat(64);
const USER_ID = '11111111-2222-3333-4444-555555555555';

function fakeRpcClient({ fetchRows = [], fetchError = null, bindRows = [], bindError = null } = {}) {
  return {
    rpc: async (name) => {
      if (name === 'fetch_license_by_key') return { data: fetchRows, error: fetchError };
      if (name === 'bind_license_hwid') return { data: bindRows, error: bindError };
      return { data: null, error: { message: `unexpected rpc: ${name}` } };
    },
  };
}

// Minimal thenable query-builder fake covering the chains licenseService uses:
// update().eq().select(), update().eq(), select().eq().order()
function fakeTableClient({ rows = [], error = null } = {}) {
  return {
    from: () => {
      const builder = {
        update() { return builder; },
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: error ? null : rows, error }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

function rpcRow(overrides = {}) {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    license_key: 'PROD-WORK-0003-TEST',
    hwid: null,
    tier: 'pro',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    subscription_status: null,
    current_period_end: null,
    cancel_at_period_end: false,
    ...overrides,
  };
}

function callRoute(router, method, urlPath, body, headers = {}, ip = 'license-fail-closed') {
  return new Promise((resolve) => {
    let statusCode = 200;
    const responseHeaders = {};
    const urlObj = new URL(urlPath, 'http://localhost');
    const req = {
      method,
      url: urlPath,
      body,
      headers,
      query: Object.fromEntries(urlObj.searchParams),
      ip,
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => resolve({ status: statusCode, data, raw: JSON.stringify(data), headers: responseHeaders }),
      set: (key, value) => {
        responseHeaders[key] = value;
        return res;
      },
      get: (key) => responseHeaders[key] || null,
    };
    router.handle(req, res, () => resolve({ status: statusCode, data: null, raw: '', headers: responseHeaders }));
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n======================================================');
  console.log('🔒 License Production Fail-Closed Tests');
  console.log('======================================================\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // A. Production + Supabase unconfigured
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── A. Production without Supabase configuration ───');

  await test('A1. Lookup fails closed instead of returning an in-memory record', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL1-LOOK-0001-TEST', tier: 'pro', status: 'active', hwid: HWID_A });
      await assert.rejects(
        () => lookupLicense('FCL1-LOOK-0001-TEST'),
        LicenseServiceUnavailableError,
        'production lookup without Supabase must throw, not read memory'
      );
    })
  );

  await test('A2. Bind fails closed and does not bind through the in-memory store', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL2-BIND-0002-TEST', tier: 'pro', status: 'active', hwid: null });
      const result = await bindLicense('FCL2-BIND-0002-TEST', HWID_A);
      assert.strictEqual(result.success, false, 'bind must not report success');
      assert.strictEqual(result.error, 'LICENSE_BIND_FAILED');
      assert.strictEqual(inMemoryLicenses.get('FCL2-BIND-0002-TEST').hwid, null, 'memory hwid must stay unbound');
    })
  );

  await test('A3. Validate, activate, and status all fail closed', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL3-VALD-0003-TEST', tier: 'pro', status: 'active', hwid: HWID_A });
      await assert.rejects(() => validateLicense('FCL3-VALD-0003-TEST', HWID_A), LicenseServiceUnavailableError);
      await assert.rejects(() => activateLicense('FCL3-VALD-0003-TEST', HWID_A), LicenseServiceUnavailableError);
      await assert.rejects(() => getLicenseStatus('FCL3-VALD-0003-TEST'), LicenseServiceUnavailableError);
    })
  );

  await test('A4. Revoke fails closed and does not revoke the in-memory record', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL4-REVK-0004-TEST', tier: 'pro', status: 'active', hwid: HWID_A });
      const result = await revokeLicenseKey('FCL4-REVK-0004-TEST');
      assert.strictEqual(result.success, false, 'revoke must not report success');
      assert.strictEqual(result.code, 'OPERATION_FAILED');
      assert.strictEqual(inMemoryLicenses.get('FCL4-REVK-0004-TEST').status, 'active', 'memory status must stay active');
    })
  );

  await test('A5. HWID reset fails closed and does not clear the in-memory binding', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL5-RSTH-0005-TEST', tier: 'pro', status: 'active', hwid: HWID_A });
      const result = await resetLicenseHwid('FCL5-RSTH-0005-TEST');
      assert.strictEqual(result.success, false, 'reset must not report success');
      assert.strictEqual(result.code, 'OPERATION_FAILED');
      assert.strictEqual(inMemoryLicenses.get('FCL5-RSTH-0005-TEST').hwid, HWID_A, 'memory hwid must stay bound');
    })
  );

  await test('A6. linkLicenseToUser fails closed instead of claiming a memory-only link', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL6-LINK-0006-TEST', tier: 'pro', status: 'active', user_id: null });
      const result = await linkLicenseToUser('FCL6-LINK-0006-TEST', USER_ID);
      assert.strictEqual(result.success, false, 'link must not report success');
      assert.strictEqual(result.error, 'SUPABASE_UNAVAILABLE');
      assert.strictEqual(inMemoryLicenses.get('FCL6-LINK-0006-TEST').user_id, null, 'memory user_id must stay null');
    })
  );

  await test('A7. getLicensesByUserId fails closed instead of listing in-memory licenses', () =>
    inProduction(null, async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({
        license_key: 'FCL7-LIST-0007-TEST',
        tier: 'pro',
        status: 'active',
        user_id: USER_ID,
      });
      await assert.rejects(() => getLicensesByUserId(USER_ID), LicenseServiceUnavailableError);
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Production + Supabase configured but failing
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── B. Production with failing Supabase operations ───');

  await test('B1. Lookup RPC error does not fall back to in-memory records', () =>
    inProduction(fakeRpcClient({ fetchError: RPC_DOWN }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL8-LOOK-0008-TEST', tier: 'pro', status: 'active', hwid: HWID_A });
      await assert.rejects(() => lookupLicense('FCL8-LOOK-0008-TEST'), LicenseServiceUnavailableError);
    })
  );

  await test('B2. Bind RPC error does not produce a false success via memory', () =>
    inProduction(fakeRpcClient({ bindError: RPC_DOWN }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL9-BIND-0009-TEST', tier: 'pro', status: 'active', hwid: null });
      const result = await bindLicense('FCL9-BIND-0009-TEST', HWID_A);
      assert.strictEqual(result.success, false, 'bind RPC error must not report success');
      assert.strictEqual(result.error, 'LICENSE_BIND_FAILED');
      assert.strictEqual(inMemoryLicenses.get('FCL9-BIND-0009-TEST').hwid, null);
    })
  );

  await test('B3. Activation surfaces a failure when the bind RPC errors', () =>
    inProduction(
      fakeRpcClient({
        fetchRows: [rpcRow({ license_key: 'FCL10-ACT-0010-TEST', hwid: null })],
        bindError: RPC_DOWN,
      }),
      async () => {
        const result = await activateLicense('FCL10-ACT-0010-TEST', HWID_A);
        assert.strictEqual(result.success, false, 'activation must not succeed on a bind RPC error');
        assert.strictEqual(result.code, 'ACTIVATION_FAILED');
      }
    )
  );

  await test('B4. Revoke update failure stays fail-closed', () =>
    inProduction(
      Object.assign(fakeRpcClient({ fetchRows: [rpcRow({ license_key: 'FCL11-REVK-0011-TEST' })] }), fakeTableClient({ error: TABLE_DOWN })),
      async () => {
        clearInMemoryLicenses();
        const result = await revokeLicenseKey('FCL11-REVK-0011-TEST');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.code, 'OPERATION_FAILED');
      }
    )
  );

  await test('B5. HWID-reset update failure stays fail-closed', () =>
    inProduction(
      Object.assign(
        fakeRpcClient({ fetchRows: [rpcRow({ license_key: 'FCL12-RST-0012-TEST', hwid: HWID_A })] }),
        fakeTableClient({ error: TABLE_DOWN })
      ),
      async () => {
        clearInMemoryLicenses();
        const result = await resetLicenseHwid('FCL12-RST-0012-TEST');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.code, 'OPERATION_FAILED');
      }
    )
  );

  await test('B6. linkLicenseToUser update failure does not fall back to memory', () =>
    inProduction(fakeTableClient({ error: TABLE_DOWN }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL13-LINK-0013-TEST', tier: 'pro', status: 'active', user_id: null });
      const result = await linkLicenseToUser('FCL13-LINK-0013-TEST', USER_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'SUPABASE_UNAVAILABLE');
      assert.strictEqual(inMemoryLicenses.get('FCL13-LINK-0013-TEST').user_id, null);
    })
  );

  await test('B7. getLicensesByUserId query failure does not answer from memory', () =>
    inProduction(fakeTableClient({ error: TABLE_DOWN }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL14-LIST-0014-TEST', tier: 'pro', status: 'active', user_id: USER_ID });
      await assert.rejects(() => getLicensesByUserId(USER_ID), LicenseServiceUnavailableError);
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Production + Supabase working (injected fakes)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── C. Production with healthy Supabase-backed operations ───');

  await test('C1. Lookup returns the Supabase row, never a shadowed memory record', () =>
    inProduction(fakeRpcClient({ fetchRows: [rpcRow({ license_key: 'FCL15-WORK-0015-TEST', tier: 'standard' })] }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL15-WORK-0015-TEST', tier: 'pro', status: 'active' });
      const rec = await lookupLicense('FCL15-WORK-0015-TEST');
      assert.ok(rec, 'record must be found');
      assert.strictEqual(rec.tier, 'standard', 'Supabase row must win over the in-memory record');
    })
  );

  await test('C2. Lookup for an unknown key returns null (not an in-memory hit)', () =>
    inProduction(fakeRpcClient({ fetchRows: [] }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FCL16-UNKN-0016-TEST', tier: 'pro', status: 'active' });
      const rec = await lookupLicense('FCL16-UNKN-0016-TEST');
      assert.strictEqual(rec, null);
    })
  );

  await test('C3. Bind succeeds when the RPC confirms the requested hwid', () =>
    inProduction(fakeRpcClient({ bindRows: [{ license_key: 'FCL17-BIND-0017-TEST', hwid: HWID_A, status: 'active' }] }), async () => {
      const result = await bindLicense('FCL17-BIND-0017-TEST', HWID_A);
      assert.strictEqual(result.success, true);
    })
  );

  await test('C4. Bind still rejects an empty RPC result and a foreign hwid', () =>
    inProduction(fakeRpcClient({ bindRows: [] }), async () => {
      const empty = await bindLicense('FCL18-BIND-0018-TEST', HWID_A);
      assert.strictEqual(empty.success, false);
      assert.strictEqual(empty.error, 'LICENSE_BIND_FAILED');

      setSupabaseClientForTests(
        fakeRpcClient({ bindRows: [{ license_key: 'FCL18-BIND-0018-TEST', hwid: HWID_B, status: 'active' }] })
      );
      const mismatch = await bindLicense('FCL18-BIND-0018-TEST', HWID_A);
      assert.strictEqual(mismatch.success, false);
      assert.strictEqual(mismatch.error, 'HWID_MISMATCH');
    })
  );

  await test('C5. Activation succeeds through lookup + bind RPCs', () =>
    inProduction(
      fakeRpcClient({
        fetchRows: [rpcRow({ license_key: 'FCL19-ACT-0019-TEST', hwid: null })],
        bindRows: [{ license_key: 'FCL19-ACT-0019-TEST', hwid: HWID_A, status: 'active' }],
      }),
      async () => {
        const result = await activateLicense('FCL19-ACT-0019-TEST', HWID_A);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.license.tier, 'pro');
      }
    )
  );

  await test('C6. Revoked-license and HWID-mismatch protections intact against Supabase rows', () =>
    inProduction(
      fakeRpcClient({
        fetchRows: [rpcRow({ license_key: 'FCL20-REVK-0020-TEST', status: 'revoked', hwid: HWID_A })],
      }),
      async () => {
        const revoked = await validateLicense('FCL20-REVK-0020-TEST', HWID_A);
        assert.strictEqual(revoked.success, false);
        assert.strictEqual(revoked.code, 'LICENSE_REVOKED');

        setSupabaseClientForTests(fakeRpcClient({ fetchRows: [rpcRow({ license_key: 'FCL20-MISM-0020-TEST', hwid: HWID_A })] }));
        const mismatch = await validateLicense('FCL20-MISM-0020-TEST', HWID_B);
        assert.strictEqual(mismatch.success, false);
        assert.strictEqual(mismatch.code, 'HWID_MISMATCH');

        const activation = await activateLicense('FCL20-MISM-0020-TEST', HWID_B);
        assert.strictEqual(activation.success, false);
        assert.strictEqual(activation.code, 'HWID_MISMATCH');
      }
    )
  );

  await test('C7. Status lookup is server-authoritative for subscription entitlement', () =>
    inProduction(
      fakeRpcClient({
        fetchRows: [
          rpcRow({
            license_key: 'FCL21-STAT-0021-TEST',
            status: 'active',
            subscription_status: 'unpaid',
            current_period_end: '2099-01-01T00:00:00Z',
          }),
        ],
      }),
      async () => {
        const result = await getLicenseStatus('FCL21-STAT-0021-TEST');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.license.isActive, false, 'unpaid subscription must be inactive');
        assert.strictEqual(result.license.subscriptionStatus, 'unpaid');
      }
    )
  );

  await test('C8. Revoke and HWID reset succeed against the Supabase table', () =>
    inProduction(
      Object.assign(
        fakeRpcClient({ fetchRows: [rpcRow({ license_key: 'FCL22-ADMN-0022-TEST', hwid: HWID_A })] }),
        fakeTableClient({ rows: [{ license_key: 'FCL22-ADMN-0022-TEST' }] })
      ),
      async () => {
        clearInMemoryLicenses();
        const revoked = await revokeLicenseKey('FCL22-ADMN-0022-TEST');
        assert.strictEqual(revoked.success, true);
        assert.strictEqual(revoked.alreadyRevoked, false);

        const reset = await resetLicenseHwid('FCL22-ADMN-0022-TEST');
        assert.strictEqual(reset.success, true);
        assert.strictEqual(reset.hadHwid, true);
      }
    )
  );

  await test('C9. Dashboard listing and user linking succeed against Supabase', () =>
    inProduction(fakeTableClient({ rows: [{ license_key: 'FCL23-LIST-0023-TEST', tier: 'pro', status: 'active' }] }), async () => {
      clearInMemoryLicenses();
      const licenses = await getLicensesByUserId(USER_ID);
      assert.strictEqual(licenses.length, 1);
      assert.strictEqual(licenses[0].license_key, 'FCL23-LIST-0023-TEST');

      setSupabaseClientForTests(fakeTableClient({ rows: [{ license_key: 'FCL23-LINK-0023-TEST' }] }));
      const linked = await linkLicenseToUser('FCL23-LINK-0023-TEST', USER_ID);
      assert.strictEqual(linked.success, true);
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Development / test in-memory behavior
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── D. Development/test in-memory behavior preserved ───');

  await test('D1. In-memory lookup, activation, validation, and status still work', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'DEV1-MEMR-0001-TEST', tier: 'pro', status: 'active', hwid: null });

      const activated = await activateLicense('DEV1-MEMR-0001-TEST', HWID_A);
      assert.strictEqual(activated.success, true, 'dev activation via memory must still work');
      assert.strictEqual(activated.license.tier, 'pro');

      const validated = await validateLicense('DEV1-MEMR-0001-TEST', HWID_A);
      assert.strictEqual(validated.success, true);

      const status = await getLicenseStatus('DEV1-MEMR-0001-TEST');
      assert.strictEqual(status.success, true);
      assert.strictEqual(status.license.isActive, true);
      assert.strictEqual(status.license.hasHwid, true);

      const rec = await lookupLicense('DEV1-MEMR-0001-TEST');
      assert.ok(rec);
      assert.strictEqual(rec.hwid, HWID_A);
    })
  );

  await test('D2. In-memory revoked-license and HWID-mismatch protections intact', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'DEV2-REVK-0002-TEST', tier: 'pro', status: 'revoked', hwid: HWID_A });
      const revoked = await validateLicense('DEV2-REVK-0002-TEST', HWID_A);
      assert.strictEqual(revoked.success, false);
      assert.strictEqual(revoked.code, 'LICENSE_REVOKED');

      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'DEV2-MISM-0002-TEST', tier: 'pro', status: 'active', hwid: HWID_A });
      const mismatch = await validateLicense('DEV2-MISM-0002-TEST', HWID_B);
      assert.strictEqual(mismatch.success, false);
      assert.strictEqual(mismatch.code, 'HWID_MISMATCH');

      const activation = await activateLicense('DEV2-MISM-0002-TEST', HWID_B);
      assert.strictEqual(activation.success, false);
      assert.strictEqual(activation.code, 'HWID_MISMATCH');
    })
  );

  await test('D3. In-memory revoke and HWID reset still work outside production', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'DEV3-ADMN-0003-TEST', tier: 'pro', status: 'active', hwid: HWID_A });

      const revoked = await revokeLicenseKey('DEV3-ADMN-0003-TEST');
      assert.strictEqual(revoked.success, true);
      assert.strictEqual((await lookupLicense('DEV3-ADMN-0003-TEST')).status, 'revoked');

      const reset = await resetLicenseHwid('DEV3-ADMN-0003-TEST');
      assert.strictEqual(reset.success, true);
      assert.strictEqual(reset.hadHwid, true);
      assert.strictEqual((await lookupLicense('DEV3-ADMN-0003-TEST')).hwid, null);
    })
  );

  await test('D4. In-memory user linking and dashboard listing still work', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'DEV4-LINK-0004-TEST', tier: 'pro', status: 'active', user_id: null });

      const linked = await linkLicenseToUser('DEV4-LINK-0004-TEST', USER_ID);
      assert.strictEqual(linked.success, true);

      const licenses = await getLicensesByUserId(USER_ID);
      assert.strictEqual(licenses.length, 1);
      assert.strictEqual(licenses[0].license_key, 'DEV4-LINK-0004-TEST');
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // E. Route surface stays safe
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── E. Safe public error responses ───');

  await test('E1. /status during a production outage returns a generic 500, no internals', () =>
    inProduction(fakeRpcClient({ fetchError: RPC_DOWN }), async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'FC24-HTTP-0024-TEST', tier: 'pro', status: 'active', hwid: HWID_A });

      const resp = await callRoute(licenseRouter, 'GET', '/status?licenseKey=FC24-HTTP-0024-TEST', null, {}, 'fail-closed-e1');
      assert.strictEqual(resp.status, 500, 'outage must surface as 500, never 200/404');
      assert.strictEqual(resp.data.success, false);
      assert.strictEqual(resp.data.error.code, 'INTERNAL_ERROR');

      const raw = resp.raw.toLowerCase();
      for (const forbidden of ['supabase', 'sql', 'stack', 'service_role', 'fetch_license_by_key', 'unavailable', 'rpc']) {
        assert.ok(!raw.includes(forbidden), `response must not leak "${forbidden}"`);
      }
    })
  );

  // ─── Cleanup & summary ─────────────────────────────────────────────────────

  resetSupabaseClientForTests();
  clearInMemoryLicenses();

  console.log('\n======================================================');
  console.log(`🔒 Fail-Closed Test Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('======================================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fail-closed test runner crashed:', err);
  process.exit(1);
});
