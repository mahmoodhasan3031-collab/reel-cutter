'use strict';

/**
 * License Generation Fail-Closed Tests (production)
 *
 * Verifies the Stripe-checkout license generation hardening:
 *
 *   A. Production + no Supabase client → createLicense throws, registry untouched
 *   B. Production + Supabase insert failure → no local in-memory fallback
 *   C. Webhook checkout passes requireRemote: true and rolls back its
 *      idempotency mark (HTTP 500 → Stripe retry) when creation fails
 *   D. Development/test in-memory fallback behavior unchanged
 *   E. getLicenseById: production failure throws (never serves registry);
 *      legitimate not-found returns null
 *   F. findLicenseBySubscriptionId: production failure throws instead of
 *      returning null (prevents duplicate creation / false event acks)
 *   G. updateLicenseSubscription: production failure throws, registry never
 *      mutated; not-found returns null
 *   H. updateLicenseEmailStatus: production failure throws, registry never
 *      mutated
 *   I. deleteLicenseById: production failure throws instead of reporting true
 *   J. Webhook subscription lifecycle: production DB failure → HTTP 500 +
 *      idempotency rollback (Stripe retry); dev/test flow unchanged
 *   K. Checkout email flow: license + email send succeed, email-status update
 *      fails → HTTP 500 + rollback; retry acks duplicate with exactly one email
 *      and the documented stale email_status limitation
 *
 * Runs entirely offline against injected fake Supabase clients and locally
 * signed Stripe webhook payloads. No production server, database, or .env
 * file is touched.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Stripe = require('stripe');

// Modules MUST be loaded before any NODE_ENV=production toggle — server/config
// resolves Stripe secrets at require time and throws when production vars are
// missing.
const config = require('../server/config');
const licenseGenerator = require('../server/services/licenseGenerator');
const webhookRouter = require('../server/routes/webhook');

const {
  createLicense,
  getLicenseById,
  findLicenseBySubscriptionId,
  updateLicenseSubscription,
  updateLicenseEmailStatus,
  deleteLicenseById,
  getInMemoryLicenses,
  seedInMemoryLicense,
  clearInMemoryLicenses,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
} = licenseGenerator;

const WEBHOOK_SOURCE = fs.readFileSync(path.join(__dirname, '../server/routes/webhook.js'), 'utf8');
const { getSentEmails, clearSentEmails } = require('../server/services/emailService');

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

/** Runs fn with NODE_ENV=production; restores the previous value afterwards. */
async function inProduction(fn) {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return await fn();
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
}

/** Runs fn as a development/test process. */
async function inDev(fn) {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    return await fn();
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
}

// ─── Fakes ───────────────────────────────────────────────────────────────────

const INSERT_ERROR = { message: 'permission denied for table licenses' };

// createLicense re-throws the Supabase error object, which fakes provide as a
// plain object (not an Error) — match on its message.
function isInsertFailure(err) {
  return !!(err && typeof err.message === 'string' && err.message.includes('permission denied'));
}

// Production fail-closed errors thrown by licenseGenerator's read/update/delete
// helpers (LicenseServiceUnavailableError — generic message, no DB details).
function isServiceUnavailable(err) {
  return Boolean(err) && err.name === 'LicenseServiceUnavailableError' && err.code === 'SERVICE_UNAVAILABLE';
}

// PostgREST "no rows matched" — a legitimate not-found, not a failure.
const NO_ROWS = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };
const DB_FAILURE = { code: '42501', message: 'permission denied for table licenses' };

/**
 * Minimal single-table Supabase fake for read/update/delete tests.
 *
 * - failWith: every chain resolves { data: null, error: failWith }
 * - failUpdateWith: only update chains fail with that error (reads succeed)
 * - otherwise insert/select/update/delete chains operate on the shared `rows`
 *   array (callers may pass it in to inspect mutations); empty selects resolve
 *   with the PostgREST no-rows error (legitimate not-found).
 */
