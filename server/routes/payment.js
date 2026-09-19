const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const config = require('../config');
const { validateLicenseKey, validateHwid, allowMethods, stripUnknownFields } = require('../middleware/inputValidator');
const { activateLimiter, validateLimiter, statusLimiter } = require('../middleware/rateLimiter');

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

// Helper: map website planId to server-side Stripe Price ID
function getStripePriceId(planId) {
  const priceMap = config.stripe.priceIds;
  const mapping = {
    basic: priceMap.basic || priceMap.price_basic_10 || null,
    standard: priceMap.standard || priceMap.price_standard_20 || null,
    pro: priceMap.pro || priceMap.price_pro_30 || null,
  };
  return mapping[planId] || null;
}

// Helper: build safe success URL (based on configured origin only)
function buildSuccessUrl() {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  // Use the first allowed origin for success URL
  const base = allowedOrigins[0] || 'http://localhost:3000';
  return `${base}/checkout/success`;
}

// Build safe cancel URL
function buildCancelUrl() {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  const base = allowedOrigins[0] || 'http://localhost:3000';
  return `${base}/checkout/cancel`;
}

/**
 * POST /api/checkout/create-checkout-session
 * Creates a Stripe Checkout Session for a one-time purchase.
 *
 * Request: { planId: 'basic'|'standard'|'pro', email?: string, userId?: string }
 * Response: { success: true, sessionId, url }
 *         or: { success: false, error: { code, message } }
 */
router.post('/create-checkout-session',
  allowMethods(['POST']),
  stripUnknownFields(['planId', 'email', 'userId']),
  async (req, res) => {
    const { planId, email, userId } = req.body || {};

    // Validate planId
    if (!planId || typeof planId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'A valid plan ID is required.' },
      });
    }

    // Verify planId is valid (website config)
    const plan = config.stripe.priceIds
      ? // Server has price IDs configured
        { id: planId, priceId: getStripePriceId(planId) }
      : null;

    if (!plan || !plan.priceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'PLAN_NOT_CONFIGURED', message: 'The requested plan is not configured for payment.' },
      });
    }

    // Validate email format if provided
    if (email && typeof email === 'string' && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Please enter a valid email address.' },
        });
      }
    }

    // Validate userId if provided (should be a valid Supabase auth user UUID format)
    if (userId && typeof userId === 'string') {
      const userIdRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!userIdRegex.test(userId.trim())) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Invalid user ID format.' },
        });
      }
    }

    try {
      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price: plan.priceId,
            // Quantity is 1 for one-time purchase
            quantity: 1,
          },
        ],
        mode: 'payment', // ONE-TIME purchase, not recurring
        customer_email: email || undefined,
        success_url: buildSuccessUrl(),
        cancel_url: buildCancelUrl(),
        // Metadata for webhook/license creation (safe fields only)
        metadata: {
          planId: plan.id,
          // Include userId if provided - webhook will use this to link license
          userId: userId || undefined,
        },
        // Avoid collecting address etc. — keep it minimal
        client_details: {
          // We'll set this on the frontend if needed
        },
      });

      return res.json({
        success: true,
        sessionId: session.id,
        url: session.url,
      });
    } catch (err) {
      console.error('[PaymentAPI] Stripe Checkout Session error:', err.message);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Could not create checkout session. Please try again.' },
      });
    }
  }
);

/**
 * GET /api/checkout/status
 * Safe status endpoint — returns whether a checkout session was successful.
 * Does NOT expose internal Stripe objects.
 */
router.get('/status',
  allowMethods(['GET']),
  statusLimiter,
  async (req, res) => {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Checkout session ID is required.' },
      });
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Safe response — only public, non-sensitive information
      const safeResponse = {
        success: session.payment_status === 'paid',
        sessionId: session.id,
        amount_total: session.amount_total,
        currency: session.currency,
        payment_status: session.payment_status,
        customer_email: session.customer_email || undefined,
        // Do NOT expose: secret keys, webhook secrets, etc.
      };

      return res.json({
        success: safeResponse.success,
        ...safeResponse,
      });
    } catch (err) {
      console.error('[PaymentAPI] Error retrieving checkout session:', err.message);
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Checkout session not found.' },
      });
    }
  }
);

/**
 * GET /api/checkout/hello
 * Minimal health check for the payment API.
 */
router.get('/hello',
  allowMethods(['GET']),
  (req, res) => {
    res.json({ success: true, message: 'Payment API is running' });
  }
);

module.exports = router;