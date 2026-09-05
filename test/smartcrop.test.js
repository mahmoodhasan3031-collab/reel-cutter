'use strict';
/**
 * Phase 5.2 — Smart Crop Test Suite
 *
 * Tests:
 *  1. face-api + WASM backend initialises successfully
 *  2. Model directory contains required weights
 *  3. detectFacesInFrame returns [] for a blank synthetic frame (no face)
 *  4. selectPrimaryFace returns null when empty
 *  5. selectPrimaryFace returns the highest-area face when multiple present
 *  6. selectPrimaryFace prefers nearest to lastCentreX among near-equal candidates
 *  7. applyEmaSmoothing smooths a trajectory with a single fixed point
 *  8. applyEmaSmoothing blends across rapidly changing positions
 *  9. buildSmartCropFilter — centre crop fallback when positions=[]
 * 10. buildSmartCropFilter — computes valid FFmpeg filter for known face centre
 * 11. getSmartCropFilter — returns a valid filter string and fallback=true for no-face video
 * 12. getSmartCropFilter — does NOT throw; always returns { filter, fallback }
 * 13. analyseVideo — handles a synthetic video with no faces (fallback path)
 * 14. analyseVideo — returns positions array with time values from video
 * 15. cutClip smart_crop mode — produces a valid 9:16 MP4 output
 *     (no faces detected → centre-crop fallback; output exists & is playable)
 * 16. Tier gating — video:reel smart_crop rejected for non-pro (IPC layer simulation)
 */

const path = require('path');
const fs   = require('fs');
const assert = require('assert');
const os   = require('os');
const { execSync } = require('child_process');

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: '✓' });
    console.log(`  ✓  ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: '✗', error: err.message });
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg}: expected ~${expected} ± ${tolerance}, got ${actual}`);
  }
}

// ─── Test video setup ─────────────────────────────────────────────────────────

const TEST_VIDEOS_DIR = path.join(__dirname, '..', 'test-videos');

async function ensureTestVideos() {
  if (!fs.existsSync(TEST_VIDEOS_DIR)) fs.mkdirSync(TEST_VIDEOS_DIR, { recursive: true });

  const ffmpegBin = require('ffmpeg-static');

  const videos = {
    'talking_head.mp4':  `"${ffmpegBin}" -y -f lavfi -i color=c=red:size=1280x720:rate=30 -f lavfi -i anullsrc=r=44100:cl=stereo -t 6 -c:v libx264 -preset ultrafast -c:a aac -shortest`,
    'moving_person.mp4': `"${ffmpegBin}" -y -f lavfi -i color=c=blue:size=1280x720:rate=30 -f lavfi -i anullsrc=r=44100:cl=stereo -t 4 -c:v libx264 -preset ultrafast -c:a aac -shortest`,
    'no_face.mp4':       `"${ffmpegBin}" -y -f lavfi -i color=c=black:size=1280x720:rate=30 -f lavfi -i anullsrc=r=44100:cl=stereo -t 4 -c:v libx264 -preset ultrafast -c:a aac -shortest`,
  };

  for (const [name, cmd] of Object.entries(videos)) {
    const outPath = path.join(TEST_VIDEOS_DIR, name);
    if (!fs.existsSync(outPath)) {
      execSync(`${cmd} "${outPath}"`, { stdio: 'pipe' });
    }
  }
}

// ─── Module imports ───────────────────────────────────────────────────────────

const {
  getSmartCropFilter,
  detectFacesInFrame,
  selectPrimaryFace,
  applyEmaSmoothing,
  analyseVideo,
  buildSmartCropFilter,
  initFaceApi,
  MODEL_DIR,
  EMA_ALPHA,
} = require('../src/engine/smartCrop');

// ─── Test suite ───────────────────────────────────────────────────────────────

