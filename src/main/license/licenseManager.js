const { getHardwareId, formatShortHwid } = require('./hwid');
const { saveLicenseData, loadLicenseData, clearLicenseData, hasLicenseData } = require('./store');
const { fetchLicense, bindLicenseHwid } = require('./supabaseClient');

const MAX_OFFLINE_GRACE_PERIOD_HOURS = 72; // 3 days

/**
 * Masks a license key for safe display in the UI.
 * e.g., "PRO-REEL-7890-ABCD-1234" -> "••••-••••-••••-1234"
 *
 * @param {string} key
 * @returns {string}
 */
function maskLicenseKey(key) {
  if (!key || typeof key !== 'string') return '••••';
  const clean = key.trim();
  if (clean.length <= 4) return '••••';
  const suffix = clean.slice(-4);
  return `••••-••••-••••-${suffix}`;
}

/**
 * Performs startup validation of cached license against Supabase and HWID.
 *
 * @param {string} [customStorageDir]
 * @returns {Promise<Object>}
 */
async function validateStartup(customStorageDir) {
  const stored = loadLicenseData(customStorageDir);
  if (!stored || !stored.licenseKey) {
    return {
      isValid: false,
      reason: 'NO_LICENSE',
      error: 'No active license found. Activation required.',
    };
  }

  const currentHwid = await getHardwareId();

  // 1. HWID match check
  if (stored.hwid !== currentHwid) {
    return {
      isValid: false,
      reason: 'HWID_MISMATCH',
      error: 'Stored license is bound to a different machine.',
    };
  }

  // 2. Attempt online validation with Supabase
  const { data, error, isOffline } = await fetchLicense(stored.licenseKey);

  if (isOffline) {
    // Check 3-day offline grace period
    const lastValidated = new Date(stored.lastValidatedAt || stored.activatedAt || 0).getTime();
    const now = Date.now();
    const hoursElapsed = (now - lastValidated) / (1000 * 60 * 60);

    if (hoursElapsed <= MAX_OFFLINE_GRACE_PERIOD_HOURS) {
      const remainingHours = Math.max(0, Math.round(MAX_OFFLINE_GRACE_PERIOD_HOURS - hoursElapsed));
      return {
        isValid: true,
        tier: stored.tier || 'standard',
        status: stored.status || 'active',
        maskedKey: maskLicenseKey(stored.licenseKey),
        shortHwid: formatShortHwid(currentHwid),
        isOffline: true,
        gracePeriodRemainingHours: remainingHours,
        lastValidatedAt: stored.lastValidatedAt,
      };
    } else {
      return {
        isValid: false,
        reason: 'GRACE_PERIOD_EXPIRED',
        error: `Offline grace period (${MAX_OFFLINE_GRACE_PERIOD_HOURS / 24} days) has expired. Please connect to the internet to validate your license.`,
      };
    }
  }

  // 3. Online validation response
  if (!data) {
    return {
      isValid: false,
      reason: 'INVALID_KEY',
      error: 'License could not be verified in database.',
    };
  }

  if (data.status === 'revoked') {
    // Revoked by administrator
    clearLicenseData(customStorageDir);
    return {
      isValid: false,
      reason: 'REVOKED',
      error: 'Your license has been revoked. Access blocked.',
    };
  }

  if (data.hwid && data.hwid !== currentHwid) {
    // License has been bound to another HWID
    clearLicenseData(customStorageDir);
    return {
      isValid: false,
      reason: 'HWID_MISMATCH',
      error: 'This license has been activated on another device.',
    };
  }

  // 4. Update local cache with fresh validation timestamp
  const updatedData = {
    ...stored,
    tier: data.tier || stored.tier || 'standard',
    status: data.status || 'active',
    lastValidatedAt: new Date().toISOString(),
  };
  saveLicenseData(updatedData, customStorageDir);

  return {
    isValid: true,
    tier: updatedData.tier,
    status: updatedData.status,
    maskedKey: maskLicenseKey(stored.licenseKey),
    shortHwid: formatShortHwid(currentHwid),
    isOffline: false,
    gracePeriodRemainingHours: MAX_OFFLINE_GRACE_PERIOD_HOURS,
    lastValidatedAt: updatedData.lastValidatedAt,
  };
}

