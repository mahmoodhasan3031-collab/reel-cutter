const path = require('path');
const fs = require('fs');
const { ffmpeg, getVideoMetadata } = require('./probe');
const { parseTimeToSeconds, buildReelFilter, generateOutputFilename } = require('./formatter');
const { generateProThumbnail } = require('./thumbnailGenerator');

/**
 * Cuts a single clip from a video file with optional 9:16 vertical reel formatting.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {Object} [options]
 * @param {string|number} [options.start=0] Start time in seconds or HH:MM:SS
 * @param {string|number} [options.duration] Duration in seconds or HH:MM:SS
 * @param {string|number} [options.end] End time in seconds or HH:MM:SS (if duration is not provided)
 * @param {boolean} [options.reel=false] Whether to transform to 9:16 vertical reel format
 * @param {'blur'|'crop'|'pad'} [options.mode='blur'] Reel format layout mode
 * @param {number} [options.width=1080] Output width
 * @param {number} [options.height=1920] Output height
 * @param {Function} [options.onProgress] Callback receiving progress percentage (0 - 100)
 * @returns {Promise<{ outputPath: string, duration: number, metadata: Object }>}
 */
async function cutClip(inputPath, outputPath, options = {}) {
  const metadata = await getVideoMetadata(inputPath);
  const totalDuration = metadata.duration;

  const startSeconds = parseTimeToSeconds(options.start || 0);

  let durationSeconds;
  if (options.duration !== undefined && options.duration !== null) {
    durationSeconds = parseTimeToSeconds(options.duration);
  } else if (options.end !== undefined && options.end !== null) {
    const endSeconds = parseTimeToSeconds(options.end);
    durationSeconds = Math.max(0, endSeconds - startSeconds);
  } else {
    durationSeconds = Math.max(0, totalDuration - startSeconds);
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (startSeconds > 0) {
      command = command.setStartTime(startSeconds);
    }
    if (durationSeconds > 0) {
      command = command.setDuration(durationSeconds);
    }

    if (options.reel) {
      const mode = options.mode || 'blur';
      const width = options.width || 1080;
      const height = options.height || 1920;

      if (mode === 'blur') {
        const complexFilterStr = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:5[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]`;
        command = command
          .complexFilter(complexFilterStr)
          .outputOptions(['-map [outv]', '-map 0:a?', '-c:v libx264', '-preset veryfast', '-crf 22', '-c:a aac', '-b:a 192k']);
      } else {
        const { filter } = buildReelFilter({ mode, width, height });
        command = command
          .videoFilters(filter)
          .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 22', '-c:a aac', '-b:a 192k']);
      }
    } else {
      command = command
        .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 22', '-c:a aac', '-b:a 192k']);
    }

    command
      .output(outputPath)
      .on('start', (cmdLine) => {
        // command initiated
      })
      .on('progress', (progress) => {
        if (options.onProgress) {
          let percent = progress.percent;
          if (percent === undefined && progress.timemark && durationSeconds > 0) {
            const currentSeconds = parseTimeToSeconds(progress.timemark);
            percent = Math.min(100, Math.round((currentSeconds / durationSeconds) * 100));
          }
          options.onProgress(Math.min(100, Math.max(0, Math.round(percent || 0))));
        }
      })
      .on('end', async () => {
        let thumbnailPath = null;
        if (options.generateThumbnail) {
          try {
            const thumbRes = await generateProThumbnail(outputPath, options.thumbnailPath, {
              title: options.thumbnailTitle,
            });
            if (thumbRes.success) {
              thumbnailPath = thumbRes.thumbnailPath;
            }
          } catch (thumbErr) {
            console.warn('[Cutter] Graceful fallback: Thumbnail generation error:', thumbErr.message);
          }
        }

        try {
          const outMeta = await getVideoMetadata(outputPath);
          resolve({
            outputPath,
            duration: outMeta.duration,
            metadata: outMeta,
            thumbnailPath,
          });
        } catch {
          resolve({
            outputPath,
            duration: durationSeconds,
            metadata: null,
            thumbnailPath,
          });
        }
      })
      .on('error', (err, stdout, stderr) => {
        reject(new Error(`FFmpeg error: ${err.message}\n${stderr || ''}`));
      })
      .run();
  });
}

/**
 * Splits a video into multiple reels of specified interval.
 *
 * @param {string} inputPath
 * @param {string} outputDir
 * @param {Object} [options]
 * @param {number|string} [options.interval=30] Length of each reel in seconds
 * @param {boolean} [options.reel=true] Whether to format as 9:16 vertical reels
 * @param {'blur'|'crop'|'pad'} [options.mode='blur']
 * @param {Function} [options.onSegmentComplete] Callback when a segment completes
 * @param {Function} [options.onOverallProgress] Callback receiving overall progress
 * @returns {Promise<Array<{ index: number, outputPath: string, duration: number }>>}
 */
async function splitIntoReels(inputPath, outputDir, options = {}) {
  const metadata = await getVideoMetadata(inputPath);
  const totalDuration = metadata.duration;

  if (totalDuration <= 0) {
    throw new Error('Video duration is 0 or could not be determined.');
  }

  const interval = parseTimeToSeconds(options.interval || 30);
  if (interval <= 0) {
    throw new Error('Interval must be greater than 0.');
  }

  const totalSegments = Math.ceil(totalDuration / interval);
  const results = [];

  for (let i = 0; i < totalSegments; i++) {
    const start = i * interval;
    const duration = Math.min(interval, totalDuration - start);

    const outFilename = generateOutputFilename(inputPath, {
      index: i + 1,
      suffix: options.reel ? 'reel' : 'clip',
      outputDir,
    });

    if (options.onOverallProgress) {
      options.onOverallProgress({
        current: i + 1,
        total: totalSegments,
        start,
        duration,
      });
    }

    const res = await cutClip(inputPath, outFilename, {
      start,
      duration,
      reel: options.reel !== undefined ? options.reel : true,
      mode: options.mode || 'blur',
      width: options.width,
      height: options.height,
      generateThumbnail: options.generateThumbnail,
      thumbnailTitle: options.thumbnailTitle ? `${options.thumbnailTitle} Part ${i + 1}` : undefined,
    });

    results.push({
      index: i + 1,
      outputPath: res.outputPath,
      duration: res.duration,
      thumbnailPath: res.thumbnailPath || null,
    });

    if (options.onSegmentComplete) {
      options.onSegmentComplete(results[results.length - 1]);
    }
  }

  return results;
}

module.exports = {
  cutClip,
  splitIntoReels,
};
