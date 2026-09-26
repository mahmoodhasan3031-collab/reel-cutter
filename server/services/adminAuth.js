/**
 * Backend-only admin authentication (STEP 19).
 *
 * - Passwords are stored ONLY as scrypt hashes via ADMIN_PASSWORD_HASH env var.
 *   No plaintext passwords, no hardcoded credentials in source.
 * - Sessions are short-lived HMAC-SHA256 signed tokens (ADMIN_SESSION_SECRET).
 * - Authorization is derived exclusively from a server-verified token.
 *   Client-supplied "role" fields are never trusted.
 * - Passwords, tokens, and session secrets are never logged.
 */

const crypto = require('crypto');
const config = require('../config');

const TOKEN_VERSION = 'v1';
const DEFAULT_SESSION_TTL_SECONDS = 1800;
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

// ─── Admin configuration ─────────────────────────────────────────────────────

/**
 * Returns the current admin configuration (read lazily so tests / runtime
 * env changes are picked up). Never log the returned object.
 */
function getAdminConfig() {
  return config.admin || {};
}

/**
 * Admin auth is available only when ALL of these are present:
 * username, scrypt password hash, and session signing secret.
 */
function isAdminConfigured() {
  const admin = getAdminConfig();
  return Boolean(admin.username && admin.passwordHash && admin.sessionSecret);
}

// ─── Password hashing (scrypt) ───────────────────────────────────────────────

/**
 * Hashes a password with scrypt. Output format: scrypt$<saltHex>$<hashHex>
 * Intended for operators generating ADMIN_PASSWORD_HASH — never store plaintext.
 *
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifies a password against a stored scrypt$ salt$ hash value.
 * Uses timing-safe comparison. Never logs the password or hash.
 *
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
function verifyPassword(password, storedHash) {
  return new Promise((resolve) => {
    if (typeof password !== 'string' || typeof storedHash !== 'string') {
      return resolve(false);
    }
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return resolve(false);
    }
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length === 0 || expected.length === 0) {
      return resolve(false);
    }
    crypto.scrypt(password, salt, expected.length, { N: SCRYPT_COST }, (err, derived) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(derived, expected));
      } catch {
        resolve(false);
      }
    });
  });
}

// ─── Session tokens ──────────────────────────────────────────────────────────

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signPayload(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compare against self to keep timing roughly constant on length mismatch
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates a short-lived signed admin session token.
 * Format: v1.<base64url(payload)>.<base64url(hmac)>
 *
 * @param {string} username Server-verified admin username
 * @param {number} [ttlSeconds] Optional TTL override (0 creates an already-expired token)
 * @returns {{ token: string, expiresAt: number, expiresIn: number }}
 */
function createSessionToken(username, ttlSeconds) {
  const admin = getAdminConfig();
  if (!admin.sessionSecret) {
    throw new Error('Admin session secret is not configured');
  }
  const ttl = typeof ttlSeconds === 'number'
    ? ttlSeconds
    : (Number.isFinite(admin.sessionTtlSeconds) && admin.sessionTtlSeconds > 0
      ? admin.sessionTtlSeconds
      : DEFAULT_SESSION_TTL_SECONDS);

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttl;
  const payload = {
    sub: username,
    role: 'admin', // server-issued — never taken from client input
    iat,
    exp,
    jti: crypto.randomUUID(),
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sigB64 = signPayload(payloadB64, admin.sessionSecret);
  return {
    token: `${TOKEN_VERSION}.${payloadB64}.${sigB64}`,
    expiresAt: exp,
    expiresIn: ttl,
  };
}

/**
 * Verifies a session token. Returns the payload on success, null otherwise.
 * Never throws and never logs the token.
 *
 * @param {string} token
 * @returns {{ sub: string, role: string, iat: number, exp: number, jti: string }|null}
 */
function verifySessionToken(token) {
  const admin = getAdminConfig();
  if (!admin.sessionSecret || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, payloadB64, sigB64] = parts;
  if (version !== TOKEN_VERSION || !payloadB64 || !sigB64) return null;

  const expectedSig = signPayload(payloadB64, admin.sessionSecret);
  if (!timingSafeEqualStrings(sigB64, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (payload.role !== 'admin') return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.exp !== 'number') return null;

  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return null;

  return payload;
}

/**
 * Authenticates admin credentials against server-side environment config.
 * Returns generic results — never reveals whether a username exists.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ ok: true, username: string } | { ok: false, code: 'UNAVAILABLE' | 'INVALID' }>}
 */
async function authenticateAdmin(username, password) {
  const admin = getAdminConfig();

  if (!isAdminConfigured()) {
    return { ok: false, code: 'UNAVAILABLE' };
  }

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return { ok: false, code: 'INVALID' };
  }

  // Always perform password verification (constant work regardless of username)
  const passwordOk = await verifyPassword(password, admin.passwordHash);
  const usernameOk = username === admin.username;

  if (!usernameOk || !passwordOk) {
    return { ok: false, code: 'INVALID' };
  }

  return { ok: true, username: admin.username };
}

// ─── Express middleware ──────────────────────────────────────────────────────

/**
 * Requires a verified admin session on the request.
 * Attaches req.admin = { adminId, username } on success.
 * Never accepts a role from the request body/query/headers.
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers && req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session.' },
    });
  }

  req.admin = {
    adminId: payload.sub,
    username: payload.sub,
  };
  return next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  authenticateAdmin,
  createSessionToken,
  verifySessionToken,
  requireAdmin,
  isAdminConfigured,
  getAdminConfig,
  DEFAULT_SESSION_TTL_SECONDS,
};
