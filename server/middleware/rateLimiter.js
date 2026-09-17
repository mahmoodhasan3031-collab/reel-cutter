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
 * Creates a rate limiter middleware.
 * @param {Object} options
 * @param {string} options.name - Identifier for this limiter (e.g., 'activate')
 * @param {number} options.maxRequests - Max requests in the window
 * @param {number} options.windowMs - Window duration in milliseconds
 * @returns {Function} Express middleware
 */
function createRateLimiter({ name, maxRequests, windowMs = 60_000 }) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
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

    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
    }

    next();
  };
}

const activateLimiter = createRateLimiter({ name: 'activate', maxRequests: 10, windowMs: 60_000 });
const validateLimiter = createRateLimiter({ name: 'validate', maxRequests: 30, windowMs: 60_000 });
const statusLimiter = createRateLimiter({ name: 'status', maxRequests: 30, windowMs: 60_000 });
const invalidKeyLimiter = createRateLimiter({ name: 'invalid_key', maxRequests: 5, windowMs: 60_000 });

module.exports = {
  createRateLimiter,
  activateLimiter,
  validateLimiter,
  statusLimiter,
  invalidKeyLimiter,
  windows,
  cleanup,
};
