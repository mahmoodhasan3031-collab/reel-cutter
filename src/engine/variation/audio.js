'use strict';

/**
 * Audio adjustment module for Content Variation Engine.
 * Supports controlled pitch adjustment while keeping A/V duration synchronized.
 */

const AUDIO_DEFAULTS = {
  enabled: false,
  pitchPercent: 0, // -50% to +50%
};

const AUDIO_LIMITS = {
  pitchPercent: { min: -50, max: 50 },
};

/**
 * Validates audio adjustment configuration.
 * @param {Object} [config]
 * @returns {{ valid: boolean, config: Object }}
 * @throws {Error} if validation fails
 */
function validateAudioConfig(config) {
  if (!config) {
    return { valid: true, config: { ...AUDIO_DEFAULTS } };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Audio configuration must be an object');
  }

  const enabled = Boolean(config.enabled);
  if (!enabled) {
    return { valid: true, config: { ...AUDIO_DEFAULTS, enabled: false } };
  }

  const pitchPercent = config.pitchPercent !== undefined ? Number(config.pitchPercent) : AUDIO_DEFAULTS.pitchPercent;

  if (isNaN(pitchPercent) || pitchPercent < AUDIO_LIMITS.pitchPercent.min || pitchPercent > AUDIO_LIMITS.pitchPercent.max) {
    throw new Error(`Audio pitchPercent must be a number between ${AUDIO_LIMITS.pitchPercent.min} and ${AUDIO_LIMITS.pitchPercent.max}`);
  }

  return {
    valid: true,
    config: {
      enabled: true,
      pitchPercent,
    },
  };
}

/**
 * Builds FFmpeg audio filters for pitch adjustment.
 * Pitch factor p = 1 + pitchPercent / 100.
 * Filter: asetrate=sampleRate*p, atempo=1/p, aresample=sampleRate
 * This changes the pitch by factor p while atempo compensates duration so A/V stays in sync.
 *
 * @param {Object} [config]
 * @param {Object} [metadata] video metadata object containing audio info
 * @returns {{ isEnabled: boolean, filters: string[], hasAudio: boolean }}
 */
function buildAudioFilter(config, metadata) {
  const { config: validated } = validateAudioConfig(config);

  const hasAudio = Boolean(metadata && metadata.audio && metadata.audio.channels > 0);

  if (!validated.enabled || !hasAudio) {
    return { isEnabled: false, filters: [], hasAudio };
  }

  const pitchPercent = validated.pitchPercent;
  if (Math.abs(pitchPercent) < 0.0001) {
    return { isEnabled: false, filters: [], hasAudio };
  }

  const p = 1 + pitchPercent / 100;
  if (p <= 0) {
    return { isEnabled: false, filters: [], hasAudio };
  }

  // Parse sample rate from metadata or fallback to 44100
  let sampleRate = 44100;
  if (metadata && metadata.audio && metadata.audio.sampleRate) {
    const parsed = parseInt(metadata.audio.sampleRate, 10);
    if (!isNaN(parsed) && parsed > 0) sampleRate = parsed;
  }

  const targetRate = Math.round(sampleRate * p);
  const tempoCompensate = (1 / p).toFixed(6);

  const filters = [
    `asetrate=${targetRate}`,
    `atempo=${tempoCompensate}`,
    `aresample=${sampleRate}`,
  ];

  return {
    isEnabled: true,
    filters,
    hasAudio,
  };
}

module.exports = {
  AUDIO_DEFAULTS,
  AUDIO_LIMITS,
  validateAudioConfig,
  buildAudioFilter,
};
