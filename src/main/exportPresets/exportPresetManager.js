'use strict';

/**
 * Export Preset Manager — Phase 5B
 *
 * Production-ready unified Export Preset System for Reel Cutter.
 * Captures full export configurations including aspect ratio, resolution, quality,
 * layout mode, smart crop, content variation, variation preset reference, caption template,
 * text overlays, audio settings, and export type.
 *
 * Provides validated, immutable built-in presets and persistent custom presets.
 * Persists custom presets to export-presets.json in Electron userData (or customDir for tests).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {
  validateProductVariationConfig,
  DEFAULT_PRODUCT_VARIATION,
} = require('../../engine/variation/validator');
const { validateTextOverlayConfig } = require('../../engine/textOverlayValidator');
const { getVariationPreset } = require('../variations/variationPresetManager');
const { getCaptionTemplate } = require('../captions/captionTemplateManager');
const logger = require('../logger');

const EXPORT_PRESETS_FILENAME = 'export-presets.json';
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 1;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_CUSTOM_PRESETS = 50;

const VALID_ASPECT_RATIOS = ['9:16', '1:1', '4:5', '16:9'];
const VALID_RESOLUTIONS = ['1080p', '4k'];
const VALID_QUALITIES = ['1080p', '4k', 'standard', 'high', 'medium'];
const VALID_MODES = ['blur', 'crop', 'pad', 'smart_crop'];
const VALID_EXPORT_TYPES = ['cut', 'reel', 'split'];

let _counter = 0;
function generateExportPresetId() {
  return `exp_preset_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Deep clones an object using JSON serialization to prevent mutable cross-references.
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  if (obj === undefined) return undefined;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Guard against prototype pollution attempts in JSON payloads.
 * Throws an error if dangerous keys are encountered.
 * @param {*} obj
 */
function assertNoPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return;
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (dangerous.includes(key)) {
      throw new Error(`Prototype pollution attempt rejected: illegal key "${key}"`);
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      assertNoPrototypePollution(obj[key]);
    }
  }
}

/**
 * 6 Canonical, Immutable Built-in Export Presets (Phase 5B)
 *
 * 1. Vertical 1080p     — 9:16, 1080p, blur mode, reel
 * 2. Vertical 4K         — 9:16, 4k, blur mode, reel
 * 3. Square 1080p        — 1:1, 1080p, pad mode, reel
 * 4. Landscape 1080p     — 16:9, 1080p, crop mode, cut
 * 5. Social Caption      — 9:16, 1080p, blur mode, bright variation, social caption
 * 6. Clean Repurpose     — 9:16, 1080p, crop mode, punchy variation
 */
