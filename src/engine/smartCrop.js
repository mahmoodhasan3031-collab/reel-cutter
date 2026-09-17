'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const sharp = require('sharp');
const { getFfmpegPath } = require('./probe');

// ─── Lazy-loaded face-api (heavy init, only done once) ────────────────────────
let faceapi = null;
let modelLoaded = false;
let modelLoadPromise = null;

const MODEL_DIR = path.join(
  path.dirname(require.resolve('@vladmandic/face-api/dist/face-api.node-wasm.js')),
  '..',
  'model'
).replace('app.asar', 'app.asar.unpacked');

/**
 * Initialise face-api + WASM TF backend once; safe to call multiple times.
 */
async function initFaceApi() {
  if (modelLoaded) return faceapi;
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
    await faceapi.tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR);
    modelLoaded = true;
    console.log('[SmartCrop] face-api WASM backend ready, Tiny Face Detector loaded');
    return faceapi;
  })();

  return modelLoadPromise;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Detection input size for TinyFaceDetector (power of 2: 128/160/224/320/416/608).
 * 320 is the best speed/accuracy tradeoff for a full video scan.
 */
const DETECTION_INPUT_SIZE = 320;
const SCORE_THRESHOLD = 0.35;

/**
 * Exponential Moving Average (EMA) factor for crop-centre smoothing.
 * Higher = smoother (slower to follow); Lower = more reactive.
 * 0.12 provides comfortable following without jittery jumps.
 */
const EMA_ALPHA = 0.12;

/**
 * Timeout for individual FFmpeg frame extraction (ms).
 * Prevents hangs on corrupt or extremely long videos.
 */
const FRAME_EXTRACT_TIMEOUT_MS = parseInt(process.env.REEL_CUTTER_FRAME_TIMEOUT_MS, 10) || 15 * 1000;

// ─── Face detection on a single Sharp frame buffer ───────────────────────────

/**
 * Detect faces in a raw JPEG buffer.
 * Returns an array of { x, y, width, height, score } in original image coords.
 *
 * @param {Buffer} jpegBuffer   JPEG buffer from FFmpeg frame extraction
 * @param {number} origWidth    Original frame width in pixels
 * @param {number} origHeight   Original frame height in pixels
 * @returns {Promise<Array<{x,y,width,height,score}>>}
 */
