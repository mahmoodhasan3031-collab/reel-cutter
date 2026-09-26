const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { allowMethods, stripUnknownFields } = require('../middleware/inputValidator');
const { createRateLimiter } = require('../middleware/rateLimiter');
const { isValidProofReference } = require('../routes/upload');
const config = require('../config');

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_PLAN_IDS = ['basic', 'standard', 'pro'];
const VALID_PAYMENT_METHODS = ['bkash', 'nagad', 'rocket', 'bank', 'binance'];
const VALID_CURRENCIES = ['BDT', 'USDT'];
const BDT_METHODS = ['bkash', 'nagad', 'rocket', 'bank'];
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MAX_TRANSACTION_ID_LENGTH = 100;
const MAX_SENDER_ACCOUNT_LENGTH = 100;
const MAX_PROOF_URL_LENGTH = 500;
const MAX_WHATSAPP_LENGTH = 20;

// Plan amounts in BDT for validation (approximate, allows some flexibility)
const PLAN_AMOUNTS = {
  basic: { min: 500, max: 1500, currency: 'BDT' },
  standard: { min: 1000, max: 3000, currency: 'BDT' },
  pro: { min: 1500, max: 5000, currency: 'BDT' },
};

// ─── Rate Limiters ──────────────────────────────────────────────────────────
const submitLimiter = createRateLimiter({ name: 'manual_payment_submit', maxRequests: 5, windowMs: 60_000 });
const statusLimiter = createRateLimiter({ name: 'manual_payment_status', maxRequests: 20, windowMs: 60_000 });

// ─── Supabase Client ──────────────────────────────────────────────────────────

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null;
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function errorResponse(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function successResponse(res, data) {
  return res.status(200).json({
    success: true,
    ...data,
  });
}

/**
 * Normalizes an email address to lowercase and trims whitespace.
 */
function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Normalizes a phone number by removing spaces, dashes, parentheses.
 */
function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[\s\-().]/g, '').trim();
}

/**
 * Validates email format.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates phone format (digits, optional + prefix, 7-20 digits).
 */
function isValidPhone(phone) {
  if (!phone) return true; // optional
  return /^\+?\d{7,20}$/.test(phone);
}

/**
 * Extracts user ID from Supabase JWT if present.
 * Returns null if not authenticated.
 */
async function extractUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/manual-payment/submit
 *
 * Customer submits a manual payment for admin review.
 * Status is always 'pending' — no license is created at submission time.
 *
 * Request body:
 *   customer_name (required), customer_email (required), whatsapp_number (optional),
 *   plan_id (required), payment_method (required), amount (required),
 *   currency (optional, defaults BDT), transaction_id (required),
 *   sender_account (optional), proof_url (optional)
 */
