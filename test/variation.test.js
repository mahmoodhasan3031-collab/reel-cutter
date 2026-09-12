'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const {
  runVariationPipeline,
  validatePipelinePaths,
  validateColorConfig,
  buildColorFilter,
  validateAudioConfig,
  buildAudioFilter,
  validateSpeedConfig,
  buildSpeedFilters,
  validateReframeConfig,
  buildReframeFilter,
  validateMetadataConfig,
  buildMetadataOptions,
} = require('../src/engine/variation');

const { getVideoMetadata } = require('../src/engine/probe');

console.log('======================================================');
console.log('🧪 Running Content Variation Engine Test Suite (Phase 1A)');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passedTests++;
      console.log(`  ✓ PASS: ${testName}`);
    })
    .catch((err) => {
      console.error(`  ✗ FAIL: ${testName}`);
      console.error(`    Error: ${err.message}`);
      throw err;
    });
}

const TEST_DIR = path.join(__dirname, '.test-variation-media');

function setupTestMedia() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  const withAudio = path.join(TEST_DIR, 'with_audio.mp4');
  const noAudio = path.join(TEST_DIR, 'no_audio.mp4');
  const withMeta = path.join(TEST_DIR, 'with_meta.mp4');

  if (!fs.existsSync(withAudio)) {
    spawnSync(ffmpegStatic, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '44100',
      withAudio,
    ]);
  }

  if (!fs.existsSync(noAudio)) {
    spawnSync(ffmpegStatic, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      noAudio,
    ]);
  }

  if (!fs.existsSync(withMeta)) {
    spawnSync(ffmpegStatic, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
      '-metadata', 'title=OriginalTitle',
      '-metadata', 'comment=OriginalComment',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      withMeta,
    ]);
  }

  return { withAudio, noAudio, withMeta };
}

function cleanupTestMedia() {
  try {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  } catch (_) {}
}

