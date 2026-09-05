const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { generateProThumbnail, scoreFrame, extractFrameBuffer } = require('../src/engine/thumbnailGenerator');
const { cutClip, splitIntoReels } = require('../src/engine/cutter');
const { hasFeature, FEATURE_TIERS } = require('../src/shared/features');

console.log('======================================================');
console.log('🧪 Running Phase 5.1 AI Thumbnail / Pro Image Tests');
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

function ensureTestVideos(testDir) {
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  const ffmpegStatic = require('ffmpeg-static');
  const { spawnSync } = require('child_process');

  const talkingHeadVideo = path.join(testDir, 'talking_head.mp4');
  const highMotionVideo = path.join(testDir, 'high_motion.mp4');
  const normalVideo = path.join(testDir, 'normal_general.mp4');

  if (!fs.existsSync(talkingHeadVideo)) {
    spawnSync(ffmpegStatic, [
      '-y', '-f', 'lavfi', '-i', 'color=c=0x1e1e2e:s=1280x720:d=5',
      '-f', 'lavfi', '-i', 'sine=f=440:d=5',
      '-vf', 'drawbox=x=540:y=200:w=200:h=260:color=0xffd1b3:t=fill,drawbox=x=440:y=460:w=400:h=260:color=0x2b3a67:t=fill',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      talkingHeadVideo
    ]);
  }

  if (!fs.existsSync(highMotionVideo)) {
    spawnSync(ffmpegStatic, [
      '-y', '-f', 'lavfi', '-i', 'testsrc=duration=5:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=f=880:d=5',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      highMotionVideo
    ]);
  }

  if (!fs.existsSync(normalVideo)) {
    spawnSync(ffmpegStatic, [
      '-y', '-f', 'lavfi', '-i', 'smptebars=duration=5:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=f=220:d=5',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      normalVideo
    ]);
  }

  return { talkingHeadVideo, highMotionVideo, normalVideo };
}

