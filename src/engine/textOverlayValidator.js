'use strict';

/**
 * Text Overlay Validator (Phase 4A)
 *
 * Enforces strict main-process validation rules for text overlays.
 * Protects against arbitrary filter injection, path traversal, and malicious client input.
 */

const ALLOWED_FONTS = [
  'Arial',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Times New Roman',
  'Courier New'
];

const ALLOWED_POSITIONS = ['top', 'center', 'bottom', 'custom'];
const ALLOWED_ALIGNMENTS = ['left', 'center', 'right'];
const ALLOWED_WEIGHTS = ['normal', 'bold'];

const LIMITS = {
  maxOverlays: 5,
  maxTextLength: 500,
  minFontSize: 12,
  maxFontSize: 160,
  minOpacity: 0,
  maxOpacity: 1,
  minOutlineWidth: 0,
  maxOutlineWidth: 10,
  minCoord: 0,
  maxCoord: 1
};

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Factory for default overlay object
 * @param {Partial<Object>} [overrides]
 * @returns {Object}
 */
function createDefaultOverlay(overrides = {}) {
  return {
    id: `overlay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    text: '',
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 'normal',
    color: '#FFFFFF',
    opacity: 1,
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    outlineColor: '#000000',
    outlineWidth: 0,
    position: 'bottom',
    x: 0.5,
    y: 0.9,
    alignment: 'center',
    startTime: 0,
    endTime: null,
    enabled: true,
    ...overrides
  };
}

/**
 * Validates a single text overlay object.
 *
 * @param {Object} raw
 * @param {number} [index=0]
 * @param {Object} [options]
 * @param {boolean} [options.fallbackFont=false]
 * @returns {Object} Normalized, sanitized overlay
 */
function validateSingleOverlay(raw, index = 0, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Overlay at index ${index} must be an object`);
  }

  // ID validation
  let id = raw.id;
  if (!id || typeof id !== 'string') {
    id = `overlay_${Date.now()}_${index}`;
  }

  // Text validation
  if (raw.text === undefined || raw.text === null) {
    throw new Error(`Overlay "${id}": text must be a string`);
  }
  if (typeof raw.text !== 'string') {
    throw new Error(`Overlay "${id}": text must be a string`);
  }
  if (raw.text.length > LIMITS.maxTextLength) {
    throw new Error(`Overlay "${id}": Text is too long (maximum ${LIMITS.maxTextLength} characters).`);
  }

  // Font family validation
  const rawFont = raw.fontFamily || 'Arial';
  if (typeof rawFont !== 'string') {
    throw new Error(`Overlay "${id}": Font family must be a string`);
  }
  // Prevent path traversal or raw font file paths
  if (rawFont.includes('/') || rawFont.includes('\\') || /\.(ttf|otf|woff|woff2|eot)$/i.test(rawFont)) {
    throw new Error(`Overlay "${id}": Arbitrary font paths are not allowed.`);
  }

  let fontFamily = rawFont;
  if (!ALLOWED_FONTS.includes(rawFont)) {
    if (options.fallbackFont) {
      fontFamily = 'Arial';
    } else {
      throw new Error(
        `Overlay "${id}": Invalid font family "${rawFont}". Allowed fonts: ${ALLOWED_FONTS.join(', ')}.`
      );
    }
  }

  // Font size
  const rawFontSize = raw.fontSize !== undefined ? Number(raw.fontSize) : 48;
  if (isNaN(rawFontSize) || rawFontSize < LIMITS.minFontSize || rawFontSize > LIMITS.maxFontSize) {
    throw new Error(
      `Overlay "${id}": Font size must be between ${LIMITS.minFontSize} and ${LIMITS.maxFontSize}.`
    );
  }
  const fontSize = Math.round(rawFontSize);

  // Font weight
  const fontWeight = raw.fontWeight ? String(raw.fontWeight).toLowerCase().trim() : 'normal';
  if (!ALLOWED_WEIGHTS.includes(fontWeight)) {
    throw new Error(
      `Overlay "${id}": Font weight must be 'normal' or 'bold', received "${raw.fontWeight}".`
    );
  }

  // Color validation helper
  const validateHexColor = (col, fieldName, defaultCol) => {
    if (col === undefined || col === null || col === '') return defaultCol;
    if (typeof col !== 'string' || !HEX_COLOR_REGEX.test(col.trim())) {
      throw new Error(`Overlay "${id}": Invalid ${fieldName} color "${col}". Must be valid hex (e.g. #FFFFFF).`);
    }
    return col.trim().toUpperCase();
  };

  const color = validateHexColor(raw.color, 'text', '#FFFFFF');
  const backgroundColor = validateHexColor(raw.backgroundColor, 'background', '#000000');
  const outlineColor = validateHexColor(raw.outlineColor, 'outline', '#000000');

  // Opacity helper
  const validateOpacity = (val, fieldName, defaultVal) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const num = Number(val);
    if (isNaN(num) || num < LIMITS.minOpacity || num > LIMITS.maxOpacity) {
      throw new Error(`Overlay "${id}": ${fieldName} must be between 0 and 1, received ${val}.`);
    }
    return Math.round(num * 100) / 100;
  };

  const opacity = validateOpacity(raw.opacity, 'Opacity', 1);
  const backgroundOpacity = validateOpacity(raw.backgroundOpacity, 'Background opacity', 0);

  // Outline width
  const rawOutline = raw.outlineWidth !== undefined ? Number(raw.outlineWidth) : 0;
  if (isNaN(rawOutline) || rawOutline < LIMITS.minOutlineWidth || rawOutline > LIMITS.maxOutlineWidth) {
    throw new Error(
      `Overlay "${id}": Outline width must be between ${LIMITS.minOutlineWidth} and ${LIMITS.maxOutlineWidth}.`
    );
  }
  const outlineWidth = Math.round(rawOutline);

  // Position
  const position = raw.position ? String(raw.position).toLowerCase().trim() : 'bottom';
  if (!ALLOWED_POSITIONS.includes(position)) {
    throw new Error(
      `Overlay "${id}": Position must be one of: ${ALLOWED_POSITIONS.join(', ')}.`
    );
  }

  // Alignment
  const alignment = raw.alignment ? String(raw.alignment).toLowerCase().trim() : 'center';
  if (!ALLOWED_ALIGNMENTS.includes(alignment)) {
    throw new Error(
      `Overlay "${id}": Alignment must be one of: ${ALLOWED_ALIGNMENTS.join(', ')}.`
    );
  }

  // Normalized coordinates x, y
  const validateCoord = (val, coordName, defaultVal) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const num = Number(val);
    if (isNaN(num) || num < LIMITS.minCoord || num > LIMITS.maxCoord) {
      throw new Error(`Overlay "${id}": Custom coordinate ${coordName} must be between 0 and 1, received ${val}.`);
    }
    return Math.round(num * 1000) / 1000;
  };

  const x = validateCoord(raw.x, 'x', 0.5);
  const y = validateCoord(raw.y, 'y', 0.9);

  // Timing: startTime, endTime
  const rawStart = raw.startTime !== undefined && raw.startTime !== null ? Number(raw.startTime) : 0;
  if (isNaN(rawStart) || rawStart < 0) {
    throw new Error(`Overlay "${id}": Start time must be greater than or equal to 0.`);
  }
  const startTime = Math.round(rawStart * 1000) / 1000;

  let endTime = null;
  if (raw.endTime !== undefined && raw.endTime !== null && raw.endTime !== '') {
    const rawEnd = Number(raw.endTime);
    if (isNaN(rawEnd)) {
      throw new Error(`Overlay "${id}": End time must be a valid number.`);
    }
    if (rawEnd <= startTime) {
      throw new Error(`Overlay "${id}": End time must be greater than start time.`);
    }
    endTime = Math.round(rawEnd * 1000) / 1000;
  }

  const enabled = raw.enabled !== undefined ? Boolean(raw.enabled) : true;

  return {
    id,
    text: raw.text,
    fontFamily,
    fontSize,
    fontWeight,
    color,
    opacity,
    backgroundColor,
    backgroundOpacity,
    outlineColor,
    outlineWidth,
    position,
    x,
    y,
    alignment,
    startTime,
    endTime,
    enabled
  };
}

