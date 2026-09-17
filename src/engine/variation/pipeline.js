'use strict';

const fs = require('fs');
const path = require('path');
const { ffmpeg, getVideoMetadata } = require('../probe');
const { validateColorConfig, buildColorFilter } = require('./color');
const { validateAudioConfig, buildAudioFilter } = require('./audio');
const { validateSpeedConfig, buildSpeedFilters } = require('./speed');
const { validateReframeConfig, buildReframeFilter } = require('./reframe');
const { validateMetadataConfig, buildMetadataOptions } = require('./metadata');

// ─── Timeout Configuration ────────────────────────────────────────────────────
const VARIATION_TIMEOUT_MS = parseInt(process.env.REEL_CUTTER_TIMEOUT_MS, 10) || 30 * 60 * 1000; // 30 min default

let logger;
try {
  logger = require('../../main/logger');
} catch {
  logger = {
    info: (tag, msg) => console.log(`[${tag}] ${msg}`),
    warn: (tag, msg) => console.warn(`[${tag}] ${msg}`),
    error: (tag, msg) => console.error(`[${tag}] ${msg}`),
  };
}

/**
 * Validates input and output path parameters for the variation pipeline.
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {{ resolvedInput: string, resolvedOutput: string }}
 */
function validatePipelinePaths(inputPath, outputPath) {
  if (!inputPath || typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new Error('Input path is required and must be a non-empty string');
  }

  if (!outputPath || typeof outputPath !== 'string' || !outputPath.trim()) {
    throw new Error('Output path is required and must be a non-empty string');
  }

  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  if (resolvedInput.toLowerCase() === resolvedOutput.toLowerCase()) {
    throw new Error('Input and output paths cannot be the same file');
  }

  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  return { resolvedInput, resolvedOutput };
}

/**
 * Runs the Content Variation Pipeline on a video.
 *
 * @param {Object} options
 * @param {string} options.inputPath Path to source video file
 * @param {string} options.outputPath Path to destination video file
 * @param {Object} [options.color] Color adjustments (brightness, saturation, hue)
 * @param {Object} [options.audio] Audio adjustments (pitchPercent)
 * @param {Object} [options.speed] Speed adjustment (factor)
 * @param {Object} [options.reframe] Reframe/crop adjustments (mode, cropPercent)
 * @param {Object} [options.metadata] Metadata cleanup options (clean)
 * @param {Function} [options.onProgress] Optional callback (percent: 0-100)
 * @param {Function} [options.onCommand] Optional callback inspecting built FFmpeg command
 * @returns {Promise<{ success: boolean, outputPath: string, duration: number, metadata: Object, transformationsApplied: string[] }>}
 */
