require('dotenv').config();

// ─── Backend API transport (STEP 76 / L-1) ──────────────────────────────────
// The Electron client talks to the Reel Cutter backend HTTP API
// (POST /api/license/activate, POST /api/license/validate,
//  GET /api/license/status). It no longer talks to Supabase directly:
// the license RPCs are revoked from PUBLIC/anon at the database, so no
// Supabase credential (not even the anon key) is bundled in the client.
//
// __API_BASE_URL__ is injected at build time via electron.vite.config.mjs.
// REEL_CUTTER_API_URL overrides it for local development.
// An empty value means "no backend configured" → local mock database
// (dev/test only) or fail-closed in packaged builds.
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REEL_CUTTER_API_URL) ||
  (typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : '') ||
  '';

// Detect packaged production build — mock DB must never be used in production
let isPackaged = false;
try {
  const { app } = require('electron');
  isPackaged = !!(app && app.isPackaged);
} catch {
  // Not in Electron context (tests, CLI) — mock DB remains available
}

const REQUEST_TIMEOUT_MS = 10_000;

// ─── In-Memory Mock Database (for dev, testing, or standalone mode) ──────────
const defaultMockLicenses = {
  'PRO-REEL-7890-ABCD-1234': {
    id: '11111111-1111-1111-1111-111111111111',
    license_key: 'PRO-REEL-7890-ABCD-1234',
    hwid: null,
    tier: 'pro',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  'STD-REEL-4567-EFGH-5678': {
    id: '22222222-2222-2222-2222-222222222222',
    license_key: 'STD-REEL-4567-EFGH-5678',
    hwid: null,
    tier: 'standard',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  'BAS-REEL-1234-IJKL-9012': {
    id: '33333333-3333-3333-3333-333333333333',
    license_key: 'BAS-REEL-1234-IJKL-9012',
    hwid: null,
    tier: 'basic',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  'PRO-REEL-REVOKED-9999': {
    id: '44444444-4444-4444-4444-444444444444',
    license_key: 'PRO-REEL-REVOKED-9999',
    hwid: null,
    tier: 'pro',
    status: 'revoked',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  'PRO-BOUND-ANOTHER-HWID': {
    id: '55555555-5555-5555-5555-555555555555',
    license_key: 'PRO-BOUND-ANOTHER-HWID',
    hwid: 'other-machine-hwid-9999999999999999',
    tier: 'pro',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
};

let mockDb = JSON.parse(JSON.stringify(defaultMockLicenses));
let simulateOffline = false;

/**
 * Resets the in-memory mock database to default state (useful for tests).
 */
function resetMockDb() {
  mockDb = JSON.parse(JSON.stringify(defaultMockLicenses));
  simulateOffline = false;
}

/**
 * Toggles simulated offline mode (useful for tests).
 * @param {boolean} val
 */
function setSimulateOffline(val) {
  simulateOffline = !!val;
}

/**
 * Inserts or replaces a mock license record (useful for tests).
 * @param {string} licenseKey
 * @param {Object} record
 */
function setMockLicense(licenseKey, record) {
  if (!licenseKey || !record) return;
  mockDb[licenseKey.trim().toUpperCase()] = record;
}

/**
 * Checks whether an error represents a network or offline condition.
 * @param {Error|Object} err
 * @returns {boolean}
 */
function isNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('ehostunreach') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    err.name === 'AbortError'
  );
}

/**
 * Performs an HTTP request against the backend API with a hard timeout.
 *
 * @param {string} path - e.g. '/api/license/status?licenseKey=...'
 * @param {Object} [options] - fetch options
 * @returns {Promise<{ status: number, body: Object|null }>}
 * @throws {Error} on network failure or timeout (see isNetworkError)
 */
async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classifies an HTTP error response for license flows.
 * Transient conditions (network, 5xx, 429) are reported as offline so the
 * existing grace-period logic applies instead of punishing the user.
 *
 * @param {number} status
 * @param {Object|null} body
 * @param {string} fallbackMessage
 * @returns {{ data: null, error: string, isOffline: boolean, code: string|null }}
 */
function classifyHttpFailure(status, body, fallbackMessage) {
  const code = body && body.error && body.error.code ? body.error.code : null;
  const message = body && body.error && body.error.message ? body.error.message : fallbackMessage;

  if (status >= 500 || status === 429) {
    return { data: null, error: message, isOffline: true, code: null };
  }
  if (status === 404 && !code) {
    return { data: null, error: message, isOffline: false, code: 'LICENSE_INVALID' };
  }
  return { data: null, error: message, isOffline: false, code };
}

/**
 * Fetches the authoritative license state for this device.
 *
 * @param {string} licenseKey
 * @param {string} [hwid] - When provided, validates through the backend
 *   (authoritative HWID + subscription check) instead of a read-only lookup.
 * @returns {Promise<{ data: Object|null, error: string|null, isOffline: boolean, code?: string }>}
 */
async function fetchLicense(licenseKey, hwid) {
  if (simulateOffline) {
    return { data: null, error: 'Network request failed (offline)', isOffline: true };
  }

  const normalizedKey = licenseKey.trim().toUpperCase();

  // Remote path: backend HTTP API (the only supported remote transport)
  if (API_BASE_URL) {
    try {
      const { status, body } = hwid
        ? await apiRequest('/api/license/validate', {
            method: 'POST',
            body: JSON.stringify({ licenseKey: normalizedKey, hwid }),
          })
        : await apiRequest(`/api/license/status?licenseKey=${encodeURIComponent(normalizedKey)}`);

      if (status < 200 || status >= 300 || !body || body.success !== true) {
        return classifyHttpFailure(
          status,
          body,
          'License could not be verified in database.'
        );
      }

      const license = body.license || {};
      // Successful validation implies the server matched this device's hwid.
      return {
        data: hwid ? { ...license, hwid } : { ...license },
        error: null,
        isOffline: false,
      };
    } catch (err) {
      return { data: null, error: err.message, isOffline: true, code: null };
    }
  }

  // Fallback to local mock database (dev/test only — never in packaged builds)
  if (isPackaged) {
    return { data: null, error: 'License verification requires internet connection. Please check your network.', isOffline: true };
  }
  const record = mockDb[normalizedKey];
  if (!record) {
    return { data: null, error: 'License could not be verified in database.', isOffline: false, code: 'LICENSE_INVALID' };
  }
  // Mirror the backend's authoritative checks so dev/test behavior matches prod.
  if (record.status === 'revoked') {
    return { data: null, error: 'This license key has been revoked.', isOffline: false, code: 'LICENSE_REVOKED' };
  }
  if (hwid && record.hwid !== hwid) {
    return { data: null, error: 'This license is bound to a different device.', isOffline: false, code: 'HWID_MISMATCH' };
  }
  return { data: { ...record }, error: null, isOffline: false };
}

/**
 * Binds a license to this machine by calling the backend activation endpoint
 * (authoritative server-side validation + atomic bind).
 *
 * @param {string} licenseKey
 * @param {string} hwid
 * @returns {Promise<{ success: boolean, data: Object|null, error: string|null, isOffline: boolean, code?: string }>}
 */
async function bindLicenseHwid(licenseKey, hwid) {
  if (simulateOffline) {
    return { success: false, data: null, error: 'Network request failed (offline)', isOffline: true };
  }

  const normalizedKey = licenseKey.trim().toUpperCase();

  if (API_BASE_URL) {
    try {
      const { status, body } = await apiRequest('/api/license/activate', {
        method: 'POST',
        body: JSON.stringify({ licenseKey: normalizedKey, hwid }),
      });

      if (status < 200 || status >= 300 || !body || body.success !== true) {
        const failure = classifyHttpFailure(status, body, 'Activation failed while registering device.');
        return { success: false, data: null, error: failure.error, isOffline: failure.isOffline, code: failure.code };
      }

      return { success: true, data: { ...(body.license || {}), hwid }, error: null, isOffline: false };
    } catch (err) {
      return { success: false, data: null, error: err.message, isOffline: true };
    }
  }

  // Mock DB update (dev/test only — never in packaged builds)
  if (isPackaged) {
    return { success: false, data: null, error: 'License activation requires internet connection. Please check your network.', isOffline: true };
  }
  const record = mockDb[normalizedKey];
  if (!record) {
    return { success: false, data: null, error: 'Invalid license key. Please verify and try again.', isOffline: false, code: 'LICENSE_INVALID' };
  }
  if (record.status === 'revoked') {
    return { success: false, data: null, error: 'This license key has been revoked.', isOffline: false, code: 'LICENSE_REVOKED' };
  }
  if (record.hwid && record.hwid !== hwid) {
    return { success: false, data: null, error: 'License is already bound to another machine. Multi-device activation is not permitted.', isOffline: false, code: 'HWID_MISMATCH' };
  }

  record.hwid = hwid;
  record.updated_at = new Date().toISOString();
  return { success: true, data: { ...record }, error: null, isOffline: false };
}

module.exports = {
  fetchLicense,
  bindLicenseHwid,
  isNetworkError,
  resetMockDb,
  setSimulateOffline,
  setMockLicense,
  isRemoteConfigured: () => !!API_BASE_URL,
};
