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
 * Determines if a subscription license is currently valid based on subscription state.
 * Server-authoritative: never trusts client-supplied status.
 *
 * @param {Object} record - License record from database
 * @returns {{ valid: boolean, reason?: string }}
 */
function checkSubscriptionValidity(record) {
  // One-time licenses (no subscription) use legacy status check
  if (!record.stripe_subscription_id && !record.subscription_status) {
    return { valid: record.status === 'active' };
  }

  // Subscription license: check subscription_status
  const subStatus = record.subscription_status;

  if (subStatus === 'active') {
    // Active subscription — check if period has expired (edge case: webhook delay)
    if (record.current_period_end) {
      const now = new Date();
      const periodEnd = new Date(record.current_period_end);
      if (now > periodEnd) {
        return { valid: false, reason: 'SUBSCRIPTION_EXPIRED' };
      }
    }
    return { valid: true };
  }

  if (subStatus === 'past_due') {
    // Past due — allow access during grace period
    // Access continues until current_period_end
    if (record.current_period_end) {
      const now = new Date();
      const periodEnd = new Date(record.current_period_end);
      if (now > periodEnd) {
        return { valid: false, reason: 'PAST_DUE_PERIOD_ENDED' };
      }
    }
    return { valid: true };
  }

  if (subStatus === 'canceled') {
    // Canceled — access continues until current_period_end if cancel_at_period_end
    if (record.cancel_at_period_end && record.current_period_end) {
      const now = new Date();
      const periodEnd = new Date(record.current_period_end);
      if (now <= periodEnd) {
        return { valid: true };
      }
    }
    return { valid: false, reason: 'SUBSCRIPTION_CANCELED' };
  }

  if (subStatus === 'unpaid') {
    return { valid: false, reason: 'SUBSCRIPTION_UNPAID' };
  }

  // Unknown subscription status — deny access
  return { valid: false, reason: 'SUBSCRIPTION_UNKNOWN_STATUS' };
}

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
    stripe_subscription_id: record.stripe_subscription_id || null,
    subscription_status: record.subscription_status || null,
    current_period_end: record.current_period_end || null,
    cancel_at_period_end: record.cancel_at_period_end || false,
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

  // Subscription-aware validity check
  if (record.stripe_subscription_id || record.subscription_status) {
    const subCheck = checkSubscriptionValidity(record);
    if (!subCheck.valid) {
      return { success: false, error: 'This subscription is no longer active.', code: 'SUBSCRIPTION_INACTIVE' };
    }
  } else if (record.status !== 'active') {
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

  // Subscription-aware validity check
  if (record.stripe_subscription_id || record.subscription_status) {
    const subCheck = checkSubscriptionValidity(record);
    if (!subCheck.valid) {
      return { success: false, error: 'This subscription is no longer active.', code: 'SUBSCRIPTION_INACTIVE' };
    }
  } else if (record.status !== 'active') {
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
      subscriptionStatus: record.subscription_status || null,
      currentPeriodEnd: record.current_period_end || null,
      cancelAtPeriodEnd: record.cancel_at_period_end || false,
    },
  };
}

/**
 * Link a license to an authenticated Supabase user.
 * Sets the user_id on the license record.
 * Only the service role can call this.
 * @param {string} licenseKey
 * @param {string} userId - Supabase auth user UUID
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function linkLicenseToUser(licenseKey, userId) {
  const key = licenseKey.trim().toUpperCase();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('licenses')
        .update({ user_id: userId })
        .eq('license_key', key);

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.warn('[LicenseService] linkLicenseToUser Supabase failed:', err.message);
    }
  }

  // Fallback: in-memory update (check both licenseService and licenseGenerator stores)
  for (const record of inMemoryLicenses.values()) {
    if (record.license_key === key) {
      record.user_id = userId;
      return { success: true };
    }
  }

  // Also check licenseGenerator's in-memory registry (used by createLicense)
  try {
    const licenseGenerator = require('./licenseGenerator');
    const licenses = licenseGenerator.getInMemoryLicenses();
    for (const record of licenses) {
      if (record.license_key === key) {
        record.user_id = userId;
        return { success: true };
      }
    }
  } catch {
    // licenseGenerator module not available
  }

  return { success: false, error: 'LICENSE_NOT_FOUND' };
}

/**
 * Get all licenses for an authenticated user.
 * Returns only safe public fields.
 * @param {string} userId - Supabase auth user UUID
 * @returns {Promise<Object[]>}
 */
