const path = require('path');

/**
 * Parses time string (e.g. "90", "1:30", "01:30", "00:01:30", "00:01:30.500") into total seconds.
 * @param {string|number} timeInput
 * @returns {number}
 */
function parseTimeToSeconds(timeInput) {
  if (timeInput === null || timeInput === undefined) return 0;
  if (typeof timeInput === 'number') return Math.max(0, timeInput);

  const str = String(timeInput).trim();
  if (!str) return 0;

  // Pure number check (e.g., "45" or "12.5")
  if (/^\d+(\.\d+)?$/.test(str)) {
    return parseFloat(str);
  }

  // Format HH:MM:SS or MM:SS
  const parts = str.split(':').map((part) => parseFloat(part));
  if (parts.some((p) => isNaN(p))) {
    throw new Error(`Invalid time format "${timeInput}". Expected seconds (e.g. 45) or HH:MM:SS (e.g. 00:01:30).`);
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 1) {
    return parts[0];
  }

  throw new Error(`Invalid time format "${timeInput}". Expected seconds or HH:MM:SS.`);
}

/**
 * Converts seconds into a formatted string (HH:MM:SS).
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatSecondsToTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Generates an output filename given input video path, index or label, and directory.
 * @param {string} inputPath
 * @param {Object} options
 * @param {number} [options.index]
 * @param {string} [options.suffix]
 * @param {string} [options.outputDir]
 * @returns {string}
 */
function generateOutputFilename(inputPath, options = {}) {
  const parsed = path.parse(inputPath);
  const outDir = options.outputDir || parsed.dir || '.';
  const indexStr = options.index !== undefined ? `_${String(options.index).padStart(2, '0')}` : '';
  const suffix = options.suffix ? `_${options.suffix}` : '';
  const baseName = options.baseName || parsed.name;
  const filename = `${baseName}${indexStr}${suffix}${parsed.ext || '.mp4'}`;
  return path.join(outDir, filename);
}

/**
 * Builds video filter string or complex filter for 9:16 vertical reel formatting.
 * @param {Object} options
 * @param {'blur'|'crop'|'pad'} [options.mode='blur']
 * @param {number} [options.width=1080]
 * @param {number} [options.height=1920]
 * @returns {{ isComplex: boolean, filter: string }}
 */
function buildReelFilter(options = {}) {
  const mode = (options.mode || 'blur').toLowerCase();
  const width = options.width || 1080;
  const height = options.height || 1920;

  switch (mode) {
    case 'crop':
      return {
        isComplex: false,
        filter: `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
      };

    case 'pad':
    case 'fit':
      return {
        isComplex: false,
        filter: `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(${width}-iw)/2:(${height}-ih)/2:black`,
      };

    case 'blur':
    default:
      return {
        isComplex: true,
        filter: `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:5[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`,
      };
  }
}

/**
 * Resolves width & height from aspect ratio & quality.
 * @param {string} [aspectRatio='9:16']
 * @param {string} [quality='1080p']
 * @returns {{ width: number, height: number }}
 */
function resolveDimensions(aspectRatio = '9:16', quality = '1080p') {
  const is4k = String(quality || '').toLowerCase().includes('4k');
  switch (aspectRatio) {
    case '1:1':
      return is4k ? { width: 2160, height: 2160 } : { width: 1080, height: 1080 };
    case '4:5':
      return is4k ? { width: 2160, height: 2700 } : { width: 1080, height: 1350 };
    case '16:9':
      return is4k ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 };
    case '9:16':
    default:
      return is4k ? { width: 2160, height: 3840 } : { width: 1080, height: 1920 };
  }
}

module.exports = {
  parseTimeToSeconds,
  formatSecondsToTime,
  generateOutputFilename,
  buildReelFilter,
  resolveDimensions,
};