async function detectFacesInFrame(jpegBuffer, origWidth, origHeight) {
  const api = await initFaceApi();

  // Resize to detection resolution, keeping RGB layout
  const { data, info } = await sharp(jpegBuffer)
    .resize(DETECTION_INPUT_SIZE, DETECTION_INPUT_SIZE, { fit: 'contain', background: '#000' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = api.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
  const opts = new api.TinyFaceDetectorOptions({
    inputSize: DETECTION_INPUT_SIZE,
    scoreThreshold: SCORE_THRESHOLD,
  });

  let detections;
  try {
    detections = await api.detectAllFaces(tensor, opts);
  } finally {
    tensor.dispose();
  }

  if (!detections || detections.length === 0) return [];

  // Scale detected boxes back to original frame dimensions
  const scaleX = origWidth / info.width;
  const scaleY = origHeight / info.height;

  return detections.map((d) => ({
    x: d.box.x * scaleX,
    y: d.box.y * scaleY,
    width: d.box.width * scaleX,
    height: d.box.height * scaleY,
    score: d.score,
  }));
}

// ─── Primary Face Selection Strategy ─────────────────────────────────────────
/**
 * Strategy: "Largest & Highest Scoring"
 *
 * When multiple faces are detected in a frame:
 * 1. Score each face as: score * area  (area = width * height in pixels)
 *    This biases toward the largest face closest to the camera — typically the
 *    primary subject/speaker in a talking-head or interview video.
 * 2. Among faces with compositeScore within 30% of the best, pick the one
 *    whose horizontal centre is closest to the existing tracked centre, to
 *    avoid jumping between co-equal subjects.
 *
 * @param {Array<{x,y,width,height,score}>} faces
 * @param {number|null} lastCentreX  The tracked crop centre X from the previous sample
 * @returns {{x,y,width,height,score}|null}
 */
function selectPrimaryFace(faces, lastCentreX = null) {
  if (!faces || faces.length === 0) return null;
  if (faces.length === 1) return faces[0];

  const scored = faces.map((f) => ({
    face: f,
    composite: f.score * (f.width * f.height),
  }));
  scored.sort((a, b) => b.composite - a.composite);

  const best = scored[0].composite;
  const THRESHOLD = 0.30;

  const candidates = scored.filter((s) => s.composite >= best * (1 - THRESHOLD));

  if (lastCentreX !== null && candidates.length > 1) {
    // Among near-equal candidates, prefer the one closest to current tracked position
    candidates.sort((a, b) => {
      const cx_a = a.face.x + a.face.width / 2;
      const cx_b = b.face.x + b.face.width / 2;
      return Math.abs(cx_a - lastCentreX) - Math.abs(cx_b - lastCentreX);
    });
  }

  return candidates[0].face;
}

// ─── EMA Smoothing ────────────────────────────────────────────────────────────

/**
 * Apply Exponential Moving Average to a series of crop centre positions.
 * Each element is { time, cx, cy } (centre-x, centre-y in original pixel space).
 * Returns a smoothed array of { time, cx, cy }.
 *
 * @param {Array<{time:number, cx:number, cy:number}>} positions
 * @param {number} [alpha=EMA_ALPHA]
 * @returns {Array<{time:number, cx:number, cy:number}>}
 */
function applyEmaSmoothing(positions, alpha = EMA_ALPHA) {
  if (positions.length === 0) return [];
  const result = [];
  let smoothX = positions[0].cx;
  let smoothY = positions[0].cy;

  for (const pos of positions) {
    smoothX = alpha * pos.cx + (1 - alpha) * smoothX;
    smoothY = alpha * pos.cy + (1 - alpha) * smoothY;
    result.push({ time: pos.time, cx: smoothX, cy: smoothY });
  }
  return result;
}

// ─── Frame sampling ───────────────────────────────────────────────────────────

/**
 * Extract a JPEG buffer from a video file at a given timestamp using FFmpeg.
 * Includes timeout to prevent hangs on corrupt videos.
 *
 * @param {string} videoPath
 * @param {number} timestampSeconds
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] Override timeout in ms
 * @returns {Promise<Buffer>}
 */
function extractFrameAt(videoPath, timestampSeconds, opts = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const { spawn } = require('child_process');
    const timeoutMs = opts.timeoutMs || FRAME_EXTRACT_TIMEOUT_MS;

    const proc = spawn(getFfmpegPath(), [
      '-ss', String(Math.max(0, timestampSeconds)),
      '-i', videoPath,
      '-frames:v', '1',
      '-f', 'image2',
      '-vframes', '1',
      '-q:v', '2',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let finished = false;
    const timeoutHandle = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        proc.kill('SIGKILL');
      } catch (_) {}
      reject(new Error(`FFmpeg frame extraction timed out after ${Math.round(timeoutMs / 1000)}s at t=${timestampSeconds}s`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutHandle);
    };

    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stdout.on('end', () => {
      if (finished) return;
      finished = true;
      cleanup();
      const buf = Buffer.concat(chunks);
      if (buf.length < 100) return reject(new Error(`Empty frame at ${timestampSeconds}s`));
      resolve(buf);
    });
    proc.on('error', (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    });
    proc.on('close', (code) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (code !== 0 && chunks.length === 0) reject(new Error(`FFmpeg exited ${code} at ${timestampSeconds}s`));
    });
  });
}

// ─── Core Smart Crop analyser ─────────────────────────────────────────────────

/**
 * Analyse a video for face positions and return an array of smoothed crop-centre
 * keyframe positions in original video coordinates.
 *
 * Sampling strategy:
 * - Sample 1 frame every `sampleIntervalSec` seconds (default 1s).
 * - Use low-resolution detection tensors to keep CPU load manageable.
 * - Apply EMA smoothing to prevent jitter.
 *
 * @param {string}  videoPath
 * @param {number}  duration          Total video duration in seconds
 * @param {number}  origWidth         Original video width (px)
 * @param {number}  origHeight        Original video height (px)
 * @param {Object}  [opts]
 * @param {number}  [opts.sampleIntervalSec=1.0]  Seconds between sample frames
 * @returns {Promise<{
 *   positions: Array<{time:number, cx:number, cy:number}>,
 *   fallback: boolean
 * }>}
 */
