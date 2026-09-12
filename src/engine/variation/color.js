'use strict';

/**
 * Color adjustment module for Content Variation Engine.
 * Supports controlled creative adjustments for brightness, saturation, and hue.
 */

const COLOR_DEFAULTS = {
  enabled: false,
  brightness: 0,   // -1.0 to 1.0 (default 0)
  saturation: 1.0, // 0.0 to 3.0 (default 1.0)
  hue: 0,          // -180 to 180 degrees (default 0)
};

const COLOR_LIMITS = {
  brightness: { min: -1.0, max: 1.0 },
  saturation: { min: 0.0, max: 3.0 },
  hue: { min: -180, max: 180 },
};

/**
 * Validates color adjustment configuration.
 * @param {Object} [config]
 * @returns {{ valid: boolean, config: Object }}
 * @throws {Error} if validation fails
 */
function validateColorConfig(config) {
  if (!config) {
    return { valid: true, config: { ...COLOR_DEFAULTS } };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Color configuration must be an object');
  }

  const enabled = Boolean(config.enabled);
  if (!enabled) {
    return { valid: true, config: { ...COLOR_DEFAULTS, enabled: false } };
  }

  const brightness = config.brightness !== undefined ? Number(config.brightness) : COLOR_DEFAULTS.brightness;
  const saturation = config.saturation !== undefined ? Number(config.saturation) : COLOR_DEFAULTS.saturation;
  const hue = config.hue !== undefined ? Number(config.hue) : COLOR_DEFAULTS.hue;

  if (isNaN(brightness) || brightness < COLOR_LIMITS.brightness.min || brightness > COLOR_LIMITS.brightness.max) {
    throw new Error(`Color brightness must be a number between ${COLOR_LIMITS.brightness.min} and ${COLOR_LIMITS.brightness.max}`);
  }

  if (isNaN(saturation) || saturation < COLOR_LIMITS.saturation.min || saturation > COLOR_LIMITS.saturation.max) {
    throw new Error(`Color saturation must be a number between ${COLOR_LIMITS.saturation.min} and ${COLOR_LIMITS.saturation.max}`);
  }

  if (isNaN(hue) || hue < COLOR_LIMITS.hue.min || hue > COLOR_LIMITS.hue.max) {
    throw new Error(`Color hue must be a number between ${COLOR_LIMITS.hue.min} and ${COLOR_LIMITS.hue.max}`);
  }

  return {
    valid: true,
    config: {
      enabled: true,
      brightness,
      saturation,
      hue,
    },
  };
}

/**
 * Builds FFmpeg video filter strings for color adjustment.
 * @param {Object} [config]
 * @returns {{ isEnabled: boolean, filters: string[] }}
 */
function buildColorFilter(config) {
  const { config: validated } = validateColorConfig(config);

  if (!validated.enabled) {
    return { isEnabled: false, filters: [] };
  }

  const filters = [];

  // eq filter for brightness and saturation
  const hasBrightness = Math.abs(validated.brightness) > 0.0001;
  const hasSaturation = Math.abs(validated.saturation - 1.0) > 0.0001;

  if (hasBrightness || hasSaturation) {
    filters.push(`eq=brightness=${validated.brightness.toFixed(4)}:saturation=${validated.saturation.toFixed(4)}`);
  }

  // hue filter for hue rotation
  const hasHue = Math.abs(validated.hue) > 0.0001;
  if (hasHue) {
    filters.push(`hue=h=${validated.hue.toFixed(2)}`);
  }

  return {
    isEnabled: filters.length > 0,
    filters,
  };
}

module.exports = {
  COLOR_DEFAULTS,
  COLOR_LIMITS,
  validateColorConfig,
  buildColorFilter,
};
