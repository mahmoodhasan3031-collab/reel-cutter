const { machineIdSync, machineId } = require('node-machine-id');
const crypto = require('crypto');
const os = require('os');

let cachedHwid = null;

/**
 * Derives a fallback machine fingerprint if node-machine-id is blocked or unavailable.
 * @returns {string}
 */
function getFallbackMachineFingerprint() {
  try {
    const cpus = os.cpus().map((c) => c.model).join(';');
    const homedir = os.homedir();
    const hostname = os.hostname();
    const platform = os.platform();
    const raw = `${platform}:${hostname}:${homedir}:${cpus}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch {
    return 'fallback-machine-id-' + crypto.randomBytes(16).toString('hex');
  }
}

/**
 * Returns a stable, deterministic hardware ID for this computer.
 * Generated securely in the Electron main process.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<string>}
 */
async function getHardwareId(forceRefresh = false) {
  if (cachedHwid && !forceRefresh) {
    return cachedHwid;
  }

  try {
    // Attempt node-machine-id with original raw GUID
    const id = await machineId({ original: true });
    if (id && id.trim()) {
      // Hash it with SHA-256 for a consistent 64-char identifier
      cachedHwid = crypto.createHash('sha256').update(id.trim()).digest('hex');
      return cachedHwid;
    }
  } catch (err) {
    console.warn('[HWID] node-machine-id async failed, trying sync fallback:', err.message);
  }

  try {
    const idSync = machineIdSync({ original: true });
    if (idSync && idSync.trim()) {
      cachedHwid = crypto.createHash('sha256').update(idSync.trim()).digest('hex');
      return cachedHwid;
    }
  } catch (err) {
    console.warn('[HWID] node-machine-id sync failed, using OS fingerprint:', err.message);
  }

  cachedHwid = getFallbackMachineFingerprint();
  return cachedHwid;
}

/**
 * Synchronously returns the cached HWID or computes fallback.
 * @returns {string}
 */
function getHardwareIdSync() {
  if (cachedHwid) return cachedHwid;
  try {
    const id = machineIdSync({ original: true });
    if (id && id.trim()) {
      cachedHwid = crypto.createHash('sha256').update(id.trim()).digest('hex');
      return cachedHwid;
    }
  } catch {
    // fallback
  }
  cachedHwid = getFallbackMachineFingerprint();
  return cachedHwid;
}

/**
 * Formats a shortened HWID for display in the UI (e.g. "a8f1...4c92").
 * @param {string} hwid
 * @returns {string}
 */
function formatShortHwid(hwid) {
  if (!hwid || hwid.length < 10) return hwid || 'Unknown';
  return `${hwid.substring(0, 6)}...${hwid.substring(hwid.length - 4)}`;
}

module.exports = {
  getHardwareId,
  getHardwareIdSync,
  formatShortHwid,
};
