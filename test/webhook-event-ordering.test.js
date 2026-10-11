'use strict';

/**
 * Webhook Subscription Event-Ordering Regression Tests
 *
 * Regression being covered: the forward-only invoice guard used to live in
 * classifyDuplicateEvent, which only runs when an idempotency mark EXISTS. A
 * retried event whose mark had been rolled back (or an event arriving after
 * the cache was lost) ran the handler with NO guard at all, so an older
 * invoice could move current_period_end backwards and an older
 * customer.subscription.updated could overwrite newer subscription state.
 *
 * The ordering checks now live inside the handlers, so every case below is
 * exercised BOTH with and without a processed-event mark.
 *
 *   O1. Older invoice after a newer one, NO mark   → period must not regress.
 *   O2. Older invoice after a newer one, WITH mark → acked, no regression.
 *   O3. Older invoice after cancellation, NO mark  → no reactivation, no write.
 *   O4. Older invoice after cancellation, WITH mark→ no reactivation, no write.
 *   O5. Invoice with no usable period end          → stored period is kept.
 *   O6. Forward invoice still extends the period   → valid behavior preserved.
 *   O7. Forward invoice cannot reactivate a canceled license.
 *   O8. Database outage applying a forward invoice → 500, no false ack.
 *   O9. Database outage verifying a marked invoice → 503, no false ack.
 *   S1. Older subscription update, NO mark         → newer state preserved.
 *   S2. Older subscription update in the SAME period, NO mark → skipped.
 *   S3. Newer subscription update, NO mark         → still applied.
 *   S4. Subscription update must not undo a cancellation, NO mark.
 *   S5. Subscription update must not undo a cancellation, WITH mark.
 *   S6. Unestablishable ordering fails closed instead of overwriting.
 *   S7. Database outage on a subscription update   → 500, no false ack.
 *   S8. Update with NO period end must not erase a stored expiry (regression:
 *       a fresh event used to fall through to the clock check and null out
 *       current_period_end, which checkSubscriptionValidity then treats as a
 *       never-expiring license).
 *   S9. Update with a period start but no period end is refused the same way.
 *   D1. subscription.deleted still cancels normally (regression).
 *
 * Runs entirely offline against locally signed Stripe webhook payloads, using
 * the in-memory license registry in dev/test. No production server, database,
 * or .env file is touched, and no outbound network request is made (these event
 * types never call back into the Stripe API).
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

const iso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString();

/** Pulls the event-level `created` out of the override bag. */
function splitCreated(overrides) {
  const rest = Object.assign({}, overrides);
  const created = Object.prototype.hasOwnProperty.call(rest, 'created') ? rest.created : NOW;
  delete rest.created;
  return { created, rest };
}

function subscriptionUpdatedEvent(eventId, subscriptionId, overrides) {
  // `created` is a real Stripe event field, so it is NOT part of the
  // subscription object. Pass created: null to probe the fail-closed path.
  const { created, rest } = splitCreated(overrides);
  return {
    id: eventId,
    object: 'event',
    created,
    type: 'customer.subscription.updated',
    data: {
      object: Object.assign(
        {
          id: subscriptionId,
          customer: 'cus_ordering_test',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_your-standard-price-id' } }] },
          current_period_start: NOW - 30 * DAY,
          current_period_end: NOW + 30 * DAY,
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: {},
        },
        rest
      ),
    },
  };
}

function invoiceSucceededEvent(eventId, subscriptionId, periodStart, periodEnd, overrides) {
  const { created, rest } = splitCreated(overrides);
  return {
    id: eventId,
    object: 'event',
    created,
    type: 'invoice.payment_succeeded',
    data: {
      object: Object.assign(
        {
          id: `in_${eventId}`,
          subscription: subscriptionId,
          customer: 'cus_ordering_test',
          period_start: periodStart,
          period_end: periodEnd,
        },
        rest
      ),
    },
  };
}

function subscriptionDeletedEvent(eventId, subscriptionId) {
  return {
    id: eventId,
    object: 'event',
    created: NOW,
    type: 'customer.subscription.deleted',
    data: { object: { id: subscriptionId, customer: 'cus_ordering_test' } },
  };
}

// ─── State helpers ────────────────────────────────────────────────────────────

