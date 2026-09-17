const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getHardwareIdSync } = require('./hwid');

const LICENSE_FILENAME = 'license.enc';
const SIGNING_SECRET_FILENAME = 'signing-secret.enc';

/**
 * Gets the path to the encrypted license file.
 * @param {string} [customDir] Optional override for testing
 * @returns {string}
 */
function getLicenseFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, LICENSE_FILENAME);
  }
  try {
    const userDataPath = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userDataPath, LICENSE_FILENAME);
  } catch {
    return path.join(process.cwd(), LICENSE_FILENAME);
  }
}

/**
 * Gets the path to the encrypted signing secret file.
 * @param {string} [customDir] Optional override for testing
 * @returns {string}
 */
function getSigningSecretPath(customDir) {
  if (customDir) {
    return path.join(customDir, SIGNING_SECRET_FILENAME);
  }
  try {
    const userDataPath = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userDataPath, SIGNING_SECRET_FILENAME);
  } catch {
    return path.join(process.cwd(), SIGNING_SECRET_FILENAME);
  }
}

/**
 * Derives a 32-byte key from the hardware ID for AES-256-GCM fallback encryption.
 * This key is used ONLY for encrypting/decrypting stored files — NOT for HMAC signing.
 * @returns {Buffer}
 */
function deriveMachineKey() {
  const hwid = getHardwareIdSync();
  const salt = 'reel-cutter-secure-storage-v1';
  return crypto.scryptSync(hwid, salt, 32);
}

/**
 * Encrypts a string using AES-256-GCM (used when Electron safeStorage is unavailable).
 * @param {string} text
 * @returns {Buffer}
 */
function fallbackEncrypt(text) {
  const key = deriveMachineKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: [1 byte mode (0x02)] [12 bytes IV] [16 bytes auth tag] [encrypted payload]
  return Buffer.concat([Buffer.from([0x02]), iv, authTag, encrypted]);
}

/**
 * Decrypts a buffer using AES-256-GCM.
 * @param {Buffer} buffer
 * @returns {string}
 */
function fallbackDecrypt(buffer) {
  const key = deriveMachineKey();
  const iv = buffer.subarray(1, 13);
  const authTag = buffer.subarray(13, 29);
  const encrypted = buffer.subarray(29);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * Encrypts text using Electron safeStorage if available, otherwise AES-256-GCM.
 * @param {string} text
 * @returns {Buffer}
 */
function encryptData(text) {
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(text);
      // Format: [1 byte mode (0x01 = safeStorage)] [encrypted buffer]
      return Buffer.concat([Buffer.from([0x01]), encrypted]);
    }
  } catch (err) {
    console.warn('[LicenseStore] safeStorage failed, falling back to machine AES-GCM:', err.message);
  }
  return fallbackEncrypt(text);
}

/**
 * Decrypts buffer using the appropriate mechanism.
 * @param {Buffer} buffer
 * @returns {string}
 */
function decryptData(buffer) {
  if (!buffer || buffer.length < 2) {
    throw new Error('Invalid encrypted payload');
  }
  const mode = buffer[0];
  if (mode === 0x01) {
    // Electron safeStorage
    const payload = buffer.subarray(1);
    return safeStorage.decryptString(payload);
  } else if (mode === 0x02) {
    // AES-256-GCM
    return fallbackDecrypt(buffer);
  } else {
    // Legacy / raw attempt
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buffer);
      }
    } catch {
      // ignore
    }
    return fallbackDecrypt(buffer);
  }
}

// ─── Signing Secret Management ──────────────────────────────────────────────
// The HMAC signing secret is a randomly generated 32-byte value stored encrypted
// on disk. It is NOT derived from HWID, hostname, CPU, or any machine identifier.
// HWID remains part of the signed payload but is NOT the signing key.

let cachedSigningSecret = null;
let cachedSigningSecretDir = null;

/**
 * Loads or generates a per-installation HMAC signing secret.
 * Secret is randomly generated on first run, encrypted at rest, and cached in memory.
 *
 * @param {string} [customDir] Optional override for testing
 * @returns {Buffer} 32-byte signing secret
 */
function getOrCreateSigningSecret(customDir) {
  const dirKey = customDir || '__default__';
  if (cachedSigningSecret && cachedSigningSecretDir === dirKey) {
    return cachedSigningSecret;
  }

  const secretPath = getSigningSecretPath(customDir);

  // Try to load existing secret from disk
  if (fs.existsSync(secretPath)) {
    try {
      const encrypted = fs.readFileSync(secretPath);
      const hexSecret = decryptData(encrypted);
      const secret = Buffer.from(hexSecret, 'hex');
      if (secret.length === 32) {
        cachedSigningSecret = secret;
        cachedSigningSecretDir = dirKey;
        return cachedSigningSecret;
      }
    } catch {
      // Corrupt or unreadable — regenerate below
    }
  }

  // Generate new 32-byte random signing secret
  const secret = crypto.randomBytes(32);

  // Persist encrypted on disk
  try {
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const encrypted = encryptData(secret.toString('hex'));
    fs.writeFileSync(secretPath, encrypted);
  } catch (err) {
    console.warn('[LicenseStore] Failed to persist signing secret:', err.message);
  }

  cachedSigningSecret = secret;
  cachedSigningSecretDir = dirKey;
  return cachedSigningSecret;
}

