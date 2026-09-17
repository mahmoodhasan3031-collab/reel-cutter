const express = require('express');
const router = express.Router();
const { activateLicense, validateLicense, getLicenseStatus } = require('../services/licenseService');
const { validateLicenseKey, validateHwid, allowMethods, stripUnknownFields } = require('../middleware/inputValidator');
const { activateLimiter, validateLimiter, statusLimiter } = require('../middleware/rateLimiter');

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

module.exports = router;
