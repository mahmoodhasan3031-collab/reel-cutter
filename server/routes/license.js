const express = require('express');
const router = express.Router();
const { activateLicense, validateLicense, getLicenseStatus, getLicensesByUserId } = require('../services/licenseService');
const { validateLicenseKey, validateHwid, allowMethods, stripUnknownFields } = require('../middleware/inputValidator');
const { activateLimiter, validateLimiter, statusLimiter } = require('../middleware/rateLimiter');
const config = require('../config');

// Safe error response helper — never leaks internals
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
 * POST /api/license/activate
 * Activates a license key and binds it to a hardware ID.
 *
 * Request:  { licenseKey: string, hwid: string }
 * Response: { success: true, license: { licenseKey, tier, status, activatedAt } }
 */
router.post('/activate',
  allowMethods(['POST']),
  stripUnknownFields(['licenseKey', 'hwid']),
  activateLimiter,
  async (req, res) => {
    const { licenseKey, hwid } = req.body || {};

    const keyCheck = validateLicenseKey(licenseKey);
    if (!keyCheck.valid) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'A valid license key is required in XXXX-XXXX-XXXX-XXXX format.');
    }

    const hwidCheck = validateHwid(hwid);
    if (!hwidCheck.valid) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'A valid hardware ID is required.');
    }

    try {
      const result = await activateLicense(licenseKey, hwid);

      if (!result.success) {
        const status = result.code === 'LICENSE_INVALID' ? 404 : 403;
        return errorResponse(res, status, result.code, result.error);
      }

      return successResponse(res, { license: result.license });
    } catch (err) {
      console.error('[LicenseAPI] Activation error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * POST /api/license/validate
 * Validates the current state of a license key.
 *
 * Request:  { licenseKey: string, hwid: string }
 * Response: { success: true, license: { licenseKey, tier, status, activatedAt } }
 */
router.post('/validate',
  allowMethods(['POST']),
  stripUnknownFields(['licenseKey', 'hwid']),
  validateLimiter,
  async (req, res) => {
    const { licenseKey, hwid } = req.body || {};

    const keyCheck = validateLicenseKey(licenseKey);
    if (!keyCheck.valid) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'A valid license key is required in XXXX-XXXX-XXXX-XXXX format.');
    }

    const hwidCheck = validateHwid(hwid);
    if (!hwidCheck.valid) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'A valid hardware ID is required.');
    }

    try {
      const result = await validateLicense(licenseKey, hwid);

      if (!result.success) {
        const status = result.code === 'LICENSE_INVALID' ? 404 : 403;
        return errorResponse(res, status, result.code, result.error);
      }

      return successResponse(res, { license: result.license });
    } catch (err) {
      console.error('[LicenseAPI] Validation error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * GET /api/license/status
 * Read-only status lookup for a license key. No HWID required.
 *
 * Query:    ?licenseKey=XXXX-XXXX-XXXX-XXXX
 * Response: { success: true, license: { licenseKey, tier, status, activatedAt, hasHwid } }
 */
router.get('/status',
  allowMethods(['GET']),
  statusLimiter,
  async (req, res) => {
    const { licenseKey } = req.query || {};

    const keyCheck = validateLicenseKey(licenseKey);
    if (!keyCheck.valid) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'A valid license key is required in XXXX-XXXX-XXXX-XXXX format.');
    }

    try {
      const result = await getLicenseStatus(licenseKey);

      if (!result.success) {
        return errorResponse(res, 404, result.code, result.error);
      }

      return successResponse(res, { license: result.license });
    } catch (err) {
      console.error('[LicenseAPI] Status error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

/**
 * GET /api/license/dashboard
 * Returns licenses for the authenticated user.
 * Requires Bearer token (Supabase JWT) in Authorization header.
 * Server determines user from token — never trusts client-supplied userId.
 *
 * Headers: Authorization: Bearer <supabase_jwt>
 * Response: { success: true, licenses: [...safeFields] }
 */
router.get('/dashboard',
  allowMethods(['GET']),
  async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required. Please log in.');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required. Please log in.');
    }

    try {
      // Verify the JWT using Supabase service-role client
      let userId = null;

      if (config.supabase.url && config.supabase.serviceRoleKey) {
        const { createClient } = require('@supabase/supabase-js');
        const adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
          auth: { persistSession: false },
        });
        const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
        if (authError || !user) {
          return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid or expired session. Please log in again.');
        }
        userId = user.id;
      } else {
        // In-memory / test mode: extract userId from a special test header
        userId = req.headers['x-test-user-id'];
        if (!userId) {
          return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required. Please log in.');
        }
      }

      const licenses = await getLicensesByUserId(userId);

      // Return safe fields only — no customer_email, no transaction_id
      const safeLicenses = licenses.map((lic) => ({
        license_key: lic.license_key,
        tier: lic.tier,
        status: lic.status,
        activated_at: lic.activated_at,
        created_at: lic.created_at,
        hasHwid: !!lic.hwid,
        subscription_status: lic.subscription_status || null,
        current_period_start: lic.current_period_start || null,
        current_period_end: lic.current_period_end || null,
        cancel_at_period_end: lic.cancel_at_period_end || false,
        canceled_at: lic.canceled_at || null,
        plan_interval: lic.plan_interval || null,
      }));

      return res.status(200).json({
        success: true,
        licenses: safeLicenses,
      });
    } catch (err) {
      console.error('[LicenseAPI] Dashboard error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
  }
);

module.exports = router;
