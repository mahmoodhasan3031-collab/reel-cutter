/**
 * Input validation helpers for License API endpoints.
 */

const LICENSE_KEY_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const HWID_REGEX = /^[a-f0-9]{64}$/;
const MAX_HWID_LENGTH = 128;
const MAX_LICENSE_KEY_LENGTH = 19;

/**
 * Validates license key format.
 * @param {string} key
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLicenseKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'LICENSE_KEY_REQUIRED' };
  }

  const trimmed = key.trim();
  if (trimmed.length > MAX_LICENSE_KEY_LENGTH) {
    return { valid: false, error: 'LICENSE_KEY_TOO_LONG' };
  }

  if (!LICENSE_KEY_REGEX.test(trimmed)) {
    return { valid: false, error: 'LICENSE_KEY_INVALID_FORMAT' };
  }

  return { valid: true };
}

/**
 * Validates HWID format.
 * @param {string} hwid
 * @returns {{ valid: boolean, error?: string }}
 */
function validateHwid(hwid) {
  if (hwid === null || hwid === undefined || hwid === '') {
    return { valid: false, error: 'HWID_REQUIRED' };
  }

  if (typeof hwid !== 'string') {
    return { valid: false, error: 'HWID_INVALID' };
  }

  const trimmed = hwid.trim();
  if (trimmed.length > MAX_HWID_LENGTH) {
    return { valid: false, error: 'HWID_TOO_LONG' };
  }

  if (!HWID_REGEX.test(trimmed)) {
    return { valid: false, error: 'HWID_INVALID_FORMAT' };
  }

  return { valid: true };
}

/**
 * Creates middleware that rejects unexpected HTTP methods.
 * @param {string[]} allowedMethods
 * @returns {Function}
 */
function allowMethods(allowedMethods) {
  return (req, res, next) => {
    if (!allowedMethods.includes(req.method)) {
      return res.status(405).json({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method} is not allowed on this endpoint.`,
        },
      });
    }
    next();
  };
}

/**
 * Strips unexpected fields from request body, keeping only whitelisted keys.
 * @param {string[]} allowedFields
 * @returns {Function}
 */
function stripUnknownFields(allowedFields) {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      const cleaned = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          cleaned[field] = req.body[field];
        }
      }
      req.body = cleaned;
    }
    next();
  };
}

module.exports = {
  validateLicenseKey,
  validateHwid,
  allowMethods,
  stripUnknownFields,
  LICENSE_KEY_REGEX,
  HWID_REGEX,
  MAX_HWID_LENGTH,
  MAX_LICENSE_KEY_LENGTH,
};
