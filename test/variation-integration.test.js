'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const {
  validateProductVariationConfig,
  PRODUCT_VARIATION_LIMITS,
  DEFAULT_PRODUCT_VARIATION,
  runVariationPipeline,
} = require('../src/engine/variation');

const { cutClip } = require('../src/engine/cutter');
const { getVideoMetadata } = require('../src/engine/probe');

console.log('======================================================');
console.log('🧪 Running Phase 1B Variation UI & Pipeline Integration Tests');
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

const TEST_DIR = path.join(__dirname, '.test-variation-p1b');

function getHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function setupTestMedia() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  const withAudio = path.join(TEST_DIR, 'source_audio.mp4');
  const noAudio = path.join(TEST_DIR, 'source_no_audio.mp4');
  const withMeta = path.join(TEST_DIR, 'source_meta.mp4');

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
      '-metadata', 'title=TestVideoTitle',
      '-metadata', 'comment=TestComment',
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
  const initialHashAudio = getHash(media.withAudio);
  const initialHashNoAudio = getHash(media.noAudio);

  try {
    // 1. Content Variation disabled → existing export behavior unchanged
    await runTest('1. Content Variation disabled -> existing export behavior unchanged', async () => {
      const outPath = path.join(TEST_DIR, 'out_disabled.mp4');
      const res = await cutClip(media.withAudio, outPath, {
        start: 0,
        duration: 1,
        variation: { enabled: false },
      });
      assert.strictEqual(res.outputPath, outPath);
      assert.ok(fs.existsSync(outPath));
      const meta = await getVideoMetadata(outPath);
      assert.ok(meta.video);
      assert.ok(meta.audio);
    });

    // 2. Color variation → parameters reach engine correctly
    await runTest('2. Color variation -> parameters reach engine correctly', async () => {
      const outPath = path.join(TEST_DIR, 'out_color.mp4');
      let commandObj = null;
      const res = await cutClip(media.withAudio, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          brightness: 0.1,
          saturation: 1.25,
          hue: 20,
        },
        onCommand: (cmd) => { commandObj = cmd; },
      });
      assert.ok(fs.existsSync(outPath));
      assert.ok(commandObj !== null);
      const vFilters = commandObj._currentOutput.videoFilters.get();
      assert.ok(vFilters.some((f) => f.includes('eq=brightness=0.1000:saturation=1.2500')));
      assert.ok(vFilters.some((f) => f.includes('hue=h=20.00')));
    });

    // 3. Audio pitch → parameters reach engine correctly
    await runTest('3. Audio pitch -> parameters reach engine correctly', async () => {
      const outPath = path.join(TEST_DIR, 'out_pitch.mp4');
      let commandObj = null;
      const res = await cutClip(media.withAudio, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          pitch: 2.0,
        },
        onCommand: (cmd) => { commandObj = cmd; },
      });
      assert.ok(fs.existsSync(outPath));
      assert.ok(commandObj !== null);
      const aFilters = commandObj._currentOutput.audioFilters.get();
      assert.ok(aFilters.some((f) => f.includes('asetrate=')));
      assert.ok(aFilters.some((f) => f.includes('atempo=')));
    });

    // 4. Speed → parameters reach engine correctly
    await runTest('4. Speed -> parameters reach engine correctly', async () => {
      const outPath = path.join(TEST_DIR, 'out_speed.mp4');
      let commandObj = null;
      const res = await cutClip(media.withAudio, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          speed: 1.03,
        },
        onCommand: (cmd) => { commandObj = cmd; },
      });
      assert.ok(fs.existsSync(outPath));
      assert.ok(commandObj !== null);
      const vFilters = commandObj._currentOutput.videoFilters.get();
      const aFilters = commandObj._currentOutput.audioFilters.get();
      assert.ok(vFilters.some((f) => f.includes('setpts=')));
      assert.ok(aFilters.some((f) => f.includes('atempo=1.030000')));
    });

    // 5. Reframe → parameters reach engine correctly
    await runTest('5. Reframe -> parameters reach engine correctly', async () => {
      const outPath = path.join(TEST_DIR, 'out_reframe.mp4');
      let commandObj = null;
      const res = await cutClip(media.withAudio, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          mode: 'center',
          crop: 1.5,
        },
        onCommand: (cmd) => { commandObj = cmd; },
      });
      assert.ok(fs.existsSync(outPath));
      assert.ok(commandObj !== null);
      const vFilters = commandObj._currentOutput.videoFilters.get();
      assert.ok(vFilters.some((f) => f.includes('crop=')));
    });

    // 6. Metadata cleanup → parameters reach engine correctly
    await runTest('6. Metadata cleanup -> parameters reach engine correctly', async () => {
      const outPath = path.join(TEST_DIR, 'out_meta_clean.mp4');
      let commandObj = null;
      const res = await cutClip(media.withMeta, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          cleanMetadata: true,
        },
        onCommand: (cmd) => { commandObj = cmd; },
      });
      assert.ok(fs.existsSync(outPath));
      assert.ok(commandObj !== null);
      const outOptions = commandObj._currentOutput.options.get();
      assert.ok(outOptions.includes('-map_metadata'));
      assert.ok(outOptions.includes('-1'));

      const probed = await getVideoMetadata(outPath);
      const tags = (probed.raw && probed.raw.format && probed.raw.format.tags) || {};
      assert.strictEqual(tags.title, undefined);
      assert.strictEqual(tags.comment, undefined);
    });

    // 7. Multiple variation settings → combined settings reach pipeline correctly
    await runTest('7. Multiple variation settings -> combined settings reach pipeline correctly', async () => {
      const outPath = path.join(TEST_DIR, 'out_combined_pipeline.mp4');
      let commandObj = null;
      const res = await cutClip(media.withAudio, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          brightness: 0.05,
          saturation: 1.1,
          hue: 10,
          pitch: 1.5,
          speed: 1.02,
          mode: 'center',
          crop: 1.0,
          cleanMetadata: true,
        },
        onCommand: (cmd) => { commandObj = cmd; },
      });
      assert.ok(fs.existsSync(outPath));
      assert.ok(commandObj !== null);
      const vFilters = commandObj._currentOutput.videoFilters.get();
      const aFilters = commandObj._currentOutput.audioFilters.get();
      assert.ok(vFilters.some((f) => f.includes('crop=')));
      assert.ok(vFilters.some((f) => f.includes('eq=')));
      assert.ok(vFilters.some((f) => f.includes('hue=')));
      assert.ok(vFilters.some((f) => f.includes('setpts=')));
      assert.ok(aFilters.some((f) => f.includes('atempo=')));
      assert.ok(aFilters.some((f) => f.includes('asetrate=')));
    });

    // 8. Invalid brightness rejected
    await runTest('8. Invalid brightness rejected (outside -1 to 1)', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, brightness: 1.5 }), /Brightness/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, brightness: -1.2 }), /Brightness/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, brightness: 'abc' }), /Invalid Brightness/);
    });

    // 9. Invalid saturation rejected
    await runTest('9. Invalid saturation rejected (outside 0 to 3)', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, saturation: -0.1 }), /Saturation/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, saturation: 3.5 }), /Saturation/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, saturation: NaN }), /Invalid Saturation/);
    });

    // 10. Invalid hue rejected
    await runTest('10. Invalid hue rejected (outside -180 to 180)', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, hue: 181 }), /Hue/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, hue: -190 }), /Hue/);
    });

    // 11. Invalid pitch rejected
    await runTest('11. Invalid pitch rejected (outside product limits -3 to 3)', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, pitch: 3.5 }), /Pitch/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, pitch: -4 }), /Pitch/);
    });

    // 12. Invalid speed rejected
    await runTest('12. Invalid speed rejected (outside product limits 1.00 to 1.05)', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, speed: 0.95 }), /Speed/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, speed: 1.10 }), /Speed/);
    });

    // 13. Invalid crop rejected
    await runTest('13. Invalid crop rejected (outside product limits 0 to 2)', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, crop: -0.5 }), /Crop/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, crop: 2.5 }), /Crop/);
    });

    // 14. Invalid reframe mode rejected
    await runTest('14. Invalid reframe mode rejected', () => {
      assert.throws(() => validateProductVariationConfig({ enabled: true, mode: 'diagonal' }), /Reframe mode/);
      assert.throws(() => validateProductVariationConfig({ enabled: true, mode: 'random_mode' }), /Reframe mode/);
    });

    // 15. No-audio source does not fail because of audio controls
    await runTest('15. No-audio source does not fail because of audio controls', async () => {
      const outPath = path.join(TEST_DIR, 'out_no_audio_var.mp4');
      const res = await cutClip(media.noAudio, outPath, {
        start: 0,
        duration: 1,
        variation: {
          enabled: true,
          pitch: 2.0,
          speed: 1.02,
          brightness: 0.05,
        },
      });
      assert.strictEqual(res.outputPath, outPath);
      assert.ok(fs.existsSync(outPath));
      const meta = await getVideoMetadata(outPath);
      assert.ok(meta.video);
      assert.strictEqual(meta.audio, null);
    });

    // 16. Source file remains unchanged
    await runTest('16. Source file remains unchanged', () => {
      const currentHashAudio = getHash(media.withAudio);
      const currentHashNoAudio = getHash(media.noAudio);
      assert.strictEqual(initialHashAudio, currentHashAudio, 'Audio source video file was modified!');
      assert.strictEqual(initialHashNoAudio, currentHashNoAudio, 'No-audio source video file was modified!');
    });

    console.log('\n======================================================');
    console.log(`📊 Phase 1B Variation Integration Tests: ${passedTests} / ${totalTests} passed`);
    console.log('======================================================\n');
  } finally {
    cleanupTestMedia();
  }
}

main().catch((err) => {
  console.error('\n❌ Phase 1B Test Suite encountered fatal error:', err);
  cleanupTestMedia();
  process.exit(1);
});
