'use strict';

/**
 * Reframe and crop module for Content Variation Engine.
 * Supports controlled cropping/reframing (center, left, right, top, bottom).
 * Ensures even output dimensions and frame boundary safety.
 */

const REFRAME_DEFAULTS = {
  enabled: false,
  mode: 'center',          // 'center' | 'left' | 'right' | 'top' | 'bottom'
  cropPercent: 0,          // 0% to 50%
  preserveResolution: true, // scales back to original resolution
};

const REFRAME_MODES = ['center', 'left', 'right', 'top', 'bottom'];

const REFRAME_LIMITS = {
  cropPercent: { min: 0, max: 50 },
};

/**
 * Validates reframe configuration.
 * @param {Object} [config]
 * @returns {{ valid: boolean, config: Object }}
 * @throws {Error} if validation fails
 */
function validateReframeConfig(config) {
  if (!config) {
    return { valid: true, config: { ...REFRAME_DEFAULTS } };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Reframe configuration must be an object');
  }

  const enabled = Boolean(config.enabled);
  if (!enabled) {
    return { valid: true, config: { ...REFRAME_DEFAULTS, enabled: false } };
  }

  const mode = String(config.mode || REFRAME_DEFAULTS.mode).toLowerCase().trim();
  if (!REFRAME_MODES.includes(mode)) {
    throw new Error(`Reframe mode must be one of: ${REFRAME_MODES.join(', ')}`);
  }

  const cropPercent = config.cropPercent !== undefined ? Number(config.cropPercent) : REFRAME_DEFAULTS.cropPercent;
  if (isNaN(cropPercent) || cropPercent < REFRAME_LIMITS.cropPercent.min || cropPercent > REFRAME_LIMITS.cropPercent.max) {
    throw new Error(`Reframe cropPercent must be a number between ${REFRAME_LIMITS.cropPercent.min} and ${REFRAME_LIMITS.cropPercent.max}`);
  }

  const preserveResolution = config.preserveResolution !== undefined
    ? Boolean(config.preserveResolution)
    : REFRAME_DEFAULTS.preserveResolution;

  return {
    valid: true,
    config: {
      enabled: true,
      mode,
      cropPercent,
      preserveResolution,
    },
  };
}

/**
 * Builds FFmpeg video filters for cropping and reframing.
 *
 * @param {Object} [config]
 * @param {Object} [metadata] Video metadata (width, height)
 * @returns {{ isEnabled: boolean, filters: string[], mode: string, cropPercent: number }}
 */
function buildReframeFilter(config, metadata) {
  const { config: validated } = validateReframeConfig(config);

  if (!validated.enabled || validated.cropPercent <= 0) {
    return { isEnabled: false, filters: [], mode: validated.mode, cropPercent: 0 };
  }

  const factor = (1 - validated.cropPercent / 100).toFixed(6);

  // Offset expressions based on mode
  let xExpr = '(in_w-out_w)/2';
  let yExpr = '(in_h-out_h)/2';

  switch (validated.mode) {
    case 'left':
      xExpr = '0';
      break;
    case 'right':
      xExpr = 'in_w-out_w';
      break;
    case 'top':
      yExpr = '0';
      break;
    case 'bottom':
      yExpr = 'in_h-out_h';
      break;
    case 'center':
    default:
      xExpr = '(in_w-out_w)/2';
      yExpr = '(in_h-out_h)/2';
      break;
  }

  // Ensure crop dimensions are even numbers (trunc(.../2)*2)
  const cropFilter = `crop=w=trunc(iw*${factor}/2)*2:h=trunc(ih*${factor}/2)*2:x=${xExpr}:y=${yExpr}`;
  const filters = [cropFilter];

  // If preserveResolution is requested and we know dimensions, scale back to original
  if (validated.preserveResolution && metadata && metadata.video && metadata.video.width && metadata.video.height) {
    const origW = metadata.video.width;
    const origH = metadata.video.height;
    filters.push(`scale=${origW}:${origH}`);
  } else if (validated.preserveResolution) {
    // If metadata dimensions unknown, scale using in_w:in_h before crop
    filters.push('scale=iw:ih');
  }

  return {
    isEnabled: true,
    filters,
    mode: validated.mode,
    cropPercent: validated.cropPercent,
  };
}

module.exports = {
  REFRAME_DEFAULTS,
  REFRAME_MODES,
  REFRAME_LIMITS,
  validateReframeConfig,
  buildReframeFilter,
};