const CANONICAL_BUILTIN_EXPORT_PRESETS = [
  {
    id: 'exp_builtin_vertical_1080p',
    name: 'Vertical 1080p',
    description: 'Standard 9:16 vertical full HD format for Reels, Shorts, and Stories.',
    isBuiltIn: true,
    settings: {
      aspectRatio: '9:16',
      resolution: '1080p',
      quality: '1080p',
      mode: 'blur',
      smartCrop: false,
      exportType: 'reel',
      variation: {
        enabled: false,
        brightness: 0.0,
        saturation: 1.0,
        hue: 0.0,
        pitch: 0.0,
        speed: 1.00,
        mode: 'center',
        crop: 0.0,
        cleanMetadata: true,
      },
      variationPresetId: null,
      captionTemplateId: null,
      textOverlays: [],
      audio: {
        preservePitch: true,
        normalizeAudio: false,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'exp_builtin_vertical_4k',
    name: 'Vertical 4K',
    description: 'High-fidelity 9:16 4K Ultra HD vertical export for premium short-form distribution.',
    isBuiltIn: true,
    settings: {
      aspectRatio: '9:16',
      resolution: '4k',
      quality: '4k',
      mode: 'blur',
      smartCrop: false,
      exportType: 'reel',
      variation: {
        enabled: false,
        brightness: 0.0,
        saturation: 1.0,
        hue: 0.0,
        pitch: 0.0,
        speed: 1.00,
        mode: 'center',
        crop: 0.0,
        cleanMetadata: true,
      },
      variationPresetId: null,
      captionTemplateId: null,
      textOverlays: [],
      audio: {
        preservePitch: true,
        normalizeAudio: false,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'exp_builtin_square_1080p',
    name: 'Square 1080p',
    description: 'Balanced 1:1 square full HD format optimized for social feeds and carousels.',
    isBuiltIn: true,
    settings: {
      aspectRatio: '1:1',
      resolution: '1080p',
      quality: '1080p',
      mode: 'pad',
      smartCrop: false,
      exportType: 'reel',
      variation: {
        enabled: false,
        brightness: 0.0,
        saturation: 1.0,
        hue: 0.0,
        pitch: 0.0,
        speed: 1.00,
        mode: 'center',
        crop: 0.0,
        cleanMetadata: true,
      },
      variationPresetId: null,
      captionTemplateId: null,
      textOverlays: [],
      audio: {
        preservePitch: true,
        normalizeAudio: false,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'exp_builtin_landscape_1080p',
    name: 'Landscape 1080p',
    description: 'Standard 16:9 widescreen full HD presentation for YouTube and desktop viewing.',
    isBuiltIn: true,
    settings: {
      aspectRatio: '16:9',
      resolution: '1080p',
      quality: '1080p',
      mode: 'crop',
      smartCrop: false,
      exportType: 'cut',
      variation: {
        enabled: false,
        brightness: 0.0,
        saturation: 1.0,
        hue: 0.0,
        pitch: 0.0,
        speed: 1.00,
        mode: 'center',
        crop: 0.0,
        cleanMetadata: true,
      },
      variationPresetId: null,
      captionTemplateId: null,
      textOverlays: [],
      audio: {
        preservePitch: true,
        normalizeAudio: false,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'exp_builtin_social_caption',
    name: 'Social Caption',
    description: 'Vertical 9:16 format with subtle bright variation and readable social caption overlay.',
    isBuiltIn: true,
    settings: {
      aspectRatio: '9:16',
      resolution: '1080p',
      quality: '1080p',
      mode: 'blur',
      smartCrop: false,
      exportType: 'reel',
      variation: {
        enabled: true,
        brightness: 0.05,
        saturation: 1.1,
        hue: 0.0,
        pitch: 0.0,
        speed: 1.00,
        mode: 'center',
        crop: 0.0,
        cleanMetadata: true,
      },
      variationPresetId: 'vpreset_builtin_bright',
      captionTemplateId: 'tpl_builtin_social',
      textOverlays: [
        {
          id: 'soc_ov_1',
          text: 'Captivating Hook Here',
          fontSize: 48,
          fontColor: '#FFFFFF',
          fontFamily: 'Arial',
          position: 'bottom',
          marginV: 60,
          lineSpacing: 1.2,
        },
      ],
      audio: {
        preservePitch: true,
        normalizeAudio: false,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'exp_builtin_clean_repurpose',
    name: 'Clean Repurpose',
    description: 'Full HD vertical clip with subtle punchy color and center reframe for multi-platform publishing.',
    isBuiltIn: true,
    settings: {
      aspectRatio: '9:16',
      resolution: '1080p',
      quality: '1080p',
      mode: 'crop',
      smartCrop: false,
      exportType: 'reel',
      variation: {
        enabled: true,
        brightness: 0.05,
        saturation: 1.2,
        hue: 0.0,
        pitch: 0.0,
        speed: 1.00,
        mode: 'center',
        crop: 0.0,
        cleanMetadata: true,
      },
      variationPresetId: 'vpreset_builtin_punchy',
      captionTemplateId: null,
      textOverlays: [],
      audio: {
        preservePitch: true,
        normalizeAudio: false,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const BUILTIN_EXPORT_PRESET_IDS = new Set(CANONICAL_BUILTIN_EXPORT_PRESETS.map((p) => p.id));

/**
 * Resolves the path to the export-presets.json file.
 * @param {string} [customDir]
 * @returns {string}
 */
function getExportPresetsFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, EXPORT_PRESETS_FILENAME);
  }
  try {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, EXPORT_PRESETS_FILENAME);
  } catch {
    return path.join(process.cwd(), EXPORT_PRESETS_FILENAME);
  }
}

/**
 * Validates preset name.
 * @param {*} name
 * @returns {string}
 */
function validatePresetName(name) {
  if (typeof name !== 'string') {
    throw new Error('Preset name is required and must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) {
    throw new Error('Preset name cannot be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Preset name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Validates preset description.
 * @param {*} desc
 * @returns {string}
 */
function validatePresetDescription(desc) {
  if (desc === undefined || desc === null) return '';
  if (typeof desc !== 'string') {
    throw new Error('Preset description must be a string');
  }
  const trimmed = desc.trim();
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Preset description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Returns safe export preset settings defaults.
 * @returns {Object}
 */
function getSafeExportPresetDefaults() {
  return {
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: '1080p',
    mode: 'blur',
    smartCrop: false,
    exportType: 'reel',
    variation: {
      ...DEFAULT_PRODUCT_VARIATION,
      enabled: false,
    },
    variationPresetId: null,
    captionTemplateId: null,
    textOverlays: [],
    audio: {
      preservePitch: true,
      normalizeAudio: false,
    },
  };
}

/**
 * Normalizes export preset settings, ensuring safe defaults for all fields.
 * Prevents mutation and missing properties.
 * @param {Object} [rawSettings]
 * @param {string} [customDir]
 * @returns {Object} canonical normalized settings
 */
function normalizeExportSettings(rawSettings = {}, customDir) {
  assertNoPrototypePollution(rawSettings);

  const defaults = getSafeExportPresetDefaults();
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    return defaults;
  }

  // 1. Aspect Ratio
  let aspectRatio = defaults.aspectRatio;
  if (typeof rawSettings.aspectRatio === 'string') {
    const matchedAspect = VALID_ASPECT_RATIOS.find(
      (a) => a.toLowerCase() === rawSettings.aspectRatio.trim().toLowerCase()
    );
    if (matchedAspect) aspectRatio = matchedAspect;
  }

  // 2. Resolution
  let resolution = defaults.resolution;
  if (typeof rawSettings.resolution === 'string') {
    const matchedRes = VALID_RESOLUTIONS.find(
      (r) => r.toLowerCase() === rawSettings.resolution.trim().toLowerCase()
    );
    if (matchedRes) resolution = matchedRes;
  }

  // 3. Quality
  let quality = defaults.quality;
  if (typeof rawSettings.quality === 'string') {
    const matchedQ = VALID_QUALITIES.find(
      (q) => q.toLowerCase() === rawSettings.quality.trim().toLowerCase()
    );
    if (matchedQ) quality = matchedQ;
  } else if (resolution) {
    quality = resolution;
  }

  // 4. Mode
  let mode = defaults.mode;
  if (typeof rawSettings.mode === 'string') {
    const matchedMode = VALID_MODES.find(
      (m) => m.toLowerCase() === rawSettings.mode.trim().toLowerCase()
    );
    if (matchedMode) mode = matchedMode;
  }

  // 5. Smart Crop
  let smartCrop = mode === 'smart_crop' || Boolean(rawSettings.smartCrop);
  if (mode === 'smart_crop') {
    smartCrop = true;
  }

  // 6. Export Type
  let exportType = defaults.exportType;
  if (typeof rawSettings.exportType === 'string') {
    const matchedType = VALID_EXPORT_TYPES.find(
      (t) => t.toLowerCase() === rawSettings.exportType.trim().toLowerCase()
    );
    if (matchedType) exportType = matchedType;
  }

  // 7. Variation Preset ID
  let variationPresetId = null;
  if (typeof rawSettings.variationPresetId === 'string' && rawSettings.variationPresetId.trim()) {
    const trimmedId = rawSettings.variationPresetId.trim();
    try {
      const vPreset = getVariationPreset(trimmedId, customDir);
      if (vPreset) variationPresetId = vPreset.id;
    } catch (_) {}
  }

  // 8. Variation Config
  let variation = { ...defaults.variation };
  if (rawSettings.variation && typeof rawSettings.variation === 'object') {
    try {
      const validatedVar = validateProductVariationConfig({
        ...DEFAULT_PRODUCT_VARIATION,
        ...rawSettings.variation,
      });
      if (validatedVar && validatedVar.valid) {
        variation = deepClone(validatedVar.config);
      }
    } catch (_) {
      // If validation fails, keep safe defaults
    }
  } else if (variationPresetId) {
    try {
      const vPreset = getVariationPreset(variationPresetId, customDir);
      if (vPreset?.variation) {
        variation = deepClone(vPreset.variation);
      }
    } catch (_) {}
  }

  // 9. Caption Template ID
  let captionTemplateId = null;
  if (typeof rawSettings.captionTemplateId === 'string' && rawSettings.captionTemplateId.trim()) {
    const trimmedTplId = rawSettings.captionTemplateId.trim();
    try {
      const tpl = getCaptionTemplate(trimmedTplId, customDir);
      if (tpl) captionTemplateId = tpl.id;
    } catch (_) {}
  }

  // 10. Text Overlays
  let textOverlays = [];
  if (Array.isArray(rawSettings.textOverlays) && rawSettings.textOverlays.length > 0) {
    try {
      const validatedOverlays = validateTextOverlayConfig(rawSettings.textOverlays, { fallbackFont: true });
      if (Array.isArray(validatedOverlays)) {
        textOverlays = deepClone(validatedOverlays);
      }
    } catch (_) {
      textOverlays = [];
    }
  } else if (captionTemplateId) {
    try {
      const tpl = getCaptionTemplate(captionTemplateId, customDir);
      if (Array.isArray(tpl?.overlays)) {
        textOverlays = deepClone(tpl.overlays);
      }
    } catch (_) {}
  }

  // 11. Audio
  const audio = {
    preservePitch:
      rawSettings.audio?.preservePitch !== undefined
        ? Boolean(rawSettings.audio.preservePitch)
        : defaults.audio.preservePitch,
    normalizeAudio:
      rawSettings.audio?.normalizeAudio !== undefined
        ? Boolean(rawSettings.audio.normalizeAudio)
        : defaults.audio.normalizeAudio,
  };

  return {
    aspectRatio,
    resolution,
    quality,
    mode,
    smartCrop,
    exportType,
    variation,
    variationPresetId,
    captionTemplateId,
    textOverlays,
    audio,
  };
}

/**
 * Strictly validates export preset settings.
 * Main process authoritative verification.
 * Throws detailed error if any parameter is invalid.
 *
 * @param {*} settings
 * @param {string} [customDir]
 * @returns {Object} normalized valid settings
 */
function validateExportPresetSettings(settings, customDir) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Export preset settings must be a non-null object');
  }

  assertNoPrototypePollution(settings);

  // Validate aspect ratio
  if (settings.aspectRatio !== undefined) {
    if (typeof settings.aspectRatio !== 'string' || !VALID_ASPECT_RATIOS.includes(settings.aspectRatio)) {
      throw new Error(`Invalid aspectRatio "${settings.aspectRatio}". Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}`);
    }
  }

  // Validate resolution
  if (settings.resolution !== undefined) {
    if (typeof settings.resolution !== 'string' || !VALID_RESOLUTIONS.includes(settings.resolution)) {
      throw new Error(`Invalid resolution "${settings.resolution}". Must be one of: ${VALID_RESOLUTIONS.join(', ')}`);
    }
  }

  // Validate quality
  if (settings.quality !== undefined) {
    if (typeof settings.quality !== 'string' || !VALID_QUALITIES.includes(settings.quality)) {
      throw new Error(`Invalid quality "${settings.quality}". Must be one of: ${VALID_QUALITIES.join(', ')}`);
    }
  }

  // Validate mode
  if (settings.mode !== undefined) {
    if (typeof settings.mode !== 'string' || !VALID_MODES.includes(settings.mode)) {
      throw new Error(`Invalid mode "${settings.mode}". Must be one of: ${VALID_MODES.join(', ')}`);
    }
  }

  // Validate export type
  if (settings.exportType !== undefined) {
    if (typeof settings.exportType !== 'string' || !VALID_EXPORT_TYPES.includes(settings.exportType)) {
      throw new Error(`Invalid exportType "${settings.exportType}". Must be one of: ${VALID_EXPORT_TYPES.join(', ')}`);
    }
  }

  // Validate variation config if provided
  if (settings.variation !== undefined) {
    if (typeof settings.variation !== 'object' || settings.variation === null || Array.isArray(settings.variation)) {
      throw new Error('Variation settings must be an object');
    }
    const varRes = validateProductVariationConfig(settings.variation);
    if (!varRes || !varRes.valid) {
      throw new Error('Variation configuration failed engine validation');
    }
  }

  // Validate variationPresetId if provided
  if (settings.variationPresetId !== undefined && settings.variationPresetId !== null && settings.variationPresetId !== '') {
    if (typeof settings.variationPresetId !== 'string') {
      throw new Error('variationPresetId must be a string or null');
    }
    const vPreset = getVariationPreset(settings.variationPresetId, customDir);
    if (!vPreset) {
      throw new Error(`Variation preset not found: ${settings.variationPresetId}`);
    }
  }

  // Validate captionTemplateId if provided
  if (settings.captionTemplateId !== undefined && settings.captionTemplateId !== null && settings.captionTemplateId !== '') {
    if (typeof settings.captionTemplateId !== 'string') {
      throw new Error('captionTemplateId must be a string or null');
    }
    const tpl = getCaptionTemplate(settings.captionTemplateId, customDir);
    if (!tpl) {
      throw new Error(`Caption template not found: ${settings.captionTemplateId}`);
    }
  }

  // Validate text overlays if provided
  if (settings.textOverlays !== undefined && settings.textOverlays !== null) {
    if (!Array.isArray(settings.textOverlays)) {
      throw new Error('textOverlays must be an array');
    }
    validateTextOverlayConfig(settings.textOverlays);
  }

  // Validate audio settings if provided
  if (settings.audio !== undefined) {
    if (typeof settings.audio !== 'object' || settings.audio === null || Array.isArray(settings.audio)) {
      throw new Error('Audio settings must be an object');
    }
  }

  return normalizeExportSettings(settings, customDir);
}

/**
 * Validates complete preset input data for create or update.
 * @param {Object} input
 * @param {boolean} [isUpdate=false]
 * @param {string} [customDir]
 * @returns {{ name: string|undefined, description: string|undefined, settings: Object|undefined }}
 */
function validateExportPresetInput(input, isUpdate = false, customDir) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Preset input must be a non-null object');
  }

  assertNoPrototypePollution(input);

  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'function') {
      throw new Error(`Invalid property ${k}: functions are not allowed`);
    }
  }

  let name;
  if (!isUpdate || input.name !== undefined) {
    name = validatePresetName(input.name);
  }

  let description;
  if (input.description !== undefined) {
    description = validatePresetDescription(input.description);
  }

  let settings;
  if (!isUpdate || input.settings !== undefined) {
    settings = validateExportPresetSettings(input.settings || {}, customDir);
  }

  return { name, description, settings };
}

/**
 * Loads custom presets from disk.
 * Recovers gracefully from corrupt, empty, or missing files without deleting user data.
 * @param {string} [customDir]
 * @returns {Array<Object>} custom presets array
 */
function loadCustomPresets(customDir) {
  const filePath = getExportPresetsFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const candidateList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.presets)
        ? parsed.presets
        : [];

    const validCustom = [];
    const seenIds = new Set(BUILTIN_EXPORT_PRESET_IDS);

    for (const item of candidateList) {
      if (!item || typeof item !== 'object' || !item.id || item.isBuiltIn) {
        continue;
      }
      const idStr = String(item.id);
      if (seenIds.has(idStr)) {
        continue;
      }
      seenIds.add(idStr);

      let name = 'Untitled Preset';
      try {
        name = validatePresetName(item.name);
      } catch (_) {
        name = String(item.name || 'Untitled Preset').slice(0, MAX_NAME_LENGTH);
      }

      const description = typeof item.description === 'string'
        ? item.description.slice(0, MAX_DESCRIPTION_LENGTH)
        : '';

      const settings = normalizeExportSettings(item.settings, customDir);

      validCustom.push({
        id: idStr,
        name,
        description,
        isBuiltIn: false,
        settings,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
    }

    return validCustom;
  } catch (err) {
    logger?.warn?.('ExportPresetManager', `Corrupt export presets file detected (${err.message}). Returning empty custom list.`);
    return [];
  }
}

/**
 * Saves custom presets to disk safely using atomic write.
 * @param {Array<Object>} customPresets
 * @param {string} [customDir]
 */
function saveCustomPresets(customPresets, customDir) {
  const filePath = getExportPresetsFilePath(customDir);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      presets: customPresets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        isBuiltIn: false,
        settings: p.settings,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    },
    null,
    2
  );

  const tmpPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    throw new Error(`Failed to save export presets: ${err.message}`);
  }
}

/**
 * Retrieves all presets (built-in + custom), optionally filtered.
 * @param {Object} [options]
 * @param {'all'|'builtin'|'custom'} [options.category='all']
 * @param {string} [options.search]
 * @param {string} [customDir]
 * @returns {Array<Object>} deep-cloned preset objects
 */
function getExportPresets(options = {}, customDir) {
  const { category = 'all', search } = options;
  const builtIns = CANONICAL_BUILTIN_EXPORT_PRESETS.map((p) => deepClone(p));
  const custom = loadCustomPresets(customDir);

  let combined;
  if (category === 'builtin') {
    combined = builtIns;
  } else if (category === 'custom') {
    combined = custom;
  } else {
    combined = [...builtIns, ...custom];
  }

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    combined = combined.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }

  return combined.map((p) => deepClone(p));
}

/**
 * Retrieves a single preset by ID.
 * Looks in built-ins first, then custom presets.
 * Returns null if not found.
 *
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null} deep-cloned preset object
 */
function getExportPreset(id, customDir) {
  if (!id || typeof id !== 'string') return null;

  const builtIn = CANONICAL_BUILTIN_EXPORT_PRESETS.find((p) => p.id === id);
  if (builtIn) {
    return deepClone(builtIn);
  }

  const customList = loadCustomPresets(customDir);
  const found = customList.find((p) => p.id === id);
  return found ? deepClone(found) : null;
}

/**
 * Searches presets by query and optional filters.
 * @param {Object} [options]
 * @param {string} [options.query]
 * @param {'all'|'builtin'|'custom'} [options.category='all']
 * @param {string} [options.aspectRatio]
 * @param {string} [options.exportType]
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function searchExportPresets(options = {}, customDir) {
  const { query, category = 'all', aspectRatio, exportType } = options;
  let results = getExportPresets({ category, search: query }, customDir);

  if (aspectRatio && typeof aspectRatio === 'string') {
    results = results.filter((p) => p.settings?.aspectRatio === aspectRatio);
  }

  if (exportType && typeof exportType === 'string') {
    results = results.filter((p) => p.settings?.exportType === exportType);
  }

  return results;
}

/**
 * Creates a new custom export preset.
 * @param {Object} input { name, description, settings }
 * @param {string} [customDir]
 * @returns {Object} newly created preset
 */
function createExportPreset(input, customDir) {
  const { name, description, settings } = validateExportPresetInput(input, false, customDir);

  const customPresets = loadCustomPresets(customDir);
  if (customPresets.length >= MAX_CUSTOM_PRESETS) {
    throw new Error(`Maximum custom presets limit reached (${MAX_CUSTOM_PRESETS}). Please delete unused presets first.`);
  }

  const now = new Date().toISOString();
  const newPreset = {
    id: generateExportPresetId(),
    name,
    description: description || '',
    isBuiltIn: false,
    settings,
    createdAt: now,
    updatedAt: now,
  };

  customPresets.push(newPreset);
  saveCustomPresets(customPresets, customDir);

  logger?.info?.('ExportPresetManager', `Created export preset "${newPreset.name}" (${newPreset.id})`);
  return deepClone(newPreset);
}

/**
 * Updates an existing custom export preset.
 * Built-in presets cannot be updated.
 *
 * @param {string} id
 * @param {Object} input { name, description, settings }
 * @param {string} [customDir]
 * @returns {Object} updated preset
 */
function updateExportPreset(id, input, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Valid preset ID is required for update');
  }

  if (BUILTIN_EXPORT_PRESET_IDS.has(id)) {
    throw new Error(`Built-in export preset "${id}" cannot be modified`);
  }

  const { name, description, settings } = validateExportPresetInput(input, true, customDir);

  const customPresets = loadCustomPresets(customDir);
  const index = customPresets.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Export preset not found: ${id}`);
  }

  const existing = customPresets[index];
  const updated = {
    ...existing,
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    settings: settings !== undefined ? settings : existing.settings,
    updatedAt: new Date().toISOString(),
  };

  customPresets[index] = updated;
  saveCustomPresets(customPresets, customDir);

  logger?.info?.('ExportPresetManager', `Updated export preset "${updated.name}" (${id})`);
  return deepClone(updated);
}

/**
 * Deletes a custom export preset by ID.
 * Built-in presets cannot be deleted.
 *
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ success: boolean, deletedId: string }}
 */
function deleteExportPreset(id, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Valid preset ID is required for deletion');
  }

  if (BUILTIN_EXPORT_PRESET_IDS.has(id)) {
    throw new Error(`Built-in export preset "${id}" cannot be deleted`);
  }

  const customPresets = loadCustomPresets(customDir);
  const filtered = customPresets.filter((p) => p.id !== id);
  if (filtered.length === customPresets.length) {
    throw new Error(`Export preset not found: ${id}`);
  }

  saveCustomPresets(filtered, customDir);
  logger?.info?.('ExportPresetManager', `Deleted export preset (${id})`);
  return { success: true, deletedId: id };
}

/**
 * Generates an incremental duplicate name, e.g. "Vertical 1080p Copy", "Vertical 1080p Copy 2".
 * @param {string} baseName
 * @param {Array<Object>} existingPresets
 * @returns {string}
 */
function generateDuplicateName(baseName, existingPresets) {
  const existingNames = new Set(existingPresets.map((p) => (p.name || '').toLowerCase()));
  let candidate = `${baseName} Copy`.slice(0, MAX_NAME_LENGTH);
  if (!existingNames.has(candidate.toLowerCase())) {
    return candidate;
  }
  let counter = 2;
  while (counter <= 999) {
    candidate = `${baseName} Copy ${counter}`.slice(0, MAX_NAME_LENGTH);
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
  return `${baseName} Copy ${Date.now()}`.slice(0, MAX_NAME_LENGTH);
}

/**
 * Duplicates an existing preset (built-in or custom) to create a new custom preset.
 *
 * @param {string} id
 * @param {Object} [overrides]
 * @param {string} [customDir]
 * @returns {Object} new custom preset
 */
function duplicateExportPreset(id, overrides = {}, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Valid preset ID is required for duplication');
  }

  const source = getExportPreset(id, customDir);
  if (!source) {
    throw new Error(`Export preset to duplicate not found: ${id}`);
  }

  const allPresets = getExportPresets({ category: 'all' }, customDir);
  const defaultName = generateDuplicateName(source.name, allPresets);
  const name = overrides && typeof overrides.name === 'string' && overrides.name.trim()
    ? validatePresetName(overrides.name)
    : defaultName;

  const description = overrides && overrides.description !== undefined
    ? validatePresetDescription(overrides.description)
    : source.description;

  const settings = overrides && overrides.settings
    ? validateExportPresetSettings({ ...source.settings, ...overrides.settings }, customDir)
    : deepClone(source.settings);

  return createExportPreset(
    {
      name,
      description,
      settings,
    },
    customDir
  );
}

/**
 * Compares current export settings with a selected preset to produce
 * a structured "Export Difference" analysis.
 *
 * @param {Object} currentConfig Current export settings in editor/panel
 * @param {Object|string} presetOrId Target preset or preset ID
 * @param {string} [customDir]
 * @returns {{ differences: Object, summary: string[], hasDifferences: boolean }}
 */
function compareExportPresets(currentConfig = {}, presetOrId, customDir) {
  const targetPreset = typeof presetOrId === 'string'
    ? getExportPreset(presetOrId, customDir)
    : presetOrId;

  if (!targetPreset || !targetPreset.settings) {
    throw new Error('Valid target export preset is required for comparison');
  }

  const curNormalized = normalizeExportSettings(currentConfig, customDir);
  const tgtNormalized = normalizeExportSettings(targetPreset.settings, customDir);

  const differences = {};
  const summary = [];

  const compareField = (key, label, curVal, tgtVal, formatter = (v) => String(v ?? 'None')) => {
    const isDifferent = curVal !== tgtVal;
    differences[key] = {
      current: curVal,
      preset: tgtVal,
      isDifferent,
    };
    if (isDifferent) {
      summary.push(`${label}: ${formatter(curVal)} → ${formatter(tgtVal)}`);
    }
  };

  compareField('aspectRatio', 'Aspect Ratio', curNormalized.aspectRatio, tgtNormalized.aspectRatio);
  compareField('resolution', 'Resolution', curNormalized.resolution, tgtNormalized.resolution);
  compareField('quality', 'Quality', curNormalized.quality, tgtNormalized.quality);
  compareField('mode', 'Layout Mode', curNormalized.mode, tgtNormalized.mode);
  compareField('smartCrop', 'Smart Crop', Boolean(curNormalized.smartCrop), Boolean(tgtNormalized.smartCrop), (v) => (v ? 'Enabled' : 'Disabled'));
  compareField('exportType', 'Export Type', curNormalized.exportType, tgtNormalized.exportType);

  // Variation Preset Comparison
  const curVP = curNormalized.variationPresetId || null;
  const tgtVP = tgtNormalized.variationPresetId || null;
  compareField('variationPresetId', 'Variation Preset', curVP, tgtVP, (v) => v || 'Custom / None');

  // Variation Config Comparison
  const curVarEnabled = Boolean(curNormalized.variation?.enabled);
  const tgtVarEnabled = Boolean(tgtNormalized.variation?.enabled);
  if (curVarEnabled !== tgtVarEnabled) {
    differences.variationEnabled = {
      current: curVarEnabled,
      preset: tgtVarEnabled,
      isDifferent: true,
    };
    summary.push(`Variation: ${curVarEnabled ? 'Enabled' : 'Disabled'} → ${tgtVarEnabled ? 'Enabled' : 'Disabled'}`);
  }

  // Caption Template Comparison
  const curTpl = curNormalized.captionTemplateId || null;
  const tgtTpl = tgtNormalized.captionTemplateId || null;
  compareField('captionTemplateId', 'Caption Template', curTpl, tgtTpl, (v) => v || 'None');

  // Text Overlays Count Comparison
  const curOvCount = Array.isArray(curNormalized.textOverlays) ? curNormalized.textOverlays.length : 0;
  const tgtOvCount = Array.isArray(tgtNormalized.textOverlays) ? tgtNormalized.textOverlays.length : 0;
  if (curOvCount !== tgtOvCount) {
    differences.textOverlaysCount = {
      current: curOvCount,
      preset: tgtOvCount,
      isDifferent: true,
    };
    summary.push(`Text Overlays: ${curOvCount} layer(s) → ${tgtOvCount} layer(s)`);
  }

  // Audio settings
  const curPreserve = Boolean(curNormalized.audio?.preservePitch);
  const tgtPreserve = Boolean(tgtNormalized.audio?.preservePitch);
  if (curPreserve !== tgtPreserve) {
    differences.audioPreservePitch = {
      current: curPreserve,
      preset: tgtPreserve,
      isDifferent: true,
    };
    summary.push(`Audio Preserve Pitch: ${curPreserve ? 'Yes' : 'No'} → ${tgtPreserve ? 'Yes' : 'No'}`);
  }

  const curNormalizeAudio = Boolean(curNormalized.audio?.normalizeAudio);
  const tgtNormalizeAudio = Boolean(tgtNormalized.audio?.normalizeAudio);
  if (curNormalizeAudio !== tgtNormalizeAudio) {
    differences.audioNormalize = {
      current: curNormalizeAudio,
      preset: tgtNormalizeAudio,
      isDifferent: true,
    };
    summary.push(`Audio Normalize: ${curNormalizeAudio ? 'Yes' : 'No'} → ${tgtNormalizeAudio ? 'Yes' : 'No'}`);
  }

  const hasDifferences = summary.length > 0;

  return {
    presetId: targetPreset.id,
    presetName: targetPreset.name,
    differences,
    differencesCount: summary.length,
    hasDifferences,
    summary,
  };
}

/**
 * Applies an export preset onto a current configuration.
 * Deep-clones all settings to ensure mutable isolation.
 * Resolves referenced variationPresetId and captionTemplateId if needed.
 *
 * @param {Object|string} presetOrId Preset or Preset ID
 * @param {Object} [currentConfig={}] Current export state (preserved for unrelated fields)
 * @param {string} [customDir]
 * @returns {Object} applied configuration
 */
function applyExportPreset(presetOrId, currentConfig = {}, customDir) {
  const preset = typeof presetOrId === 'string'
    ? getExportPreset(presetOrId, customDir)
    : presetOrId;

  if (!preset || !preset.settings) {
    throw new Error('Valid export preset is required to apply');
  }

  const normalized = normalizeExportSettings(preset.settings, customDir);

  // Deep clone to guarantee that modifications to the returned state never mutate the preset
  return {
    ...deepClone(currentConfig),
    appliedPresetId: preset.id,
    appliedPresetName: preset.name,
    aspectRatio: normalized.aspectRatio,
    resolution: normalized.resolution,
    quality: normalized.quality,
    mode: normalized.mode,
    smartCrop: normalized.smartCrop,
    exportType: normalized.exportType,
    variation: deepClone(normalized.variation),
    variationPresetId: normalized.variationPresetId,
    captionTemplateId: normalized.captionTemplateId,
    textOverlays: deepClone(normalized.textOverlays),
    audio: deepClone(normalized.audio),
  };
}

/**
 * Resolves an immutable snapshot of an export preset for use in Bulk Plans or Schedules.
 * Completely decouples the snapshot from saved storage records.
 *
 * @param {Object|string} presetOrId
 * @param {string} [customDir]
 * @returns {Object} immutable snapshot
 */
function resolveExportPresetSnapshot(presetOrId, customDir) {
  const preset = typeof presetOrId === 'string'
    ? getExportPreset(presetOrId, customDir)
    : presetOrId;

  if (!preset) {
    return {
      id: null,
      name: 'Default',
      isBuiltIn: false,
      settings: getSafeExportPresetDefaults(),
    };
  }

  const normalizedSettings = normalizeExportSettings(preset.settings, customDir);

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description || '',
    isBuiltIn: Boolean(preset.isBuiltIn),
    settings: deepClone(normalizedSettings),
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Resets the custom export presets file to empty list.
 * Built-in presets are preserved.
 * Profiles, schedules, templates, and variation presets are untouched.
 *
 * @param {string} [customDir]
 * @returns {{ success: boolean }}
 */
function resetExportPresets(customDir) {
  saveCustomPresets([], customDir);
  logger?.info?.('ExportPresetManager', 'Reset custom export presets');
  return { success: true };
}

module.exports = {
  CANONICAL_BUILTIN_EXPORT_PRESETS,
  BUILTIN_EXPORT_PRESET_IDS,
  VALID_ASPECT_RATIOS,
  VALID_RESOLUTIONS,
  VALID_QUALITIES,
  VALID_MODES,
  VALID_EXPORT_TYPES,
  getExportPresetsFilePath,
  getSafeExportPresetDefaults,
  normalizeExportSettings,
  validateExportPresetSettings,
  validateExportPresetInput,
  getExportPresets,
  getExportPreset,
  searchExportPresets,
  createExportPreset,
  updateExportPreset,
  deleteExportPreset,
  duplicateExportPreset,
  compareExportPresets,
  applyExportPreset,
  resolveExportPresetSnapshot,
  resetExportPresets,
};
