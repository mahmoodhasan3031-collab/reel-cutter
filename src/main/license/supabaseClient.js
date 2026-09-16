require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ─── Environment Configuration ───────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Detect packaged production build — mock DB must never be used in production
let isPackaged = false;
try {
  const { app } = require('electron');
  isPackaged = !!(app && app.isPackaged);
} catch {
  // Not in Electron context (tests, CLI) — mock DB remains available
}

let remoteClient = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    remoteClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn('[Supabase] Failed to initialize remote client:', err.message);
  }
}

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
    msg.includes('fetch failed')
  );
}

/**
 * Fetches a license record by license key.
 *
 * @param {string} licenseKey
 * @returns {Promise<{ data: Object|null, error: string|null, isOffline: boolean }>}
 */
async function fetchLicense(licenseKey) {
  if (simulateOffline) {
    return { data: null, error: 'Network request failed (offline)', isOffline: true };
  }

  const normalizedKey = licenseKey.trim().toUpperCase();

  // If remote Supabase client is configured, query remote
  if (remoteClient) {
    try {
      const { data, error } = await remoteClient
        .from('licenses')
        .select('*')
        .eq('license_key', normalizedKey)
        .maybeSingle();

      if (error) {
        if (isNetworkError(error)) {
          return { data: null, error: error.message, isOffline: true };
        }
        return { data: null, error: error.message, isOffline: false };
      }

      return { data, error: null, isOffline: false };
    } catch (err) {
      if (isNetworkError(err)) {
        return { data: null, error: err.message, isOffline: true };
      }
      return { data: null, error: err.message, isOffline: false };
    }
  }

  // Fallback to local mock database (dev/test only — never in packaged builds)
  if (isPackaged) {
    return { data: null, error: 'License verification requires internet connection. Please check your network.', isOffline: true };
  }
  const record = mockDb[normalizedKey];
  if (!record) {
    return { data: null, error: null, isOffline: false }; // not found
  }
  return { data: { ...record }, error: null, isOffline: false };
}

/**
 * Binds a license to a machine HWID.
 *
 * @param {string} licenseKey
 * @param {string} hwid
 * @returns {Promise<{ success: boolean, data: Object|null, error: string|null, isOffline: boolean }>}
 */
async function bindLicenseHwid(licenseKey, hwid) {
  if (simulateOffline) {
    return { success: false, data: null, error: 'Network request failed (offline)', isOffline: true };
  }

  const normalizedKey = licenseKey.trim().toUpperCase();

  if (remoteClient) {
    try {
      const { data, error } = await remoteClient
        .from('licenses')
        .update({ hwid, updated_at: new Date().toISOString() })
        .eq('license_key', normalizedKey)
        .select()
        .single();

      if (error) {
        if (isNetworkError(error)) {
          return { success: false, data: null, error: error.message, isOffline: true };
        }
        return { success: false, data: null, error: error.message, isOffline: false };
      }

      return { success: true, data, error: null, isOffline: false };
    } catch (err) {
      if (isNetworkError(err)) {
        return { success: false, data: null, error: err.message, isOffline: true };
      }
      return { success: false, data: null, error: err.message, isOffline: false };
    }
  }

  // Mock DB update (dev/test only — never in packaged builds)
  if (isPackaged) {
    return { success: false, data: null, error: 'License activation requires internet connection. Please check your network.', isOffline: true };
  }
  const record = mockDb[normalizedKey];
  if (!record) {
    return { success: false, data: null, error: 'License key not found', isOffline: false };
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
  isRemoteConfigured: () => !!remoteClient,
};
