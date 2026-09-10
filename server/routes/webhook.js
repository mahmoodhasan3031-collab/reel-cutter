const express = require('express');
const StripeProvider = require('../providers/stripeProvider');
const { createLicense } = require('../services/licenseGenerator');
const { sendLicenseEmail, deliverLicenseEmail } = require('../services/emailService');
const { maskEmail } = require('../services/emailService');

const router = express.Router();
const stripeProvider = new StripeProvider();

// Idempotency cache: Set of processed event IDs to prevent duplicate fulfillment
const processedEventIds = new Set();

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

    // 2. Idempotency check
    if (processedEventIds.has(event.id)) {
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

      // 6. Mark event as processed
      processedEventIds.add(event.id);

      // Keep cache bounded
      if (processedEventIds.size > 10000) {
        const first = processedEventIds.values().next().value;
        processedEventIds.delete(first);
      }

      return res.status(200).json({
        received: true,
        licenseKey: licenseResult.licenseKey,
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

// Helper for tests to reset idempotency cache
router.resetProcessedEvents = () => {
  processedEventIds.clear();
};

module.exports = router;