/**
 * Validates a list of overlay configurations.
 * Handles deduplication/fixing of IDs and caps count to MAX_OVERLAYS.
 *
 * @param {Array<Object>} rawOverlays
 * @param {Object} [options]
 * @param {boolean} [options.fallbackFont=false]
 * @returns {Array<Object>} Validated and normalized overlay configurations
 */
function validateTextOverlayConfig(rawOverlays, options = {}) {
  if (!rawOverlays) {
    return [];
  }

  if (!Array.isArray(rawOverlays)) {
    throw new Error('Text overlays must be an array');
  }

  if (rawOverlays.length > LIMITS.maxOverlays) {
    throw new Error(`Maximum ${LIMITS.maxOverlays} text overlays allowed.`);
  }

  const validated = [];
  const seenIds = new Set();

  for (let i = 0; i < rawOverlays.length; i++) {
    const item = validateSingleOverlay(rawOverlays[i], i, options);

    // Ensure unique ID
    if (seenIds.has(item.id)) {
      item.id = `${item.id}_${i + 1}`;
    }
    seenIds.add(item.id);

    validated.push(item);
  }

  return validated;
}

module.exports = {
  ALLOWED_FONTS,
  ALLOWED_POSITIONS,
  ALLOWED_ALIGNMENTS,
  ALLOWED_WEIGHTS,
  LIMITS,
  createDefaultOverlay,
  validateSingleOverlay,
  validateTextOverlayConfig
};
