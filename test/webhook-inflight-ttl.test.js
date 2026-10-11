'use strict';

/**
 * Webhook In-Flight Marker TTL Tests
 *
 * The route keeps an in-flight marker per event id so concurrent deliveries of
 * the same event are deferred (503, retry) instead of racing the first
 * handler. Markers are normally removed in a `finally` block, but a handler
 * that never settles (hung Stripe API call, stalled process) would otherwise
 * leave its marker behind forever, blocking every future retry of that event
 * until a restart.
 *
 * These tests verify the TTL behavior at runtime:
 *
 *   T1. A FRESH in-flight marker defers a duplicate delivery with 503 and is
 *       retained (still processing).
 *   T2. An EXPIRED in-flight marker is discarded and the event is reprocessed
 *       instead of being blocked forever.
 *   T3. An expired leftover marker cannot override verified persistence: when
 *       the license exists, the duplicate is acked normally.
 *   T4. The in-flight guard also protects the non-checkout verify-before-ack
 *       path (a fresh marker defers a duplicate subscription.deleted).
 *
 * Expiry is always safe: it only allows a second handler to run concurrently;
 * duplicate license creation is still prevented by handler-level dedupe and
 * the transaction_id unique index.
 *
 * Runs entirely offline against locally signed Stripe webhook payloads.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const Stripe = require('stripe');

// Loaded before any NODE_ENV toggle — server/config resolves Stripe secrets at
// require time.
const config = require('../server/config');
const licenseGenerator = require('../server/services/licenseGenerator');
const webhookRouter = require('../server/routes/webhook');

const { clearInMemoryLicenses, getInMemoryLicenses } = licenseGenerator;

// Well beyond the route's 5-minute TTL, while remaining far inside Stripe's
// multi-day retry horizon.
const LONG_AGO = Date.now() - 60 * 60 * 1000; // 1 hour ago

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

function checkoutEvent(eventId) {
  return {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${eventId}`,
        payment_intent: `pi_${eventId}`,
        customer_details: { email: 'ttl@example.invalid' },
        line_items: { data: [{ price: { id: 'price_your-standard-price-id' } }] },
        metadata: { tier: 'standard' },
      },
    },
  };
}

function subscriptionDeletedEvent(eventId, subscriptionId) {
  return {
    id: eventId,
    object: 'event',
    type: 'customer.subscription.deleted',
    data: { object: { id: subscriptionId, customer: 'cus_ttl_test' } },
  };
}

function deliver(eventPayload) {
  const { rawBody, headers } = signEvent(eventPayload);
  return callWebhook(rawBody, headers);
}

function resetState() {
  webhookRouter.resetProcessedEvents();
  clearInMemoryLicenses();
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
  console.log('🔐 Webhook In-Flight Marker TTL Tests');
  console.log('======================================================');

  console.log('─── T. In-flight marker TTL ───');

  await test('T1. Fresh in-flight marker defers a duplicate delivery with 503 and is retained', async () => {
    resetState();
    const event = checkoutEvent('evt_ttl_fresh_marker');
    // Simulate: mark recorded and a delivery still running for this event.
    webhookRouter.__getProcessedEventMap().set(event.id, Date.now());
    webhookRouter.__getInFlightEventIds().set(event.id, Date.now());

    const response = await deliver(event);
    assert.strictEqual(response.status, 503, 'a fresh in-flight delivery must defer with a retryable 503');
    assert.notStrictEqual(response.data && response.data.duplicate, true, 'must not claim duplicate while processing');
    assert.ok(webhookRouter.__getProcessedEventMap().has(event.id), 'the processed mark must be retained');
    assert.ok(webhookRouter.__getInFlightEventIds().has(event.id), 'the fresh marker must be retained');
    assert.strictEqual(getInMemoryLicenses().length, 0, 'no license may be created while the first delivery is in flight');

    resetState();
  });

  await test('T2. Expired in-flight marker is discarded and the event is reprocessed, not blocked', async () => {
    resetState();
    const event = checkoutEvent('evt_ttl_expired_marker');
    webhookRouter.__getProcessedEventMap().set(event.id, Date.now());
    // Simulate a hung delivery that never removed its marker.
    webhookRouter.__getInFlightEventIds().set(event.id, LONG_AGO);

    const { result, warnings } = await captureWarnings(() => deliver(event));
    assert.strictEqual(result.status, 200, 'an expired marker must not block the event forever');
    assert.notStrictEqual(result.data.duplicate, true, 'a stale mark without a license must not be acked as duplicate');
    assert.strictEqual(getInMemoryLicenses().length, 1, 'the license must be created exactly once');
    assert.ok(
      warnings.some((w) => w.includes('In-flight marker') && w.includes('expired')),
      'marker expiry must be observable via a warning'
    );
    assert.ok(!webhookRouter.__getInFlightEventIds().has(event.id), 'the expired marker must be gone after processing');
    assert.ok(webhookRouter.__getProcessedEventMap().has(event.id), 'the event must be re-marked after processing');

    resetState();
  });

  await test('T3. Expired leftover marker cannot override verified persistence: duplicate acks normally', async () => {
    resetState();
    const event = checkoutEvent('evt_ttl_expired_with_license');
    const first = await deliver(event);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(getInMemoryLicenses().length, 1);

    // Simulate a hung marker left behind after the delivery actually finished.
    webhookRouter.__getInFlightEventIds().set(event.id, LONG_AGO);

    const retry = await deliver(event);
    assert.strictEqual(retry.status, 200);
    assert.strictEqual(retry.data.duplicate, true, 'an existing license must still be acked as duplicate');
    assert.strictEqual(getInMemoryLicenses().length, 1, 'no second license may be created');

    resetState();
  });

  await test('T4. In-flight guard also protects the subscription.deleted verify-before-ack path', async () => {
    resetState();
    const subscriptionId = 'sub_ttl_deleted_001';
    await licenseGenerator.createLicense({
      tier: 'standard',
      customerEmail: 'ttl-subscription@example.invalid',
      transactionId: 'pi_ttl_deleted_001',
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: 'active',
      requireRemote: false,
    });

    const event = subscriptionDeletedEvent('evt_ttl_subscription_deleted', subscriptionId);
    webhookRouter.__getProcessedEventMap().set(event.id, Date.now());
    webhookRouter.__getInFlightEventIds().set(event.id, Date.now());

    const response = await deliver(event);
    assert.strictEqual(response.status, 503, 'a fresh in-flight delivery must defer the cancellation too');
    const license = await licenseGenerator.findLicenseBySubscriptionId(subscriptionId);
    assert.strictEqual(license.subscription_status, 'active', 'state must not change while the first delivery is in flight');

    resetState();
  });

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`🔐 In-Flight TTL Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
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