async function main() {
  const media = setupTestMedia();

  try {
    // 1. Module existence
    await runTest('1. variation module exists and exports required members', () => {
      const variation = require('../src/engine/variation');
      assert.strictEqual(typeof variation.runVariationPipeline, 'function');
      assert.strictEqual(typeof variation.validatePipelinePaths, 'function');
      assert.strictEqual(typeof variation.validateColorConfig, 'function');
      assert.strictEqual(typeof variation.validateAudioConfig, 'function');
      assert.strictEqual(typeof variation.validateSpeedConfig, 'function');
      assert.strictEqual(typeof variation.validateReframeConfig, 'function');
      assert.strictEqual(typeof variation.validateMetadataConfig, 'function');
    });

    // 2. Pipeline API exists
    await runTest('2. pipeline API exists and is callable', () => {
      assert.strictEqual(typeof runVariationPipeline, 'function');
    });

    // 3. Disabled pipeline configuration is accepted
    await runTest('3. disabled pipeline configuration is accepted without error', () => {
      const color = validateColorConfig({ enabled: false });
      const audio = validateAudioConfig({ enabled: false });
      const speed = validateSpeedConfig({ enabled: false });
      const reframe = validateReframeConfig({ enabled: false });
      const metadata = validateMetadataConfig({ clean: false });

      assert.strictEqual(color.config.enabled, false);
      assert.strictEqual(audio.config.enabled, false);
      assert.strictEqual(speed.config.enabled, false);
      assert.strictEqual(reframe.config.enabled, false);
      assert.strictEqual(metadata.config.clean, false);
    });

    // 4. Color configuration validation
    await runTest('4. color configuration validation (valid, bounds, invalid)', () => {
      const valid = validateColorConfig({ enabled: true, brightness: 0.2, saturation: 1.5, hue: 45 });
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.config.brightness, 0.2);
      assert.strictEqual(valid.config.saturation, 1.5);
      assert.strictEqual(valid.config.hue, 45);

      const colorFilter = buildColorFilter({ enabled: true, brightness: 0.1, saturation: 1.2, hue: 15 });
      assert.strictEqual(colorFilter.isEnabled, true);
      assert.ok(colorFilter.filters.some((f) => f.includes('eq=')));
      assert.ok(colorFilter.filters.some((f) => f.includes('hue=')));

      // Out of bounds brightness
      assert.throws(() => validateColorConfig({ enabled: true, brightness: 2.5 }), /brightness/);
      // Out of bounds saturation
      assert.throws(() => validateColorConfig({ enabled: true, saturation: 4.0 }), /saturation/);
      // Out of bounds hue
      assert.throws(() => validateColorConfig({ enabled: true, hue: 200 }), /hue/);
      // Non-object
      assert.throws(() => validateColorConfig('invalid'), /must be an object/);
    });

    // 5. Audio configuration validation
    await runTest('5. audio configuration validation (pitchPercent bounds, invalid)', () => {
      const valid = validateAudioConfig({ enabled: true, pitchPercent: 10 });
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.config.pitchPercent, 10);

      const mockMetaWithAudio = { audio: { channels: 2, sampleRate: '48000 Hz' } };
      const audioFilter = buildAudioFilter({ enabled: true, pitchPercent: 5 }, mockMetaWithAudio);
      assert.strictEqual(audioFilter.isEnabled, true);
      assert.ok(audioFilter.filters.some((f) => f.includes('asetrate=')));
      assert.ok(audioFilter.filters.some((f) => f.includes('atempo=')));

      // Out of bounds
      assert.throws(() => validateAudioConfig({ enabled: true, pitchPercent: 75 }), /pitchPercent/);
      assert.throws(() => validateAudioConfig({ enabled: true, pitchPercent: -60 }), /pitchPercent/);
      // Non-object
      assert.throws(() => validateAudioConfig(123), /must be an object/);
    });

    // 6. Speed configuration validation
    await runTest('6. speed configuration validation (factor bounds, invalid)', () => {
      const valid = validateSpeedConfig({ enabled: true, factor: 1.25 });
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.config.factor, 1.25);

      const mockMeta = { audio: { channels: 2 } };
      const speedFilter = buildSpeedFilters({ enabled: true, factor: 1.5 }, mockMeta);
      assert.strictEqual(speedFilter.isEnabled, true);
      assert.ok(speedFilter.videoFilters.some((f) => f.includes('setpts=')));
      assert.ok(speedFilter.audioFilters.some((f) => f.includes('atempo=')));

      // Factor 1.0 does nothing
      const neutral = buildSpeedFilters({ enabled: true, factor: 1.0 }, mockMeta);
      assert.strictEqual(neutral.isEnabled, false);

      // Out of bounds
      assert.throws(() => validateSpeedConfig({ enabled: true, factor: 0.2 }), /Speed factor/);
      assert.throws(() => validateSpeedConfig({ enabled: true, factor: 3.5 }), /Speed factor/);
    });

    // 7. Reframe configuration validation
    await runTest('7. reframe configuration validation (modes, cropPercent bounds)', () => {
      const valid = validateReframeConfig({ enabled: true, mode: 'center', cropPercent: 10 });
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.config.mode, 'center');
      assert.strictEqual(valid.config.cropPercent, 10);

      const mockMeta = { video: { width: 1280, height: 720 } };
      const reframeFilter = buildReframeFilter({ enabled: true, mode: 'center', cropPercent: 15 }, mockMeta);
      assert.strictEqual(reframeFilter.isEnabled, true);
      assert.ok(reframeFilter.filters.some((f) => f.includes('crop=')));

      // Valid modes check
      ['center', 'left', 'right', 'top', 'bottom'].forEach((mode) => {
        const res = validateReframeConfig({ enabled: true, mode, cropPercent: 5 });
        assert.strictEqual(res.valid, true);
      });

      // Invalid mode
      assert.throws(() => validateReframeConfig({ enabled: true, mode: 'diagonal' }), /Reframe mode/);
      // Out of bounds cropPercent
      assert.throws(() => validateReframeConfig({ enabled: true, cropPercent: 60 }), /cropPercent/);
    });

    // 8. Metadata configuration validation
    await runTest('8. metadata configuration validation', () => {
      const cleanOn = validateMetadataConfig({ clean: true });
      assert.strictEqual(cleanOn.valid, true);
      assert.strictEqual(cleanOn.config.clean, true);

      const optsOn = buildMetadataOptions({ clean: true });
      assert.strictEqual(optsOn.isEnabled, true);
      assert.ok(optsOn.outputOptions.includes('-map_metadata'));
      assert.ok(optsOn.outputOptions.includes('-1'));

      const cleanOff = validateMetadataConfig({ clean: false });
      assert.strictEqual(cleanOff.config.clean, false);
      const optsOff = buildMetadataOptions({ clean: false });
      assert.strictEqual(optsOff.isEnabled, false);
      assert.strictEqual(optsOff.outputOptions.length, 0);

      assert.throws(() => validateMetadataConfig('not-obj'), /must be an object/);
    });

    // 9. Input path validation
    await runTest('9. input path validation rejects empty or missing input', () => {
      assert.throws(() => validatePipelinePaths('', 'out.mp4'), /Input path is required/);
      assert.throws(() => validatePipelinePaths(null, 'out.mp4'), /Input path is required/);
      assert.throws(() => validatePipelinePaths('non_existent_file_12345.mp4', 'out.mp4'), /Input file not found/);
    });

    // 10. Output path validation
    await runTest('10. output path validation rejects empty output', () => {
      assert.throws(() => validatePipelinePaths(media.withAudio, ''), /Output path is required/);
      assert.throws(() => validatePipelinePaths(media.withAudio, null), /Output path is required/);
    });

    // 11. Input and output cannot be the same path
    await runTest('11. input and output cannot be the same path', () => {
      assert.throws(
        () => validatePipelinePaths(media.withAudio, media.withAudio),
        /Input and output paths cannot be the same file/
      );
    });

    // 12. No-audio input is handled safely
    await runTest('12. no-audio input is handled safely without failing pipeline', async () => {
      const outPath = path.join(TEST_DIR, 'out_no_audio.mp4');
      const result = await runVariationPipeline({
        inputPath: media.noAudio,
        outputPath: outPath,
        color: { enabled: true, brightness: 0.05 },
        audio: { enabled: true, pitchPercent: 10 }, // Should gracefully skip audio filter
        speed: { enabled: true, factor: 1.1 },       // Should gracefully skip audio atempo
      });

      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(outPath));
      assert.ok(result.transformationsApplied.includes('color'));
      assert.ok(result.transformationsApplied.includes('speed'));
      // audio transformation should not be in applied list because input has no audio
      assert.strictEqual(result.transformationsApplied.includes('audio'), false);

      const outMeta = await getVideoMetadata(outPath);
      assert.strictEqual(outMeta.audio, null);
    });

    // 13. Multiple transformations can be composed
    await runTest('13. multiple transformations can be composed simultaneously', async () => {
      const outPath = path.join(TEST_DIR, 'out_composed.mp4');
      let commandCaptured = null;

      const result = await runVariationPipeline({
        inputPath: media.withAudio,
        outputPath: outPath,
        color: { enabled: true, brightness: 0.05, saturation: 1.1 },
        audio: { enabled: true, pitchPercent: 5 },
        speed: { enabled: true, factor: 1.15 },
        reframe: { enabled: true, mode: 'center', cropPercent: 10 },
        metadata: { clean: true },
        onCommand: (cmd) => { commandCaptured = cmd; },
      });

      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(outPath));
      assert.strictEqual(result.transformationsApplied.length, 5);
      assert.ok(result.transformationsApplied.includes('color'));
      assert.ok(result.transformationsApplied.includes('audio'));
      assert.ok(result.transformationsApplied.includes('speed'));
      assert.ok(result.transformationsApplied.includes('reframe'));
      assert.ok(result.transformationsApplied.includes('metadata'));
      assert.ok(commandCaptured !== null);
    });

    // 14. FFmpeg failure is converted into a controlled error
    await runTest('14. FFmpeg failure is converted into a controlled error (no crash, no raw stack leaks)', async () => {
      const badInput = path.join(TEST_DIR, 'corrupt.mp4');
      fs.writeFileSync(badInput, 'NOT A REAL VIDEO FILE CONTENT');

      await assert.rejects(
        async () => {
          await runVariationPipeline({
            inputPath: badInput,
            outputPath: path.join(TEST_DIR, 'should_fail.mp4'),
          });
        },
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('FFmpeg') || err.message.includes('FFprobe'));
          // Ensure error message length is bounded
          assert.ok(err.message.length <= 650);
          return true;
        }
      );
    });

    // 15. Output path is respected
    await runTest('15. output path is strictly respected and returned in result', async () => {
      const explicitOut = path.join(TEST_DIR, 'nested', 'custom_output.mp4');
      const result = await runVariationPipeline({
        inputPath: media.withAudio,
        outputPath: explicitOut,
        color: { enabled: false },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(path.resolve(result.outputPath), path.resolve(explicitOut));
      assert.ok(fs.existsSync(explicitOut));
    });

    // 16. Metadata cleanup does not inject false metadata
    await runTest('16. metadata cleanup does not inject false or misleading metadata', async () => {
      const outPath = path.join(TEST_DIR, 'out_cleaned_meta.mp4');
      const result = await runVariationPipeline({
        inputPath: media.withMeta,
        outputPath: outPath,
        metadata: { clean: true },
      });

      assert.strictEqual(result.success, true);
      const probed = await getVideoMetadata(outPath);

      // Verify that no false ownership, copyright, or creator tags were injected
      const tags = (probed.raw && probed.raw.format && probed.raw.format.tags) || {};
      assert.strictEqual(tags.title, undefined);
      assert.strictEqual(tags.comment, undefined);
      assert.strictEqual(tags.author, undefined);
      assert.strictEqual(tags.copyright, undefined);
      assert.strictEqual(tags.artist, undefined);
    });

    console.log('\n======================================================');
    console.log(`📊 Phase 1A Variation Tests: ${passedTests} / ${totalTests} passed`);
    console.log('======================================================\n');
  } finally {
    cleanupTestMedia();
  }
}

main().catch((err) => {
  console.error('\n❌ Variation Test Suite encountered fatal error:', err);
  cleanupTestMedia();
  process.exit(1);
});
