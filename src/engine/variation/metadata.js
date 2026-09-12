'use strict';

/**
 * Metadata cleanup module for Content Variation Engine.
 * Supports removing nonessential container metadata safely.
 *
 * NOTE: Does NOT inject fake, misleading, or fabricated metadata.
 * Only strips standard nonessential container/chapter tags when requested.
 */

const METADATA_DEFAULTS = {
  clean: false,
};

/**
 * Validates metadata configuration.
 * @param {Object} [config]
 * @returns {{ valid: boolean, config: Object }}
 * @throws {Error} if validation fails
 */
function validateMetadataConfig(config) {
  if (!config) {
    return { valid: true, config: { ...METADATA_DEFAULTS } };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Metadata configuration must be an object');
  }

  const clean = Boolean(config.clean);

  return {
    valid: true,
    config: {
      clean,
    },
  };
}

/**
 * Builds FFmpeg output options for metadata handling.
 * When clean is true, removes global metadata and chapter markers.
 *
 * @param {Object} [config]
 * @returns {{ isEnabled: boolean, outputOptions: string[] }}
 */
function buildMetadataOptions(config) {
  const { config: validated } = validateMetadataConfig(config);

  if (!validated.clean) {
    return { isEnabled: false, outputOptions: [] };
  }

  // -map_metadata -1 strips all container-level tags
  // -map_chapters -1 strips chapter markers
  return {
    isEnabled: true,
    outputOptions: [
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
    ],
  };
}

module.exports = {
  METADATA_DEFAULTS,
  validateMetadataConfig,
  buildMetadataOptions,
};
