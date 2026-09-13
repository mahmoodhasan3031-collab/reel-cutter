'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateSingleOverlay,
  validateTextOverlayConfig,
  ALLOWED_FONTS,
  ALLOWED_POSITIONS,
  ALLOWED_ALIGNMENTS,
  ALLOWED_WEIGHTS,
  LIMITS,
  createDefaultOverlay
} = require('./textOverlayValidator');

/**
 * Font filename mapping on Windows
 */
const FONT_FILE_MAP = {
  'Arial': { normal: 'arial.ttf', bold: 'arialbd.ttf' },
  'Verdana': { normal: 'verdana.ttf', bold: 'verdanab.ttf' },
  'Tahoma': { normal: 'tahoma.ttf', bold: 'tahomabd.ttf' },
  'Georgia': { normal: 'georgia.ttf', bold: 'georgiab.ttf' },
  'Times New Roman': { normal: 'times.ttf', bold: 'timesbd.ttf' },
  'Courier New': { normal: 'cour.ttf', bold: 'courbd.ttf' }
};

/**
 * Escapes characters for FFmpeg drawtext filter string
 *
 * @param {string} text
 * @returns {string}
 */
function escapeFfmpegText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r\n|\r|\n/g, '\\\n');
}

/**
 * Resolves a safe system font path on the main process.
 * Never trusts raw paths from renderer.
 *
 * @param {string} fontFamily
 * @param {string} [fontWeight='normal']
 * @returns {{ fontfile?: string, font?: string }}
 */
function resolveFontConfig(fontFamily, fontWeight = 'normal') {
  const safeFont = ALLOWED_FONTS.includes(fontFamily) ? fontFamily : 'Arial';
  const weight = fontWeight === 'bold' ? 'bold' : 'normal';

  if (process.platform === 'win32') {
    const windir = process.env.WINDIR || 'C:\\Windows';
    const fontFiles = FONT_FILE_MAP[safeFont] || FONT_FILE_MAP['Arial'];
    const filename = fontFiles[weight] || fontFiles.normal;
    const fullPath = path.join(windir, 'Fonts', filename).replace(/\\/g, '/');

    if (fs.existsSync(fullPath)) {
      // Escape colon in Windows drive letter (e.g. C\:/Windows/Fonts/...)
      const escapedPath = fullPath.replace(/:/g, '\\:');
      return { fontfile: `'${escapedPath}'` };
    }

    // Fallback to Arial if specific font file missing
    const arialPath = path.join(windir, 'Fonts', weight === 'bold' ? 'arialbd.ttf' : 'arial.ttf').replace(/\\/g, '/');
    if (fs.existsSync(arialPath)) {
      return { fontfile: `'${arialPath.replace(/:/g, '\\:')}'` };
    }
  }

  // Fallback to font name for fontconfig/system lookup
  return { font: `'${safeFont}'` };
}

/**
 * Converts a hex color (#FFFFFF or #FFF) to FFmpeg 0x format (0xFFFFFF).
 *
 * @param {string} hex
 * @returns {string}
 */
function toFfmpegColor(hex) {
  if (!hex || typeof hex !== 'string') return '0xFFFFFF';
  let clean = hex.trim().replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  return `0x${clean.toUpperCase()}`;
}

/**
 * Builds an individual drawtext filter string for a single overlay.
 *
 * @param {Object} rawOverlay
 * @param {number} [clipDuration]
 * @returns {string|null}
 */
