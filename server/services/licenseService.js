const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabase = null;
if (config.supabase.url && config.supabase.serviceRoleKey) {
  try {
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn('[LicenseService] Failed to initialize Supabase client:', err.message);
  }
}

// In-memory fallback for dev/test when Supabase is unavailable
const inMemoryLicenses = new Map();

/**
 * Looks up a license by key. Returns only safe public fields.
 * @param {string} licenseKey
 * @returns {Promise<Object|null>}
 */
async function lookupLicense(licenseKey) {
  const key = licenseKey.trim().toUpperCase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .rpc('fetch_license_by_key', { p_license_key: key });

      if (error) throw error;
      if (data && data.length > 0) {
        return data[0];
      }
      return null;
    } catch (err) {
      console.warn('[LicenseService] Supabase lookup failed, trying in-memory:', err.message);
    }
  }

  // Fallback: in-memory lookup
  const record = inMemoryLicenses.get(key);
  if (!record) return null;

  // Return same shape as RPC (safe public fields only)
  return {
    license_key: record.license_key,
    tier: record.tier,
    status: record.status,
    hwid: record.hwid,
    activated_at: record.activated_at,
    created_at: record.created_at,
  };
}

/**
 * Binds a license to an HWID.
 * @param {string} licenseKey
 * @param {string} hwid
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function bindLicense(licenseKey, hwid) {
  const key = licenseKey.trim().toUpperCase();
  const normalizedHwid = hwid.trim().toLowerCase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .rpc('bind_license_hwid', {
          p_license_key: key,
          p_hwid: normalizedHwid,
        });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.warn('[LicenseService] Supabase bind failed, trying in-memory:', err.message);
    }
  }

  // Fallback: in-memory bind
  const record = inMemoryLicenses.get(key);
  if (!record) return { success: false, error: 'LICENSE_NOT_FOUND' };
  if (record.status === 'revoked') return { success: false, error: 'LICENSE_REVOKED' };
  if (record.hwid && record.hwid !== normalizedHwid) return { success: false, error: 'HWID_MISMATCH' };
  if (record.hwid === normalizedHwid) return { success: true }; // Already bound

  record.hwid = normalizedHwid;
  record.activated_at = record.activated_at || new Date().toISOString();
  record.updated_at = new Date().toISOString();
  return { success: true };
}

/**
 * License activation flow. Server-side authoritative.
 * @param {string} licenseKey
 * @param {string} hwid
 * @returns {Promise<{ success: boolean, license?: Object, error?: string, code?: string }>}
 */
async function activateLicense(licenseKey, hwid) {
  const key = licenseKey.trim().toUpperCase();
  const normalizedHwid = hwid.trim().toLowerCase();

  const record = await lookupLicense(key);

  if (!record) {
    return { success: false, error: 'The license key is invalid.', code: 'LICENSE_INVALID' };
  }

  if (record.status === 'revoked') {
    return { success: false, error: 'This license has been revoked.', code: 'LICENSE_REVOKED' };
  }

  if (record.status !== 'active') {
    return { success: false, error: 'This license is not active.', code: 'LICENSE_INACTIVE' };
  }

  // HWID binding logic
  if (record.hwid === null || record.hwid === undefined) {
    // New license — bind to this HWID
    const bindResult = await bindLicense(key, normalizedHwid);
    if (!bindResult.success) {
      return { success: false, error: 'Failed to activate license.', code: 'ACTIVATION_FAILED' };
    }
  } else if (record.hwid === normalizedHwid) {
    // Already bound to same HWID — allow reactivation
  } else {
    // Bound to different HWID — reject
    return {
      success: false,
      error: 'This license is already bound to another device.',
      code: 'HWID_MISMATCH',
    };
  }

  // Return safe public license info (server-authoritative)
  return {
    success: true,
    license: {
      licenseKey: key,
      tier: record.tier,
      status: 'active',
      activatedAt: record.activated_at || new Date().toISOString(),
    },
  };
}

/**
 * License validation flow. Server-side authoritative.
 * @param {string} licenseKey
 * @param {string} hwid
 * @returns {Promise<{ success: boolean, license?: Object, error?: string, code?: string }>}
 */
async function validateLicense(licenseKey, hwid) {
  const key = licenseKey.trim().toUpperCase();
  const normalizedHwid = hwid.trim().toLowerCase();

  const record = await lookupLicense(key);

  if (!record) {
    return { success: false, error: 'The license key is invalid.', code: 'LICENSE_INVALID' };
  }

  if (record.status === 'revoked') {
    return { success: false, error: 'This license has been revoked.', code: 'LICENSE_REVOKED' };
  }

  if (record.status !== 'active') {
    return { success: false, error: 'This license is not active.', code: 'LICENSE_INACTIVE' };
  }

  // HWID must match
  if (record.hwid !== normalizedHwid) {
    return {
      success: false,
      error: 'This license is bound to a different device.',
      code: 'HWID_MISMATCH',
    };
  }

  return {
    success: true,
    license: {
      licenseKey: key,
      tier: record.tier,
      status: record.status,
      activatedAt: record.activated_at,
    },
  };
}

/**
 * License status lookup (read-only).
 * @param {string} licenseKey
 * @returns {Promise<{ success: boolean, license?: Object, error?: string, code?: string }>}
 */
async function getLicenseStatus(licenseKey) {
  const key = licenseKey.trim().toUpperCase();

  const record = await lookupLicense(key);

  if (!record) {
    return { success: false, error: 'The license key is invalid.', code: 'LICENSE_INVALID' };
  }

  return {
    success: true,
    license: {
      licenseKey: key,
      tier: record.tier,
      status: record.status,
      activatedAt: record.activated_at,
      hasHwid: !!record.hwid,
    },
  };
}

/**
 * Add a license to the in-memory store (for dev/test).
 */
function seedInMemoryLicense(record) {
  const key = record.license_key || record.licenseKey;
  if (key) {
    inMemoryLicenses.set(key.toUpperCase(), {
      license_key: key.toUpperCase(),
      tier: record.tier || 'standard',
      status: record.status || 'active',
      hwid: record.hwid || null,
      activated_at: record.activated_at || null,
      created_at: record.created_at || new Date().toISOString(),
    });
  }
}

/**
 * Clear all in-memory licenses (for testing).
 */
function clearInMemoryLicenses() {
  inMemoryLicenses.clear();
}

/**
 * Check if Supabase is configured.
 */
function isSupabaseConfigured() {
  return supabase !== null;
}

module.exports = {
  lookupLicense,
  bindLicense,
  activateLicense,
  validateLicense,
  getLicenseStatus,
  seedInMemoryLicense,
  clearInMemoryLicenses,
  isSupabaseConfigured,
  inMemoryLicenses,
};
