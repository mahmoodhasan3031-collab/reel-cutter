/**
 * In-memory sliding window rate limiter for license API endpoints.
 *
 * Limits:
 *   - Activation: 10 requests per minute per IP
 *   - Validation: 30 requests per minute per IP
 *   - Status: 30 requests per minute per IP
 *   - Invalid key attempts: 5 per minute per IP (stricter)
 *
 * Production note: Replace with Redis-backed limiter for multi-instance deployments.
 */

const windows = new Map();

// Strict budget for unknown license keys (also used by invalidKeyGuard)
const INVALID_KEY_MAX_REQUESTS = 5;
const INVALID_KEY_WINDOW_MS = 60_000;

/**
 * Cleans expired entries periodically to prevent memory leaks.
 */
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (now - entry.windowStart > 120_000) {
      windows.delete(key);
    }
  }
}

// Run cleanup every 2 minutes
const cleanupInterval = setInterval(cleanup, 120_000);
if (cleanupInterval.unref) cleanupInterval.unref();

/**
 * Counts one request against a named bucket for an IP and reports whether it
 * is still within the limit. Shared by the middleware limiter and the strict
 * invalid-key guard (STEP 76).
 *
 * @param {string} name - Limiter identifier
 * @param {number} maxRequests - Max requests in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @param {string} ip - Client IP key
 * @returns {{ allowed: boolean, limit: number, remaining: number, resetAt: number, retryAfter: number }}
 */
function consumeWindow(name, maxRequests, windowMs, ip) {
  const key = `${name}:${ip}`;
  const now = Date.now();

  let entry = windows.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 };
    windows.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, maxRequests - entry.count);
  const resetAt = entry.windowStart + windowMs;
  return {
    allowed: entry.count <= maxRequests,
    limit: maxRequests,
    remaining,
    resetAt,
    retryAfter: Math.ceil((resetAt - now) / 1000),
  };
}

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function applyLimitHeaders(res, result) {
  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
}

function sendRateLimited(res, result) {
  res.set('Retry-After', String(result.retryAfter));
  return res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    },
  });
}

/**
 * Creates a rate limiter middleware.
 * @param {Object} options
 * @param {string} options.name - Identifier for this limiter (e.g., 'activate')
 * @param {number} options.maxRequests - Max requests in the window
 * @param {number} options.windowMs - Window duration in milliseconds
 * @returns {Function} Express middleware
 */
function createRateLimiter({ name, maxRequests, windowMs = 60_000 }) {
  return (req, res, next) => {
    const result = consumeWindow(name, maxRequests, windowMs, clientIp(req));
    applyLimitHeaders(res, result);

    if (!result.allowed) {
      return sendRateLimited(res, result);
    }

    next();
  };
}

/**
 * Strict per-IP counter for UNKNOWN license keys (L-4, STEP 76).
 *
 * Stricter than the per-endpoint limiters: only requests that ended with a
 * LICENSE_INVALID lookup actually count, so guess-and-check sweeps of valid
 * endpoints (format checks, existing-key probes) cannot dilute the budget
 * while an attacker brute-forces key space.
 *
 * Sends the 429 itself and returns true when the caller must stop;
 * returns false when the request should continue with its normal 404.
 *
 * @returns {boolean} true if the response was consumed (rate limited)
 */
function invalidKeyGuard(req, res) {
  const result = consumeWindow('invalid_key', INVALID_KEY_MAX_REQUESTS, INVALID_KEY_WINDOW_MS, clientIp(req));
  applyLimitHeaders(res, result);

  if (!result.allowed) {
    sendRateLimited(res, result);
    return true;
  }
  return false;
}

const activateLimiter = createRateLimiter({ name: 'activate', maxRequests: 10, windowMs: 60_000 });
const validateLimiter = createRateLimiter({ name: 'validate', maxRequests: 30, windowMs: 60_000 });
const statusLimiter = createRateLimiter({ name: 'status', maxRequests: 30, windowMs: 60_000 });
const invalidKeyLimiter = createRateLimiter({ name: 'invalid_key', maxRequests: INVALID_KEY_MAX_REQUESTS, windowMs: INVALID_KEY_WINDOW_MS });

module.exports = {
  createRateLimiter,
  activateLimiter,
  validateLimiter,
  statusLimiter,
  invalidKeyLimiter,
  invalidKeyGuard,
  windows,
  cleanup,
};
