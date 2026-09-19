const express = require('express');
const fs = require('fs');
const path = require('path');
const StripeProvider = require('../providers/stripeProvider');
const { createLicense, findLicenseBySubscriptionId, updateLicenseSubscription } = require('../services/licenseGenerator');
const { sendLicenseEmail, deliverLicenseEmail, maskEmail } = require('../services/emailService');
const { linkLicenseToUser } = require('../services/licenseService');

const router = express.Router();
const stripeProvider = new StripeProvider();

// Durable idempotency: persisted to disk to survive application restarts
const IDEMPOTENCY_MAX_ENTRIES = 10000;
const IDEMPOTENCY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IDEMPOTENCY_FILENAME = '.webhook-idempotency.json';

function getIdempotencyFilePath() {
  try {
    return path.join(__dirname, '..', IDEMPOTENCY_FILENAME);
  } catch {
    return path.join(process.cwd(), IDEMPOTENCY_FILENAME);
  }
}

function loadIdempotencyCache() {
  try {
    const filePath = getIdempotencyFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        return parsed.filter((entry) => {
          if (!entry || !entry.id || !entry.ts) return false;
          return now - entry.ts < IDEMPOTENCY_MAX_AGE_MS;
        });
      }
    }
  } catch {
    // corrupt or missing file — start fresh
  }
  return [];
}

function persistIdempotencyCache(entries) {
  try {
    const filePath = getIdempotencyFilePath();
    const data = JSON.stringify(entries);
    fs.writeFileSync(filePath, data, 'utf8');
  } catch {
    // best-effort persistence — log but don't throw
    console.warn('[Webhook] Failed to persist idempotency cache');
  }
}

// In-memory map for fast lookups: id -> timestamp
const processedEventMap = new Map();

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
  persistIdempotencyCache(entries);
}

/**
 * Removes an event from the processed set (rollback on license creation failure).
 * Allows Stripe to retry the delivery.
 * @param {string} eventId
 */
function unmarkEventProcessed(eventId) {
  processedEventMap.delete(eventId);
  // Persist updated state to disk
  const entries = Array.from(processedEventMap.entries()).map(([id, ts]) => ({ id, ts }));
  persistIdempotencyCache(entries);
}

/**
 * Handle checkout.session.completed — creates a new subscription license.
 * One subscription = one license record.
 */
async function handleCheckoutCompleted(event) {
  const details = stripeProvider.extractCheckoutDetails(event);
  if (!details) {
    return { status: 200, body: { received: true, unhandledType: event.type } };
  }

  const { customerEmail, tier, transactionId, subscriptionId, customerId } = details;

  // If subscription ID is present, check for existing license (duplicate protection)
  if (subscriptionId) {
    const existing = await findLicenseBySubscriptionId(subscriptionId);
    if (existing) {
      console.log(`[Webhook:Stripe] Subscription ${subscriptionId} already has license ${existing.license_key}, skipping creation`);
      return { status: 200, body: { received: true, duplicate: true, licenseKey: existing.license_key } };
    }
  }

  // Retrieve userId from checkout session metadata
  let userIdFromMetadata = null;
  try {
    const session = await stripeProvider.stripe.checkout.sessions.retrieve(event.id);
    userIdFromMetadata = session.metadata?.userId || null;
  } catch (err) {
    userIdFromMetadata = event.data?.object?.metadata?.userId || null;
    if (!userIdFromMetadata) {
      console.warn('[Webhook:Stripe] Could not retrieve checkout session:', err.message);
    }
  }

  console.log(`[Webhook:Stripe] Processing subscription for ${maskEmail(customerEmail)}: tier = ${tier}`);

  // Create license with subscription fields
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
 *   - If license creation fails, the mark is rolled back so Stripe can retry.
 *   - The database transaction_id and subscription_id unique constraints provide
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

    // 2. Durable idempotency check (persists across restarts)
    if (isEventProcessed(event.id)) {
      console.log(`[Webhook:Stripe] Duplicate event ignored: ${event.id}`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // 3. Determine event category and route to appropriate handler
    const category = stripeProvider.getEventCategory(event);

    if (!category) {
      // Unknown event type — mark as processed (no side effects) and return
      markEventProcessed(event.id);
      return res.status(200).json({ received: true, unhandledType: event.type });
    }

    // 4. Mark event as processed BEFORE any state changes.
    //    If processing fails, the mark is rolled back for Stripe retry.
    markEventProcessed(event.id);

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

      return res.status(result.status).json(result.body);
    } catch (err) {
      // Rollback: unmark event so Stripe can retry the delivery
      unmarkEventProcessed(event.id);
      console.error(`[Webhook:Stripe] Error processing ${event.type}: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error processing webhook' });
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
  try {
    const filePath = getIdempotencyFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // best-effort cleanup
  }
};

// Test helper: expose the in-memory map for restart simulation tests
router.__getProcessedEventMap = () => processedEventMap;

module.exports = router;
