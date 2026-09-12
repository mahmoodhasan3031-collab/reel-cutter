'use strict';

/**
 * Product-level validation rules for Content Variation (Phase 1B).
 *
 * Enforces strict product-level bounds before any FFmpeg processing.
 * Never trusts renderer input.
 */

const PRODUCT_VARIATION_LIMITS = {
  brightness: { min: -1.0, max: 1.0, default: 0.0 },
  saturation: { min: 0.0, max: 3.0, default: 1.0 },
  hue: { min: -180.0, max: 180.0, default: 0.0 },
  pitch: { min: -3.0, max: 3.0, default: 0.0 },
  speed: { min: 1.00, max: 1.05, default: 1.00 },
  crop: { min: 0.0, max: 2.0, default: 0.0 },
  reframeModes: ['center', 'left', 'right', 'top', 'bottom'],
};

const DEFAULT_PRODUCT_VARIATION = {
  enabled: false,
  brightness: PRODUCT_VARIATION_LIMITS.brightness.default,
  saturation: PRODUCT_VARIATION_LIMITS.saturation.default,
  hue: PRODUCT_VARIATION_LIMITS.hue.default,
  pitch: PRODUCT_VARIATION_LIMITS.pitch.default,
  speed: PRODUCT_VARIATION_LIMITS.speed.default,
  mode: 'center',
  crop: PRODUCT_VARIATION_LIMITS.crop.default,
  cleanMetadata: true,
};

/**
 * Validates product-level variation settings from UI or API.
 * Rejects invalid types or out-of-bounds numbers safely.
 *
 * @param {Object} [raw] Raw variation options from UI / caller
 * @returns {{ valid: boolean, config: Object }}
 * @throws {Error} if any parameter fails product-level validation
 */
function validateProductVariationConfig(raw) {
  if (!raw) {
    return { valid: true, config: { ...DEFAULT_PRODUCT_VARIATION, enabled: false } };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Variation settings must be an object');
  }

  const enabled = Boolean(raw.enabled);
  if (!enabled) {
    return { valid: true, config: { ...DEFAULT_PRODUCT_VARIATION, enabled: false } };
  }

  // Helper for numeric extraction and range checking
  // Support both flat format (raw.brightness) and nested format (raw.color?.brightness)
  const extractNum = (flatVal, nestedVal, defVal, fieldName, min, max) => {
    const candidate = flatVal !== undefined ? flatVal : nestedVal;
    if (candidate === undefined || candidate === null || candidate === '') {
      return defVal;
    }
    const num = Number(candidate);
    if (typeof candidate === 'boolean' || isNaN(num)) {
      throw new Error(`Invalid ${fieldName}: must be a valid number`);
    }
    if (num < min || num > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}, received ${num}`);
    }
    return num;
  };

  const brightness = extractNum(
    raw.brightness,
    raw.color?.brightness,
    PRODUCT_VARIATION_LIMITS.brightness.default,
    'Brightness',
    PRODUCT_VARIATION_LIMITS.brightness.min,
    PRODUCT_VARIATION_LIMITS.brightness.max
  );

  const saturation = extractNum(
    raw.saturation,
    raw.color?.saturation,
    PRODUCT_VARIATION_LIMITS.saturation.default,
    'Saturation',
    PRODUCT_VARIATION_LIMITS.saturation.min,
    PRODUCT_VARIATION_LIMITS.saturation.max
  );

  const hue = extractNum(
    raw.hue,
    raw.color?.hue,
    PRODUCT_VARIATION_LIMITS.hue.default,
    'Hue',
    PRODUCT_VARIATION_LIMITS.hue.min,
    PRODUCT_VARIATION_LIMITS.hue.max
  );

  const pitch = extractNum(
    raw.pitch !== undefined ? raw.pitch : raw.pitchPercent,
    raw.audio?.pitchPercent,
    PRODUCT_VARIATION_LIMITS.pitch.default,
    'Pitch',
    PRODUCT_VARIATION_LIMITS.pitch.min,
    PRODUCT_VARIATION_LIMITS.pitch.max
  );

  const speed = extractNum(
    raw.speed !== undefined ? raw.speed : raw.factor,
    raw.speed?.factor,
    PRODUCT_VARIATION_LIMITS.speed.default,
    'Speed',
    PRODUCT_VARIATION_LIMITS.speed.min,
    PRODUCT_VARIATION_LIMITS.speed.max
  );

  const crop = extractNum(
    raw.crop !== undefined ? raw.crop : raw.cropPercent,
    raw.reframe?.cropPercent,
    PRODUCT_VARIATION_LIMITS.crop.default,
    'Crop',
    PRODUCT_VARIATION_LIMITS.crop.min,
    PRODUCT_VARIATION_LIMITS.crop.max
  );

  // Reframe mode check
  const rawMode = raw.mode || raw.reframeMode || raw.reframe?.mode || 'center';
  const mode = String(rawMode).toLowerCase().trim();
  if (!PRODUCT_VARIATION_LIMITS.reframeModes.includes(mode)) {
    throw new Error(`Reframe mode must be one of: ${PRODUCT_VARIATION_LIMITS.reframeModes.join(', ')}`);
  }

  // Clean metadata check
  const cleanMetadata = raw.cleanMetadata !== undefined
    ? Boolean(raw.cleanMetadata)
    : raw.metadata?.clean !== undefined
      ? Boolean(raw.metadata.clean)
      : true;

  // Build canonical structured variation engine format
  const structured = {
    enabled: true,
    brightness,
    saturation,
    hue,
    pitch,
    speed,
    mode,
    crop,
    cleanMetadata,
    // Engine-compatible sub-configs
    color: {
      enabled: Math.abs(brightness) > 0.0001 || Math.abs(saturation - 1.0) > 0.0001 || Math.abs(hue) > 0.0001,
      brightness,
      saturation,
      hue,
    },
    audio: {
      enabled: Math.abs(pitch) > 0.0001,
      pitchPercent: pitch,
    },
    speedConfig: {
      enabled: Math.abs(speed - 1.00) > 0.0001,
      factor: speed,
    },
    reframe: {
      enabled: crop > 0,
      mode,
      cropPercent: crop,
      preserveResolution: true,
    },
    metadata: {
      clean: cleanMetadata,
    },
  };

  return {
    valid: true,
    config: structured,
  };
}

module.exports = {
  PRODUCT_VARIATION_LIMITS,
  DEFAULT_PRODUCT_VARIATION,
  validateProductVariationConfig,
};
