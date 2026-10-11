'use strict';

/**
 * Webhook Subscription/Invoice Crash-Retry Consistency Tests
 *
 * The webhook marks an event as processed BEFORE running its handler. If the
 * process crashes between the mark and the handler's database write, Stripe's
 * retry arrives with the mark still present. The route now verifies the side
 * effect before acknowledging such duplicates:
 *
 *   S1. subscription.deleted applied normally on first delivery (regression).
 *   S2. CRASH GAP: a marked-but-never-applied cancellation is re-applied on
 *       retry (previously acked as duplicate while the license stayed active).
 *   S3. An already-applied cancellation is acked as duplicate without
 *       reprocessing.
 *   S4. CRASH GAP: a marked-but-never-applied invoice period extension is
 *       re-applied when the stored period is strictly older (forward-only).
 *   S5. A retry of an invoice event superseded by a NEWER stored period is
 *       acked without reprocessing — a stale event must never regress a newer
 *       billing period.
 *   S6. ACCEPTED GAP (documented): customer.subscription.updated duplicates
 *       are acked from the mark alone; its fields are not monotonic, so
 *       re-applying a stale event could overwrite newer state. The next
 *       lifecycle event re-syncs the license.
 *   S7. ACCEPTED GAP (documented): invoice.payment_failed duplicates are
 *       acked from the mark alone (same non-monotonicity argument).
 *   S8. A production database outage while verifying a duplicate returns 503
 *       (retry) — never a false acknowledgement — and the event is handled
 *       normally once the outage clears.
 *
 * Runs entirely offline against locally signed Stripe webhook payloads, using
 * the in-memory license registry. No production server, database, or .env
 * file is touched.
 */

const assert = require('assert');
const Stripe = require('stripe');

// Loaded before any NODE_ENV toggle — server/config resolves Stripe secrets at
// require time.
const config = require('../server/config');
const licenseGenerator = require('../server/services/licenseGenerator');
const webhookRouter = require('../server/routes/webhook');

const {
  clearInMemoryLicenses,
  createLicense,
  findLicenseBySubscriptionId,
  getInMemoryLicenses,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
} = licenseGenerator;

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

function deliver(eventPayload) {
  const { rawBody, headers } = signEvent(eventPayload);
  return callWebhook(rawBody, headers);
}

// ─── Event builders ───────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const DAY = 24 * 60 * 60;

function subscriptionDeletedEvent(eventId, subscriptionId) {
  return {
    id: eventId,
    object: 'event',
    type: 'customer.subscription.deleted',
    data: { object: { id: subscriptionId, customer: 'cus_retry_test' } },
  };
}

function subscriptionUpdatedEvent(eventId, subscriptionId, overrides) {
  return {
    id: eventId,
    object: 'event',
    type: 'customer.subscription.updated',
    data: {
      object: Object.assign(
        {
          id: subscriptionId,
          customer: 'cus_retry_test',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_your-standard-price-id' } }] },
          current_period_start: NOW - 30 * DAY,
          current_period_end: NOW + 30 * DAY,
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: {},
        },
        overrides || {}
      ),
    },
  };
}

function invoiceSucceededEvent(eventId, subscriptionId, periodStart, periodEnd) {
  return {
    id: eventId,
    object: 'event',
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: `in_${eventId}`,
        subscription: subscriptionId,
        customer: 'cus_retry_test',
        period_start: periodStart,
        period_end: periodEnd,
      },
    },
  };
}

function invoiceFailedEvent(eventId, subscriptionId) {
  return {
    id: eventId,
    object: 'event',
    type: 'invoice.payment_failed',
    data: {
      object: { id: `in_${eventId}`, subscription: subscriptionId, customer: 'cus_retry_test' },
    },
  };
}

// ─── State helpers ────────────────────────────────────────────────────────────

async function seedSubscriptionLicense(subscriptionId, overrides) {
  return createLicense(
    Object.assign(
      {
        tier: 'standard',
        customerEmail: 'retry-consistency@example.invalid',
        transactionId: `pi_${subscriptionId}`,
        paymentProvider: 'stripe',
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'active',
        requireRemote: false,
      },
      overrides || {}
    )
  );
}

/** Simulates a crash between markEventProcessed and the handler's DB write. */
function seedProcessedMark(eventId) {
  webhookRouter.__getProcessedEventMap().set(eventId, Date.now());
}

