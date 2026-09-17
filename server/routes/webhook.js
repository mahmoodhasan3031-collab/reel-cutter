const express = require('express');
const fs = require('fs');
const path = require('path');
const StripeProvider = require('../providers/stripeProvider');
const { createLicense } = require('../services/licenseGenerator');
const { sendLicenseEmail, deliverLicenseEmail } = require('../services/emailService');
const { maskEmail } = require('../services/emailService');

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
 * Stripe webhook endpoint.
 * Note: Must receive raw Buffer body for signature verification!
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

    // 3. Process payment success events
    const paymentDetails = stripeProvider.extractPaymentDetails(event);

    if (!paymentDetails) {
      // Not a payment completion event (e.g. charge.updated, customer.created)
      return res.status(200).json({ received: true, unhandledType: event.type });
    }

    try {
      const { customerEmail, tier, transactionId, eventId } = paymentDetails;

      console.log(`[Webhook:Stripe] Processing payment for ${maskEmail(customerEmail)}: tier = ${tier}`);

      // 4. Generate unique XXXX-XXXX-XXXX-XXXX license and insert into Supabase
      const licenseResult = await createLicense({
        tier,
        customerEmail,
        transactionId,
        paymentProvider: 'stripe',
      });

      // 5. Send confirmation email and persist delivery status/attempts
      const emailResult = await deliverLicenseEmail(licenseResult.id);
      if (!emailResult.success) {
        console.warn(`[Webhook:Stripe] License email delivery failed for ${maskEmail(customerEmail)}: ${emailResult.error}`);
      }

      // 6. Mark event as processed (durable — survives restarts)
      markEventProcessed(event.id);

      return res.status(200).json({
        received: true,
        tier: licenseResult.tier,
        emailStatus: emailResult.email_status,
      });
    } catch (err) {
      console.error(`[Webhook:Stripe] Error fulfilling order: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error processing payment' });
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