async function runVariationPipeline(options = {}) {
  const { inputPath, outputPath, color, audio, speed, reframe, metadata, onProgress, onCommand } = options;

  // 1. Validate paths
  const { resolvedInput, resolvedOutput } = validatePipelinePaths(inputPath, outputPath);

  // 2. Validate all configs early to fail fast on invalid arguments
  validateColorConfig(color);
  validateAudioConfig(audio);
  validateSpeedConfig(speed);
  validateReframeConfig(reframe);
  validateMetadataConfig(metadata);

  // 3. Probe input video metadata
  const meta = await getVideoMetadata(resolvedInput);
  const totalDuration = meta.duration || 0;
  const hasAudio = Boolean(meta.audio && meta.audio.channels > 0);

  // 4. Build filter chains
  const transformationsApplied = [];
  const videoFilters = [];
  const audioFilters = [];
  const outputOptions = [];

  // 4a. Reframe / Crop (first in video chain)
  const reframeResult = buildReframeFilter(reframe, meta);
  if (reframeResult.isEnabled) {
    videoFilters.push(...reframeResult.filters);
    transformationsApplied.push('reframe');
  }

  // 4b. Color Adjustment (second in video chain)
  const colorResult = buildColorFilter(color);
  if (colorResult.isEnabled) {
    videoFilters.push(...colorResult.filters);
    transformationsApplied.push('color');
  }

  // 4c. Speed Adjustment (video PTS + audio tempo)
  const speedResult = buildSpeedFilters(speed, meta);
  if (speedResult.isEnabled) {
    videoFilters.push(...speedResult.videoFilters);
    if (speedResult.audioFilters.length > 0 && hasAudio) {
      audioFilters.push(...speedResult.audioFilters);
    }
    transformationsApplied.push('speed');
  }

  // 4d. Audio Adjustment (pitch) - only if audio is present
  const audioResult = buildAudioFilter(audio, meta);
  if (audioResult.isEnabled && hasAudio) {
    audioFilters.push(...audioResult.filters);
    transformationsApplied.push('audio');
  }

  // 4e. Metadata cleanup options
  const metadataResult = buildMetadataOptions(metadata);
  if (metadataResult.isEnabled) {
    outputOptions.push(...metadataResult.outputOptions);
    transformationsApplied.push('metadata');
  }

  // 5. Output encoding options
  // Standard, highly compatible libx264 + yuv420p video
  outputOptions.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p');

  if (hasAudio) {
    outputOptions.push('-c:a', 'aac', '-b:a', '192k');
  } else {
    // If input has no audio, explicitly omit audio
    outputOptions.push('-an');
  }

  // Ensure output directory exists
  const outDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 6. Build and execute fluent-ffmpeg command
  return new Promise((resolve, reject) => {
    let command = ffmpeg(resolvedInput);

    if (videoFilters.length > 0) {
      command = command.videoFilters(videoFilters);
    }

    if (audioFilters.length > 0 && hasAudio) {
      command = command.audioFilters(audioFilters);
    }

    command = command.outputOptions(outputOptions);

    if (typeof onCommand === 'function') {
      try {
        onCommand(command);
      } catch (_) {
        // Callback errors must not crash pipeline
      }
    }

    const effectiveDuration = speedResult.factor && speedResult.factor > 0
      ? totalDuration / speedResult.factor
      : totalDuration;

    const timeoutMs = options.timeoutMs || VARIATION_TIMEOUT_MS;
    let finished = false;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    let timeoutHandle = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        command.kill('SIGKILL');
      } catch (_) {}
      reject(new Error(`Variation pipeline timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    command
      .output(resolvedOutput)
      .on('progress', (progress) => {
        if (typeof onProgress === 'function') {
          let percent = progress.percent;
          if (percent === undefined && progress.timemark && effectiveDuration > 0) {
            const parts = progress.timemark.split(':').map(Number);
            if (parts.length === 3) {
              const currentSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
              percent = Math.min(100, Math.round((currentSecs / effectiveDuration) * 100));
            }
          }
          onProgress(Math.min(100, Math.max(0, Math.round(percent || 0))));
        }
      })
      .on('end', async () => {
        if (finished) return;
        finished = true;
        cleanup();
        try {
          const outMeta = await getVideoMetadata(resolvedOutput);
          resolve({
            success: true,
            outputPath: resolvedOutput,
            duration: outMeta.duration,
            metadata: outMeta,
            transformationsApplied,
          });
        } catch {
          resolve({
            success: true,
            outputPath: resolvedOutput,
            duration: effectiveDuration,
            metadata: null,
            transformationsApplied,
          });
        }
      })
      .on('error', (err, _stdout, stderr) => {
        if (finished) return;
        finished = true;
        cleanup();
        const stderrSnippet = stderr ? stderr.slice(-500).trim() : '';
        const safeErrorMsg = `FFmpeg variation error: ${err.message}${stderrSnippet ? '\n' + stderrSnippet : ''}`;
        logger.error('VariationPipeline', safeErrorMsg);
        reject(new Error(safeErrorMsg));
      })
      .run();
  });
}

module.exports = {
  runVariationPipeline,
  validatePipelinePaths,
  VARIATION_TIMEOUT_MS,
};