async function main() {
  const testDir = path.join(__dirname, '..', 'test-videos');
  const { talkingHeadVideo, highMotionVideo, normalVideo } = ensureTestVideos(testDir);

  assert(fs.existsSync(talkingHeadVideo), 'talking_head.mp4 must exist');
  assert(fs.existsSync(highMotionVideo), 'high_motion.mp4 must exist');
  assert(fs.existsSync(normalVideo), 'normal_general.mp4 must exist');

  // Test 1: Feature gating for ai_thumbnails
  await runTest('Feature Gating: ai_thumbnails is strictly Pro tier only', () => {
    assert.strictEqual(hasFeature('basic', 'ai_thumbnails'), false, 'Basic tier should not have ai_thumbnails');
    assert.strictEqual(hasFeature('standard', 'ai_thumbnails'), false, 'Standard tier should not have ai_thumbnails');
    assert.strictEqual(hasFeature('pro', 'ai_thumbnails'), true, 'Pro tier must have ai_thumbnails');
    assert.strictEqual(hasFeature(null, 'ai_thumbnails'), false, 'Unlicensed should not have ai_thumbnails');
  });

  // Test 2: Frame Extraction & Scoring
  await runTest('Scoring: Laplacian edge variance & channel scoring generates valid score', async () => {
    const frameBuffer = await extractFrameBuffer(highMotionVideo, 1.0);
    assert(Buffer.isBuffer(frameBuffer), 'Extracted frame must be a Buffer');
    assert(frameBuffer.length > 0, 'Buffer must not be empty');

    const scoreResult = await scoreFrame(frameBuffer);
    assert(typeof scoreResult.score === 'number', 'Score must be a number');
    assert(scoreResult.score > 0, 'Score must be positive');
    assert(typeof scoreResult.sharpness === 'number', 'Sharpness must be a number');
  });

  // Test 3: Thumbnail generation on Talking-Head video
  await runTest('Thumbnail Generation: Talking-head video generates side-by-side Pro thumbnail', async () => {
    const outThumb = path.join(testDir, 'test_talking_head_out.jpg');
    if (fs.existsSync(outThumb)) fs.unlinkSync(outThumb);

    const res = await generateProThumbnail(talkingHeadVideo, outThumb, {
      title: 'INTERVIEW CLIP',
    });

    assert.strictEqual(res.success, true, 'Generation must succeed');
    assert.strictEqual(res.thumbnailPath, outThumb, 'Thumbnail path must match target');
    assert(fs.existsSync(outThumb), 'Output thumbnail file must exist on disk');

    const meta = await sharp(outThumb).metadata();
    assert.strictEqual(meta.format, 'jpeg', 'Thumbnail must be JPEG');
    assert(meta.width > 0 && meta.height > 0, 'Thumbnail must have valid dimensions');

    fs.unlinkSync(outThumb);
  });

  // Test 4: Thumbnail generation on High-Motion video
  await runTest('Thumbnail Generation: High-motion video identifies sharp action frame', async () => {
    const outThumb = path.join(testDir, 'test_high_motion_out.jpg');
    if (fs.existsSync(outThumb)) fs.unlinkSync(outThumb);

    const res = await generateProThumbnail(highMotionVideo, outThumb, {
      title: 'FAST ACTION',
    });

    assert.strictEqual(res.success, true, 'Generation must succeed');
    assert(res.score > 10, 'High motion video should have a substantial score');
    assert(fs.existsSync(outThumb), 'Output thumbnail file must exist on disk');

    const meta = await sharp(outThumb).metadata();
    assert.strictEqual(meta.format, 'jpeg', 'Thumbnail must be JPEG');
    assert(meta.width > 0 && meta.height > 0, 'Thumbnail must have valid dimensions');

    fs.unlinkSync(outThumb);
  });

  // Test 5: Thumbnail generation on Normal/General video
  await runTest('Thumbnail Generation: Normal/general video generates valid Pro thumbnail', async () => {
    const outThumb = path.join(testDir, 'test_normal_out.jpg');
    if (fs.existsSync(outThumb)) fs.unlinkSync(outThumb);

    const res = await generateProThumbnail(normalVideo, outThumb, {
      title: 'NORMAL CLIP',
    });

    assert.strictEqual(res.success, true, 'Generation must succeed');
    assert(fs.existsSync(outThumb), 'Output thumbnail file must exist on disk');

    const meta = await sharp(outThumb).metadata();
    assert.strictEqual(meta.format, 'jpeg', 'Thumbnail must be JPEG');

    fs.unlinkSync(outThumb);
  });

  // Test 6: Default side-by-side naming (.mp4 -> .jpg)
  await runTest('Naming: Default thumbnail path is side-by-side with video (.mp4 -> .jpg)', async () => {
    const expectedPath = path.join(testDir, 'talking_head.jpg');
    const res = await generateProThumbnail(talkingHeadVideo);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.thumbnailPath, expectedPath);
    assert(fs.existsSync(expectedPath));
  });

  // Test 7: Integration with cutter.js cutClip (with thumbnail option)
  await runTest('Cutter Integration: cutClip generates both video clip and Pro thumbnail', async () => {
    const outClip = path.join(testDir, 'test_cutter_thumb.mp4');
    const outThumb = path.join(testDir, 'test_cutter_thumb.jpg');
    if (fs.existsSync(outClip)) fs.unlinkSync(outClip);
    if (fs.existsSync(outThumb)) fs.unlinkSync(outThumb);

    const result = await cutClip(talkingHeadVideo, outClip, {
      start: 0,
      duration: 2,
      reel: true,
      mode: 'blur',
      generateThumbnail: true,
      thumbnailTitle: 'CUTTER PRO',
    });

    assert.strictEqual(result.outputPath, outClip);
    assert(fs.existsSync(outClip), 'Output video clip must exist');
    assert.strictEqual(result.thumbnailPath, outThumb, 'Returned thumbnailPath must match side-by-side .jpg');
    assert(fs.existsSync(outThumb), 'Generated thumbnail must exist');

    fs.unlinkSync(outClip);
    fs.unlinkSync(outThumb);
  });

  // Test 8: cutClip without thumbnail does not generate thumbnail
  await runTest('Cutter Integration: cutClip without generateThumbnail leaves thumbnailPath as null', async () => {
    const outClip = path.join(testDir, 'test_cutter_nothumb.mp4');
    const outThumb = path.join(testDir, 'test_cutter_nothumb.jpg');
    if (fs.existsSync(outClip)) fs.unlinkSync(outClip);
    if (fs.existsSync(outThumb)) fs.unlinkSync(outThumb);

    const result = await cutClip(talkingHeadVideo, outClip, {
      start: 0,
      duration: 2,
      generateThumbnail: false,
    });

    assert.strictEqual(result.outputPath, outClip);
    assert(fs.existsSync(outClip), 'Output video clip must exist');
    assert.strictEqual(result.thumbnailPath, null, 'thumbnailPath must be null');
    assert(!fs.existsSync(outThumb), 'Thumbnail must not exist');

    fs.unlinkSync(outClip);
  });

  // Test 9: Graceful degradation on thumbnail failure (never fail video)
  await runTest('Graceful Fallback: Thumbnail error does not fail video clip creation', async () => {
    const outClip = path.join(testDir, 'test_cutter_fallback.mp4');
    if (fs.existsSync(outClip)) fs.unlinkSync(outClip);

    const invalidThumbPath = 'Z:\\non_existent_folder_xyz_123\\invalid.jpg';

    const result = await cutClip(talkingHeadVideo, outClip, {
      start: 0,
      duration: 2,
      generateThumbnail: true,
      thumbnailPath: invalidThumbPath,
    });

    assert.strictEqual(result.outputPath, outClip);
    assert(fs.existsSync(outClip), 'Video clip must succeed despite thumbnail error');
    assert.strictEqual(result.thumbnailPath, null, 'thumbnailPath should gracefully be null on failure');

    fs.unlinkSync(outClip);
  });

  // Test 10: splitIntoReels integration with thumbnails
  await runTest('Split Integration: splitIntoReels generates thumbnails for each segment', async () => {
    const splitDir = path.join(testDir, 'test_split_thumbs');
    if (fs.existsSync(splitDir)) {
      fs.rmSync(splitDir, { recursive: true, force: true });
    }
    fs.mkdirSync(splitDir, { recursive: true });

    const results = await splitIntoReels(normalVideo, splitDir, {
      interval: 2,
      reel: true,
      mode: 'pad',
      generateThumbnail: true,
      thumbnailTitle: 'EPISODE',
    });

    assert(results.length >= 2, 'Should create at least 2 segments for 5s video with 2s interval');
    for (const seg of results) {
      assert(fs.existsSync(seg.outputPath), `Segment video ${seg.outputPath} must exist`);
      assert(seg.thumbnailPath, 'Segment must have thumbnailPath');
      assert(fs.existsSync(seg.thumbnailPath), `Segment thumbnail ${seg.thumbnailPath} must exist`);
    }

    fs.rmSync(splitDir, { recursive: true, force: true });
  });

  console.log('======================================================');
  console.log(`🎉 All ${passedTests}/${totalTests} Phase 5.1 AI Thumbnail tests passed!`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
