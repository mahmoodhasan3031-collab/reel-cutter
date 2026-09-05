const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');
const { ffmpeg, getVideoMetadata } = require('./probe');

/**
 * Extracts a single frame from a video at a specific timestamp in seconds.
 *
 * @param {string} videoPath
 * @param {number} timestampSeconds
 * @returns {Promise<Buffer>}
 */
function extractFrameBuffer(videoPath, timestampSeconds) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const safeTime = Math.max(0, timestampSeconds);

    ffmpeg(videoPath)
      .seekInput(safeTime)
      .frames(1)
      .format('image2')
      .outputOptions(['-vframes 1', '-q:v 2'])
      .pipe()
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', (err) => reject(err));
  });
}

/**
 * Scores a frame buffer for sharpness, detail, and visual interest.
 * Higher score indicates a sharper, high-contrast, motion/action keyframe.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ score: number, meanLuminance: number, sharpness: number }>}
 */
async function scoreFrame(buffer) {
  try {
    const image = sharp(buffer);
    const stats = await image.stats();

    // 1. Calculate average luminance across RGB channels
    const rMean = stats.channels[0]?.mean || 0;
    const gMean = stats.channels[1]?.mean || 0;
    const bMean = stats.channels[2]?.mean || 0;
    const meanLuminance = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;

    // Reject pitch black or completely white frames
    if (meanLuminance < 15 || meanLuminance > 245) {
      return { score: 0, meanLuminance, sharpness: 0 };
    }

    // 2. Measure edge sharpness using Laplacian kernel convolution
    // Laplacian kernel: detects edges and high frequency details
    const edgeImage = await image
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
      })
      .raw()
      .toBuffer();

    // Calculate variance of edge magnitudes (standard variance of Laplacian)
    let sum = 0;
    let sumSq = 0;
    const len = edgeImage.length;
    for (let i = 0; i < len; i++) {
      const val = edgeImage[i];
      sum += val;
      sumSq += val * val;
    }
    const mean = sum / len;
    const variance = sumSq / len - mean * mean;
    const sharpness = Math.sqrt(Math.max(0, variance));

    // 3. Channel variance (color richness and contrast)
    const channelVariance =
      ((stats.channels[0]?.stdev || 0) +
        (stats.channels[1]?.stdev || 0) +
        (stats.channels[2]?.stdev || 0)) /
      3;

    // Combined weighted score
    const score = sharpness * 1.5 + channelVariance * 0.8;

    return {
      score: Math.max(0, score),
      meanLuminance,
      sharpness,
    };
  } catch (err) {
    return { score: 1, meanLuminance: 128, sharpness: 1 };
  }
}

/**
 * Builds an SVG gradient and text overlay for the thumbnail.
 *
 * @param {Object} params
 * @param {number} params.width
 * @param {number} params.height
 * @param {string} params.title
 * @returns {Buffer}
 */