/**
 * Returns the HMAC signing key for license integrity.
 * Key source: securely generated random secret stored on disk.
 * NOT derived from HWID or any machine identifier.
 *
 * @param {string} [customDir] Optional override for testing
 * @returns {Buffer}
 */
function deriveSigningKey(customDir) {
  return getOrCreateSigningSecret(customDir);
}

// ─── Canonical Serialization ────────────────────────────────────────────────

/**
 * Canonical deterministic serialization for HMAC payload.
 * Uses sorted-key JSON with a fixed field set to avoid ambiguous string
 * concatenation and field-boundary collisions.
 *
 * @param {Object} data
 * @returns {string}
 */
function canonicalSerialize(data) {
  const obj = {
    activatedAt: data.activatedAt || '',
    hwid: data.hwid || '',
    lastSeenAt: data.lastSeenAt || '',
    lastValidatedAt: data.lastValidatedAt || '',
    licenseKey: data.licenseKey || '',
    status: data.status || '',
    tier: data.tier || '',
  };
  return JSON.stringify(obj);
}

// ─── Timing-Safe Signature Comparison ───────────────────────────────────────

/**
 * Compares two HMAC hex signatures using constant-time comparison
 * to prevent timing side-channel attacks.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function signaturesMatch(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// ─── Signature Computation ──────────────────────────────────────────────────

/**
 * Computes an HMAC-SHA256 signature over the license payload.
 * Uses a securely generated random secret (not HWID) as the signing key.
 * Payload includes all security-relevant fields with canonical JSON serialization.
 *
 * @param {Object} data
 * @param {string} [customDir] Optional override for testing
 * @returns {string} hex-encoded HMAC
 */
function computeSignature(data, customDir) {
  const signingKey = deriveSigningKey(customDir);
  const serialized = canonicalSerialize(data);
  return crypto.createHmac('sha256', signingKey).update(serialized).digest('hex');
}

/**
 * Computes HMAC using legacy format for backward compatibility with existing licenses.
 * Uses raw HWID as key and colon-separated 5-field payload (no timestamps).
 *
 * @param {Object} data
 * @returns {string}
 */
function computeSignatureLegacy(data) {
  const hwid = getHardwareIdSync();
  const serialized = `${data.licenseKey}:${data.hwid}:${data.tier}:${data.status}:${data.activatedAt}`;
  return crypto.createHmac('sha256', hwid).update(serialized).digest('hex');
}

// ─── License Persistence ────────────────────────────────────────────────────

/**
 * Saves license record to encrypted local storage with integrity signature.
 * Uses atomic write (temp file + rename) to prevent corruption on crash.
 * @param {Object} licenseData
 * @param {string} [customDir]
 */
function saveLicenseData(licenseData, customDir) {
  const filePath = getLicenseFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = {
    ...licenseData,
    signature: computeSignature(licenseData, customDir),
    savedAt: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(payload);
  const encryptedBuffer = encryptData(jsonString);

  // Atomic write: temp file + rename
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tempPath, encryptedBuffer);
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    // Windows fallback: rename may fail across volumes; try copy + unlink
    try {
      if (fs.existsSync(tempPath)) {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
      }
    } catch (copyErr) {
      // Clean up temp file on failure
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
      throw new Error(`Failed to save license data: ${copyErr.message}`);
    }
  }
}

/**
 * Loads and decrypts license record from local storage.
 * Verifies integrity signature (new format first, legacy fallback).
 * Transparently upgrades legacy signatures and re-saves.
 *
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function loadLicenseData(customDir) {
  if (app && typeof app.isReady === 'function' && !app.isReady()) {
    return null;
  }

  const filePath = getLicenseFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const encryptedBuffer = fs.readFileSync(filePath);
    const jsonString = decryptData(encryptedBuffer);
    const data = JSON.parse(jsonString);

    // Verify signature — try new format first, fall back to legacy for backward compatibility
    const expectedSig = computeSignature(data, customDir);
    const legacySig = computeSignatureLegacy(data);

    if (!signaturesMatch(data.signature, expectedSig) && !signaturesMatch(data.signature, legacySig)) {
      console.warn('[LicenseStore] Signature verification failed! Storage may have been tampered with.');
      return null;
    }

    // Transparently upgrade legacy signature to new format
    if (signaturesMatch(data.signature, legacySig) && !signaturesMatch(data.signature, expectedSig)) {
      data.signature = expectedSig;
      // Re-save to persist the migrated format
      saveLicenseData(data, customDir);
    }

    return data;
  } catch (err) {
    console.warn('[LicenseStore] Failed to decrypt or read license file:', err.message);
    return null;
  }
}

/**
 * Clears locally stored license data.
 * @param {string} [customDir]
 */
function clearLicenseData(customDir) {
  const filePath = getLicenseFilePath(customDir);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn('[LicenseStore] Error removing license file:', err.message);
    }
  }
}

/**
 * Checks if a license file exists locally.
 * @param {string} [customDir]
 * @returns {boolean}
 */
function hasLicenseData(customDir) {
  const filePath = getLicenseFilePath(customDir);
  return fs.existsSync(filePath);
}

module.exports = {
  saveLicenseData,
  loadLicenseData,
  clearLicenseData,
  hasLicenseData,
  getLicenseFilePath,
  getSigningSecretPath,
  computeSignature,
  computeSignatureLegacy,
  deriveSigningKey,
  canonicalSerialize,
  signaturesMatch,
};
