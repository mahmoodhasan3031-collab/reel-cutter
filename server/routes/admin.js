/**
 * Admin API (STEP 19) — authentication + manual payment review.
 *
 * Endpoints (ALL except /login require a verified admin session):
 *   POST /api/admin/login
 *   GET  /api/admin/payments
 *   GET  /api/admin/payments/:id
 *   POST /api/admin/payments/:id/approve
 *   POST /api/admin/payments/:id/reject
 *   POST /api/admin/licenses/:licenseKey/revoke      (STEP 76)
 *   POST /api/admin/licenses/:licenseKey/reset-hwid  (STEP 76)
 *
 * Security invariants:
 *   - No anonymous access to any non-login route (requireAdmin).
 *   - Role is derived ONLY from the server-verified session token;
 *     client-supplied role/license/status fields are stripped and ignored.
 *   - Dedicated brute-force rate limiter on login.
 *   - Generic auth errors; credentials/tokens are never logged.
 *   - Private proof bucket stays private; viewing uses a short-lived
 *     server-generated signed URL only.
 *   - Responses never contain service-role keys or storage credentials.
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { allowMethods, stripUnknownFields, validateLicenseKey } = require('../middleware/inputValidator');
const { createRateLimiter } = require('../middleware/rateLimiter');
const {
  authenticateAdmin,
  createSessionToken,
  requireAdmin,
  isAdminConfigured,
} = require('../services/adminAuth');
const {
  listPayments,
  getPayment,
  approvePayment,
  rejectPayment,
  isValidUuid,
  VALID_STATUSES,
} = require('../services/paymentReviewService');
const { revokeLicenseKey, resetLicenseHwid } = require('../services/licenseService');
const { writeAuditLog } = require('../services/auditLog');
const { BUCKET_NAME, SIGNED_URL_EXPIRY_SECONDS } = require('./upload');
const config = require('../config');

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_ADMIN_NOTE_LENGTH = 1000;
const MAX_REASON_LENGTH = 1000;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

// ─── Rate Limiters ──────────────────────────────────────────────────────────

// Dedicated brute-force protection for admin login
const loginLimiter = createRateLimiter({ name: 'admin_login', maxRequests: 5, windowMs: 60_000 });
// General limiter for authenticated admin operations
const adminApiLimiter = createRateLimiter({ name: 'admin_api', maxRequests: 60, windowMs: 60_000 });

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

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null;
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Generates a short-lived signed URL for a private payment proof.
 * The bucket is never made public; the URL expires after
 * SIGNED_URL_EXPIRY_SECONDS. Returns nulls when unavailable.
 */
async function createProofSignedUrl(proofReference) {
  const result = { reference: proofReference || null, signed_url: null, expires_in_seconds: null };
  if (!proofReference || typeof proofReference !== 'string') return result;
  if (!proofReference.startsWith(`${BUCKET_NAME}/`)) return result;

  const supabase = getSupabaseClient();
  if (!supabase) return result;

  const storagePath = proofReference.slice(`${BUCKET_NAME}/`.length);
  if (!storagePath) return result;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
    if (!error && data && data.signedUrl) {
      result.signed_url = data.signedUrl;
      result.expires_in_seconds = SIGNED_URL_EXPIRY_SECONDS;
    }
  } catch (err) {
    console.error('[Admin] Signed URL generation failed.');
  }
  return result;
}

