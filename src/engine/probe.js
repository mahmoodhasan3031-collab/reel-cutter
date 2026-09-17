const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');

// ─── Timeout Configuration ────────────────────────────────────────────────────
const FFPROBE_TIMEOUT_MS = parseInt(process.env.REEL_CUTTER_PROBE_TIMEOUT_MS, 10) || 30 * 1000; // 30s

/**
 * Resolves the physical path of the bundled ffmpeg binary.
 * Handles both development and packaged electron (app.asar.unpacked) environments.
 */
function getFfmpegPath() {
  let p = ffmpegStatic;
  if (typeof p === 'string') {
    p = p.replace('app.asar', 'app.asar.unpacked');
  }
  return p;
}

/**
 * Resolves the physical path of the bundled ffprobe binary.
 * Handles both development and packaged electron (app.asar.unpacked) environments.
 */
function getFfprobePath() {
  let p = ffprobeStatic && ffprobeStatic.path;
  if (typeof p === 'string') {
    p = p.replace('app.asar', 'app.asar.unpacked');
  }
  return p;
}

const resolvedFfmpeg = getFfmpegPath();
if (resolvedFfmpeg) {
  ffmpeg.setFfmpegPath(resolvedFfmpeg);
}
const resolvedFfprobe = getFfprobePath();
if (resolvedFfprobe) {
  ffmpeg.setFfprobePath(resolvedFfprobe);
}

/**
 * Format raw bytes into human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Convert seconds into HH:MM:SS format.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatSeconds(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 100);

  const pad = (n) => String(n).padStart(2, '0');
  let result = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  if (ms > 0) result += `.${pad(ms)}`;
  return result;
}

/**
 * Extract fps from ffprobe fraction format like "30/1" or "24000/1001".
 * @param {string} rFrameRate
 * @returns {number}
 */
function parseFps(rFrameRate) {
  if (!rFrameRate) return 0;
  if (rFrameRate.includes('/')) {
    const [num, den] = rFrameRate.split('/').map(Number);
    return den ? parseFloat((num / den).toFixed(2)) : 0;
  }
  return parseFloat(Number(rFrameRate).toFixed(2)) || 0;
}

/**
 * Probes a video file and returns structured metadata.
 * Uses child_process.execFile for timeout control over the ffprobe process.
 * @param {string} filePath
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] Override timeout in ms
 * @returns {Promise<Object>}
 */
function getVideoMetadata(filePath, opts = {}) {
  const { execFile } = require('child_process');
  const ffprobeBin = getFfprobePath();
  const timeoutMs = opts.timeoutMs || FFPROBE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`Input file not found: ${filePath}`));
    }

    if (!ffprobeBin) {
      return reject(new Error('ffprobe binary not found'));
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const child = execFile(ffprobeBin, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
          return reject(new Error(`FFprobe timed out after ${Math.round(timeoutMs / 1000)}s for ${filePath}`));
        }
        const rawMsg = err.message || 'FFprobe error';
        const errMsg = rawMsg.length > 500 ? rawMsg.slice(0, 497) + '...' : rawMsg;
        // Ensure error message contains 'FFprobe' for downstream error handling
        const finalMsg = errMsg.includes('FFprobe')
          ? errMsg
          : `FFprobe error: ${errMsg}`;
        return reject(new Error(finalMsg));
      }

      try {
        const metadata = JSON.parse(stdout);
        const videoStream = metadata.streams.find((s) => s.codec_type === 'video') || {};
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio') || null;

        const duration = parseFloat(metadata.format.duration || videoStream.duration || 0);
        const width = videoStream.width || 0;
        const height = videoStream.height || 0;
        const fps = parseFps(videoStream.r_frame_rate || videoStream.avg_frame_rate);

        resolve({
          path: filePath,
          duration,
          durationFormatted: formatSeconds(duration),
          size: metadata.format.size || 0,
          sizeFormatted: formatBytes(metadata.format.size || 0),
          bitrate: metadata.format.bit_rate ? Math.round(metadata.format.bit_rate / 1000) + ' kbps' : 'Unknown',
          video: {
            codec: videoStream.codec_name || 'unknown',
            width,
            height,
            aspectRatio: width && height ? `${width}:${height}` : 'unknown',
            isVertical: height > width,
            fps,
            pixelFormat: videoStream.pix_fmt || 'unknown',
          },
          audio: audioStream
            ? {
                codec: audioStream.codec_name || 'unknown',
                channels: audioStream.channels || 0,
                sampleRate: audioStream.sample_rate ? audioStream.sample_rate + ' Hz' : 'unknown',
              }
            : null,
          raw: metadata,
        });
      } catch (parseErr) {
        reject(new Error(`FFprobe output parse error: ${parseErr.message}`));
      }
    });

    child.on('error', (procErr) => {
      if (procErr.killed || procErr.code === 'ETIMEDOUT') {
        reject(new Error(`FFprobe timed out after ${Math.round(timeoutMs / 1000)}s for ${filePath}`));
      } else {
        reject(procErr);
      }
    });
  });
}

module.exports = {
  getVideoMetadata,
  formatBytes,
  formatSeconds,
  parseFps,
  ffmpeg,
  getFfmpegPath,
  getFfprobePath,
  FFPROBE_TIMEOUT_MS,
};
