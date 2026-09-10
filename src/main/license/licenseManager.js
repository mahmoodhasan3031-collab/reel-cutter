const { getHardwareId, formatShortHwid } = require('./hwid');
const { saveLicenseData, loadLicenseData, clearLicenseData, hasLicenseData } = require('./store');
const { fetchLicense, bindLicenseHwid } = require('./supabaseClient');
const { hasFeature, getTierFeatureList } = require('../../shared/features');

const MAX_OFFLINE_GRACE_PERIOD_HOURS = 72; // 3 days
const CLOCK_DRIFT_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance for legitimate NTP adjustments

let heartbeatTimer = null;

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
 * Checks if the system clock has been tampered with (e.g. rolled backwards).
 *
 * @param {Object} stored License data stored on disk
 * @param {number} [now] Current timestamp ms (default: Date.now())
 * @returns {{ isTampered: boolean, reason?: string, error?: string }}
 */
function checkClockRollback(stored, now = Date.now()) {
  if (!stored) return { isTampered: false };

  const lastValidated = new Date(stored.lastValidatedAt || stored.activatedAt || 0).getTime();
  if (lastValidated > 0 && now < lastValidated - CLOCK_DRIFT_TOLERANCE_MS) {
    return {
      isTampered: true,
      reason: 'CLOCK_TAMPERED',
      error: 'System clock rollback detected. Connect to the internet to validate your license.',
    };
  }

  if (stored.lastSeenAt) {
    const lastSeen = new Date(stored.lastSeenAt).getTime();
    if (lastSeen > 0 && now < lastSeen - CLOCK_DRIFT_TOLERANCE_MS) {
      return {
        isTampered: true,
        reason: 'CLOCK_TAMPERED',
        error: 'System clock rollback detected. Connect to the internet to validate your license.',
      };
    }
  }

  return { isTampered: false };
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
    const now = Date.now();

    // Check clock rollback protection
    const clockCheck = checkClockRollback(stored, now);
    if (clockCheck.isTampered) {
      return {
        isValid: false,
        reason: clockCheck.reason,
        error: clockCheck.error,
      };
    }

    // Check 3-day offline grace period
    const lastValidated = new Date(stored.lastValidatedAt || stored.activatedAt || 0).getTime();
    const hoursElapsed = (now - lastValidated) / (1000 * 60 * 60);

    if (hoursElapsed >= 0 && hoursElapsed <= MAX_OFFLINE_GRACE_PERIOD_HOURS) {
      // Update monotonic lastSeenAt
      const updatedData = {
        ...stored,
        lastSeenAt: new Date(Math.max(now, new Date(stored.lastSeenAt || 0).getTime())).toISOString(),
      };
      saveLicenseData(updatedData, customStorageDir);

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

  // 4. Update local cache with fresh validation and lastSeen timestamps
  const currentTimestamp = new Date().toISOString();
  const updatedData = {
    ...stored,
    tier: data.tier || stored.tier || 'standard',
    status: data.status || 'active',
    lastValidatedAt: currentTimestamp,
    lastSeenAt: currentTimestamp,
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
    lastSeenAt: now,
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
 * Returns current license details safely for UI consumption and IPC feature gating.
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

  const now = Date.now();
  const clockCheck = checkClockRollback(stored, now);
  const lastValidated = new Date(stored.lastValidatedAt || stored.activatedAt || 0).getTime();
  const hoursElapsed = (now - lastValidated) / (1000 * 60 * 60);
  const isGraceExpired = hoursElapsed > MAX_OFFLINE_GRACE_PERIOD_HOURS || hoursElapsed < -0.1;
  const remainingHours = Math.max(0, Math.round(MAX_OFFLINE_GRACE_PERIOD_HOURS - hoursElapsed));

  const isValid =
    stored.status === 'active' &&
    stored.hwid === currentHwid &&
    !clockCheck.isTampered &&
    !isGraceExpired;

  return {
    hasLicense: true,
    isValid,
    tier: stored.tier || 'standard',
    status: clockCheck.isTampered
      ? 'clock_tampered'
      : isGraceExpired
      ? 'grace_period_expired'
      : stored.status || 'active',
    reason: clockCheck.isTampered
      ? 'CLOCK_TAMPERED'
      : isGraceExpired
      ? 'GRACE_PERIOD_EXPIRED'
      : null,
    maskedKey: maskLicenseKey(stored.licenseKey),
    shortHwid: formatShortHwid(currentHwid),
    hwidStatus: stored.hwid === currentHwid ? 'Bound to this device' : 'HWID mismatch',
    lastValidatedAt: stored.lastValidatedAt,
    activatedAt: stored.activatedAt,
    lastSeenAt: stored.lastSeenAt,
    gracePeriodRemainingHours: isGraceExpired ? 0 : remainingHours,
    features: isValid ? getTierFeatureList(stored.tier || 'standard') : {},
  };
}

let isRevalidating = false;

/**
 * Silently revalidates the license with Supabase when internet connectivity is restored.
 * Prevents concurrent redundant validation requests if multiple network events fire rapidly.
 *
 * @param {string} [customStorageDir]
 * @returns {Promise<Object|null>}
 */
async function revalidateOnlineSilently(customStorageDir) {
  if (isRevalidating) return null;
  isRevalidating = true;
  try {
    return await validateStartup(customStorageDir);
  } finally {
    isRevalidating = false;
  }
}

/**
 * Starts periodic background license heartbeat to monitor grace-period expiration
 * and clock tampering while the app remains running.
 *
 * @param {Function} onStatusChange Callback invoked when license status changes
 * @param {number} [intervalMs=600000] Interval in ms (default: 10 minutes)
 */
function startBackgroundLicenseHeartbeat(onStatusChange, intervalMs = 10 * 60 * 1000) {
  stopBackgroundLicenseHeartbeat();

  heartbeatTimer = setInterval(async () => {
    try {
      const status = await validateStartup();
      if (typeof onStatusChange === 'function') {
        onStatusChange(status);
      }
    } catch (err) {
      console.warn('[LicenseHeartbeat] Error during periodic check:', err.message);
    }
  }, intervalMs);

  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

/**
 * Stops the periodic background license heartbeat.
 */
function stopBackgroundLicenseHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

module.exports = {
  validateStartup,
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
  maskLicenseKey,
  hasFeature,
  checkClockRollback,
  revalidateOnlineSilently,
  startBackgroundLicenseHeartbeat,
  stopBackgroundLicenseHeartbeat,
  MAX_OFFLINE_GRACE_PERIOD_HOURS,
  CLOCK_DRIFT_TOLERANCE_MS,
};
