'use strict';
/**
 * Local Structured Logger — STEP 4B
 *
 * Features:
 *  - info / warn / error levels
 *  - Timestamped, structured log lines:  [ISO] [LEVEL] [COMPONENT] message
 *  - Writes to app.log in Electron userData (falls back to os.tmpdir() pre-ready)
 *  - Log rotation: max 1 MB → rotated to app.log.1  (one backup retained)
 *  - Fully offline-safe — zero network access
 *  - Recursive-call guard (logger errors cannot crash the app)
 *  - Credential / secret sanitization built-in
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_LOG_BYTES     = 1 * 1024 * 1024; // 1 MB per file
const MAX_MSG_LENGTH    = 1000;             // chars per log entry
const LOG_FILENAME      = 'app.log';

// ─── Sanitization Patterns ────────────────────────────────────────────────────

const SANITIZE_PATTERNS = [
  // Stripe live / test secret keys
  [/sk_(live|test)_[A-Za-z0-9]+/g,                              '[SK_REDACTED]'],
  // Stripe webhook signing secrets
  [/whsec_[A-Za-z0-9]+/g,                                       '[WHSEC_REDACTED]'],
  // Resend API keys (≥6 chars after re_)
  [/re_[A-Za-z0-9_]{6,}/g,                                      '[RESEND_REDACTED]'],
  // Bearer tokens
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,                         'Bearer [TOKEN_REDACTED]'],
  // Authorization headers
  [/Authorization:\s*\S+/gi,                                    'Authorization: [REDACTED]'],
  // password= / pass= keyword assignments
  [/password\s*[:=]\s*\S+/gi,                                   'password=[REDACTED]'],
  [/\bpass\s*[:=]\s*\S+/gi,                                     'pass=[REDACTED]'],
  // JWT / Supabase service-role tokens
  [/eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT_REDACTED]'],
  // License key patterns  XXXX-XXXX-XXXX-XXXX-XXXX
  [/\b[A-Z]{2,8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, '[LICENSE_KEY_REDACTED]'],
];

/**
 * Sanitizes a log message: removes credentials and truncates.
 *
 * @param {*} msg  Any value that will be stringified.
 * @returns {string}
 */
function sanitize(msg) {
  let str = (msg === null || msg === undefined) ? '' : String(msg);
  for (const [pattern, replacement] of SANITIZE_PATTERNS) {
    str = str.replace(pattern, replacement);
  }
  if (str.length > MAX_MSG_LENGTH) {
    str = str.slice(0, MAX_MSG_LENGTH - 3) + '...';
  }
  return str;
}

/**
 * Masks a customer email address for safe log output.
 * "customer@example.com" → "c***@example.com"
 *
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[unknown]';
  const at = email.indexOf('@');
  if (at < 1) return '[masked]';
  return email.slice(0, 1) + '***' + email.slice(at);
}

// ─── Log Directory ────────────────────────────────────────────────────────────

let _logDir = null; // null = use dynamic resolution each time

/**
 * Returns the active log directory.
 * Falls back to os.tmpdir()/reel-cutter when Electron userData is unavailable.
 *
 * @returns {string}
 */
function getLogDir() {
  if (_logDir) return _logDir;
  try {
    // Will throw if Electron is not available (tests) or app not yet ready
    const { app } = require('electron'); // eslint-disable-line
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) {}
  // Safe fallback for pre-ready or non-Electron (test) environments
  return path.join(os.tmpdir(), 'reel-cutter');
}

/**
 * Lock in the log directory once Electron app.whenReady() has fired.
 * Call this early in app.whenReady() so all subsequent writes go to userData.
 *
 * @param {string} dir
 */
function setLogDir(dir) {
  _logDir = dir;
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

/**
 * Rotates app.log → app.log.1 when the file exceeds MAX_LOG_BYTES.
 * Any existing .1 backup is overwritten (one backup retained).
 * Errors are silently swallowed — rotation must never crash the app.
 *
 * @param {string} logPath  Absolute path to the primary log file.
 */
function rotateIfNeeded(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const { size } = fs.statSync(logPath);
    if (size < MAX_LOG_BYTES) return;

    const backup = logPath + '.1';
    try { fs.unlinkSync(backup); } catch (_) {}
    fs.renameSync(logPath, backup);
  } catch (_) {
    // Rotation failure must not propagate
  }
}

// ─── Core Write ───────────────────────────────────────────────────────────────

let _isWriting = false; // Guard: prevent recursive logger calls from crashing

/**
 * Writes a single log entry to the log file.
 *
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} component
 * @param {string} message
 */
function writeLog(level, component, message) {
  if (_isWriting) return;
  _isWriting = true;
  try {
    const timestamp = new Date().toISOString();
    const clean     = sanitize(message);
    const line      = `[${timestamp}] [${level}] [${component}] ${clean}\n`;

    const dir = getLogDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const logPath = path.join(dir, LOG_FILENAME);
    rotateIfNeeded(logPath);
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (_) {
    // Logger must never throw
  } finally {
    _isWriting = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const logger = {
  /**
   * Log informational message (file only, not echoed to console).
   * @param {string} component  Short tag, e.g. 'FFmpeg', 'License'
   * @param {string} message
   */
  info(component, message) {
    writeLog('INFO', component, String(message));
  },

  /**
   * Log warning message (file + console.warn).
   * @param {string} component
   * @param {string} message
   */
  warn(component, message) {
    writeLog('WARN', component, String(message));
    console.warn(`[WARN] [${component}] ${sanitize(message)}`);
  },

  /**
   * Log error message (file + console.error).
   * @param {string} component
   * @param {string} message
   */
  error(component, message) {
    writeLog('ERROR', component, String(message));
    console.error(`[ERROR] [${component}] ${sanitize(message)}`);
  },

  // ── Utilities ──────────────────────────────────────────────────────────────

  /** Sanitize a string for safe logging (strips secrets, truncates). */
  sanitize,

  /** Mask a customer email address for safe log output. */
  maskEmail,

  /** Lock in the log directory after Electron is ready. */
  setLogDir,

  /** Get the current effective log directory. */
  getLogDir,

  /** Rotate a log file if it exceeds the size limit (exposed for tests). */
  rotateIfNeeded,

  /** Absolute path to the current primary log file. */
  getLogPath() {
    return path.join(getLogDir(), LOG_FILENAME);
  },
};

module.exports = logger;