async function analyseVideo(videoPath, duration, origWidth, origHeight, opts = {}) {
  const sampleIntervalSec = opts.sampleIntervalSec || 1.0;

  // Generate sample timestamps (avoid first/last 0.1s to dodge blank frames)
  const sampleTimes = [];
  const padding = Math.min(0.1, duration * 0.05);
  let t = padding;
  while (t < duration - padding) {
    sampleTimes.push(Math.min(t, duration - padding));
    t += sampleIntervalSec;
  }
  if (sampleTimes.length === 0) sampleTimes.push(duration / 2);

  console.log(`[SmartCrop] Sampling ${sampleTimes.length} frames from ${videoPath.split(/[\\/]/).pop()} (${duration.toFixed(1)}s)`);

  const rawPositions = [];
  let lastCentreX = origWidth / 2;
  let facesFoundTotal = 0;

  for (const time of sampleTimes) {
    try {
      const frame = await extractFrameAt(videoPath, time);
      const faces = await detectFacesInFrame(frame, origWidth, origHeight);

      if (faces.length > 0) {
        facesFoundTotal++;
        const face = selectPrimaryFace(faces, lastCentreX);
        const cx = face.x + face.width / 2;
        const cy = face.y + face.height / 2;
        lastCentreX = cx;
        rawPositions.push({ time, cx, cy, detected: true });
      } else {
        // No face: use last known position or centre
        rawPositions.push({
          time,
          cx: lastCentreX,
          cy: origHeight / 2,
          detected: false,
        });
      }
    } catch (err) {
      console.warn(`[SmartCrop] Frame error at t=${time.toFixed(2)}: ${err.message}`);
      rawPositions.push({ time, cx: lastCentreX, cy: origHeight / 2, detected: false });
    }
  }

  const fallback = facesFoundTotal === 0;
  if (fallback) {
    console.log('[SmartCrop] No faces detected — using centre-crop fallback');
    // Return fixed centre positions
    return {
      positions: sampleTimes.map((time) => ({ time, cx: origWidth / 2, cy: origHeight / 2 })),
      fallback: true,
    };
  }

  console.log(`[SmartCrop] Faces detected in ${facesFoundTotal}/${sampleTimes.length} frames. Applying EMA smoothing (α=${EMA_ALPHA})`);
  const smoothed = applyEmaSmoothing(rawPositions);
  return { positions: smoothed, fallback: false };
}

// ─── FFmpeg filter builder ────────────────────────────────────────────────────

/**
 * Clamp value between min and max.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Build an FFmpeg crop+scale filter for face-tracking 9:16 output.
 *
 * The crop follows the detected face centres across time using `sendcmd` or
 * a static crop with the computed average centre for the full clip.
 *
 * For a 9:16 (1080×1920) output from a 16:9 (1280×720) source:
 * - The tallest possible crop from a 1280×720 source maintaining 9:16 is
 *   405×720 (width=405 for 16:9 content) or we scale first.
 * - Strategy: Scale source to fill 1080 wide → 1080×607, then crop 1080×1920
 *   would lose height. Better: scale to 1080 wide, pad height to 1920, THEN
 *   face-track within the padded field.
 *
 * Practical approach for arbitrary source AR → 9:16 with face tracking:
 * 1. Scale source so height=1920 → width = 1920 * (origW/origH)
 * 2. Crop a 1080-wide window horizontally around the face centre.
 *
 * For centre positions across the clip we generate a single average-weighted
 * crop expression — this keeps the FFmpeg pipeline simple and avoids frame-by-frame
 * -vf switching. For a production version, VF `crop` supports `x=eval_at_frame`
 * but the sendcmd approach with interpolation is complex; instead we use the
 * dominant weighted centre.
 *
 * @param {Array<{time,cx,cy}>} positions   Smoothed face-centre positions
 * @param {number} origWidth                Source width
 * @param {number} origHeight               Source height
 * @param {number} outWidth                 Target width (default 1080)
 * @param {number} outHeight                Target height (default 1920)
 * @returns {{ filter: string, isComplex: boolean }}
 */