async function getLicensesByUserId(userId) {
  const normalizedId = userId.toLowerCase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('[LicenseService] getLicensesByUserId Supabase failed:', err.message);
    }
  }

  // Fallback: in-memory lookup
  const fromService = Array.from(inMemoryLicenses.values())
    .filter((record) => record.user_id && record.user_id.toLowerCase() === normalizedId)
    .map((record) => ({
      license_key: record.license_key,
      tier: record.tier,
      status: record.status,
      hwid: record.hwid,
      activated_at: record.activated_at,
      created_at: record.created_at,
      subscription_status: record.subscription_status || null,
      current_period_start: record.current_period_start || null,
      current_period_end: record.current_period_end || null,
      cancel_at_period_end: record.cancel_at_period_end || false,
      canceled_at: record.canceled_at || null,
      plan_interval: record.plan_interval || null,
    }));

  // Also check licenseGenerator's in-memory registry (used by createLicense)
  try {
    const licenseGenerator = require('./licenseGenerator');
    const generated = licenseGenerator.getInMemoryLicenses();
    for (const record of generated) {
      if (record.user_id && record.user_id.toLowerCase() === normalizedId) {
        // Avoid duplicates if already in fromService
        if (!fromService.some((l) => l.license_key === record.license_key)) {
          fromService.push({
            license_key: record.license_key,
            tier: record.tier,
            status: record.status,
            hwid: record.hwid,
            activated_at: record.activated_at,
            created_at: record.created_at,
            subscription_status: record.subscription_status || null,
            current_period_start: record.current_period_start || null,
            current_period_end: record.current_period_end || null,
            cancel_at_period_end: record.cancel_at_period_end || false,
            canceled_at: record.canceled_at || null,
            plan_interval: record.plan_interval || null,
          });
        }
      }
    }
  } catch {
    // licenseGenerator module not available
  }

  return fromService;
}

/**
 * Seed a license into the in-memory store (for testing).
 * @param {Object} record - Must include at least license_key, tier, status.
 */
function seedInMemoryLicense(record) {
  const key = record.license_key.trim().toUpperCase();
  inMemoryLicenses.set(key, {
    license_key: key,
    tier: record.tier || 'pro',
    status: record.status || 'active',
    hwid: record.hwid || null,
    activated_at: record.activated_at || null,
    created_at: record.created_at || new Date().toISOString(),
    user_id: record.user_id || null,
    stripe_subscription_id: record.stripe_subscription_id || null,
    stripe_customer_id: record.stripe_customer_id || null,
    subscription_status: record.subscription_status || null,
    current_period_start: record.current_period_start || null,
    current_period_end: record.current_period_end || null,
    cancel_at_period_end: record.cancel_at_period_end || false,
    canceled_at: record.canceled_at || null,
    plan_interval: record.plan_interval || null,
  });
}

/**
 * Clear all in-memory licenses (for testing).
 */
function clearInMemoryLicenses() {
  inMemoryLicenses.clear();
}

/**
 * Check whether Supabase is configured and connected.
 * @returns {boolean}
 */
function isSupabaseConfigured() {
  return supabase !== null;
}

module.exports = { lookupLicense, bindLicense, activateLicense, validateLicense, getLicenseStatus, linkLicenseToUser, getLicensesByUserId, seedInMemoryLicense, clearInMemoryLicenses, isSupabaseConfigured, inMemoryLicenses, checkSubscriptionValidity };
