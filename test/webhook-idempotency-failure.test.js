'use strict';

/**
 * Webhook Idempotency Failure-Case Tests
 *
 * Verifies the confirmed failure modes of the durable Stripe idempotency
 * cache, by exercising runtime behavior (never by scanning source text):
 *
 *   A. Stale processed mark whose license write never happened (crash between
 *      mark and commit) must be reprocessed — never acked as a duplicate.
 *   B. Same stale mark, but restored from disk (rollback persist failed, or a
 *      restart) — reprocessing still happens and dedupes on the licenses table.
 *   C. A disk write failure while persisting the cache is observable (logged)
 *      and never yields a false duplicate ack; a retry dedupes via the
 *      licenses table instead of the lost cache.
 *   D. A corrupt cache file is observable (warned once), does not crash the
 *      endpoint, and is repaired on the next persist.
 *   E. Concurrent delivery of the same event creates exactly one license.
 *   F. A non-2xx handler result (unresolvable checkout details) rolls the
 *      processed mark back so Stripe's retry reprocesses instead of being
 *      acknowledged as a duplicate with no license.
 *   G. During a production database outage, a marked duplicate is answered
 *      with 503 (retry) — never a false duplicate acknowledgement.
 *
 * Runs entirely offline against locally signed Stripe webhook payloads. No
 * production server, database, or .env file is touched.
 */

const fs = require('fs');
const os = require('os');
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
  clearInMemoryLicenses,
  getInMemoryLicenses,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
} = licenseGenerator;
const { clearSentEmails } = require('../server/services/emailService');

// ─── Test harness ─────────────────────────────────────────────────────────────

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

/** Runs fn while capturing every console.warn call. */
async function captureWarnings(fn) {
  const captured = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    captured.push(args.map(String).join(' '));
    originalWarn.apply(console, args);
  };
  try {
    const result = await fn();
    return { result, warnings: captured };
  } finally {
    console.warn = originalWarn;
  }
}

// ─── Webhook helpers ──────────────────────────────────────────────────────────

const testWebhookSecret = config.stripe.webhookSecret;

function signEvent(eventPayload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(eventPayload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: testWebhookSecret,
    timestamp,
  });
  return {
    rawBody: Buffer.from(payloadString, 'utf8'),
    headers: { 'stripe-signature': signature },
  };
}

function callWebhook(rawBody, headers) {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req = { body: rawBody, headers, method: 'POST', url: '/stripe' };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { resolve({ status: statusCode, data }); },
    };
    webhookRouter.handle(req, res, () => resolve({ status: statusCode, data: null }));
  });
}

function checkoutEvent(eventId, objectOverrides) {
  return {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: Object.assign(
        {
          id: `cs_${eventId}`,
          payment_intent: `pi_${eventId}`,
          customer_details: { email: 'idem-failure@example.invalid' },
          line_items: { data: [{ price: { id: 'price_your-standard-price-id' } }] },
          metadata: { tier: 'standard' },
        },
        objectOverrides || {}
      ),
    },
  };
}

function deliver(eventPayload) {
  const { rawBody, headers } = signEvent(eventPayload);
  return callWebhook(rawBody, headers);
}

function resetState() {
  webhookRouter.resetProcessedEvents();
  clearInMemoryLicenses();
  clearSentEmails();
}

