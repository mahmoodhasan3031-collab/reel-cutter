const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Service-role client, resolved lazily so tests can inject a fake client.
let injectedSupabaseClient;
let defaultSupabaseClient;
let defaultSupabaseClientResolved = false;

function getSupabaseClient() {
  if (injectedSupabaseClient !== undefined) {
    return injectedSupabaseClient;
  }
  if (!defaultSupabaseClientResolved) {
    defaultSupabaseClientResolved = true;
    if (config.supabase.url && config.supabase.serviceRoleKey) {
      try {
        defaultSupabaseClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
          auth: { persistSession: false },
        });
      } catch (err) {
        console.warn('[LicenseService] Failed to initialize Supabase client:', err.message);
      }
    }
  }
  return defaultSupabaseClient || null;
}

/**
 * For testing: inject a fake Supabase client (null forces the in-memory path).
 */
function setSupabaseClientForTests(client) {
  injectedSupabaseClient = client;
}

/**
 * For testing: restores config-based Supabase client resolution.
 */
function resetSupabaseClientForTests() {
  injectedSupabaseClient = undefined;
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
 * Computes the server-authoritative entitlement flag for a license record.
 * `status` alone is not authoritative for subscription licenses (the Stripe
 * webhook updates subscription columns, never `status`), so subscription
 * records are decided by checkSubscriptionValidity (M-1, STEP 76).
 *
 * @param {Object} record
 * @returns {boolean}
 */
function computeIsActive(record) {
  if (!record || record.status !== 'active') return false;
  if (record.subscription_status || record.stripe_subscription_id) {
    return checkSubscriptionValidity(record).valid;
  }
  return true;
}

/**
 * Looks up a license by key. Returns only safe public fields
 * (same column set as the fetch_license_by_key RPC — no payment metadata).
 * @param {string} licenseKey
 * @returns {Promise<Object|null>}
 */
async function lookupLicense(licenseKey) {
  const key = licenseKey.trim().toUpperCase();

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
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

  // Return same shape as RPC (safe public fields only — no payment metadata)
  return {
    license_key: record.license_key,
    tier: record.tier,
    status: record.status,
    hwid: record.hwid,
    activated_at: record.activated_at,
    created_at: record.created_at,
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

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .rpc('bind_license_hwid', {
          p_license_key: key,
          p_hwid: normalizedHwid,
        });

      if (error) throw error;

      // L-2 (STEP 76): the RPC returns a row ONLY when the license is now
      // bound to the requested hwid. An empty result means the license was
      // not found, was rejected (inactive/revoked), or the bind race was
      // lost to another device — never report those as success.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return { success: false, error: 'LICENSE_BIND_FAILED' };
      }
      if (row.hwid !== normalizedHwid) {
        return { success: false, error: 'HWID_MISMATCH' };
      }
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
      // L-2 (STEP 76): surface WHY the bind failed instead of a blanket error.
      if (bindResult.error === 'HWID_MISMATCH') {
        return {
          success: false,
          error: 'This license is already bound to another device.',
          code: 'HWID_MISMATCH',
        };
      }
      if (bindResult.error === 'LICENSE_NOT_FOUND') {
        return { success: false, error: 'The license key is invalid.', code: 'LICENSE_INVALID' };
      }
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
      // M-1 (STEP 76): authoritative entitlement flag. For subscription
      // records this is derived from subscription columns (which the
      // webhook maintains), not from the static `status` column.
      isActive: computeIsActive(record),
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
  const linkClient = getSupabaseClient();
  if (linkClient) {
    try {
      const { error } = await linkClient
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

  const listClient = getSupabaseClient();
  if (listClient) {
    try {
      const { data, error } = await listClient
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
 * Finds a license in any in-memory store (service fallback or generator
 * registry). Used by admin mutations so dev/test records are reachable even
 * when the service fallback store does not hold the key.
 * @param {string} key - Normalized license key
 * @returns {Object|null}
 */
function findAnyInMemoryLicense(key) {
  const direct = inMemoryLicenses.get(key);
  if (direct) return direct;

  try {
    const licenseGenerator = require('./licenseGenerator');
    for (const generated of licenseGenerator.getInMemoryLicenses()) {
      if (generated.license_key === key) return generated;
    }
  } catch {
    // licenseGenerator module not available
  }
  return null;
}

/**
 * Applies a mutation to every in-memory license store that may hold the key
 * (licenseService fallback store + licenseGenerator registry).
 * @param {string} key - Normalized license key
 * @param {(record: Object) => void} mutate
 */
function applyToInMemoryStores(key, mutate) {
  const record = inMemoryLicenses.get(key);
  if (record) mutate(record);

  try {
    const licenseGenerator = require('./licenseGenerator');
    for (const generated of licenseGenerator.getInMemoryLicenses()) {
      if (generated.license_key === key) mutate(generated);
    }
  } catch {
    // licenseGenerator module not available
  }
}

/**
 * Revokes a license (admin operation, service-role only — L-3 STEP 76).
 * Idempotent: an already-revoked license succeeds with alreadyRevoked=true.
 * Never touches subscription columns or hwid.
 *
 * @param {string} licenseKey
 * @returns {Promise<{ success: boolean, code?: string, alreadyRevoked?: boolean }>}
 */
async function revokeLicenseKey(licenseKey) {
  const key = licenseKey.trim().toUpperCase();

  const record = (await lookupLicense(key)) || findAnyInMemoryLicense(key);
  if (!record) {
    return { success: false, code: 'LICENSE_INVALID' };
  }
  if (record.status === 'revoked') {
    return { success: true, alreadyRevoked: true };
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('licenses')
        .update({ status: 'revoked' })
        .eq('license_key', key)
        .select('license_key');
      if (error) throw error;
      if (!data || data.length === 0) {
        return { success: false, code: 'LICENSE_INVALID' };
      }
      return { success: true, alreadyRevoked: false };
    } catch (err) {
      console.warn('[LicenseService] revoke failed:', err.message);
      return { success: false, code: 'OPERATION_FAILED' };
    }
  }

  applyToInMemoryStores(key, (rec) => {
    rec.status = 'revoked';
    rec.updated_at = new Date().toISOString();
  });
  return { success: true, alreadyRevoked: false };
}

/**
 * Clears the hwid binding of a license (admin operation — L-3 STEP 76).
 * Never changes status/tier/subscription columns.
 * Idempotent: an already-unbound license succeeds with alreadyUnbound=true.
 *
 * @param {string} licenseKey
 * @returns {Promise<{ success: boolean, code?: string, alreadyUnbound?: boolean, hadHwid?: boolean }>}
 */
async function resetLicenseHwid(licenseKey) {
  const key = licenseKey.trim().toUpperCase();

  const record = (await lookupLicense(key)) || findAnyInMemoryLicense(key);
  if (!record) {
    return { success: false, code: 'LICENSE_INVALID' };
  }
  const hadHwid = !!record.hwid;
  if (!hadHwid) {
    return { success: true, alreadyUnbound: true, hadHwid: false };
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('licenses')
        .update({ hwid: null })
        .eq('license_key', key)
        .select('license_key');
      if (error) throw error;
      if (!data || data.length === 0) {
        return { success: false, code: 'LICENSE_INVALID' };
      }
      return { success: true, alreadyUnbound: false, hadHwid: true };
    } catch (err) {
      console.warn('[LicenseService] hwid reset failed:', err.message);
      return { success: false, code: 'OPERATION_FAILED' };
    }
  }

  applyToInMemoryStores(key, (rec) => {
    rec.hwid = null;
    rec.updated_at = new Date().toISOString();
  });
  return { success: true, alreadyUnbound: false, hadHwid: true };
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
  return getSupabaseClient() !== null;
}

module.exports = {
  lookupLicense,
  bindLicense,
  activateLicense,
  validateLicense,
  getLicenseStatus,
  linkLicenseToUser,
  getLicensesByUserId,
  revokeLicenseKey,
  resetLicenseHwid,
  seedInMemoryLicense,
  clearInMemoryLicenses,
  isSupabaseConfigured,
  inMemoryLicenses,
  checkSubscriptionValidity,
  computeIsActive,
  setSupabaseClientForTests,
  resetSupabaseClientForTests,
};