function fakeDbClient({ rows = [], failWith = null, failUpdateWith = null, onInsert = null } = {}) {
  const table = rows;
  return {
    from: () => {
      const state = {};
      const builder = {
        insert(values) {
          state.op = 'insert';
          state.values = Array.isArray(values) ? values[0] : values;
          return builder;
        },
        update(values) {
          state.op = 'update';
          state.values = values;
          return builder;
        },
        delete() {
          state.op = 'delete';
          return builder;
        },
        select() { return builder; },
        eq() { return builder; },
        or() { return builder; },
        order() { return builder; },
        single() { return builder; },
        then(onFulfilled, onRejected) {
          if (state.op === 'update' && failUpdateWith) {
            return Promise.resolve({ data: null, error: failUpdateWith }).then(onFulfilled, onRejected);
          }
          if (failWith) {
            return Promise.resolve({ data: null, error: failWith }).then(onFulfilled, onRejected);
          }
          if (state.op === 'insert') {
            table.push(state.values);
            if (onInsert) onInsert(state.values);
            return Promise.resolve({ data: state.values, error: null }).then(onFulfilled, onRejected);
          }
          if (state.op === 'update') {
            const target = table[0];
            if (!target) {
              return Promise.resolve({ data: null, error: NO_ROWS }).then(onFulfilled, onRejected);
            }
            Object.assign(target, state.values);
            return Promise.resolve({ data: target, error: null }).then(onFulfilled, onRejected);
          }
          if (state.op === 'delete') {
            table.length = 0;
            return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
          }
          const found = table[0];
          if (found) {
            return Promise.resolve({ data: found, error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: null, error: NO_ROWS }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

/** Reads a single registry record by license_key (mode-independent). */
function registryRecord(licenseKey) {
  return getInMemoryLicenses().find((record) => record.license_key === licenseKey) || null;
}

/**
 * Minimal thenable query-builder fake covering every chain createLicense and
 * the webhook email path use: insert().select().single(), select().or().single(),
 * update().eq().select().single(). Realistic results: insert chains resolve to
 * the inserted record, update chains echo the written values, select chains
 * return the given row or the PostgREST no-rows error — never a bare
 * { data: null, error: null }.
 */
function fakeGeneratorClient({ row = null, error = null, onInsert = null } = {}) {
  return {
    from: () => {
      const state = {};
      const builder = {
        insert(values) {
          state.inserted = Array.isArray(values) ? values[0] : values;
          return builder;
        },
        update(values) {
          state.updated = values;
          return builder;
        },
        select() { return builder; },
        eq() { return builder; },
        or() { return builder; },
        order() { return builder; },
        single() { return builder; },
        then(onFulfilled, onRejected) {
          if (error) {
            return Promise.resolve({ data: null, error }).then(onFulfilled, onRejected);
          }
          if (state.inserted) {
            if (onInsert) onInsert(state.inserted);
            return Promise.resolve({ data: state.inserted, error: null }).then(onFulfilled, onRejected);
          }
          if (state.updated) {
            return Promise.resolve({ data: state.updated, error: null }).then(onFulfilled, onRejected);
          }
          if (row) {
            return Promise.resolve({ data: row, error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: null, error: NO_ROWS }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

/**
 * Anomalous Supabase response: HTTP 2xx with no body — data and error are both
 * null. PostgREST never signals not-found this way on .single() chains (0 rows
 * arrive as PGRST116), so production must treat it as a service failure.
 */
function fakeEmptyResponseClient() {
  return {
    from: () => {
      const builder = {
        insert() { return builder; },
        update() { return builder; },
        delete() { return builder; },
        select() { return builder; },
        eq() { return builder; },
        or() { return builder; },
        order() { return builder; },
        single() { return builder; },
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

// ─── Stripe webhook helpers ──────────────────────────────────────────────────

function signEventPayload(eventPayload) {
  const payloadString = JSON.stringify(eventPayload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: config.stripe.webhookSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });
  return {
    rawBody: Buffer.from(payloadString, 'utf8'),
    headers: { 'stripe-signature': signature },
    eventId: eventPayload.id,
  };
}

function buildSignedCheckoutEvent(eventId) {
  const eventPayload = {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${eventId}`,
        payment_intent: `pi_${eventId}`,
        customer_details: { email: 'fail-closed@example.invalid' },
        line_items: {
          data: [{ price: { id: 'price_your-standard-price-id' } }],
        },
        // userId in metadata keeps the handler offline (no session retrieve)
        metadata: { tier: 'standard', userId: '99999999-8888-7777-6666-555555555555' },
      },
    },
  };
  return signEventPayload(eventPayload);
}

// Checkout event WITH a subscription id so the handler runs its
// findLicenseBySubscriptionId duplicate check (one subscription = one license).
function buildSignedCheckoutSubscriptionEvent(eventId, subscriptionId) {
  const eventPayload = {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${eventId}`,
        payment_intent: `pi_${eventId}`,
        subscription: subscriptionId,
        customer_details: { email: 'fail-closed@example.invalid' },
        line_items: {
          data: [{ price: { id: 'price_your-standard-price-id' } }],
        },
        metadata: { tier: 'standard', userId: '99999999-8888-7777-6666-555555555555' },
      },
    },
  };
  return signEventPayload(eventPayload);
}

function buildSignedSubscriptionUpdatedEvent(eventId, subscriptionId) {
  const eventPayload = {
    id: eventId,
    object: 'event',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionId,
        customer: 'cus_fail_closed',
        status: 'active',
        items: { data: [{ price: { id: 'price_unknown_test_id' } }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
        canceled_at: null,
        metadata: { tier: 'standard' },
      },
    },
  };
  return signEventPayload(eventPayload);
}

function callWebhook(rawBody, headers) {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req = { body: rawBody, headers, method: 'POST', url: '/stripe' };
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => resolve({ status: statusCode, data }),
    };
    webhookRouter.handle(req, res, () => resolve({ status: statusCode, data: null }));
  });
}

function registryHasLicenseKey(key) {
  return getInMemoryLicenses().some((record) => record.license_key === key);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n======================================================');
  console.log('🔒 License Generation Fail-Closed Tests');
  console.log('======================================================\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // A. Production + Supabase unconfigured
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('─── A. Production without Supabase configuration ───');

  await test('A1. createLicense fails closed and never registers a local license', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(
          () => createLicense({ tier: 'standard', customerEmail: 'a@example.invalid' }),
          /Supabase is not configured/,
          'production creation without Supabase must throw'
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'registry must remain unchanged');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('A2. Fail-closed applies regardless of requireRemote', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(
          () => createLicense({ tier: 'pro', customerEmail: 'b@example.invalid', requireRemote: true }),
          /Supabase is not configured/
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'registry must remain unchanged');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Production + Supabase insert failure
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── B. Production with a failing Supabase INSERT ───');

  await test('B1. requireRemote insert failure propagates and registry stays empty', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(fakeGeneratorClient({ error: INSERT_ERROR }));
      try {
        await assert.rejects(
          () => createLicense({ tier: 'standard', customerEmail: 'c@example.invalid', requireRemote: true }),
          isInsertFailure
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'no local fallback license may be registered');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('B2. Insert failure never falls back to memory in production, even without requireRemote', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(fakeGeneratorClient({ error: INSERT_ERROR }));
      try {
        await assert.rejects(
          () => createLicense({ tier: 'basic', customerEmail: 'd@example.invalid' }),
          isInsertFailure,
          'production must not cache a local-only license'
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'registry must remain unchanged');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Stripe checkout webhook
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── C. Stripe checkout webhook ───');

  await test('C1. Webhook checkout calls createLicense with requireRemote: true', () => {
    assert.ok(
      WEBHOOK_SOURCE.includes('requireRemote: true'),
      'webhook must pass requireRemote: true to createLicense'
    );
    const createCall = WEBHOOK_SOURCE.substring(
      WEBHOOK_SOURCE.indexOf('await createLicense({'),
      WEBHOOK_SOURCE.indexOf('});', WEBHOOK_SOURCE.indexOf('await createLicense({'))
    );
    assert.ok(createCall.includes('requireRemote: true'), 'the createLicense call itself must set requireRemote');
  });

  await test('C2. Production checkout failure returns 500, clears the idempotency mark, and retry succeeds', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      webhookRouter.resetProcessedEvents();
      const { rawBody, headers, eventId } = buildSignedCheckoutEvent('evt_gen_fail_closed_1');
      const inserted = [];

      try {
        // Phase 1: Supabase INSERT fails → 500 + mark rolled back (Stripe retry)
        setSupabaseClientForTests(fakeGeneratorClient({ error: INSERT_ERROR }));
        const failedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(failedRes.status, 500, 'creation failure must surface as HTTP 500');
        assert.ok(failedRes.data && failedRes.data.error, 'must return an error body');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          false,
          'failed event must be unmarked so Stripe can retry'
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'no local fallback license on webhook failure');

        // Phase 2: Supabase healthy again → the retried event succeeds
        setSupabaseClientForTests(fakeGeneratorClient({ onInsert: (record) => inserted.push(record) }));
        const retriedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(retriedRes.status, 200, 'retry after recovery must succeed');
        assert.strictEqual(retriedRes.data.received, true);
        assert.strictEqual(retriedRes.data.tier, 'standard');
        assert.strictEqual(inserted.length, 1, 'exactly one license must be persisted on retry');
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'successful production creation must not use the registry');
      } finally {
        resetSupabaseClientForTests();
        webhookRouter.resetProcessedEvents();
        clearInMemoryLicenses();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Development / test fallback unchanged
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── D. Development/test fallback preserved ───');

  await test('D1. Without a Supabase client, dev/test creation still uses the registry', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(null);
      try {
        const license = await createLicense({ tier: 'pro', customerEmail: 'dev@example.invalid' });
        assert.ok(license.licenseKey, 'dev creation must return a license key');
        assert.ok(registryHasLicenseKey(license.licenseKey), 'registry must hold the new license');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('D2. requireRemote is still ignored without a client in dev/test (in-memory fallback)', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(null);
      try {
        const license = await createLicense({
          tier: 'standard',
          customerEmail: 'dev2@example.invalid',
          requireRemote: true,
        });
        assert.ok(license.licenseKey);
        assert.ok(registryHasLicenseKey(license.licenseKey), 'documented dev/test fallback must remain');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('D3. Dev/test insert failure with requireRemote still throws (STEP 47 behavior)', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(fakeGeneratorClient({ error: INSERT_ERROR }));
      try {
        await assert.rejects(
          () => createLicense({ tier: 'standard', customerEmail: 'dev3@example.invalid', requireRemote: true }),
          isInsertFailure
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'registry must remain unchanged');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('D4. Dev/test webhook checkout still completes end-to-end via the in-memory fallback', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(null);
      webhookRouter.resetProcessedEvents();
      const { rawBody, headers, eventId } = buildSignedCheckoutEvent('evt_gen_dev_flow_1');

      try {
        const res = await callWebhook(rawBody, headers);
        assert.strictEqual(res.status, 200, 'dev checkout must still succeed without Supabase');
        assert.strictEqual(res.data.received, true);
        assert.strictEqual(res.data.tier, 'standard');
        assert.strictEqual(getInMemoryLicenses().length, 1, 'license must be registered in memory for dev/test');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          true,
          'dev checkout event must stay marked as processed'
        );

        const duplicate = await callWebhook(rawBody, headers);
        assert.strictEqual(duplicate.status, 200);
        assert.strictEqual(duplicate.data.duplicate, true, 'idempotency must still apply in dev/test');
      } finally {
        webhookRouter.resetProcessedEvents();
        clearInMemoryLicenses();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // E. getLicenseById (production fail-closed)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── E. getLicenseById ───');

  await test('E1. Production + no Supabase client throws instead of serving the registry', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'E1GEN-LOOK-0001-AAAA', tier: 'pro' });
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(() => getLicenseById('E1GEN-LOOK-0001-AAAA'), isServiceUnavailable);
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('E2. Production query failure throws instead of falling back to the registry', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'E2GEN-LOOK-0002-AAAA', tier: 'pro' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        await assert.rejects(() => getLicenseById('E2GEN-LOOK-0002-AAAA'), isServiceUnavailable);
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('E3. Production legitimate not-found returns null (registry never consulted)', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'E3GEN-LOOK-0003-AAAA', tier: 'pro' });
      setSupabaseClientForTests(fakeDbClient({ rows: [] }));
      try {
        const result = await getLicenseById('E3GEN-LOOK-0003-AAAA');
        assert.strictEqual(result, null, 'not-found must stay null, not an in-memory record');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('E4. Production still returns a real Supabase row on success', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(fakeDbClient({
        rows: [{ id: 'e4-row', license_key: 'E4ROW-LOOK-0004-BBBB', tier: 'pro' }],
      }));
      try {
        const result = await getLicenseById('E4ROW-LOOK-0004-BBBB');
        assert.ok(result, 'row must be returned');
        assert.strictEqual(result.license_key, 'E4ROW-LOOK-0004-BBBB');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('E5. Dev/test query failure still falls back to the registry', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'E5GEN-LOOK-0005-AAAA', tier: 'basic' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        const result = await getLicenseById('E5GEN-LOOK-0005-AAAA');
        assert.ok(result, 'registry fallback must still work outside production');
        assert.strictEqual(result.license_key, 'E5GEN-LOOK-0005-AAAA');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('E6. Dev/test without a client still reads the registry', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'E6GEN-LOOK-0006-AAAA', tier: 'basic' });
      setSupabaseClientForTests(null);
      try {
        const result = await getLicenseById('E6GEN-LOOK-0006-AAAA');
        assert.ok(result, 'in-memory read must keep working outside production');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('E7. Production { data: null, error: null } response throws instead of not-found', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'E7GEN-LOOK-0007-AAAA', tier: 'pro' });
      setSupabaseClientForTests(fakeEmptyResponseClient());
      try {
        await assert.rejects(() => getLicenseById('E7GEN-LOOK-0007-AAAA'), isServiceUnavailable);
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // F. findLicenseBySubscriptionId (production fail-closed)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── F. findLicenseBySubscriptionId ───');

  await test('F1. Production + no Supabase client throws instead of returning null', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'F1GEN-SUBFND-0001-AAAA', stripe_subscription_id: 'sub_f1_lookup' });
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(() => findLicenseBySubscriptionId('sub_f1_lookup'), isServiceUnavailable);
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('F2. Production query failure throws (null must never mean "no duplicate")', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'F2GEN-SUBFND-0002-AAAA', stripe_subscription_id: 'sub_f2_lookup' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        await assert.rejects(() => findLicenseBySubscriptionId('sub_f2_lookup'), isServiceUnavailable);
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('F3. Production legitimate not-found returns null (registry never consulted)', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'F3GEN-SUBFND-0003-AAAA', stripe_subscription_id: 'sub_f3_lookup' });
      setSupabaseClientForTests(fakeDbClient({ rows: [] }));
      try {
        const result = await findLicenseBySubscriptionId('sub_f3_lookup');
        assert.strictEqual(result, null, 'not-found must stay null, not an in-memory record');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('F4. Production still finds a real Supabase row', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(fakeDbClient({
        rows: [{ id: 'f4-row', license_key: 'F4ROW-SUBFND-0004-BBBB', stripe_subscription_id: 'sub_f4_lookup' }],
      }));
      try {
        const result = await findLicenseBySubscriptionId('sub_f4_lookup');
        assert.ok(result, 'row must be returned');
        assert.strictEqual(result.license_key, 'F4ROW-SUBFND-0004-BBBB');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('F5. Dev/test query failure still falls back to the registry', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'F5GEN-SUBFND-0005-AAAA', stripe_subscription_id: 'sub_f5_lookup' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        const result = await findLicenseBySubscriptionId('sub_f5_lookup');
        assert.ok(result, 'registry fallback must still work outside production');
        assert.strictEqual(result.stripe_subscription_id, 'sub_f5_lookup');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('F6. Production { data: null, error: null } response throws (never means "no duplicate")', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'F6GEN-SUBFND-0006-AAAA', stripe_subscription_id: 'sub_f6_lookup' });
      setSupabaseClientForTests(fakeEmptyResponseClient());
      try {
        await assert.rejects(() => findLicenseBySubscriptionId('sub_f6_lookup'), isServiceUnavailable);
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // G. updateLicenseSubscription (production fail-closed)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── G. updateLicenseSubscription ───');

  await test('G1. Production + no Supabase client throws; registry never mutated', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'G1GEN-SUBUPD-0001-AAAA', subscription_status: 'active' });
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(
          () => updateLicenseSubscription('G1GEN-SUBUPD-0001-AAAA', { subscription_status: 'canceled' }),
          isServiceUnavailable
        );
        assert.strictEqual(
          registryRecord('G1GEN-SUBUPD-0001-AAAA').subscription_status,
          'active',
          'registry record must remain untouched'
        );
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('G2. Production update failure throws; registry never mutated', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'G2GEN-SUBUPD-0002-AAAA', subscription_status: 'active' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        await assert.rejects(
          () => updateLicenseSubscription('G2GEN-SUBUPD-0002-AAAA', { subscription_status: 'canceled' }),
          isServiceUnavailable
        );
        assert.strictEqual(
          registryRecord('G2GEN-SUBUPD-0002-AAAA').subscription_status,
          'active',
          'a failed remote update must not be applied locally'
        );
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('G3. Production legitimate not-found returns null without touching the registry', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'G3GEN-SUBUPD-0003-AAAA', subscription_status: 'active' });
      setSupabaseClientForTests(fakeDbClient({ rows: [] }));
      try {
        const result = await updateLicenseSubscription('G3GEN-SUBUPD-0003-AAAA', { subscription_status: 'canceled' });
        assert.strictEqual(result, null, 'not-found must be null, not an in-memory update');
        assert.strictEqual(registryRecord('G3GEN-SUBUPD-0003-AAAA').subscription_status, 'active');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('G4. Production success updates the remote row and returns it', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      const rows = [{ id: 'g4-row', license_key: 'G4ROW-SUBUPD-0004-BBBB', subscription_status: 'past_due' }];
      setSupabaseClientForTests(fakeDbClient({ rows }));
      try {
        const result = await updateLicenseSubscription('g4-row', { subscription_status: 'active' });
        assert.ok(result, 'updated row must be returned');
        assert.strictEqual(result.subscription_status, 'active');
        assert.strictEqual(rows[0].subscription_status, 'active', 'remote row must carry the update');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('G5. Dev/test update failure still updates via the registry fallback', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'G5GEN-SUBUPD-0005-AAAA', subscription_status: 'active' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        const result = await updateLicenseSubscription('G5GEN-SUBUPD-0005-AAAA', { subscription_status: 'canceled' });
        assert.ok(result, 'registry fallback must still work outside production');
        assert.strictEqual(registryRecord('G5GEN-SUBUPD-0005-AAAA').subscription_status, 'canceled');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('G6. Production { data: null, error: null } response throws; registry never mutated', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'G6GEN-SUBUPD-0006-AAAA', subscription_status: 'active' });
      setSupabaseClientForTests(fakeEmptyResponseClient());
      try {
        await assert.rejects(
          () => updateLicenseSubscription('G6GEN-SUBUPD-0006-AAAA', { subscription_status: 'canceled' }),
          isServiceUnavailable
        );
        assert.strictEqual(
          registryRecord('G6GEN-SUBUPD-0006-AAAA').subscription_status,
          'active',
          'an empty response must never apply a local fallback update'
        );
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // H. updateLicenseEmailStatus (production fail-closed)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── H. updateLicenseEmailStatus ───');

  await test('H1. Production + no Supabase client throws; registry never mutated', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'H1GEN-EMLSTS-0001-AAAA', email_status: 'pending' });
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(
          () => updateLicenseEmailStatus('H1GEN-EMLSTS-0001-AAAA', { email_status: 'sent' }),
          isServiceUnavailable
        );
        assert.strictEqual(registryRecord('H1GEN-EMLSTS-0001-AAAA').email_status, 'pending');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('H2. Production update failure throws; registry never mutated', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'H2GEN-EMLSTS-0002-AAAA', email_status: 'pending' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        await assert.rejects(
          () => updateLicenseEmailStatus('H2GEN-EMLSTS-0002-AAAA', { email_status: 'sent' }),
          isServiceUnavailable
        );
        assert.strictEqual(
          registryRecord('H2GEN-EMLSTS-0002-AAAA').email_status,
          'pending',
          'a failed remote status update must not be applied locally'
        );
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('H3. Production legitimate not-found returns null (registry never consulted)', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'H3GEN-EMLSTS-0003-AAAA', email_status: 'pending' });
      setSupabaseClientForTests(fakeDbClient({ rows: [] }));
      try {
        const result = await updateLicenseEmailStatus('H3GEN-EMLSTS-0003-AAAA', { email_status: 'sent' });
        assert.strictEqual(result, null, 'not-found must be null, not an in-memory update');
        assert.strictEqual(registryRecord('H3GEN-EMLSTS-0003-AAAA').email_status, 'pending');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('H4. Dev/test update failure still updates via the registry fallback', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'H4GEN-EMLSTS-0004-AAAA', email_status: 'pending' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        const result = await updateLicenseEmailStatus('H4GEN-EMLSTS-0004-AAAA', { email_status: 'sent' });
        assert.ok(result, 'registry fallback must still work outside production');
        assert.strictEqual(registryRecord('H4GEN-EMLSTS-0004-AAAA').email_status, 'sent');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('H5. Production { data: null, error: null } response throws; registry never mutated', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'H5GEN-EMLSTS-0005-AAAA', email_status: 'pending' });
      setSupabaseClientForTests(fakeEmptyResponseClient());
      try {
        await assert.rejects(
          () => updateLicenseEmailStatus('H5GEN-EMLSTS-0005-AAAA', { email_status: 'sent' }),
          isServiceUnavailable
        );
        assert.strictEqual(
          registryRecord('H5GEN-EMLSTS-0005-AAAA').email_status,
          'pending',
          'an empty response must never apply a local fallback update'
        );
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // I. deleteLicenseById (production fail-closed)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── I. deleteLicenseById ───');

  await test('I1. Production + no Supabase client throws instead of reporting success', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'I1GEN-DELLC-0001-AAAA', id: 'i1-orphan-id' });
      setSupabaseClientForTests(null);
      try {
        await assert.rejects(() => deleteLicenseById('i1-orphan-id'), isServiceUnavailable);
        assert.ok(registryRecord('I1GEN-DELLC-0001-AAAA'), 'registry record must not be silently deleted');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('I2. Production delete failure throws instead of reporting success', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'I2GEN-DELLC-0002-AAAA', id: 'i2-orphan-id' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        await assert.rejects(() => deleteLicenseById('i2-orphan-id'), isServiceUnavailable);
        assert.ok(registryRecord('I2GEN-DELLC-0002-AAAA'), 'registry record must not be silently deleted');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('I3. Production success returns true after the remote delete', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      const rows = [{ id: 'i3-row', license_key: 'I3ROW-DELLC-0003-BBBB' }];
      setSupabaseClientForTests(fakeDbClient({ rows }));
      try {
        const result = await deleteLicenseById('i3-row');
        assert.strictEqual(result, true, 'successful remote delete returns true');
        assert.strictEqual(rows.length, 0, 'remote row must be deleted');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('I4. Dev/test without a client still cleans the registry and returns true', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'I4GEN-DELLC-0004-AAAA', id: 'i4-orphan-id' });
      setSupabaseClientForTests(null);
      try {
        const result = await deleteLicenseById('i4-orphan-id');
        assert.strictEqual(result, true, 'in-memory cleanup must keep returning true outside production');
        assert.strictEqual(registryRecord('I4GEN-DELLC-0004-AAAA'), null, 'registry record must be removed');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  await test('I5. Dev/test delete failure still cleans the registry and returns true', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      seedInMemoryLicense({ license_key: 'I5GEN-DELLC-0005-AAAA', id: 'i5-orphan-id' });
      setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
      try {
        const result = await deleteLicenseById('i5-orphan-id');
        assert.strictEqual(result, true, 'dev/test behavior must remain unchanged');
        assert.strictEqual(registryRecord('I5GEN-DELLC-0005-AAAA'), null, 'registry record must be removed');
      } finally {
        resetSupabaseClientForTests();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // J. Webhook subscription lifecycle (failure/retry + dev/test flow)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── J. Webhook subscription lifecycle ───');

  await test('J1. Production subscription.updated: DB failures → 500 + rollback; retry applies the update', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      webhookRouter.resetProcessedEvents();
      const rows = [{
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        license_key: 'J1GEN-LIFE-0001-AAAA',
        tier: 'standard',
        status: 'active',
        stripe_subscription_id: 'sub_prod_lifecycle_001',
        subscription_status: 'past_due',
      }];
      const { rawBody, headers, eventId } = buildSignedSubscriptionUpdatedEvent(
        'evt_gen_prod_lifecycle_1',
        'sub_prod_lifecycle_001'
      );

      try {
        // Phase 1: lookup fails → event must NOT be acknowledged
        setSupabaseClientForTests(fakeDbClient({ failWith: DB_FAILURE }));
        const lookupFailedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(lookupFailedRes.status, 500, 'lookup failure must surface as HTTP 500');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          false,
          'failed event must be unmarked so Stripe can retry'
        );
        assert.strictEqual(rows[0].subscription_status, 'past_due', 'no partial update may be applied');

        // Phase 2: lookup works, UPDATE fails → still 500 + rollback
        setSupabaseClientForTests(fakeDbClient({ rows, failUpdateWith: DB_FAILURE }));
        const updateFailedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(updateFailedRes.status, 500, 'update failure must surface as HTTP 500');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          false,
          'update failure must also roll back the idempotency mark'
        );
        assert.strictEqual(rows[0].subscription_status, 'past_due', 'failed update must not mutate the remote row');

        // Phase 3: database healthy again → the retried event succeeds
        setSupabaseClientForTests(fakeDbClient({ rows }));
        const retriedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(retriedRes.status, 200, 'retry after recovery must succeed');
        assert.strictEqual(retriedRes.data.received, true);
        assert.strictEqual(rows[0].subscription_status, 'active', 'remote row must carry the updated status');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          true,
          'successful event stays marked as processed'
        );
        assert.deepStrictEqual(getInMemoryLicenses(), [], 'production must never use the registry');
      } finally {
        resetSupabaseClientForTests();
        webhookRouter.resetProcessedEvents();
        clearInMemoryLicenses();
      }
    })
  );

  await test('J2. Dev/test subscription.updated still runs through the in-memory path', () =>
    inDev(async () => {
      clearInMemoryLicenses();
      setSupabaseClientForTests(null);
      webhookRouter.resetProcessedEvents();
      seedInMemoryLicense({
        license_key: 'J2GEN-LIFE-0002-AAAA',
        tier: 'standard',
        status: 'active',
        stripe_subscription_id: 'sub_dev_lifecycle_001',
        subscription_status: 'past_due',
      });
      const { rawBody, headers, eventId } = buildSignedSubscriptionUpdatedEvent(
        'evt_gen_dev_lifecycle_1',
        'sub_dev_lifecycle_001'
      );

      try {
        const res = await callWebhook(rawBody, headers);
        assert.strictEqual(res.status, 200, 'dev/test subscription update must still succeed');
        assert.strictEqual(res.data.received, true);
        const record = registryRecord('J2GEN-LIFE-0002-AAAA');
        assert.ok(record, 'registry record must exist');
        assert.strictEqual(record.subscription_status, 'active', 'registry record must be updated');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          true,
          'dev/test event stays marked as processed'
        );
      } finally {
        resetSupabaseClientForTests();
        webhookRouter.resetProcessedEvents();
        clearInMemoryLicenses();
      }
    })
  );

  await test('J3. Production subscription.updated with { data: null, error: null } → 500 + idempotency rollback', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      webhookRouter.resetProcessedEvents();
      const rows = [{
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        license_key: 'J3GEN-LIFE-0003-AAAA',
        tier: 'standard',
        status: 'active',
        stripe_subscription_id: 'sub_prod_lifecycle_003',
        subscription_status: 'past_due',
      }];
      const { rawBody, headers, eventId } = buildSignedSubscriptionUpdatedEvent(
        'evt_gen_prod_lifecycle_empty_1',
        'sub_prod_lifecycle_003'
      );

      try {
        // Phase 1: anomalous empty lookup response → must NOT be acknowledged
        setSupabaseClientForTests(fakeEmptyResponseClient());
        const emptyRes = await callWebhook(rawBody, headers);
        assert.strictEqual(emptyRes.status, 500, 'empty response must surface as HTTP 500');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          false,
          'failed event must be unmarked so Stripe can retry'
        );
        assert.strictEqual(rows[0].subscription_status, 'past_due', 'no update may be applied or acknowledged');

        // Phase 2: database healthy again → the retried event succeeds
        setSupabaseClientForTests(fakeDbClient({ rows }));
        const retriedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(retriedRes.status, 200, 'retry after recovery must succeed');
        assert.strictEqual(retriedRes.data.received, true);
        assert.strictEqual(rows[0].subscription_status, 'active', 'remote row must carry the updated status');
      } finally {
        resetSupabaseClientForTests();
        webhookRouter.resetProcessedEvents();
        clearInMemoryLicenses();
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // K. Checkout email: send succeeds, email-status update fails
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n─── K. Webhook checkout email-status failure ───');

  await test('K1. Email sent + status-update failure → 500 + rollback; retry acks duplicate with exactly one email', () =>
    inProduction(async () => {
      clearInMemoryLicenses();
      clearSentEmails();
      webhookRouter.resetProcessedEvents();
      const rows = [];
      const { rawBody, headers, eventId } = buildSignedCheckoutSubscriptionEvent(
        'evt_gen_email_status_1',
        'sub_email_status_001'
      );

      try {
        // Phase 1: license insert succeeds, email send succeeds, the
        // email-status UPDATE fails → event must NOT be acknowledged.
        setSupabaseClientForTests(fakeDbClient({ rows, failUpdateWith: DB_FAILURE }));
        const firstRes = await callWebhook(rawBody, headers);
        assert.strictEqual(firstRes.status, 500, 'status-update failure must surface as HTTP 500');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(eventId),
          false,
          'failed event must be unmarked so Stripe can retry'
        );
        assert.strictEqual(rows.length, 1, 'license must already exist after phase 1');
        assert.strictEqual(getSentEmails().length, 1, 'exactly one email must have been sent');

        // Phase 2: Stripe retries the same event → duplicate acknowledgement
        // without a second send or a second license.
        const retriedRes = await callWebhook(rawBody, headers);
        assert.strictEqual(retriedRes.status, 200, 'retry must be acknowledged with HTTP 200');
        assert.strictEqual(retriedRes.data.duplicate, true, 'retry must ack as duplicate');
        assert.strictEqual(rows.length, 1, 'retry must not create a second license');
        assert.strictEqual(getSentEmails().length, 1, 'retry must not send a second email');
        // KNOWN LIMITATION (documented): the retry takes the duplicate path
        // before any email work, so email_status stays stale at 'pending' —
        // there is no automatic resend and no status reconciliation.
        assert.strictEqual(
          rows[0].email_status,
          'pending',
          'known stale-status limitation: email_status stays pending after the retry'
        );
      } finally {
        resetSupabaseClientForTests();
        webhookRouter.resetProcessedEvents();
        clearInMemoryLicenses();
        clearSentEmails();
      }
    })
  );

  // ─── Cleanup & summary ─────────────────────────────────────────────────────

  resetSupabaseClientForTests();
  clearInMemoryLicenses();
  webhookRouter.resetProcessedEvents();

  console.log('\n======================================================');
  console.log(`🔒 Generator Fail-Closed Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('======================================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Generator fail-closed test runner crashed:', err);
  process.exit(1);
});
