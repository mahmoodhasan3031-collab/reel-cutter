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
   * Determines the event category for routing in the webhook handler.
   *
   * @param {Object} event - Verified Stripe event
   * @returns {'checkout'|'subscription'|'invoice'|null}
   */
  getEventCategory(event) {
    if (!event || !event.type) return null;
    if (event.type === 'checkout.session.completed') return 'checkout';
    if (event.type.startsWith('customer.subscription.')) return 'subscription';
    if (event.type.startsWith('invoice.')) return 'invoice';
    return null;
  }

  /**
   * Extracts subscription details from a verified Stripe checkout.session.completed event.
   *
   * @param {Object} event
   * @returns {{ customerEmail: string, tier: string, transactionId: string, eventId: string,
   *             subscriptionId: string|null, customerId: string|null,
   *             currentPeriodStart: string|null, currentPeriodEnd: string|null } | null}
   */
  extractCheckoutDetails(event) {
    if (!event || event.type !== 'checkout.session.completed') return null;

    const session = event.data?.object || {};
    const customerEmail =
      session.customer_details?.email ||
      session.customer_email ||
      session.metadata?.customer_email ||
      '';

    // Determine tier from server-side price ID mapping (most reliable)
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

    // Fallback: metadata tier (only if it matches a valid server-side tier)
    if (!tier && session.metadata?.tier) {
      const declared = session.metadata.tier.toLowerCase();
      if (['basic', 'standard', 'pro'].includes(declared)) {
        tier = declared;
      }
    }

    if (!tier) return null;

    const subscriptionId = session.subscription || null;
    const customerId = session.customer || null;

    // Billing period from subscription data (may not be populated on session)
    let currentPeriodStart = null;
    let currentPeriodEnd = null;
    if (session.subscription_data) {
      currentPeriodStart = session.subscription_data.billing_cycle_anchor
        ? new Date(session.subscription_data.billing_cycle_anchor * 1000).toISOString()
        : null;
    }

    return {
      customerEmail,
      tier,
      transactionId: session.payment_intent || session.id,
      eventId: event.id,
      subscriptionId,
      customerId,
      currentPeriodStart,
      currentPeriodEnd,
    };
  }

  /**
   * Extracts subscription update details from a customer.subscription.updated event.
   *
   * @param {Object} event
   * @returns {{ subscriptionId: string, customerId: string, tier: string|null,
   *             subscriptionStatus: string, currentPeriodStart: string|null,
   *             currentPeriodEnd: string|null, cancelAtPeriodEnd: boolean,
   *             canceledAt: string|null } | null}
   */
  extractSubscriptionUpdateDetails(event) {
    if (!event || event.type !== 'customer.subscription.updated') return null;

    const sub = event.data?.object || {};
    const subscriptionId = sub.id;
    const customerId = sub.customer || null;
    const subscriptionStatus = sub.status || null;

    // Determine tier from current_period's plan price
    let tier = null;
    if (sub.items && sub.items.data && sub.items.data.length > 0) {
      const priceId = sub.items.data[0].price?.id;
      tier = this.mapPriceIdToTier(priceId);
    }

    // Fallback: metadata tier
    if (!tier && sub.metadata?.tier) {
      const declared = sub.metadata.tier.toLowerCase();
      if (['basic', 'standard', 'pro'].includes(declared)) {
        tier = declared;
      }
    }

    const currentPeriodStart = sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null;
    const currentPeriodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    return {
      subscriptionId,
      customerId,
      tier,
      subscriptionStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    };
  }

  /**
   * Extracts subscription deletion details from a customer.subscription.deleted event.
   *
   * @param {Object} event
   * @returns {{ subscriptionId: string, customerId: string } | null}
   */
  extractSubscriptionDeleteDetails(event) {
    if (!event || event.type !== 'customer.subscription.deleted') return null;

    const sub = event.data?.object || {};
    return {
      subscriptionId: sub.id,
      customerId: sub.customer || null,
    };
  }

  /**
   * Extracts invoice payment success details from an invoice.payment_succeeded event.
   *
   * @param {Object} event
   * @returns {{ subscriptionId: string, customerId: string, invoiceId: string,
   *             currentPeriodStart: string|null, currentPeriodEnd: string|null } | null}
   */
  extractInvoicePaymentSucceeded(event) {
    if (!event || event.type !== 'invoice.payment_succeeded') return null;

    const invoice = event.data?.object || {};
    const subscriptionId = invoice.subscription || null;

    // Only handle subscription invoices (not one-time invoices)
    if (!subscriptionId) return null;

    const customerId = invoice.customer || null;
    const invoiceId = invoice.id || null;

    // The invoice period is the source of truth for the new billing period
    let currentPeriodStart = null;
    let currentPeriodEnd = null;
    if (invoice.period_start) {
      currentPeriodStart = new Date(invoice.period_start * 1000).toISOString();
    }
    if (invoice.period_end) {
      currentPeriodEnd = new Date(invoice.period_end * 1000).toISOString();
    }

    return {
      subscriptionId,
      customerId,
      invoiceId,
      currentPeriodStart,
      currentPeriodEnd,
    };
  }

  /**
   * Extracts invoice payment failure details from an invoice.payment_failed event.
   *
   * @param {Object} event
   * @returns {{ subscriptionId: string, customerId: string, invoiceId: string } | null}
   */
  extractInvoicePaymentFailed(event) {
    if (!event || event.type !== 'invoice.payment_failed') return null;

    const invoice = event.data?.object || {};
    const subscriptionId = invoice.subscription || null;

    if (!subscriptionId) return null;

    return {
      subscriptionId,
      customerId: invoice.customer || null,
      invoiceId: invoice.id || null,
    };
  }

  /**
   * Legacy: Extracts customer email, tier, transaction ID, and event ID from a verified Stripe event.
   * Supports checkout.session.completed and payment_intent.succeeded.
   * Kept for backward compatibility with existing one-time payment code paths.
   *
   * @param {Object} event
   * @returns {{ customerEmail: string, tier: string, transactionId: string, eventId: string } | null}
   */
  extractPaymentDetails(event) {
    if (!event || !event.type) return null;

    if (event.type === 'checkout.session.completed') {
      const result = this.extractCheckoutDetails(event);
      if (!result) return null;
      return {
        customerEmail: result.customerEmail,
        tier: result.tier,
        transactionId: result.transactionId,
        eventId: result.eventId,
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

      if (!tier) return null;

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