router.post('/submit',
  allowMethods(['POST']),
  stripUnknownFields([
    'customer_name', 'customer_email', 'whatsapp_number',
    'plan_id', 'payment_method', 'amount', 'currency',
    'transaction_id', 'sender_account', 'proof_url',
  ]),
  submitLimiter,
  async (req, res) => {
    try {
      // ─── Extract authenticated user (if present) ──────────────────────
      const auth = await extractUserId(req);

      // ─── Validate customer_name ──────────────────────────────────────
      const { customer_name } = req.body || {};
      if (!customer_name || typeof customer_name !== 'string') {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Customer name is required.');
      }
      const trimmedName = customer_name.trim();
      if (trimmedName.length < 1 || trimmedName.length > MAX_NAME_LENGTH) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Customer name must be 1-${MAX_NAME_LENGTH} characters.`);
      }

      // ─── Validate customer_email ─────────────────────────────────────
      const { customer_email } = req.body || {};
      if (!customer_email || typeof customer_email !== 'string') {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Email address is required.');
      }
      const normalizedEmail = normalizeEmail(customer_email);
      if (normalizedEmail.length > MAX_EMAIL_LENGTH || !isValidEmail(normalizedEmail)) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'A valid email address is required.');
      }

      // If authenticated, email must match the auth user's email
      if (auth && auth.email && auth.email.toLowerCase() !== normalizedEmail) {
        return errorResponse(res, 403, 'EMAIL_MISMATCH', 'The email must match your account email.');
      }

      // ─── Validate whatsapp_number (optional) ─────────────────────────
      const { whatsapp_number } = req.body || {};
      let normalizedWhatsapp = null;
      if (whatsapp_number && typeof whatsapp_number === 'string' && whatsapp_number.trim()) {
        normalizedWhatsapp = normalizePhone(whatsapp_number);
        if (normalizedWhatsapp.length > MAX_WHATSAPP_LENGTH) {
          return errorResponse(res, 400, 'INVALID_INPUT', `WhatsApp number must be at most ${MAX_WHATSAPP_LENGTH} characters.`);
        }
        if (!isValidPhone(normalizedWhatsapp)) {
          return errorResponse(res, 400, 'INVALID_INPUT', 'Invalid WhatsApp number format.');
        }
      }

      // ─── Validate plan_id ────────────────────────────────────────────
      const { plan_id } = req.body || {};
      if (!plan_id || !VALID_PLAN_IDS.includes(plan_id)) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Invalid plan. Must be one of: ${VALID_PLAN_IDS.join(', ')}.`);
      }

      // ─── Validate payment_method ─────────────────────────────────────
      const { payment_method } = req.body || {};
      if (!payment_method || !VALID_PAYMENT_METHODS.includes(payment_method)) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}.`);
      }

      // ─── Validate currency ───────────────────────────────────────────
      let { currency } = req.body || {};
      if (!currency) {
        currency = payment_method === 'binance' ? 'USDT' : 'BDT';
      }
      if (!VALID_CURRENCIES.includes(currency)) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(', ')}.`);
      }
      // Enforce currency consistency with payment method
      if (payment_method === 'binance' && currency !== 'USDT') {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Binance payments must use USDT.');
      }
      if (BDT_METHODS.includes(payment_method) && currency !== 'BDT') {
        return errorResponse(res, 400, 'INVALID_INPUT', `${payment_method} payments must use BDT.`);
      }

      // ─── Validate amount ─────────────────────────────────────────────
      const { amount } = req.body || {};
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Amount must be a positive number.');
      }
      if (parsedAmount > 1_000_000) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Amount exceeds maximum allowed.');
      }

      // ─── Validate transaction_id ─────────────────────────────────────
      const { transaction_id } = req.body || {};
      if (!transaction_id || typeof transaction_id !== 'string') {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Transaction ID is required.');
      }
      const trimmedTxnId = transaction_id.trim();
      if (trimmedTxnId.length < 1 || trimmedTxnId.length > MAX_TRANSACTION_ID_LENGTH) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Transaction ID must be 1-${MAX_TRANSACTION_ID_LENGTH} characters.`);
      }

      // ─── Validate sender_account (optional) ──────────────────────────
      const { sender_account } = req.body || {};
      let normalizedSender = null;
      if (sender_account && typeof sender_account === 'string' && sender_account.trim()) {
        normalizedSender = sender_account.trim();
        if (normalizedSender.length > MAX_SENDER_ACCOUNT_LENGTH) {
          return errorResponse(res, 400, 'INVALID_INPUT', `Sender account must be at most ${MAX_SENDER_ACCOUNT_LENGTH} characters.`);
        }
      }

      // ─── Validate proof_url (optional) ───────────────────────────────
      const { proof_url } = req.body || {};
      let normalizedProof = null;
      if (proof_url && typeof proof_url === 'string' && proof_url.trim()) {
        normalizedProof = proof_url.trim();
        if (normalizedProof.length > MAX_PROOF_URL_LENGTH) {
          return errorResponse(res, 400, 'INVALID_INPUT', `Proof reference must be at most ${MAX_PROOF_URL_LENGTH} characters.`);
        }
        if (!isValidProofReference(normalizedProof)) {
          return errorResponse(res, 400, 'INVALID_PROOF_REFERENCE', 'Invalid proof reference. Must be a reference generated by the upload endpoint.');
        }
      }

      // ─── Strip customer-controlled dangerous fields ──────────────────
      // Even if the client sends these, they are ignored
      const safeRecord = {
        customer_name: trimmedName,
        customer_email: normalizedEmail,
        whatsapp_number: normalizedWhatsapp,
        plan_id,
        payment_method,
        amount: parsedAmount,
        currency,
        transaction_id: trimmedTxnId,
        sender_account: normalizedSender,
        proof_url: normalizedProof,
        status: 'pending', // ALWAYS pending — customer cannot set
      };

      // ─── Insert into database ────────────────────────────────────────
      const supabase = getSupabaseClient();
      if (!supabase) {
        return errorResponse(res, 500, 'SERVICE_UNAVAILABLE', 'Payment service is not configured.');
      }

      const { data, error: insertError } = await supabase
        .from('manual_payments')
        .insert([safeRecord])
        .select('id, status, created_at')
        .single();

      if (insertError) {
        // Handle unique constraint violation (duplicate transaction)
        if (insertError.code === '23505') {
          return errorResponse(res, 409, 'DUPLICATE_TRANSACTION', 'A payment with this transaction ID and method has already been submitted.');
        }
        console.error('[ManualPayment] Insert error:', insertError.message);
        return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
      }

      return res.status(201).json({
        success: true,
        payment: {
          id: data.id,
          status: data.status,
          created_at: data.created_at,
        },
      });
    } catch (err) {
      console.error('[ManualPayment] Submit error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * GET /api/manual-payment/status/:id
 *
 * Returns payment status for the customer.
 * - Authenticated users can only see their own payments.
 * - Anonymous users receive a minimal safe response (status + plan only).
 */
router.get('/status/:id',
  allowMethods(['GET']),
  statusLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Payment ID is required.');
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return errorResponse(res, 500, 'SERVICE_UNAVAILABLE', 'Payment service is not configured.');
      }

      // Fetch the payment record
      const { data: payment, error: fetchError } = await supabase
        .from('manual_payments')
        .select('id, plan_id, payment_method, amount, currency, status, created_at, updated_at, rejection_reason, customer_email')
        .eq('id', id)
        .single();

      if (fetchError || !payment) {
        return errorResponse(res, 404, 'NOT_FOUND', 'Payment not found.');
      }

      // Check authorization
      const auth = await extractUserId(req);

      if (auth && auth.email) {
        // Authenticated: can only see own payments
        if (payment.customer_email !== auth.email) {
          return errorResponse(res, 404, 'NOT_FOUND', 'Payment not found.');
        }
        // Return full safe response
        return successResponse(res, {
          payment: {
            id: payment.id,
            plan_id: payment.plan_id,
            payment_method: payment.payment_method,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            rejection_reason: payment.status === 'rejected' ? payment.rejection_reason : null,
            created_at: payment.created_at,
            updated_at: payment.updated_at,
          },
        });
      }

      // Anonymous: return minimal safe response (no rejection_reason unless rejected)
      return successResponse(res, {
        payment: {
          id: payment.id,
          plan_id: payment.plan_id,
          status: payment.status,
          created_at: payment.created_at,
        },
      });
    } catch (err) {
      console.error('[ManualPayment] Status error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

module.exports = router;