function resetState() {
  webhookRouter.resetProcessedEvents();
  clearInMemoryLicenses();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('🔐 Webhook Subscription/Invoice Crash-Retry Consistency Tests');
  console.log('======================================================');

  console.log('─── S. subscription.deleted ───');

  await test('S1. subscription.deleted cancels the license on first delivery (regression)', async () => {
    resetState();
    const subscriptionId = 'sub_retry_del_normal';
    await seedSubscriptionLicense(subscriptionId);

    const response = await deliver(subscriptionDeletedEvent('evt_retry_del_normal', subscriptionId));
    assert.strictEqual(response.status, 200);
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled');

    resetState();
  });

  await test('S2. Marked-but-lost cancellation is re-applied on retry (crash gap closed)', async () => {
    resetState();
    const subscriptionId = 'sub_retry_del_lost';
    await seedSubscriptionLicense(subscriptionId);

    const event = subscriptionDeletedEvent('evt_retry_del_lost', subscriptionId);
    seedProcessedMark(event.id); // crash happened before the UPDATE committed

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.notStrictEqual(response.data.duplicate, true, 'a lost cancellation must never be acked as duplicate');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled', 'the cancellation must be re-applied');
    assert.ok(webhookRouter.__getProcessedEventMap().has(event.id), 'the event must be re-marked');

    resetState();
  });

  await test('S3. Already-applied cancellation is acked as duplicate without reprocessing', async () => {
    resetState();
    const subscriptionId = 'sub_retry_del_applied';
    await seedSubscriptionLicense(subscriptionId, { subscriptionStatus: 'canceled' });

    const event = subscriptionDeletedEvent('evt_retry_del_applied', subscriptionId);
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.duplicate, true, 'an applied cancellation must be acked as duplicate');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled');

    resetState();
  });

  console.log('─── S. invoice.payment_succeeded ───');

  await test('S4. Marked-but-lost period extension is re-applied forward on retry (crash gap closed)', async () => {
    resetState();
    const subscriptionId = 'sub_retry_inv_lost';
    const storedEnd = new Date((NOW + 30 * DAY) * 1000).toISOString();
    const newEnd = NOW + 60 * DAY;
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: storedEnd });

    const event = invoiceSucceededEvent('evt_retry_inv_lost', subscriptionId, NOW + 30 * DAY, newEnd);
    seedProcessedMark(event.id); // crash happened before the UPDATE committed

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.notStrictEqual(response.data.duplicate, true, 'a lost extension must never be acked as duplicate');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(
      license.current_period_end,
      new Date(newEnd * 1000).toISOString(),
      'the billing period must move forward to the event period'
    );

    resetState();
  });

  await test('S5. Retry of an invoice event superseded by a newer period acks without regression', async () => {
    resetState();
    const subscriptionId = 'sub_retry_inv_superseded';
    const newerEnd = new Date((NOW + 90 * DAY) * 1000).toISOString();
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: newerEnd });

    // An older invoice (period already superseded by a later renewal).
    const event = invoiceSucceededEvent('evt_retry_inv_superseded', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.duplicate, true, 'a superseded invoice must be acked as duplicate');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, newerEnd, 'a stale event must never regress a newer billing period');

    resetState();
  });

  console.log('─── S. Accepted gaps (documented behavior) ───');

  await test('S6. subscription.updated duplicate is acked from the mark alone (accepted gap)', async () => {
    resetState();
    const subscriptionId = 'sub_retry_upd_gap';
    await seedSubscriptionLicense(subscriptionId);

    // The original delivery would have set past_due; it was lost in a crash.
    const event = subscriptionUpdatedEvent('evt_retry_upd_gap', subscriptionId);
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.duplicate, true, 'subscription.updated duplicates are acked from the mark');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(
      license.subscription_status,
      'active',
      'documented gap: the update is not re-applied; the next lifecycle event re-syncs it'
    );

    resetState();
  });

  await test('S7. invoice.payment_failed duplicate is acked from the mark alone (accepted gap)', async () => {
    resetState();
    const subscriptionId = 'sub_retry_invfail_gap';
    await seedSubscriptionLicense(subscriptionId);

    const event = invoiceFailedEvent('evt_retry_invfail_gap', subscriptionId);
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.duplicate, true, 'invoice.payment_failed duplicates are acked from the mark');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(
      license.subscription_status,
      'active',
      'documented gap: past_due is not re-applied; a later event re-syncs it'
    );

    resetState();
  });

  console.log('─── S. Production outage while verifying a duplicate ───');

  await test('S8. Unverifiable subscription.deleted duplicate returns 503, then recovers after the outage', async () => {
    resetState();
    const subscriptionId = 'sub_retry_del_outage';
    await seedSubscriptionLicense(subscriptionId);

    const event = subscriptionDeletedEvent('evt_retry_del_outage', subscriptionId);
    seedProcessedMark(event.id);

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
        // Inspect the registry directly: findLicenseBySubscriptionId fails
        // closed (throws) while the outage client is installed in production.
        const record = getInMemoryLicenses().find((l) => l.stripe_subscription_id === subscriptionId);
        assert.ok(record, 'the license record must still exist');
        assert.strictEqual(record.subscription_status, 'active', 'no state may change while verification is impossible');
      } finally {
        resetSupabaseClientForTests();
      }
    });

    // Outage cleared: the retry is reprocessed and the cancellation applies.
    const recovered = await deliver(event);
    assert.strictEqual(recovered.status, 200);
    assert.notStrictEqual(recovered.data.duplicate, true, 'the lost cancellation must be applied once the outage clears');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled');

    resetState();
  });

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`🔐 Subscription/Invoice Retry-Consistency Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
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