async function seedSubscriptionLicense(subscriptionId, overrides) {
  return createLicense(
    Object.assign(
      {
        tier: 'standard',
        customerEmail: 'event-ordering@example.invalid',
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

/** Stand-in for a production database outage (fails closed on SELECT). */
const outageClient = {
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      or() { return this; },
      async single() { return { data: null, error: { code: '503', message: 'service unavailable' } }; },
    };
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('🔐 Webhook Event-Ordering Regression Tests');
  console.log('======================================================');

  console.log('─── O. invoice.payment_succeeded ───');

  await test('O1. Older invoice after a newer one, NO mark: current_period_end must not regress', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_noregress';
    const newerEnd = iso(NOW + 90 * DAY);
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: newerEnd });

    // An older invoice (period already superseded by a later renewal) delivered
    // with NO processed-event mark — the path that used to be unguarded.
    const event = invoiceSucceededEvent('evt_order_inv_noregress', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'stale_period', 'the stale invoice must be refused explicitly');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, newerEnd, 'an older invoice must never regress the billing period');

    resetState();
  });

  await test('O2. Older invoice after a newer one, WITH a rolled-back mark: acked and no regression', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_marked';
    const newerEnd = iso(NOW + 90 * DAY);
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: newerEnd });

    const event = invoiceSucceededEvent('evt_order_inv_marked', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.duplicate, true, 'a superseded invoice is acknowledged as duplicate');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, newerEnd, 'an older invoice must never regress the billing period');

    resetState();
  });

  await test('O3. Older invoice after cancellation, NO mark: no reactivation and no period write', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_canceled';
    const canceledEnd = iso(NOW + 60 * DAY);
    await seedSubscriptionLicense(subscriptionId, {
      subscriptionStatus: 'canceled',
      currentPeriodEnd: canceledEnd,
    });

    const event = invoiceSucceededEvent('evt_order_inv_canceled', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'canceled_subscription');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled', 'a canceled license must stay canceled');
    assert.strictEqual(license.current_period_end, canceledEnd, 'a canceled license must not have its period extended');

    resetState();
  });

  await test('O4. Older invoice after cancellation, WITH a mark: cancellation still stands', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_canceled_marked';
    await seedSubscriptionLicense(subscriptionId, {
      subscriptionStatus: 'canceled',
      currentPeriodEnd: iso(NOW + 60 * DAY),
    });

    const event = invoiceSucceededEvent('evt_order_inv_canceled_marked', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled', 'a canceled license must stay canceled');

    resetState();
  });

  await test('O5. Invoice with no usable period end fails closed instead of erasing the stored period', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_noperiod';
    const storedEnd = iso(NOW + 30 * DAY);
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: storedEnd });

    const event = invoiceSucceededEvent('evt_order_inv_noperiod', subscriptionId, undefined, undefined);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'unknown_period', 'an unorderable invoice must be refused');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, storedEnd, 'a missing period must never null out a stored expiry');

    resetState();
  });

  await test('O6. Forward invoice still extends the billing period, NO mark (valid behavior preserved)', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_forward';
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: iso(NOW + 30 * DAY) });

    const event = invoiceSucceededEvent('evt_order_inv_forward', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, undefined, 'a forward invoice must not be refused by the guard');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, iso(NOW + 60 * DAY), 'a forward invoice must extend the period');
    assert.strictEqual(license.subscription_status, 'active');

    resetState();
  });

  await test('O7. Forward invoice cannot reactivate a canceled license, NO mark', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_canceled_forward';
    const canceledEnd = iso(NOW + 30 * DAY);
    await seedSubscriptionLicense(subscriptionId, {
      subscriptionStatus: 'canceled',
      currentPeriodEnd: canceledEnd,
    });

    // A genuinely newer invoice period still must not resurrect the
    // subscription: cancellation is terminal for a subscription id.
    const event = invoiceSucceededEvent('evt_order_inv_canceled_forward', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled', 'a canceled license must never be reactivated');
    assert.strictEqual(license.current_period_end, canceledEnd, 'a canceled license must not gain a new period');

    resetState();
  });

  await test('O8. Database outage applying a forward invoice, NO mark: 500 and no false acknowledgement', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_outage';
    const storedEnd = iso(NOW + 30 * DAY);
    // Seeded in dev: the production block below only exercises the outage path.
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: storedEnd });

    const event = invoiceSucceededEvent('evt_order_inv_outage', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);

    await inProduction(async () => {
      setSupabaseClientForTests(outageClient);
      try {
        const response = await deliver(event);
        assert.strictEqual(response.status, 500, 'an outage must surface as a retryable error');
        assert.notStrictEqual(response.data && response.data.received, true, 'never acknowledge a write that failed');
        assert.notStrictEqual(response.data && response.data.duplicate, true, 'never claim duplicate during an outage');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(event.id),
          false,
          'the idempotency mark must be rolled back so Stripe retries'
        );
        const record = getRegistryRecord(subscriptionId);
        assert.strictEqual(record.current_period_end, storedEnd, 'no period may change while the database is down');
      } finally {
        resetSupabaseClientForTests();
      }
    });

    resetState();
  });

  await test('O9. Database outage verifying a marked invoice duplicate: 503, never a false duplicate', async () => {
    resetState();
    const subscriptionId = 'sub_order_inv_outage_dup';
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: iso(NOW + 60 * DAY) });

    const event = invoiceSucceededEvent('evt_order_inv_outage_dup', subscriptionId, NOW + 30 * DAY, NOW + 60 * DAY);
    seedProcessedMark(event.id);

    await inProduction(async () => {
      setSupabaseClientForTests(outageClient);
      try {
        const response = await deliver(event);
        assert.strictEqual(response.status, 503, 'an unverifiable duplicate must not be acknowledged');
        assert.notStrictEqual(response.data && response.data.duplicate, true, 'never claim duplicate while verification failed');
      } finally {
        resetSupabaseClientForTests();
      }
    });

    resetState();
  });

  console.log('─── S. customer.subscription.updated ───');

  await test('S1. Older subscription update, NO mark: newer subscription state is preserved', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_noregress';
    const newerEnd = iso(NOW + 60 * DAY);
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: newerEnd });

    // The event snapshot carries an OLDER billing period than the row.
    const event = subscriptionUpdatedEvent('evt_order_upd_noregress', subscriptionId, {
      status: 'active',
      current_period_end: NOW + 30 * DAY,
    });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'stale_period', 'the stale update must be refused explicitly');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, newerEnd, 'an older update must never regress the billing period');

    resetState();
  });

  await test('S2. Older subscription update in the SAME billing period, NO mark: skipped by event time', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_sameperiod';
    const sameEnd = iso(NOW + 30 * DAY);
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: sameEnd, subscriptionStatus: 'active' });

    // Same period, so the period cannot order the snapshots — the event was
    // created an hour before the row's last write, well beyond the skew
    // tolerance, so it is provably the older of the two.
    const event = subscriptionUpdatedEvent('evt_order_upd_sameperiod', subscriptionId, {
      status: 'past_due',
      current_period_end: NOW + 30 * DAY,
      created: NOW - 60 * 60,
    });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'stale_event', 'an older event must be refused');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'active', 'a stale update must not overwrite newer state');
    assert.strictEqual(license.current_period_end, sameEnd);

    resetState();
  });

  await test('S3. Newer subscription update, NO mark: still applied (valid behavior preserved)', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_fresh';
    await seedSubscriptionLicense(subscriptionId, { currentPeriodEnd: iso(NOW + 30 * DAY), subscriptionStatus: 'active' });

    const event = subscriptionUpdatedEvent('evt_order_upd_fresh', subscriptionId, {
      status: 'past_due',
      current_period_end: NOW + 60 * DAY,
    });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, undefined, 'a fresh update must not be skipped');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'past_due', 'a fresh update must still apply');
    assert.strictEqual(license.current_period_end, iso(NOW + 60 * DAY));

    resetState();
  });

  await test('S4. Subscription update must not undo a cancellation, NO mark', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_canceled';
    await seedSubscriptionLicense(subscriptionId, { subscriptionStatus: 'canceled' });

    const event = subscriptionUpdatedEvent('evt_order_upd_canceled', subscriptionId, { status: 'active' });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'canceled_subscription');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled', 'a deleted subscription must not be resurrected');

    resetState();
  });

  await test('S5. Subscription update must not undo a cancellation, WITH a mark', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_canceled_marked';
    await seedSubscriptionLicense(subscriptionId, { subscriptionStatus: 'canceled' });

    const event = subscriptionUpdatedEvent('evt_order_upd_canceled_marked', subscriptionId, { status: 'active' });
    seedProcessedMark(event.id);

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled', 'a deleted subscription must not be resurrected');

    resetState();
  });

  await test('S6. Unestablishable ordering fails closed instead of overwriting, NO mark', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_unknown';
    // No stored period and no event period → the period cannot order the two
    // snapshots; with event.created also absent the ordering is unknowable.
    await seedSubscriptionLicense(subscriptionId, { subscriptionStatus: 'active' });

    const event = subscriptionUpdatedEvent('evt_order_upd_unknown', subscriptionId, {
      status: 'past_due',
      current_period_end: null,
      created: null,
    });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'unknown_ordering', 'an unorderable update must be refused');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'active', 'unorderable state must never be overwritten');

    resetState();
  });

  await test('S7. Database outage on a subscription update, NO mark: 500 and no false acknowledgement', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_outage';
    // Seeded in dev: the production block below only exercises the outage path.
    await seedSubscriptionLicense(subscriptionId, { subscriptionStatus: 'active' });

    const event = subscriptionUpdatedEvent('evt_order_upd_outage', subscriptionId, {
      status: 'past_due',
      created: NOW,
    });

    await inProduction(async () => {
      setSupabaseClientForTests(outageClient);
      try {
        const response = await deliver(event);
        assert.strictEqual(response.status, 500, 'an outage must surface as a retryable error');
        assert.notStrictEqual(response.data && response.data.received, true, 'never acknowledge a write that failed');
        assert.strictEqual(
          webhookRouter.__getProcessedEventMap().has(event.id),
          false,
          'the idempotency mark must be rolled back so Stripe retries'
        );
        const record = getRegistryRecord(subscriptionId);
        assert.strictEqual(record.subscription_status, 'active', 'no state may change while the database is down');
      } finally {
        resetSupabaseClientForTests();
      }
    });

    resetState();
  });

  await test('S8. Subscription update with no period end must not erase a stored expiry, NO mark', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_noperiod';
    const storedEnd = iso(NOW + 60 * DAY);
    await seedSubscriptionLicense(subscriptionId, {
      currentPeriodEnd: storedEnd,
      subscriptionStatus: 'active',
    });

    // A FRESH event (created now) whose snapshot has no current_period_end.
    // Before the fix this fell through to the clock check, was allowed, and
    // nulled out the expiry — turning a bounded license into a permanent one.
    const event = subscriptionUpdatedEvent('evt_order_upd_noperiod', subscriptionId, {
      status: 'active',
      current_period_end: null,
    });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'unknown_period', 'an event without a period must be refused');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, storedEnd, 'a missing period must never erase a stored expiry');

    resetState();
  });

  await test('S9. Subscription update with a period start but no period end is also refused, NO mark', async () => {
    resetState();
    const subscriptionId = 'sub_order_upd_nostart_end';
    const storedEnd = iso(NOW + 60 * DAY);
    await seedSubscriptionLicense(subscriptionId, {
      currentPeriodEnd: storedEnd,
      subscriptionStatus: 'active',
    });

    // Same hole with period_start present: the ordering key is period_end, so
    // a start without an end must not be treated as an ordering signal.
    const event = subscriptionUpdatedEvent('evt_order_upd_nostart_end', subscriptionId, {
      status: 'past_due',
      current_period_start: NOW - 30 * DAY,
      current_period_end: null,
    });

    const response = await deliver(event);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.skipped, 'unknown_period', 'a period start without an end must be refused');
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.current_period_end, storedEnd, 'the stored expiry must survive');
    assert.strictEqual(license.subscription_status, 'active', 'no status may change on a refused update');

    resetState();
  });

  console.log('─── D. customer.subscription.deleted ───');

  await test('D1. subscription.deleted still cancels the license on first delivery (regression)', async () => {
    resetState();
    const subscriptionId = 'sub_order_del_normal';
    await seedSubscriptionLicense(subscriptionId);

    const response = await deliver(subscriptionDeletedEvent('evt_order_del_normal', subscriptionId));
    assert.strictEqual(response.status, 200);
    const license = await findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'canceled');

    resetState();
  });

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`🔐 Event-Ordering Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.error('Failed tests:');
    for (const failure of failures) {
      console.error(`  ✗ ${failure.name}: ${failure.error}`);
    }
  }

  return failed === 0;
}

/** Reads the in-memory record directly (the registry is the dev store). */
function getRegistryRecord(subscriptionId) {
  const record = getInMemoryLicenses().find((l) => l.stripe_subscription_id === subscriptionId);
  assert.ok(record, `expected an in-memory record for ${subscriptionId}`);
  return record;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