function rmrf(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('🔐 Webhook Idempotency Failure-Case Tests');
  console.log('======================================================');

  // ─── A. Stale processed mark, license never created ───────────────────────

  console.log('─── A. Stale mark without a persisted license ───');

  await test('A1. Mark present but license missing: retry reprocesses instead of acking a duplicate', async () => {
    resetState();
    const event = checkoutEvent('evt_idem_stale_mark');
    const first = await deliver(event);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.data.received, true);
    assert.strictEqual(getInMemoryLicenses().length, 1);

    // Crash window: the mark is recorded but the license write never happened.
    clearInMemoryLicenses();
    assert.ok(webhookRouter.__getProcessedEventMap().has(event.id), 'mark must still be present');

    const retry = await deliver(event);
    assert.strictEqual(retry.status, 200);
    assert.notStrictEqual(retry.data.duplicate, true, 'stale mark must not be acknowledged as a duplicate');
    assert.strictEqual(getInMemoryLicenses().length, 1, 'license must be recreated exactly once');

    resetState();
  });

  // ─── B. Stale mark restored from disk ─────────────────────────────────────

  console.log('─── B. Stale mark restored from disk ───');

  await test('B1. Disk-held stale mark without a license: retry reprocesses and the rewritten cache stays valid', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-cutter-idem-'));
    const cachePath = path.join(tmpDir, '.webhook-idempotency.json');
    const event = checkoutEvent('evt_idem_stale_disk_mark');
    try {
      resetState();
      // End state of a rollback whose disk write failed: durable mark, no license.
      fs.writeFileSync(cachePath, JSON.stringify([{ id: event.id, ts: Date.now() }]), 'utf8');
      webhookRouter.__setIdempotencyFilePathForTests(cachePath);

      const retry = await deliver(event);
      assert.strictEqual(retry.status, 200);
      assert.notStrictEqual(retry.data.duplicate, true, 'stale disk mark must not be acknowledged as a duplicate');
      assert.strictEqual(getInMemoryLicenses().length, 1, 'license must be created exactly once');

      const persisted = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      assert.ok(Array.isArray(persisted), 'cache file must be rewritten as a valid array');
      assert.ok(persisted.some((entry) => entry.id === event.id), 'reprocessed event must be re-marked');
    } finally {
      rmrf(tmpDir);
      resetState();
    }
  });

  // ─── C. Disk write failure ────────────────────────────────────────────────

  console.log('─── C. Disk write failure during cache persist ───');

  await test('C1. Persist failure is observable and never yields a false duplicate ack', async () => {
    // Parent directory intentionally missing: every cache write fails with ENOENT.
    const unwritablePath = path.join(os.tmpdir(), 'reel-cutter-idem-missing-dir', 'cache.json');
    resetState();
    webhookRouter.__setIdempotencyFilePathForTests(unwritablePath);

    const event = checkoutEvent('evt_idem_disk_write_failure');
    const { result: first, warnings } = await captureWarnings(() => deliver(event));
    assert.strictEqual(first.status, 200, 'the event must still be processed when persistence is unavailable');
    assert.strictEqual(first.data.received, true);
    assert.ok(
      warnings.some((w) => w.includes('Failed to persist idempotency cache')),
      'persist failure must be logged, not swallowed silently'
    );
    assert.strictEqual(getInMemoryLicenses().length, 1);

    // Restart: nothing durable survived the failed writes.
    webhookRouter.__getProcessedEventMap().clear();
    const retry = await deliver(event);
    assert.strictEqual(retry.status, 200);
    assert.strictEqual(retry.data.duplicate, true, 'retry must dedupe via the licenses table, not the cache');
    assert.strictEqual(getInMemoryLicenses().length, 1, 'retry must not create a second license');

    resetState();
  });

  // ─── D. Corrupt cache file ────────────────────────────────────────────────

  console.log('─── D. Corrupt idempotency cache file ───');

  await test('D1. Corrupt cache is warned about once, does not crash, and is repaired on the next persist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-cutter-idem-corrupt-'));
    const cachePath = path.join(tmpDir, '.webhook-idempotency.json');
    fs.writeFileSync(cachePath, '{ this is not valid json', 'utf8');
    const event = checkoutEvent('evt_idem_corrupt_cache');
    try {
      resetState();
      webhookRouter.__setIdempotencyFilePathForTests(cachePath);

      const { result: first, warnings } = await captureWarnings(() => deliver(event));
      assert.strictEqual(first.status, 200, 'a corrupt cache must not break the endpoint');
      assert.strictEqual(first.data.received, true);
      assert.ok(
        warnings.some((w) => w.includes('Idempotency cache') && w.includes('corrupt')),
        'corruption must be observable via a warning'
      );

      const persisted = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      assert.ok(Array.isArray(persisted), 'the corrupt file must be rewritten as valid JSON');
      assert.ok(persisted.some((entry) => entry.id === event.id), 'the processed event must be recorded');

      const second = await deliver(event);
      assert.strictEqual(second.status, 200);
      assert.strictEqual(second.data.duplicate, true, 'duplicates must be detected once the cache is healthy');
      assert.strictEqual(getInMemoryLicenses().length, 1);
    } finally {
      rmrf(tmpDir);
      resetState();
    }
  });

  // ─── E. Concurrent delivery ───────────────────────────────────────────────

  console.log('─── E. Concurrent delivery of the same event ───');

  await test('E1. Two concurrent deliveries of one event create exactly one license', async () => {
    resetState();
    const event = checkoutEvent('evt_idem_concurrent');
    const { rawBody, headers } = signEvent(event);

    const [first, second] = await Promise.all([
      callWebhook(rawBody, headers),
      callWebhook(rawBody, headers),
    ]);

    assert.strictEqual(getInMemoryLicenses().length, 1, 'concurrent delivery must not create two licenses');
    for (const response of [first, second]) {
      assert.ok(
        response.status === 200 || response.status === 503,
        `concurrent responses must be 200 or retryable 503, got ${response.status}`
      );
    }
    const acknowledged = [first, second].filter(
      (response) => response.status === 200 && response.data && response.data.received === true && !response.data.duplicate
    );
    assert.strictEqual(acknowledged.length, 1, 'exactly one delivery must be acknowledged as newly processed');

    resetState();
  });

  // ─── F. Non-2xx handler result ────────────────────────────────────────────

  console.log('─── F. Non-2xx handler result rolls the mark back ───');

  await test('F1. Unresolvable checkout details: 400 is returned and the retry reprocesses instead of acking a duplicate', async () => {
    resetState();
    // No tier resolvable (no line_items, no planId/tier metadata) → 400.
    const event = checkoutEvent('evt_idem_unresolvable', { line_items: undefined, metadata: {} });

    const first = await deliver(event);
    assert.strictEqual(first.status, 400, 'an unprocessable checkout must not be reported as a success');
    assert.ok(!webhookRouter.__getProcessedEventMap().has(event.id), 'the processed mark must be rolled back');

    const second = await deliver(event);
    assert.strictEqual(second.status, 400, 'Stripe retry must attempt processing again');
    assert.notStrictEqual(second.data.duplicate, true, 'a failed handler result must never become a duplicate ack');
    assert.strictEqual(getInMemoryLicenses().length, 0);

    resetState();
  });

  // ─── G. Database outage while verifying a duplicate ───────────────────────

  console.log('─── G. Production outage while verifying a duplicate ───');

  await test('G1. Unverifiable duplicate during an outage returns 503 (retry) and acks normally once the outage clears', async () => {
    resetState();
    const event = checkoutEvent('evt_idem_outage_verify');

    const first = await deliver(event);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.data.received, true);
    assert.strictEqual(getInMemoryLicenses().length, 1);

    const outageClient = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async single() { return { data: null, error: { code: '503', message: 'service unavailable' } }; },
        };
      },
    };

    await inProduction(async () => {
      setSupabaseClientForTests(outageClient);
      try {
        const retry = await deliver(event);
        assert.strictEqual(retry.status, 503, 'an unverifiable duplicate must not be acknowledged');
        assert.notStrictEqual(retry.data && retry.data.duplicate, true, 'never claim duplicate while verification failed');
        assert.strictEqual(getInMemoryLicenses().length, 1, 'no extra license may be created while the outage lasts');
      } finally {
        resetSupabaseClientForTests();
      }
    });

    const recovered = await deliver(event);
    assert.strictEqual(recovered.status, 200);
    assert.strictEqual(recovered.data.duplicate, true, 'once the outage clears the duplicate is acked normally');
    assert.strictEqual(getInMemoryLicenses().length, 1);

    resetState();
  });

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`🔐 Webhook Idempotency Failure-Case Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.error('Failed tests:');
    for (const failure of failures) {
      console.error(`  ✗ ${failure.name}: ${failure.error}`);
    }
  }

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
