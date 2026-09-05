const Stripe = require('stripe');
const PaymentProvider = require('./paymentProvider');
const config = require('../config');

class StripeProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.secretKey = options.secretKey || config.stripe.secretKey;
    this.webhookSecret = options.webhookSecret || config.stripe.webhookSecret;
    this.priceIds = options.priceIds || config.stripe.priceIds;
    this.stripe = new Stripe(this.secretKey);
  }

  getName() {
    return 'stripe';
  }

  /**
   * Verifies the cryptographic signature of an incoming Stripe webhook request
   * @param {Buffer} rawBody
   * @param {Object} headers
   * @returns {Promise<Object>}
   */
  async verifyWebhookEvent(rawBody, headers) {
    const signature = headers['stripe-signature'];
    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );
      return event;
    } catch (err) {
      throw new Error(`Stripe signature verification failed: ${err.message}`);
    }
  }

  /**
   * Maps a Stripe Price ID to its corresponding tier (basic, standard, pro)
   * Never trusts the price amount sent directly by the client.
   *
   * @param {string} priceId
   * @returns {'basic'|'standard'|'pro'|null}
   */
  mapPriceIdToTier(priceId) {
    if (!priceId) return null;
    return this.priceIds[priceId] || null;
  }

  /**
   * Extracts customer email, tier, transaction ID, and event ID from a verified Stripe event
   * Supports checkout.session.completed and payment_intent.succeeded
   *
   * @param {Object} event
   * @returns {{ customerEmail: string, tier: string, transactionId: string, eventId: string } | null}
   */
  extractPaymentDetails(event) {
    if (!event || !event.type) return null;

    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const customerEmail =
        session.customer_details?.email ||
        session.customer_email ||
        session.metadata?.customer_email ||
        '';

      // 1. Check line items price ID (most reliable)
      let tier = null;
      if (session.line_items && Array.isArray(session.line_items.data)) {
        for (const item of session.line_items.data) {
          const matched = this.mapPriceIdToTier(item.price?.id);
          if (matched) {
            tier = matched;
            break;
          }
        }
      }

      // 2. Check metadata or client_reference_id if line_items not expanded
      if (!tier && session.metadata?.price_id) {
        tier = this.mapPriceIdToTier(session.metadata.price_id);
      }
      if (!tier && session.metadata?.tier) {
        const declared = session.metadata.tier.toLowerCase();
        if (['basic', 'standard', 'pro'].includes(declared)) {
          tier = declared;
        }
      }

      // Default fallback if price was verified in metadata
      if (!tier) {
        tier = 'standard';
      }

      return {
        customerEmail,
        tier,
        transactionId: session.payment_intent || session.id,
        eventId: event.id,
      };
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data?.object || {};
      const customerEmail =
        pi.receipt_email ||
        pi.metadata?.customer_email ||
        '';

      let tier = null;
      if (pi.metadata?.price_id) {
        tier = this.mapPriceIdToTier(pi.metadata.price_id);
      }
      if (!tier && pi.metadata?.tier) {
        const declared = pi.metadata.tier.toLowerCase();
        if (['basic', 'standard', 'pro'].includes(declared)) {
          tier = declared;
        }
      }

      if (!tier) {
        tier = 'standard';
      }

      return {
        customerEmail,
        tier,
        transactionId: pi.id,
        eventId: event.id,
      };
    }

    return null;
  }
}

module.exports = StripeProvider;
