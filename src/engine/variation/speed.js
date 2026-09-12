'use strict';

/**
 * Speed adjustment module for Content Variation Engine.
 * Supports conservative playback speed factor adjustment (0.5x to 2.0x).
 * Accurately updates video PTS and audio tempo to keep A/V in sync.
 */

const SPEED_DEFAULTS = {
  enabled: false,
  factor: 1.0, // 0.5x to 2.0x
};

const SPEED_LIMITS = {
  factor: { min: 0.5, max: 2.0 },
};

/**
 * Validates speed adjustment configuration.
 * @param {Object} [config]
 * @returns {{ valid: boolean, config: Object }}
 * @throws {Error} if validation fails
 */
function validateSpeedConfig(config) {
  if (!config) {
    return { valid: true, config: { ...SPEED_DEFAULTS } };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Speed configuration must be an object');
  }

  const enabled = Boolean(config.enabled);
  if (!enabled) {
    return { valid: true, config: { ...SPEED_DEFAULTS, enabled: false } };
  }

  const factor = config.factor !== undefined ? Number(config.factor) : SPEED_DEFAULTS.factor;

  if (isNaN(factor) || factor < SPEED_LIMITS.factor.min || factor > SPEED_LIMITS.factor.max) {
    throw new Error(`Speed factor must be a number between ${SPEED_LIMITS.factor.min} and ${SPEED_LIMITS.factor.max}`);
  }

  return {
    valid: true,
    config: {
      enabled: true,
      factor,
    },
  };
}

/**
 * Builds FFmpeg video and audio filters for speed adjustment.
 *
 * Video filter: setpts=(1/factor)*PTS
 * Audio filter: atempo=factor (when audio is present)
 *
 * @param {Object} [config]
 * @param {Object} [metadata]
 * @returns {{ isEnabled: boolean, videoFilters: string[], audioFilters: string[], factor: number }}
 */
function buildSpeedFilters(config, metadata) {
  const { config: validated } = validateSpeedConfig(config);

  if (!validated.enabled || Math.abs(validated.factor - 1.0) < 0.0001) {
    return { isEnabled: false, videoFilters: [], audioFilters: [], factor: 1.0 };
  }

  const factor = validated.factor;
  const ptsMultiplier = (1 / factor).toFixed(6);
  const videoFilters = [`setpts=${ptsMultiplier}*PTS`];

  const hasAudio = Boolean(metadata && metadata.audio && metadata.audio.channels > 0);
  const audioFilters = [];

  if (hasAudio) {
    audioFilters.push(`atempo=${factor.toFixed(6)}`);
  }

  return {
    isEnabled: true,
    videoFilters,
    audioFilters,
    factor,
  };
}

module.exports = {
  SPEED_DEFAULTS,
  SPEED_LIMITS,
  validateSpeedConfig,
  buildSpeedFilters,
};
