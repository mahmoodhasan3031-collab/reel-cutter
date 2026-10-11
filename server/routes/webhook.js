const express = require('express');
const fs = require('fs');
const path = require('path');
const StripeProvider = require('../providers/stripeProvider');
const {
  createLicense,
  findLicenseBySubscriptionId,
  findLicenseByTransactionId,
  updateLicenseSubscription,
} = require('../services/licenseGenerator');
const { sendLicenseEmail, deliverLicenseEmail, maskEmail } = require('../services/emailService');
const { linkLicenseToUser } = require('../services/licenseService');

const router = express.Router();
const stripeProvider = new StripeProvider();

// Durable idempotency: persisted to disk to survive application restarts.
// NOTE (Render free plan): the Render filesystem is ephemeral — this cache is
// lost on every redeploy/restart, so the disk file is only a best-effort fast
// path. Correctness never depends on it: checkout dedupe is verified against
// the licenses table (findLicenseBySubscriptionId / findLicenseByTransactionId)
// before an event is acknowledged, and the transaction_id partial unique index
// in the database is the final duplicate-creation barrier. If durable
// cross-restart idempotency is required, back this cache with a persistent
// disk or an external store (e.g. a Supabase table) instead of local disk.
const IDEMPOTENCY_MAX_ENTRIES = 10000;
const IDEMPOTENCY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IDEMPOTENCY_FILENAME = '.webhook-idempotency.json';

// How long an in-flight marker is trusted before it is treated as stale.
// Any legitimate delivery settles in seconds (Stripe's own HTTP call times out
// far sooner); five minutes is orders of magnitude beyond that while staying
// far inside Stripe's multi-day retry horizon. Expiry is always safe: it only
// allows a second handler to run concurrently, and duplicate license creation
// is still prevented by the handler-level dedupe plus the unique index on
// transaction_id in the database.
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000;

// In-memory map for fast lookups: id -> timestamp
const processedEventMap = new Map();

// Events currently being processed in this process (guards concurrent delivery
// of the same event id, which would otherwise pass the mark-before-create check
// before the first delivery finished).
const inFlightEventIds = new Map();

// Test hook: when set, the idempotency cache is read from/written to this path
// instead of the default location (fault injection for disk-failure tests).
let idempotencyFilePathOverride = null;

// Guards against warning on every cache-miss read once the file is corrupt.
let corruptCacheWarned = false;