/**
 * Activates a new license key on this machine.
 *
 * @param {string} rawKey
 * @param {string} [customStorageDir]
 * @returns {Promise<Object>}
 */
async function activateLicense(rawKey, customStorageDir) {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    return { success: false, error: 'Please enter a valid license key.' };
  }

  const key = rawKey.trim().toUpperCase();
  const currentHwid = await getHardwareId();

  // 1. Fetch license from Supabase
  const { data, error, isOffline } = await fetchLicense(key);

  if (isOffline) {
    return { success: false, error: 'Internet connection is required to activate a license.' };
  }

  if (!data) {
    return { success: false, error: 'Invalid license key. Please verify and try again.' };
  }

  if (data.status === 'revoked') {
    return { success: false, error: 'This license key has been revoked.' };
  }

  // 2. Check HWID binding
  if (data.hwid && data.hwid !== currentHwid) {
    return {
      success: false,
      error: 'License is already bound to another machine. Multi-device activation is not permitted.',
    };
  }

  // 3. Bind to current HWID if not already bound
  if (!data.hwid) {
    const bindResult = await bindLicenseHwid(key, currentHwid);
    if (!bindResult.success) {
      return {
        success: false,
        error: `Activation failed while registering device: ${bindResult.error || 'Database error'}`,
      };
    }
  }

  // 4. Save validated license locally
  const now = new Date().toISOString();
  const licensePayload = {
    licenseKey: key,
    hwid: currentHwid,
    tier: data.tier || 'standard',
    status: 'active',
    activatedAt: now,
    lastValidatedAt: now,
  };

  saveLicenseData(licensePayload, customStorageDir);

  return {
    success: true,
    tier: licensePayload.tier,
    status: licensePayload.status,
    maskedKey: maskLicenseKey(key),
    shortHwid: formatShortHwid(currentHwid),
    hwidStatus: 'Bound to this device',
    lastValidatedAt: now,
  };
}

/**
 * Deactivates and clears local license.
 *
 * @param {string} [customStorageDir]
 * @returns {Promise<{ success: boolean }>}
 */
async function deactivateLicense(customStorageDir) {
  clearLicenseData(customStorageDir);
  return { success: true };
}

/**
 * Returns current license details safely for UI consumption.
 *
 * @param {string} [customStorageDir]
 * @returns {Promise<Object>}
 */
async function getLicenseInfo(customStorageDir) {
  const currentHwid = await getHardwareId();
  const stored = loadLicenseData(customStorageDir);

  if (!stored) {
    return {
      hasLicense: false,
      isValid: false,
      shortHwid: formatShortHwid(currentHwid),
    };
  }

  const hoursElapsed = (Date.now() - new Date(stored.lastValidatedAt || 0).getTime()) / (1000 * 60 * 60);
  const remainingHours = Math.max(0, Math.round(MAX_OFFLINE_GRACE_PERIOD_HOURS - hoursElapsed));

  return {
    hasLicense: true,
    isValid: stored.status === 'active' && stored.hwid === currentHwid,
    tier: stored.tier || 'standard',
    status: stored.status || 'active',
    maskedKey: maskLicenseKey(stored.licenseKey),
    shortHwid: formatShortHwid(currentHwid),
    hwidStatus: stored.hwid === currentHwid ? 'Bound to this device' : 'HWID mismatch',
    lastValidatedAt: stored.lastValidatedAt,
    activatedAt: stored.activatedAt,
    gracePeriodRemainingHours: remainingHours,
  };
}

module.exports = {
  validateStartup,
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
  maskLicenseKey,
  MAX_OFFLINE_GRACE_PERIOD_HOURS,
};