function buildDrawTextFilter(rawOverlay, clipDuration) {
  if (!rawOverlay) return null;

  const overlay = validateSingleOverlay(rawOverlay, 0, { fallbackFont: true });

  // Do not render empty text or disabled overlays
  if (!overlay.enabled || !overlay.text || !overlay.text.trim()) {
    return null;
  }

  // If clipDuration is known and startTime is beyond clip, skip
  if (typeof clipDuration === 'number' && clipDuration > 0) {
    if (overlay.startTime >= clipDuration) {
      return null;
    }
  }

  const parts = [];

  // Font
  const fontConf = resolveFontConfig(overlay.fontFamily, overlay.fontWeight);
  if (fontConf.fontfile) {
    parts.push(`fontfile=${fontConf.fontfile}`);
  } else if (fontConf.font) {
    parts.push(`font=${fontConf.font}`);
  }

  // Text
  const escapedText = escapeFfmpegText(overlay.text);
  parts.push(`text='${escapedText}'`);

  // Font Size
  parts.push(`fontsize=${overlay.fontSize}`);

  // Font Color & Opacity
  const fontColor = toFfmpegColor(overlay.color);
  parts.push(`fontcolor='${fontColor}@${overlay.opacity}'`);

  // Positioning & Alignment
  let xExpr = '(w-text_w)/2';
  let yExpr = '(h-text_h)*0.90';

  if (overlay.position === 'top') {
    yExpr = '(h-text_h)*0.10';
    if (overlay.alignment === 'left') xExpr = 'w*0.05';
    else if (overlay.alignment === 'right') xExpr = 'w*0.95-text_w';
    else xExpr = '(w-text_w)/2';
  } else if (overlay.position === 'center') {
    yExpr = '(h-text_h)*0.50';
    if (overlay.alignment === 'left') xExpr = 'w*0.05';
    else if (overlay.alignment === 'right') xExpr = 'w*0.95-text_w';
    else xExpr = '(w-text_w)/2';
  } else if (overlay.position === 'bottom') {
    yExpr = '(h-text_h)*0.90';
    if (overlay.alignment === 'left') xExpr = 'w*0.05';
    else if (overlay.alignment === 'right') xExpr = 'w*0.95-text_w';
    else xExpr = '(w-text_w)/2';
  } else if (overlay.position === 'custom') {
    yExpr = `(h-text_h)*${overlay.y}`;
    if (overlay.alignment === 'left') xExpr = `w*${overlay.x}`;
    else if (overlay.alignment === 'right') xExpr = `w*${overlay.x}-text_w`;
    else xExpr = `(w-text_w)*${overlay.x}`;
  }

  parts.push(`x=${xExpr}`);
  parts.push(`y=${yExpr}`);

  // Background Box
  if (overlay.backgroundOpacity > 0) {
    const bgColor = toFfmpegColor(overlay.backgroundColor);
    parts.push('box=1');
    parts.push(`boxcolor='${bgColor}@${overlay.backgroundOpacity}'`);
    parts.push('boxborderw=8');
  }

  // Outline / Border
  if (overlay.outlineWidth > 0) {
    const outlineCol = toFfmpegColor(overlay.outlineColor);
    parts.push(`borderw=${overlay.outlineWidth}`);
    parts.push(`bordercolor='${outlineCol}'`);
  }

  // Timing
  if (overlay.endTime !== null && overlay.endTime !== undefined) {
    let effectiveEnd = overlay.endTime;
    if (typeof clipDuration === 'number' && clipDuration > 0) {
      effectiveEnd = Math.min(effectiveEnd, clipDuration);
    }
    parts.push(`enable='between(t,${overlay.startTime},${effectiveEnd})'`);
  } else if (overlay.startTime > 0) {
    parts.push(`enable='gte(t,${overlay.startTime})'`);
  }

  return `drawtext=${parts.join(':')}`;
}

/**
 * Builds an array of FFmpeg drawtext filter strings for a collection of overlays.
 *
 * @param {Array<Object>} rawOverlays
 * @param {number} [clipDuration]
 * @returns {Array<string>} Array of drawtext filter expressions
 */
function buildTextOverlayFilters(rawOverlays, clipDuration) {
  if (!rawOverlays || !Array.isArray(rawOverlays) || rawOverlays.length === 0) {
    return [];
  }

  const validated = validateTextOverlayConfig(rawOverlays, { fallbackFont: true });
  const filters = [];

  for (const item of validated) {
    const filterStr = buildDrawTextFilter(item, clipDuration);
    if (filterStr) {
      filters.push(filterStr);
    }
  }

  return filters;
}

module.exports = {
  escapeFfmpegText,
  resolveFontConfig,
  toFfmpegColor,
  buildDrawTextFilter,
  buildTextOverlayFilters,
  ALLOWED_FONTS,
  ALLOWED_POSITIONS,
  ALLOWED_ALIGNMENTS,
  ALLOWED_WEIGHTS,
  LIMITS,
  createDefaultOverlay,
  validateSingleOverlay,
  validateTextOverlayConfig
};