async function runSuite() {
  console.log('\n📐 Phase 5.2 — Smart Crop Tests\n');

  await ensureTestVideos();

  // ── Test 1: face-api + WASM initialises ────────────────────────────────────
  await test('face-api WASM backend initialises and Tiny Face Detector loads', async () => {
    const api = await initFaceApi();
    assert.ok(api, 'faceapi object returned');
    assert.strictEqual(api.tf.getBackend(), 'wasm', 'WASM backend active');
    assert.ok(api.nets.tinyFaceDetector.isLoaded, 'Tiny Face Detector is loaded');
  });

  // ── Test 2: Model directory has required weights ───────────────────────────
  await test('Model directory contains tiny_face_detector weights', () => {
    assert.ok(fs.existsSync(MODEL_DIR), `MODEL_DIR exists: ${MODEL_DIR}`);
    const files = fs.readdirSync(MODEL_DIR);
    assert.ok(
      files.some(f => f.startsWith('tiny_face_detector')),
      'tiny_face_detector weights present'
    );
  });

  // ── Test 3: detectFacesInFrame returns [] for blank frame ─────────────────
  await test('detectFacesInFrame returns [] for a plain-colour synthetic frame', async () => {
    // Create a blank 1280x720 JPEG via Sharp
    const sharp = require('sharp');
    const blankJpeg = await sharp({
      create: { width: 1280, height: 720, channels: 3, background: { r: 100, g: 100, b: 100 } }
    }).jpeg().toBuffer();

    const faces = await detectFacesInFrame(blankJpeg, 1280, 720);
    assert.ok(Array.isArray(faces), 'returns array');
    assert.strictEqual(faces.length, 0, 'no faces in blank frame');
  });

  // ── Test 4: selectPrimaryFace returns null for empty array ────────────────
  await test('selectPrimaryFace returns null for empty faces array', () => {
    const result = selectPrimaryFace([]);
    assert.strictEqual(result, null);
  });

  // ── Test 5: selectPrimaryFace picks largest-area face ────────────────────
  await test('selectPrimaryFace picks largest area face when scores are equal', () => {
    const faces = [
      { x: 100, y: 100, width: 50,  height: 50,  score: 0.8 },  // area 2500
      { x: 200, y: 200, width: 200, height: 200, score: 0.8 },  // area 40000 — largest
      { x: 300, y: 300, width: 80,  height: 80,  score: 0.8 },  // area 6400
    ];
    const best = selectPrimaryFace(faces, null);
    assert.strictEqual(best.width, 200, 'Largest face selected');
    assert.strictEqual(best.height, 200);
  });

  // ── Test 6: selectPrimaryFace prefers nearest to lastCentreX ─────────────
  await test('selectPrimaryFace stays near lastCentreX among near-equal candidates', () => {
    // Two candidates with nearly equal composite score, one near cx=640, one near cx=200
    const faces = [
      { x: 615, y: 300, width: 50, height: 50, score: 0.9 },   // centreX ≈ 640
      { x: 175, y: 300, width: 50, height: 50, score: 0.9 },   // centreX ≈ 200
    ];
    const best = selectPrimaryFace(faces, 640);
    assert.ok(best.x + best.width / 2 > 400, `Prefers face near cx=640, got cx=${best.x + best.width/2}`);
  });

  // ── Test 7: applyEmaSmoothing — fixed centre stays fixed ─────────────────
  await test('applyEmaSmoothing maintains fixed position when all positions are the same', () => {
    const positions = [
      { time: 0, cx: 640, cy: 360 },
      { time: 1, cx: 640, cy: 360 },
      { time: 2, cx: 640, cy: 360 },
    ];
    const smoothed = applyEmaSmoothing(positions);
    for (const p of smoothed) {
      assertApprox(p.cx, 640, 1, 'cx stable');
      assertApprox(p.cy, 360, 1, 'cy stable');
    }
  });

  // ── Test 8: applyEmaSmoothing blends rapidly changing values ─────────────
  await test('applyEmaSmoothing creates intermediate values between 0 and 1280', () => {
    const positions = [
      { time: 0, cx: 0,    cy: 360 },
      { time: 1, cx: 1280, cy: 360 },
      { time: 2, cx: 1280, cy: 360 },
      { time: 3, cx: 1280, cy: 360 },
    ];
    const smoothed = applyEmaSmoothing(positions, 0.5);
    // After first step: 0.5*1280 + 0.5*0 = 640
    assertApprox(smoothed[1].cx, 640, 5, 'intermediate blend at step 1');
    // Final steps should converge toward 1280
    assert.ok(smoothed[3].cx > smoothed[1].cx, 'converging toward 1280');
    assert.ok(smoothed[3].cx <= 1280, 'never exceeds source value');
  });

  // ── Test 9: buildSmartCropFilter — fallback for empty positions ───────────
  await test('buildSmartCropFilter returns centre crop filter for empty positions', () => {
    const result = buildSmartCropFilter([], 1280, 720, 1080, 1920);
    assert.ok(result.filter.includes('crop'), 'filter contains crop');
    assert.ok(result.filter.includes('scale'), 'filter contains scale');
    assert.ok(result.filter.includes('1080'), 'output width 1080 present');
  });

  // ── Test 10: buildSmartCropFilter — valid filter for known centre ─────────
  await test('buildSmartCropFilter produces valid FFmpeg filter for centred face', () => {
    // Face centred at (640,360) in a 1280x720 source → should produce crop centred on subject
    const positions = [
      { time: 0, cx: 640, cy: 360 },
      { time: 1, cx: 640, cy: 360 },
    ];
    const result = buildSmartCropFilter(positions, 1280, 720, 1080, 1920);
    assert.ok(typeof result.filter === 'string', 'filter is a string');
    assert.ok(!result.isComplex, 'simple filter (not complex)');
    assert.ok(result.filter.includes('scale'), 'filter has scale step');
    assert.ok(result.filter.includes('crop'), 'filter has crop step');
    // cropX should not be negative
    const cropMatch = result.filter.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
    assert.ok(cropMatch, 'filter matches crop=W:H:X:Y pattern');
    const [, w, h, x, y] = cropMatch.map(Number);
    assert.ok(x >= 0, `cropX (${x}) must be >= 0`);
    assert.ok(y >= 0, `cropY (${y}) must be >= 0`);
    assert.ok(w > 0, `cropW (${w}) must be > 0`);
  });

  // ── Test 11: getSmartCropFilter — valid result for synthetic no-face video ─
  await test('getSmartCropFilter returns valid filter and fallback=true for no-face video', async () => {
    const videoPath = path.join(TEST_VIDEOS_DIR, 'no_face.mp4');
    const result = await getSmartCropFilter(videoPath, 4, 1280, 720);
    assert.ok(result, 'result object returned');
    assert.ok(typeof result.filter === 'string', 'filter is a string');
    assert.ok(result.filter.length > 0, 'filter is non-empty');
    assert.ok(result.filter.includes('scale') || result.filter.includes('crop'), 'filter has video ops');
    assert.strictEqual(result.fallback, true, 'fallback=true because no face in synthetic video');
  });

  // ── Test 12: getSmartCropFilter — never throws ────────────────────────────
  await test('getSmartCropFilter never throws, always returns { filter, fallback }', async () => {
    // Pass an invalid/missing video path
    const result = await getSmartCropFilter('/nonexistent/path/fake.mp4', 5, 1280, 720);
    assert.ok(result, 'result returned even for bad path');
    assert.ok(typeof result.filter === 'string', 'filter string always returned');
    assert.ok(typeof result.fallback === 'boolean', 'fallback boolean always returned');
  });

  // ── Test 13: analyseVideo — no-face synthetic video uses centre positions ──
  await test('analyseVideo returns centre positions and fallback=true for no-face video', async () => {
    const videoPath = path.join(TEST_VIDEOS_DIR, 'no_face.mp4');
    const { positions, fallback } = await analyseVideo(videoPath, 4, 1280, 720, { sampleIntervalSec: 2 });
    assert.ok(Array.isArray(positions), 'positions is array');
    assert.ok(positions.length > 0, 'positions array is non-empty');
    assert.strictEqual(fallback, true, 'fallback=true for no-face video');
    // All positions should be the centre (640, 360)
    for (const p of positions) {
      assert.ok(typeof p.time === 'number', 'time is number');
      assert.strictEqual(p.cx, 640, 'cx is centre (640)');
      assert.strictEqual(p.cy, 360, 'cy is centre (360)');
    }
  });

  // ── Test 14: analyseVideo — positions have valid time values ─────────────
  await test('analyseVideo positions have monotonically increasing time values', async () => {
    const videoPath = path.join(TEST_VIDEOS_DIR, 'talking_head.mp4');
    const { positions } = await analyseVideo(videoPath, 6, 1280, 720, { sampleIntervalSec: 1.5 });
    assert.ok(positions.length >= 2, `at least 2 sample positions, got ${positions.length}`);
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        positions[i].time > positions[i - 1].time,
        `time increases: t[${i}]=${positions[i].time} > t[${i-1}]=${positions[i-1].time}`
      );
    }
  });

  // ── Test 15: cutClip smart_crop mode — produces valid 9:16 output ─────────
  await test('cutClip smart_crop mode produces a valid 9:16 MP4 (fallback path)', async () => {
    const { cutClip } = require('../src/engine/cutter');
    const { getVideoMetadata } = require('../src/engine/probe');

    const inputPath  = path.join(TEST_VIDEOS_DIR, 'no_face.mp4');
    const outputPath = path.join(os.tmpdir(), `sc_test_${Date.now()}.mp4`);

    try {
      const result = await cutClip(inputPath, outputPath, {
        reel: true,
        mode: 'smart_crop',
        width: 1080,
        height: 1920,
        duration: 3,
      });

      assert.ok(fs.existsSync(result.outputPath), 'Output file exists');
      assert.ok(result.duration > 0, `Duration > 0 (got ${result.duration})`);

      // Verify dimensions
      const meta = await getVideoMetadata(result.outputPath);
      assert.strictEqual(meta.video.width,  1080, `Width should be 1080 (got ${meta.video.width})`);
      assert.strictEqual(meta.video.height, 1920, `Height should be 1920 (got ${meta.video.height})`);
    } finally {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  });

  // ── Test 16: Tier gating — smart_crop blocked for non-Pro ────────────────
  await test('Tier gating: smart_crop feature requires pro tier', () => {
    const { hasFeature } = require('../src/shared/features');
    assert.strictEqual(hasFeature('basic',    'smart_crop'), false, 'basic cannot use smart_crop');
    assert.strictEqual(hasFeature('standard', 'smart_crop'), false, 'standard cannot use smart_crop');
    assert.strictEqual(hasFeature('pro',      'smart_crop'), true,  'pro can use smart_crop');
    assert.strictEqual(hasFeature(null,       'smart_crop'), false, 'null tier cannot use smart_crop');
  });

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────');
  console.log(`  Phase 5.2 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => r.status === '✗').forEach(r => {
      console.log(`    ✗ ${r.name}`);
      console.log(`      ${r.error}`);
    });
  }
  console.log('─────────────────────────────────────\n');

  return failed;
}

module.exports = { runSuite };

if (require.main === module) {
  runSuite().then(failed => process.exit(failed > 0 ? 1 : 0));
}