function createOverlaySvg({ width, height, title }) {
  const isPortrait = height > width;
  const safeTitle = (title || 'VIRAL REEL')
    .toUpperCase()
    .replace(/[<>&"]/g, '')
    .substring(0, 32);

  // Scaled font sizes according to canvas dimensions
  const titleFontSize = Math.max(28, Math.round(width * 0.055));
  const badgeFontSize = Math.max(12, Math.round(width * 0.022));

  // Bottom text position
  const textY = isPortrait ? height - 160 : height - 80;
  const badgeY = textY - titleFontSize - 24;

  const svgString = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Polished Dark Bottom Gradient -->
        <linearGradient id="vignetteGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#09090b" stop-opacity="0.35" />
          <stop offset="40%" stop-color="#09090b" stop-opacity="0.0" />
          <stop offset="65%" stop-color="#09090b" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#09090b" stop-opacity="0.92" />
        </linearGradient>

        <!-- Accent Glow Gradient -->
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#7c3aed" />
          <stop offset="100%" stop-color="#c4b5fd" />
        </linearGradient>

        <!-- Drop Shadow for Text -->
        <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.95"/>
        </filter>
      </defs>

      <!-- Gradient Overlay -->
      <rect width="${width}" height="${height}" fill="url(#vignetteGrad)" />

      <!-- Top Border Accent Line -->
      <rect x="0" y="0" width="${width}" height="6" fill="url(#accentGrad)" opacity="0.9" />

      <!-- Pro Image Pill Badge -->
      <g transform="translate(48, ${badgeY})">
        <rect width="110" height="26" rx="6" fill="#7c3aed" fill-opacity="0.3" stroke="#a78bfa" stroke-width="1.5" stroke-opacity="0.6" />
        <text x="55" y="17" fill="#ddd6fe" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${badgeFontSize}" font-weight="700" letter-spacing="1.5" text-anchor="middle">PRO IMAGE</text>
      </g>

      <!-- Bold Title Text -->
      <text
        x="48"
        y="${textY}"
        fill="#ffffff"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="${titleFontSize}"
        font-weight="900"
        letter-spacing="1"
        filter="url(#textShadow)"
      >${safeTitle}</text>
    </svg>
  `;

  return Buffer.from(svgString, 'utf8');
}

/**
 * Generates a Pro Image thumbnail for an output video clip.
 * Analyzes multiple frames, scores sharpness, and renders gradient + bold title overlays.
 *
 * @param {string} videoPath Absolute path to video clip
 * @param {string} [customThumbnailPath] Target thumbnail path (defaults to same name with .jpg)
 * @param {Object} [options]
 * @param {string} [options.title] Optional title text overlay
 * @param {number} [options.candidateCount=5] Number of frames to analyze
 * @returns {Promise<{ success: boolean, thumbnailPath?: string, error?: string, score?: number, selectedTime?: number }>}
 */
async function generateProThumbnail(videoPath, customThumbnailPath, options = {}) {
  const targetPath = customThumbnailPath || videoPath.replace(/\.[^.]+$/, '.jpg');

  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Input video not found: ${videoPath}`);
    }

    const metadata = await getVideoMetadata(videoPath);
    const duration = Math.max(0.1, metadata.duration || 1);
    const width = metadata.width || 1080;
    const height = metadata.height || 1920;

    // 1. Calculate candidate sample timestamps
    const sampleCount = Math.max(3, options.candidateCount || 5);
    const candidates = [];

    // Distribute sample points between 10% and 85% of duration
    for (let i = 1; i <= sampleCount; i++) {
      const ratio = (i / (sampleCount + 1));
      candidates.push(duration * ratio);
    }

    // 2. Extract and score candidate frames
    let bestFrameBuffer = null;
    let bestScore = -1;
    let bestTimestamp = 0;

    for (const timestamp of candidates) {
      try {
        const buffer = await extractFrameBuffer(videoPath, timestamp);
        if (buffer && buffer.length > 0) {
          const { score } = await scoreFrame(buffer);
          if (score > bestScore) {
            bestScore = score;
            bestFrameBuffer = buffer;
            bestTimestamp = timestamp;
          }
        }
      } catch (extractErr) {
        // Continue trying other candidates
      }
    }

    // Fallback if scoring didn't yield a candidate
    if (!bestFrameBuffer) {
      bestFrameBuffer = await extractFrameBuffer(videoPath, duration * 0.2);
    }

    if (!bestFrameBuffer || bestFrameBuffer.length === 0) {
      throw new Error('Could not extract any valid candidate frame from video.');
    }

    // 3. Title derivation if not supplied
    let titleText = options.title;
    if (!titleText) {
      const baseName = path.basename(videoPath, path.extname(videoPath));
      titleText = baseName.replace(/[_-]/g, ' ').trim();
    }

    // 4. Create gradient & title overlay SVG
    const overlayBuffer = createOverlaySvg({
      width,
      height,
      title: titleText,
    });

    // 5. Composite final Pro thumbnail using Sharp
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await sharp(bestFrameBuffer)
      .resize(width, height, { fit: 'cover' })
      .composite([
        {
          input: overlayBuffer,
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(targetPath);

    return {
      success: true,
      thumbnailPath: targetPath,
      score: bestScore,
      selectedTime: bestTimestamp,
    };
  } catch (err) {
    console.warn(`[ThumbnailGenerator] Warning: Thumbnail generation failed for ${videoPath}:`, err.message);
    return {
      success: false,
      error: err.message,
      thumbnailPath: null,
    };
  }
}

module.exports = {
  generateProThumbnail,
  extractFrameBuffer,
  scoreFrame,
  createOverlaySvg,
};
