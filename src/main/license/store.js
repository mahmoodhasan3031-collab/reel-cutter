const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getHardwareIdSync } = require('./hwid');

const LICENSE_FILENAME = 'license.enc';

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
 * Derives a 32-byte key from the hardware ID for AES-256-GCM fallback encryption.
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

/**
 * Computes an HMAC signature over payload to detect local tampering.
 * @param {Object} data
 * @returns {string}
 */
function computeSignature(data) {
  const hwid = getHardwareIdSync();
  const serialized = `${data.licenseKey}:${data.hwid}:${data.tier}:${data.status}:${data.activatedAt}`;
  return crypto.createHmac('sha256', hwid).update(serialized).digest('hex');
}

/**
 * Saves license record to encrypted local storage.
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
    signature: computeSignature(licenseData),
    savedAt: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(payload);
  const encryptedBuffer = encryptData(jsonString);
  fs.writeFileSync(filePath, encryptedBuffer);
}

/**
 * Loads and decrypts license record from local storage.
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

    // Verify signature
    const expectedSig = computeSignature(data);
    if (data.signature !== expectedSig) {
      console.warn('[LicenseStore] Signature verification failed! Storage may have been tampered with.');
      return null;
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
};
