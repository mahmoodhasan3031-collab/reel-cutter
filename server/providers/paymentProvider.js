/**
 * Abstract Payment Provider Interface
 * Allows seamless integration of multiple payment gateways (Stripe, SSLCommerz, etc.)
 */
class PaymentProvider {
  /**
   * Provider identifier name
   * @returns {string}
   */
  getName() {
    throw new Error('PaymentProvider.getName must be implemented');
  }

  /**
   * Verifies an incoming webhook payload using provider-specific cryptographic signatures
   * @param {Buffer|string} rawBody
   * @param {Object} headers
   * @returns {Promise<Object>} The verified event object
   */
  async verifyWebhookEvent(rawBody, headers) {
    throw new Error('PaymentProvider.verifyWebhookEvent must be implemented');
  }

  /**
   * Extracts customer email, verified tier, and transaction ID from a verified event
   * @param {Object} event
   * @returns {{ customerEmail: string, tier: string, transactionId: string, eventId: string } | null}
   */
  extractPaymentDetails(event) {
    throw new Error('PaymentProvider.extractPaymentDetails must be implemented');
  }
}

module.exports = PaymentProvider;