function parsePagination(query) {
  const pageRaw = query && query.page !== undefined ? query.page : '1';
  const limitRaw = query && query.limit !== undefined ? query.limit : String(DEFAULT_PAGE_LIMIT);

  const page = Number(pageRaw);
  const limit = Number(limitRaw);

  if (!Number.isInteger(page) || page < 1) return null;
  if (!Number.isInteger(limit) || limit < 1) return null;
  return { page, limit: Math.min(limit, MAX_PAGE_LIMIT) };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/login
 *
 * Validates admin credentials from environment configuration and returns a
 * short-lived signed session token. Rate limited per IP.
 * Errors are generic — never reveals whether a username exists.
 */
router.post('/login',
  allowMethods(['POST']),
  stripUnknownFields(['username', 'password']),
  loginLimiter,
  async (req, res) => {
    try {
      const { username, password } = req.body || {};

      if (!username || typeof username !== 'string'
        || !password || typeof password !== 'string') {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Username and password are required.');
      }

      if (!isAdminConfigured()) {
        return errorResponse(res, 503, 'SERVICE_UNAVAILABLE', 'Admin authentication is not available.');
      }

      const result = await authenticateAdmin(username, password);

      if (!result.ok) {
        if (result.code === 'UNAVAILABLE') {
          return errorResponse(res, 503, 'SERVICE_UNAVAILABLE', 'Admin authentication is not available.');
        }
        // Same generic message whether the username exists or not
        return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid username or password.');
      }

      const session = createSessionToken(result.username);

      return successResponse(res, {
        token: session.token,
        token_type: 'Bearer',
        expires_in: session.expiresIn,
        admin: { username: result.username },
      });
    } catch (err) {
      // Never log credentials or token material
      console.error('[Admin] Login error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * GET /api/admin/payments
 *
 * Lists payments for admin review. Defaults to pending, newest first.
 * Query: status (pending|approved|rejected|cancelled), page, limit.
 */
router.get('/payments',
  allowMethods(['GET']),
  requireAdmin,
  adminApiLimiter,
  async (req, res) => {
    try {
      const status = req.query && req.query.status ? req.query.status : 'pending';
      if (!VALID_STATUSES.includes(status)) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.`);
      }

      const pagination = parsePagination(req.query);
      if (!pagination) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Invalid pagination parameters.');
      }

      const result = await listPayments({
        status,
        page: pagination.page,
        limit: pagination.limit,
      });

      if (!result.ok) {
        return errorResponse(res, result.httpStatus, result.code, result.message);
      }

      return successResponse(res, {
        payments: result.payments,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          total_pages: result.totalPages,
        },
      });
    } catch (err) {
      console.error('[Admin] Payment list error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * GET /api/admin/payments/:id
 *
 * Full review detail for one payment, including a short-lived signed proof
 * URL generated server-side (bucket stays private).
 */
router.get('/payments/:id',
  allowMethods(['GET']),
  requireAdmin,
  adminApiLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Payment ID must be a valid UUID.');
      }

      const result = await getPayment(id);
      if (!result.ok) {
        return errorResponse(res, result.httpStatus, result.code, result.message);
      }

      const proof = await createProofSignedUrl(result.payment.proof_url);

      return successResponse(res, {
        payment: {
          ...result.payment,
          proof,
        },
      });
    } catch (err) {
      console.error('[Admin] Payment detail error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * POST /api/admin/payments/:id/approve
 *
 * Approves a pending payment: creates/links a license, writes audit, and
 * triggers the existing license delivery email. Idempotent.
 * Request body (optional): { admin_note }
 */
router.post('/payments/:id/approve',
  allowMethods(['POST']),
  stripUnknownFields(['admin_note']),
  requireAdmin,
  adminApiLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Payment ID must be a valid UUID.');
      }

      const body = req.body || {};
      let adminNote = null;
      if (body.admin_note !== undefined && body.admin_note !== null) {
        if (typeof body.admin_note !== 'string') {
          return errorResponse(res, 400, 'INVALID_INPUT', 'Admin note must be a string.');
        }
        if (body.admin_note.length > MAX_ADMIN_NOTE_LENGTH) {
          return errorResponse(res, 400, 'INVALID_INPUT', `Admin note must be at most ${MAX_ADMIN_NOTE_LENGTH} characters.`);
        }
        adminNote = body.admin_note;
      }

      const result = await approvePayment(id, {
        adminId: req.admin.adminId,
        adminNote,
      });

      if (!result.ok) {
        return errorResponse(res, result.httpStatus, result.code, result.message);
      }

      return successResponse(res, {
        payment: result.payment,
        license: result.license || null,
        email: result.email || null,
        already_approved: result.code === 'ALREADY_APPROVED',
      });
    } catch (err) {
      console.error('[Admin] Payment approve error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * POST /api/admin/payments/:id/reject
 *
 * Rejects a pending payment. Reason required. Idempotent on already
 * rejected. Never modifies approved/cancelled payments. No license is
 * created and HWID binding is untouched.
 * Request body: { reason, admin_note? }
 */
router.post('/payments/:id/reject',
  allowMethods(['POST']),
  stripUnknownFields(['reason', 'admin_note']),
  requireAdmin,
  adminApiLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'Payment ID must be a valid UUID.');
      }

      const body = req.body || {};
      const reason = body.reason;
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'A rejection reason is required.');
      }
      if (reason.trim().length > MAX_REASON_LENGTH) {
        return errorResponse(res, 400, 'INVALID_INPUT', `Rejection reason must be at most ${MAX_REASON_LENGTH} characters.`);
      }

      let adminNote = null;
      if (body.admin_note !== undefined && body.admin_note !== null) {
        if (typeof body.admin_note !== 'string') {
          return errorResponse(res, 400, 'INVALID_INPUT', 'Admin note must be a string.');
        }
        if (body.admin_note.length > MAX_ADMIN_NOTE_LENGTH) {
          return errorResponse(res, 400, 'INVALID_INPUT', `Admin note must be at most ${MAX_ADMIN_NOTE_LENGTH} characters.`);
        }
        adminNote = body.admin_note;
      }

      const result = await rejectPayment(id, {
        adminId: req.admin.adminId,
        reason,
        adminNote,
      });

      if (!result.ok) {
        return errorResponse(res, result.httpStatus, result.code, result.message);
      }

      return successResponse(res, {
        payment: result.payment,
        already_rejected: result.code === 'ALREADY_REJECTED',
      });
    } catch (err) {
      console.error('[Admin] Payment reject error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * POST /api/admin/licenses/:licenseKey/revoke  (L-3, STEP 76)
 *
 * Marks a license status='revoked'. Idempotent. Never touches hwid or
 * subscription columns. Every call writes an audit record.
 * License keys are never logged.
 */
router.post('/licenses/:licenseKey/revoke',
  allowMethods(['POST']),
  stripUnknownFields([]),
  requireAdmin,
  adminApiLimiter,
  async (req, res) => {
    try {
      const { licenseKey } = req.params;
      const keyCheck = validateLicenseKey(licenseKey);
      if (!keyCheck.valid) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'A valid license key is required in XXXX-XXXX-XXXX-XXXX format.');
      }
      const normalizedKey = licenseKey.trim().toUpperCase();

      const result = await revokeLicenseKey(normalizedKey);
      if (!result.success) {
        if (result.code === 'LICENSE_INVALID') {
          return errorResponse(res, 404, 'LICENSE_INVALID', 'The license key is invalid.');
        }
        return errorResponse(res, 500, result.code || 'OPERATION_FAILED', 'Unable to revoke the license. Please try again.');
      }

      await writeAuditLog({
        adminId: req.admin.adminId,
        action: 'license_revoked',
        targetType: 'license',
        // target_id is a UUID column; the license key goes into metadata.
        targetId: null,
        metadata: {
          license_key: normalizedKey,
          already_revoked: !!result.alreadyRevoked,
        },
      });

      return successResponse(res, {
        license: { licenseKey: normalizedKey, status: 'revoked' },
        already_revoked: !!result.alreadyRevoked,
      });
    } catch (err) {
      console.error('[Admin] License revoke error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * POST /api/admin/licenses/:licenseKey/reset-hwid  (L-3, STEP 76)
 *
 * Clears the hwid binding so a license can be activated on a new device.
 * Idempotent. Never changes status, tier, or subscription columns.
 * Every call writes an audit record.
 */
router.post('/licenses/:licenseKey/reset-hwid',
  allowMethods(['POST']),
  stripUnknownFields([]),
  requireAdmin,
  adminApiLimiter,
  async (req, res) => {
    try {
      const { licenseKey } = req.params;
      const keyCheck = validateLicenseKey(licenseKey);
      if (!keyCheck.valid) {
        return errorResponse(res, 400, 'INVALID_INPUT', 'A valid license key is required in XXXX-XXXX-XXXX-XXXX format.');
      }
      const normalizedKey = licenseKey.trim().toUpperCase();

      const result = await resetLicenseHwid(normalizedKey);
      if (!result.success) {
        if (result.code === 'LICENSE_INVALID') {
          return errorResponse(res, 404, 'LICENSE_INVALID', 'The license key is invalid.');
        }
        return errorResponse(res, 500, result.code || 'OPERATION_FAILED', 'Unable to reset the device binding. Please try again.');
      }

      await writeAuditLog({
        adminId: req.admin.adminId,
        action: 'license_hwid_reset',
        targetType: 'license',
        targetId: null,
        metadata: {
          license_key: normalizedKey,
          had_hwid: !!result.hadHwid,
          already_unbound: !!result.alreadyUnbound,
        },
      });

      return successResponse(res, {
        license: { licenseKey: normalizedKey, hwid: null },
        had_hwid: !!result.hadHwid,
        already_unbound: !!result.alreadyUnbound,
      });
    } catch (err) {
      console.error('[Admin] License hwid reset error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

module.exports = router;
module.exports.loginLimiter = loginLimiter;
module.exports.adminApiLimiter = adminApiLimiter;
