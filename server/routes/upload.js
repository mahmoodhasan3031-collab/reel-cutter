const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { allowMethods } = require('../middleware/inputValidator');
const { createRateLimiter } = require('../middleware/rateLimiter');
const config = require('../config');

// ─── Constants ──────────────────────────────────────────────────────────────

const BUCKET_NAME = 'payment-proofs';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes for confirmation

// ─── Rate Limiters ──────────────────────────────────────────────────────────

const uploadLimiter = createRateLimiter({ name: 'upload_proof', maxRequests: 10, windowMs: 60_000 });

// ─── Supabase Client ────────────────────────────────────────────────────────

function getSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null;
  }
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function errorResponse(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function successResponse(res, data) {
  return res.status(200).json({
    success: true,
    ...data,
  });
}

/**
 * Extracts user ID from Supabase JWT if present.
 * Returns null if not authenticated.
 */
async function extractUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Validates that a MIME type is allowed.
 */
function isAllowedMimeType(contentType) {
  if (!contentType) return false;
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_MIME_TYPES.includes(normalized);
}

/**
 * Extracts file extension from MIME type.
 */
function getExtensionFromMime(contentType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return map[contentType.split(';')[0].trim().toLowerCase()] || '';
}

/**
 * Generates a collision-resistant storage path.
 * Pattern: {userId-or-anonymous}/{randomUUID}{ext}
 */
function generateStoragePath(userId, extension) {
  const namespace = userId || `anon-${crypto.randomUUID()}`;
  const filename = `${crypto.randomUUID()}${extension}`;
  return `${namespace}/${filename}`;
}

/**
 * Sanitizes a path to prevent traversal.
 */
function isPathSafe(path) {
  // Reject path traversal attempts
  if (path.includes('..') || path.includes('//') || path.startsWith('/')) {
    return false;
  }
  // Reject if contains backslash (Windows-style traversal)
  if (path.includes('\\')) {
    return false;
  }
  return true;
}

/**
 * Validates proof reference format.
 * Proof references must follow the pattern: {namespace}/{uuid}.{ext}
 */
function isValidProofReference(ref) {
  if (!ref || typeof ref !== 'string') return false;
  // Must start with BUCKET_NAME/
  if (!ref.startsWith(`${BUCKET_NAME}/`)) return false;
  // Extract the path after bucket prefix
  const subpath = ref.slice(`${BUCKET_NAME}/`.length);
  // Must not be empty
  if (!subpath) return false;
  // Must be safe (no traversal)
  if (!isPathSafe(subpath)) return false;
  // Must end with allowed extension
  const ext = subpath.slice(subpath.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return false;
  // Must contain a UUID-like segment (at least one UUID part)
  if (!subpath.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)) {
    return false;
  }
  return true;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/upload/proof
 *
 * Uploads a payment proof image to private Supabase Storage.
 *
 * Request: multipart/form-data OR raw binary with headers:
 *   - Content-Type: image/jpeg | image/png | image/webp
 *   - X-Filename: original filename (optional, used for extension detection)
 *
 * Authentication: Optional (Bearer JWT)
 * Rate limit: 10 uploads/minute per IP
 *
 * Response:
 *   { success: true, proof: { path, content_type, size, expires_at } }
 */
router.post('/proof',
  allowMethods(['POST']),
  uploadLimiter,
  express.raw({
    type: (req) => {
      const ct = req.headers['content-type'] || '';
      const mime = ct.split(';')[0].trim().toLowerCase();
      return ALLOWED_MIME_TYPES.includes(mime);
    },
    limit: `${MAX_FILE_SIZE}`,
    verify: (req, _res, buf) => {
      // Store the raw buffer on the request for processing
      req.rawFile = buf;
    },
  }),
  async (req, res) => {
    try {
      // ─── Get the uploaded file buffer ────────────────────────────────
      const fileBuffer = req.rawFile || req.body;

      if (!fileBuffer || fileBuffer.length === 0) {
        return errorResponse(res, 400, 'EMPTY_FILE', 'No file was uploaded. Please select a payment proof image.');
      }

      // ─── Get Content-Type from request ───────────────────────────────
      const contentType = req.headers['content-type'];
      if (!isAllowedMimeType(contentType)) {
        return errorResponse(res, 400, 'UNSUPPORTED_FORMAT', `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
      }

      const normalizedMime = contentType.split(';')[0].trim().toLowerCase();
      const extension = getExtensionFromMime(normalizedMime);

      // ─── Validate file size ──────────────────────────────────────────
      if (fileBuffer.length > MAX_FILE_SIZE) {
        return errorResponse(res, 400, 'FILE_TOO_LARGE', `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
      }

      // ─── Basic content validation ────────────────────────────────────
      // Check magic bytes to verify it's actually an image
      if (!isValidImageMagicBytes(fileBuffer, normalizedMime)) {
        return errorResponse(res, 400, 'INVALID_FILE', 'The uploaded file does not appear to be a valid image.');
      }

      // ─── Extract authenticated user (if present) ─────────────────────
      const auth = await extractUserId(req);

      // ─── Generate collision-resistant storage path ───────────────────
      const storagePath = generateStoragePath(auth?.userId, extension);

      if (!isPathSafe(storagePath)) {
        return errorResponse(res, 400, 'INVALID_PATH', 'Generated storage path is invalid.');
      }

      // ─── Upload to Supabase Storage ──────────────────────────────────
      const supabase = getSupabaseClient();
      if (!supabase) {
        return errorResponse(res, 500, 'SERVICE_UNAVAILABLE', 'Upload service is not configured.');
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: normalizedMime,
          upsert: false,
        });

      if (uploadError) {
        console.error('[Upload] Storage error:', uploadError.message);
        return errorResponse(res, 500, 'UPLOAD_FAILED', 'Failed to save proof file. Please try again.');
      }

      // ─── Generate short-lived signed URL for confirmation ────────────
      let expiresAt = null;
      const { data: signedData, error: signedError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

      if (!signedError && signedData?.signedUrl) {
        expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();
      }

      return res.status(201).json({
        success: true,
        proof: {
          path: `${BUCKET_NAME}/${uploadData?.path || storagePath}`,
          content_type: normalizedMime,
          size: fileBuffer.length,
          expires_at: expiresAt,
        },
      });
    } catch (err) {
      console.error('[Upload] Error:', err.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred during upload. Please try again.');
    }
  }
);

/**
 * Validates image magic bytes against expected MIME type.
 * Prevents uploading non-image files with spoofed MIME types.
 */
function isValidImageMagicBytes(buffer, mimeType) {
  if (buffer.length < 4) return false;

  switch (mimeType) {
    case 'image/jpeg':
      // JPEG starts with FF D8 FF
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    case 'image/png':
      // PNG starts with 89 50 4E 47 (‰PNG)
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    case 'image/webp':
      // WebP starts with RIFF....WEBP
      return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
             buffer.length >= 12 &&
             buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    default:
      return false;
  }
}

module.exports = router;
module.exports.BUCKET_NAME = BUCKET_NAME;
module.exports.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
module.exports.SIGNED_URL_EXPIRY_SECONDS = SIGNED_URL_EXPIRY_SECONDS;
module.exports.isValidProofReference = isValidProofReference;
module.exports.generateStoragePath = generateStoragePath;
module.exports.isPathSafe = isPathSafe;
