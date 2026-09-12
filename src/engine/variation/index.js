'use strict';

const { runVariationPipeline, validatePipelinePaths } = require('./pipeline');
const { validateColorConfig, buildColorFilter, COLOR_DEFAULTS, COLOR_LIMITS } = require('./color');
const { validateAudioConfig, buildAudioFilter, AUDIO_DEFAULTS, AUDIO_LIMITS } = require('./audio');
const { validateSpeedConfig, buildSpeedFilters, SPEED_DEFAULTS, SPEED_LIMITS } = require('./speed');
const { validateReframeConfig, buildReframeFilter, REFRAME_DEFAULTS, REFRAME_MODES, REFRAME_LIMITS } = require('./reframe');
const { validateMetadataConfig, buildMetadataOptions, METADATA_DEFAULTS } = require('./metadata');

module.exports = {
  runVariationPipeline,
  validatePipelinePaths,
  validateColorConfig,
  buildColorFilter,
  COLOR_DEFAULTS,
  COLOR_LIMITS,
  validateAudioConfig,
  buildAudioFilter,
  AUDIO_DEFAULTS,
  AUDIO_LIMITS,
  validateSpeedConfig,
  buildSpeedFilters,
  SPEED_DEFAULTS,
  SPEED_LIMITS,
  validateReframeConfig,
  buildReframeFilter,
  REFRAME_DEFAULTS,
  REFRAME_MODES,
  REFRAME_LIMITS,
  validateMetadataConfig,
  buildMetadataOptions,
  METADATA_DEFAULTS,
};