function maskLicenseKey(key) {
  if (!key || typeof key !== 'string') return '[unknown]';
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}****`;
}

function getIdempotencyFilePath() {
  if (idempotencyFilePathOverride) return idempotencyFilePathOverride;
  try {
    return path.join(__dirname, '..', IDEMPOTENCY_FILENAME);
  } catch {
    return path.join(process.cwd(), IDEMPOTENCY_FILENAME);
  }
}

function warnCorruptIdempotencyCache(filePath, reason) {
  if (corruptCacheWarned) return;
  corruptCacheWarned = true;
  // Reason only — never the file contents.
  console.warn(
    `[Webhook] Idempotency cache at ${filePath} is unreadable or corrupt (${reason}). ` +
      'Starting with an empty processed-event cache; duplicate protection falls back to the licenses table.'
  );
}

function loadIdempotencyCache() {
  const filePath = getIdempotencyFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      warnCorruptIdempotencyCache(filePath, 'unexpected format');
      return [];
    }
    corruptCacheWarned = false;
    const now = Date.now();
    return parsed.filter((entry) => {
      if (!entry || !entry.id || !entry.ts) return false;
      return now - entry.ts < IDEMPOTENCY_MAX_AGE_MS;
    });
  } catch (err) {
    warnCorruptIdempotencyCache(filePath, (err && err.code) || 'unreadable');
    return [];
  }
}

/**
 * Writes the cache atomically (temp file + rename) so a crash mid-write can
 * never truncate the cache into a corrupt file that would silently reset
 * idempotency state.
 * @param {Array<{id: string, ts: number}>} entries
 * @returns {boolean} true when the cache was durably written
 */
function persistIdempotencyCache(entries) {
  const filePath = getIdempotencyFilePath();
  const tmpPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(entries), 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    // best-effort persistence — log the reason but never throw
    console.warn(`[Webhook] Failed to persist idempotency cache: ${(err && err.code) || (err && err.message) || 'unknown'}`);
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup of the partial temp file
    }
    return false;
  }
}

// Initialize from persisted cache
(function initializeCache() {
  const entries = loadIdempotencyCache();
  for (const entry of entries) {
    processedEventMap.set(entry.id, entry.ts);
  }
})();

/**
 * Checks if an event has already been processed.
 * If not found in memory, reloads from persisted disk cache (survives restarts).
 * @param {string} eventId
 * @returns {boolean}
 */
function isEventProcessed(eventId) {
  if (processedEventMap.has(eventId)) {
    return true;
  }
  // Cache miss — reload from disk (handles application restart)
  const entries = loadIdempotencyCache();
  let found = false;
  for (const entry of entries) {
    processedEventMap.set(entry.id, entry.ts);
    if (entry.id === eventId) {
      found = true;
    }
  }
  return found;
}

/**
 * Marks an event as processed and persists to disk.
 * Called BEFORE license creation to prevent race conditions in concurrent delivery.
 * @param {string} eventId
 * @returns {boolean} whether the mark was durably persisted
 */
function markEventProcessed(eventId) {
  processedEventMap.set(eventId, Date.now());

  // Evict oldest entries if over limit
  if (processedEventMap.size > IDEMPOTENCY_MAX_ENTRIES) {
    const entries = Array.from(processedEventMap.entries())
      .sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, entries.length - IDEMPOTENCY_MAX_ENTRIES);
    for (const [id] of toRemove) {
      processedEventMap.delete(id);
    }
  }

  // Persist current state to disk
  const entries = Array.from(processedEventMap.entries()).map(([id, ts]) => ({ id, ts }));
  return persistIdempotencyCache(entries);
}

/**
 * Removes an event from the processed set (rollback on license creation failure).
 * Allows Stripe to retry the delivery.
 * @param {string} eventId
 * @returns {boolean} whether the rollback was durably persisted
 */
function unmarkEventProcessed(eventId) {
  processedEventMap.delete(eventId);
  // Persist updated state to disk
  const entries = Array.from(processedEventMap.entries()).map(([id, ts]) => ({ id, ts }));
  return persistIdempotencyCache(entries);
}

/**
 * Checks whether a delivery for this event id is still running in this
 * process. Markers older than IN_FLIGHT_TTL_MS are treated as stale (the
 * original handler hung or crashed without reaching its `finally` block) and
 * are deleted on sight, so a stuck delivery can never block Stripe's retries
 * of that event forever.
 *
 * Expiring a marker can never create a duplicate license: it only allows the
 * event to be reprocessed concurrently, and the handler-level dedupe plus the
 * database unique index on transaction_id still guard creation.
 * @param {string} eventId
 * @returns {boolean}
 */
function isEventInFlight(eventId) {
  const startedAt = inFlightEventIds.get(eventId);
  if (startedAt === undefined) return false;
  if (Date.now() - startedAt <= IN_FLIGHT_TTL_MS) return true;
  inFlightEventIds.delete(eventId);
  console.warn(
    `[Webhook:Stripe] In-flight marker for ${eventId} expired after ${IN_FLIGHT_TTL_MS}ms ` +
      '(the original delivery never settled); allowing reprocessing. Database unique constraints still prevent duplicate licenses.'
  );
  return false;
}

/**
 * Returns the license a checkout event already produced, if any.
 * Checks subscription id first, then transaction id, so a re-delivered
 * checkout is recognized as a duplicate even when the idempotency cache was
 * lost (crash between mark and commit, cache expiry, or ephemeral filesystem).
 * @param {{ subscriptionId: string|null, transactionId: string|null }|null} details
 * @returns {Promise<Object|null>}
 */
async function findExistingCheckoutLicense(details) {
  if (!details) return null;
  if (details.subscriptionId) {
    const bySubscription = await findLicenseBySubscriptionId(details.subscriptionId);
    if (bySubscription) return bySubscription;
  }
  if (details.transactionId) {
    const byTransaction = await findLicenseByTransactionId(details.transactionId);
    if (byTransaction) return byTransaction;
  }
  return null;
}

/**
 * Decides how to treat an event whose id is already in the processed cache:
 *
 *   - 'ack'       → the side effect the event produced is verifiably present
 *                   (or the event never had one); answer 200 duplicate.
 *   - 'reprocess' → the mark is stale (crash between mark and commit): unmark
 *                   and run the handler again.
 *   - 'retry'     → verification itself failed (database unavailable); answer
 *                   503 so Stripe retries. Never ack on an unverifiable state.
 *
 * Only verifiable, regression-safe checks can reprocess:
 *   - checkout.session.completed: license existence (subscription id, then
 *     transaction id).
 *   - customer.subscription.deleted: terminal cancellation state; the update
 *     is idempotent, so re-applying it is always safe.
 *   - invoice.payment_succeeded: billing period is forward-only; reprocess
 *     only when the stored period is strictly older than the event's, so a
 *     retried older event can never regress a newer period.
 *
 * customer.subscription.updated and invoice.payment_failed are acknowledged
 * from the mark alone: their fields are not monotonic, so re-applying a stale
 * event could overwrite newer state; the next lifecycle event re-syncs them.
 * @param {string|null} category
 * @param {Object} event
 * @returns {Promise<'ack'|'reprocess'|'retry'>}
 */
async function classifyDuplicateEvent(category, event) {
  if (category === 'checkout') {
    let existing = null;
    try {
      existing = await findExistingCheckoutLicense(stripeProvider.extractCheckoutDetails(event));
    } catch (err) {
      console.warn(`[Webhook:Stripe] Duplicate checkout ${event.id} could not be verified: ${err.message}`);
      return 'retry';
    }
    return existing ? 'ack' : 'reprocess';
  }

  if (category === 'subscription' && event.type === 'customer.subscription.deleted') {
    const details = stripeProvider.extractSubscriptionDeleteDetails(event);
    let existing = null;
    try {
      existing = await findLicenseBySubscriptionId(details && details.subscriptionId);
    } catch (err) {
      console.warn(`[Webhook:Stripe] Duplicate subscription deletion ${event.id} could not be verified: ${err.message}`);
      return 'retry';
    }
    // No license → the original run had nothing to cancel (ack). Canceled →
    // the side effect is applied (ack). Otherwise the cancellation was lost in
    // a crash window — re-apply it (idempotent, terminal state).
    if (existing && existing.subscription_status !== 'canceled') return 'reprocess';
    return 'ack';
  }

  if (category === 'invoice' && event.type === 'invoice.payment_succeeded') {
    const details = stripeProvider.extractInvoicePaymentSucceeded(event);
    let existing = null;
    try {
      existing = await findLicenseBySubscriptionId(details && details.subscriptionId);
    } catch (err) {
      console.warn(`[Webhook:Stripe] Duplicate invoice ${event.id} could not be verified: ${err.message}`);
      return 'retry';
    }
    if (!existing || !details || !details.currentPeriodEnd) return 'ack';
    const eventEnd = Date.parse(details.currentPeriodEnd);
    const storedEnd = Date.parse(existing.current_period_end);
    if (Number.isNaN(eventEnd)) return 'ack';
    // Reprocess only when the stored period is strictly older than the event's
    // (the extension was lost in a crash window). Equal or newer means the
    // event was applied or superseded — ack without touching state.
    if (Number.isNaN(storedEnd) || storedEnd < eventEnd) return 'reprocess';
    return 'ack';
  }

  // customer.subscription.updated / invoice.payment_failed / unknown types:
  // idempotent updates acknowledged from the mark alone (see doc comment).
  return 'ack';
}

/**
 * Handle checkout.session.completed — creates a new subscription license.
 * One subscription = one license record.
 */
async function handleCheckoutCompleted(event) {
  const details = stripeProvider.extractCheckoutDetails(event);
  if (!details) {
    // Cannot resolve checkout details — return error so Stripe retries
    console.warn(`[Webhook:Stripe] Could not resolve checkout details for event ${event.id}`);
    return { status: 400, body: { error: 'Could not resolve checkout session details' } };
  }

  const { customerEmail, tier, transactionId, subscriptionId, customerId } = details;

  // Duplicate protection: one subscription AND one transaction = one license.
  // Checking the transaction id as well means a retry (or reprocessing after a
  // lost idempotency cache) can never create a second license.
  const existing = await findExistingCheckoutLicense(details);
  if (existing) {
    console.log(`[Webhook:Stripe] Checkout ${transactionId} already has license ${maskLicenseKey(existing.license_key)}, skipping creation`);
    return { status: 200, body: { received: true, duplicate: true, licenseKey: existing.license_key } };
  }

  // Retrieve userId from checkout session metadata.
  // First try event.data.object.metadata (already in webhook payload),
  // then fall back to retrieving the full session via API if needed.
  let userIdFromMetadata = event.data?.object?.metadata?.userId || null;

  if (!userIdFromMetadata) {
    try {
      const session = await stripeProvider.stripe.checkout.sessions.retrieve(event.data.object.id);
      userIdFromMetadata = session.metadata?.userId || null;
    } catch (err) {
      console.warn('[Webhook:Stripe] Could not retrieve checkout session:', err.message);
    }
  }

  console.log(`[Webhook:Stripe] Processing subscription for ${maskEmail(customerEmail)}: tier = ${tier}`);

  // Create license with subscription fields.
  // requireRemote: a Stripe checkout must produce a persisted Supabase license;
  // on failure the thrown error rolls back the idempotency mark (HTTP 500) so
  // Stripe retries instead of a local-only license masking the outage.
  const licenseResult = await createLicense({
    tier,
    customerEmail,
    transactionId,
    paymentProvider: 'stripe',
    stripeSubscriptionId: subscriptionId || null,
    stripeCustomerId: customerId || null,
    subscriptionStatus: 'active',
    currentPeriodStart: details.currentPeriodStart || new Date().toISOString(),
    currentPeriodEnd: details.currentPeriodEnd || null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    planInterval: 'month',
    requireRemote: true,
  });

  // Link license to authenticated user if userId is available from metadata
  if (userIdFromMetadata) {
    const linkResult = await linkLicenseToUser(licenseResult.licenseKey, userIdFromMetadata);
    if (!linkResult.success) {
      console.warn('[Webhook:Stripe] Failed to link license to user:', linkResult.error);
    }
  }

  // Send confirmation email
  const emailResult = await deliverLicenseEmail(licenseResult.id);
  if (!emailResult.success) {
    console.warn(`[Webhook:Stripe] License email delivery failed for ${maskEmail(customerEmail)}: ${emailResult.error}`);
  }

  return {
    status: 200,
    body: {
      received: true,
      tier: licenseResult.tier,
      emailStatus: emailResult.email_status,
    },
  };
}

/**
 * Handle customer.subscription.updated — updates existing license subscription fields.
 * Never creates a second license.
 */
async function handleSubscriptionUpdated(event) {
  const details = stripeProvider.extractSubscriptionUpdateDetails(event);
  if (!details) {
    return { status: 200, body: { received: true, unhandledType: event.type } };
  }

  const { subscriptionId, tier, subscriptionStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt, customerId } = details;

  const existing = await findLicenseBySubscriptionId(subscriptionId);
  if (!existing) {
    console.warn(`[Webhook:Stripe] Subscription ${subscriptionId} not found for update, ignoring`);
    return { status: 200, body: { received: true, noLicense: true } };
  }

  const updates = {
    subscription_status: subscriptionStatus,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt,
    stripe_customer_id: customerId,
  };

  // Update tier only if it changed (plan upgrade/downgrade)
  if (tier && tier !== existing.tier) {
    updates.tier = tier;
    console.log(`[Webhook:Stripe] Subscription ${subscriptionId} tier changed: ${existing.tier} -> ${tier}`);
  }

  await updateLicenseSubscription(existing.id || existing.license_key, updates);

  console.log(`[Webhook:Stripe] Updated subscription ${subscriptionId}: status=${subscriptionStatus}, cancel_at_period_end=${cancelAtPeriodEnd}`);

  return { status: 200, body: { received: true } };
}

/**
 * Handle customer.subscription.deleted — marks license subscription as canceled.
 * Does not immediately revoke the license; access continues until current_period_end.
 */
async function handleSubscriptionDeleted(event) {
  const details = stripeProvider.extractSubscriptionDeleteDetails(event);
  if (!details) {
    return { status: 200, body: { received: true, unhandledType: event.type } };
  }

  const { subscriptionId } = details;

  const existing = await findLicenseBySubscriptionId(subscriptionId);
  if (!existing) {
    console.warn(`[Webhook:Stripe] Subscription ${subscriptionId} not found for deletion, ignoring`);
    return { status: 200, body: { received: true, noLicense: true } };
  }

  await updateLicenseSubscription(existing.id || existing.license_key, {
    subscription_status: 'canceled',
    cancel_at_period_end: false,
    canceled_at: new Date().toISOString(),
  });

  console.log(`[Webhook:Stripe] Subscription ${subscriptionId} marked as canceled`);

  return { status: 200, body: { received: true } };
}

/**
 * Handle invoice.payment_succeeded — extends billing period for existing subscription.
 * Never creates a second license.
 */
async function handleInvoicePaymentSucceeded(event) {
  const details = stripeProvider.extractInvoicePaymentSucceeded(event);
  if (!details) {
    return { status: 200, body: { received: true, unhandledType: event.type } };
  }

  const { subscriptionId, currentPeriodStart, currentPeriodEnd } = details;

  const existing = await findLicenseBySubscriptionId(subscriptionId);
  if (!existing) {
    console.warn(`[Webhook:Stripe] Subscription ${subscriptionId} not found for invoice update, ignoring`);
    return { status: 200, body: { received: true, noLicense: true } };
  }

  await updateLicenseSubscription(existing.id || existing.license_key, {
    subscription_status: 'active',
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
  });

  console.log(`[Webhook:Stripe] Invoice payment succeeded for subscription ${subscriptionId}, period extended`);

  return { status: 200, body: { received: true } };
}

/**
 * Handle invoice.payment_failed — sets subscription to past_due.
 * Does NOT immediately revoke access; preserves grace period.
 */
async function handleInvoicePaymentFailed(event) {
  const details = stripeProvider.extractInvoicePaymentFailed(event);
  if (!details) {
    return { status: 200, body: { received: true, unhandledType: event.type } };
  }

  const { subscriptionId } = details;

  const existing = await findLicenseBySubscriptionId(subscriptionId);
  if (!existing) {
    console.warn(`[Webhook:Stripe] Subscription ${subscriptionId} not found for failed invoice, ignoring`);
    return { status: 200, body: { received: true, noLicense: true } };
  }

  await updateLicenseSubscription(existing.id || existing.license_key, {
    subscription_status: 'past_due',
  });

  console.log(`[Webhook:Stripe] Invoice payment failed for subscription ${subscriptionId}, marked as past_due`);

  return { status: 200, body: { received: true } };
}

/**
 * Stripe webhook endpoint.
 * Note: Must receive raw Buffer body for signature verification!
 *
 * Idempotency strategy:
 *   - Event is marked as processed BEFORE license creation (mark-before-create).
 *   - The mark is persisted atomically; a failed disk write is logged and the
 *     event still relies on the database dedupe below.
 *   - If license creation fails (or the handler reports a non-2xx result), the
 *     mark is rolled back so Stripe can retry.
 *   - A duplicate is acknowledged only after verifying that the side effect it
 *     promised actually persisted: checkout → license existence (subscription
 *     id, then transaction id); subscription.deleted → cancellation state;
 *     invoice.payment_succeeded → billing period is not older than the event's.
 *     A stale mark without a persisted side effect is unmarked and reprocessed.
 *   - Concurrent deliveries of one event in this process are deferred with 503
 *     while an in-flight marker is fresh; markers expire after
 *     IN_FLIGHT_TTL_MS so a hung delivery can never block retries forever.
 *   - The transaction_id partial unique index in the database is the final
 *     defense against duplicate license creation from concurrent delivery.
 *
 * Subscription lifecycle events:
 *   - checkout.session.completed → create license
 *   - customer.subscription.updated → update license
 *   - customer.subscription.deleted → mark canceled
 *   - invoice.payment_succeeded → extend period
 *   - invoice.payment_failed → mark past_due
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;

    // 1. Cryptographic signature verification
    try {
      event = await stripeProvider.verifyWebhookEvent(req.body, req.headers);
    } catch (err) {
      console.warn(`[Webhook:Stripe] Signature verification failed: ${err.message}`);
      return res.status(400).json({ error: err.message });
    }

    // 2. Determine event category (needed by the idempotency check below)
    const category = stripeProvider.getEventCategory(event);

    // 3. Durable idempotency check (persists across restarts).
    //    A duplicate is acknowledged only when the side effect it promised is
    //    verifiably persisted. A "processed" mark whose side effect never
    //    happened (crash between mark and commit, or a rollback whose disk
    //    write failed) is unmarked and reprocessed instead.
    if (isEventProcessed(event.id)) {
      const decision = await classifyDuplicateEvent(category, event);

      if (decision === 'ack') {
        console.log(`[Webhook:Stripe] Duplicate event ignored: ${event.id}`);
        return res.status(200).json({ received: true, duplicate: true });
      }

      if (decision === 'retry') {
        // Verification failed (e.g. database outage) — never ack blindly.
        return res.status(503).json({ error: 'License state could not be verified; retry required' });
      }

      // decision === 'reprocess': stale mark. Defer to a delivery that is
      // still running in this process (its TTL expires stale markers).
      if (isEventInFlight(event.id)) {
        console.log(`[Webhook:Stripe] Delivery for ${event.id} is still in flight; deferring to the in-progress handler`);
        return res.status(503).json({ error: 'Event is still being processed; retry required' });
      }
      console.warn(`[Webhook:Stripe] Stale processed mark for ${event.id}: no persisted side effect found — reprocessing`);
      unmarkEventProcessed(event.id);
    }

    if (!category) {
      // Unknown event type — mark as processed (no side effects) and return
      markEventProcessed(event.id);
      return res.status(200).json({ received: true, unhandledType: event.type });
    }

    // 4. Mark event as processed BEFORE any state changes.
    //    If processing fails, the mark is rolled back for Stripe retry.
    markEventProcessed(event.id);
    inFlightEventIds.set(event.id, Date.now());

    try {
      let result;

      switch (category) {
        case 'checkout':
          result = await handleCheckoutCompleted(event);
          break;
        case 'subscription':
          if (event.type === 'customer.subscription.updated') {
            result = await handleSubscriptionUpdated(event);
          } else if (event.type === 'customer.subscription.deleted') {
            result = await handleSubscriptionDeleted(event);
          } else {
            result = { status: 200, body: { received: true, unhandledType: event.type } };
          }
          break;
        case 'invoice':
          if (event.type === 'invoice.payment_succeeded') {
            result = await handleInvoicePaymentSucceeded(event);
          } else if (event.type === 'invoice.payment_failed') {
            result = await handleInvoicePaymentFailed(event);
          } else {
            result = { status: 200, body: { received: true, unhandledType: event.type } };
          }
          break;
        default:
          result = { status: 200, body: { received: true, unhandledType: event.type } };
      }

      if (result.status >= 400) {
        // The handler did not complete its side effects — do not retain the
        // processed mark, or Stripe's retry would be acknowledged as a
        // duplicate and the event dropped without a license.
        console.warn(`[Webhook:Stripe] ${event.type} not processed (status ${result.status}); rolling back idempotency mark so Stripe can retry`);
        unmarkEventProcessed(event.id);
      }

      return res.status(result.status).json(result.body);
    } catch (err) {
      // Rollback: unmark event so Stripe can retry the delivery
      unmarkEventProcessed(event.id);
      console.error(`[Webhook:Stripe] Error processing ${event.type}: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error processing webhook' });
    } finally {
      inFlightEventIds.delete(event.id);
    }
  }
);

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'reel-cutter-payment-webhook' });
});

// Helper for tests to reset idempotency cache (both in-memory and persisted)
router.resetProcessedEvents = () => {
  processedEventMap.clear();
  inFlightEventIds.clear();
  try {
    const filePath = getIdempotencyFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // best-effort cleanup
  }
  idempotencyFilePathOverride = null;
  corruptCacheWarned = false;
};

// Test helper: expose the in-memory map for restart simulation tests
router.__getProcessedEventMap = () => processedEventMap;

// Test helper: expose the in-flight map for TTL/expiry tests
router.__getInFlightEventIds = () => inFlightEventIds;

// Test helper: redirect the idempotency cache file (disk-failure fault
// injection). Pass null to restore the default location; resetProcessedEvents()
// also restores the default.
router.__setIdempotencyFilePathForTests = (filePath) => {
  idempotencyFilePathOverride = filePath || null;
  corruptCacheWarned = false;
};

module.exports = router;