function buildSmartCropFilter(positions, origWidth, origHeight, outWidth = 1080, outHeight = 1920) {
  if (!positions || positions.length === 0) {
    // Fallback: centre crop
    return {
      isComplex: false,
      filter: `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`,
    };
  }

  // Weighted average crop centre (recent positions weighed slightly more by EMA result)
  const totalWeight = positions.length;
  const avgCX = positions.reduce((sum, p) => sum + p.cx, 0) / totalWeight;
  const avgCY = positions.reduce((sum, p) => sum + p.cy, 0) / totalWeight;

  // Normalise to [0,1] relative to source dimensions
  const normCX = avgCX / origWidth;
  const normCY = avgCY / origHeight;

  // Scale source so height = outHeight, compute resulting width
  const scaledWidth = Math.round((origWidth / origHeight) * outHeight);
  const scaledHeight = outHeight;

  // Compute horizontal crop offset so face centre stays within [0, scaledWidth - outWidth]
  const cropW = Math.min(outWidth, scaledWidth);
  const faceCentreScaledX = normCX * scaledWidth;
  let cropX = Math.round(faceCentreScaledX - cropW / 2);
  cropX = clamp(cropX, 0, Math.max(0, scaledWidth - cropW));

  // Vertical: face Y maps to scaled height; centre it within outHeight
  const faceCentreScaledY = normCY * scaledHeight;
  let cropY = Math.round(faceCentreScaledY - outHeight / 2);
  cropY = clamp(cropY, 0, Math.max(0, scaledHeight - outHeight));

  const filter =
    `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,` +
    `crop=${cropW}:${outHeight}:${cropX}:${cropY},` +
    `scale=${outWidth}:${outHeight}`;

  console.log(
    `[SmartCrop] Filter: scale→${scaledWidth}×${scaledHeight}, crop(${cropW}×${outHeight}) at (${cropX},${cropY}), face@(${normCX.toFixed(2)},${normCY.toFixed(2)})`
  );

  return { isComplex: false, filter };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Smart Crop analysis and return an FFmpeg filter string for the crop.
 *
 * Falls back to centre crop gracefully if:
 * - face-api fails to initialise
 * - No faces are detected
 * - Any unexpected error occurs
 *
 * @param {string}  videoPath
 * @param {number}  duration           Video duration in seconds
 * @param {number}  origWidth          Source video width
 * @param {number}  origHeight         Source video height
 * @param {Object}  [opts]
 * @param {number}  [opts.outWidth=1080]
 * @param {number}  [opts.outHeight=1920]
 * @param {number}  [opts.sampleIntervalSec=1.0]
 * @returns {Promise<{filter:string, isComplex:boolean, fallback:boolean, error?:string}>}
 */
async function getSmartCropFilter(videoPath, duration, origWidth, origHeight, opts = {}) {
  const outWidth = opts.outWidth || 1080;
  const outHeight = opts.outHeight || 1920;

  try {
    const { positions, fallback } = await analyseVideo(
      videoPath, duration, origWidth, origHeight,
      { sampleIntervalSec: opts.sampleIntervalSec || 1.0 }
    );

    const filterResult = buildSmartCropFilter(positions, origWidth, origHeight, outWidth, outHeight);
    return { ...filterResult, fallback };
  } catch (err) {
    console.warn('[SmartCrop] Analysis failed, using centre-crop fallback:', err.message);
    return {
      isComplex: false,
      filter: `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`,
      fallback: true,
      error: err.message,
    };
  }
}

module.exports = {
  getSmartCropFilter,
  detectFacesInFrame,
  selectPrimaryFace,
  applyEmaSmoothing,
  analyseVideo,
  buildSmartCropFilter,
  initFaceApi,
  MODEL_DIR,
  EMA_ALPHA,
};
