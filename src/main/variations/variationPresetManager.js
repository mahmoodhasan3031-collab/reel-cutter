'use strict';

/**
 * Variation Preset Manager — Phase 5A
 *
 * Production-ready Advanced Content Variation Preset System for Reel Cutter.
 * Provides validated, immutable built-in presets and persistent custom presets.
 *
 * Persists custom presets to variation-presets.json in Electron userData (or customDir for tests).
 * All preset variation objects are validated through validateProductVariationConfig()
 * before storage or retrieval.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { validateProductVariationConfig, DEFAULT_PRODUCT_VARIATION, PRODUCT_VARIATION_LIMITS } = require('../../engine/variation/validator');
const logger = require('../logger');

const VARIATION_PRESETS_FILENAME = 'variation-presets.json';
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 1;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_CUSTOM_PRESETS = 50;

let _counter = 0;
function generatePresetId() {
  return `vpreset_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
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
 * 6 Canonical, Immutable Built-in Variation Presets (Phase 5A)
 *
 * 1. Neutral     — No variation applied. Pass-through for baseline reference.
 * 2. Bright      — Subtle brightness and saturation lift for warm vivid look.
 * 3. Punchy      — Bold saturation boost with slight brightness for dynamic content.
 * 4. Soft        — Slightly reduced brightness and saturation for calm cinematic tone.
 * 5. Subtle Motion — Minimal speed change with slight crop for natural feel.
 * 6. Reframe Focus — Center-focused crop for tighter intentional composition.
 *
 * All values comply strictly with PRODUCT_VARIATION_LIMITS:
 *   brightness: -1.0 to 1.0
 *   saturation: 0.0 to 3.0
 *   hue: -180.0 to 180.0
 *   pitch: -3.0 to 3.0
 *   speed: 1.00 to 1.05
 *   crop: 0.0 to 2.0
 *   mode: center | left | right | top | bottom
 */
const CANONICAL_BUILTIN_PRESETS = [
  {
    id: 'vpreset_builtin_neutral',
    name: 'Neutral',
    description: 'No variation applied. Use as a baseline or pass-through reference.',
    isBuiltIn: true,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'vpreset_builtin_bright',
    name: 'Bright',
    description: 'Subtle brightness and saturation lift for a warm, vivid look.',
    isBuiltIn: true,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'vpreset_builtin_punchy',
    name: 'Punchy',
    description: 'Bold saturation boost with slight brightness for high-impact, dynamic content.',
    isBuiltIn: true,
    variation: {
      enabled: true,
      brightness: 0.05,
      saturation: 1.15,
      hue: 0.0,
      pitch: 0.0,
      speed: 1.00,
      mode: 'center',
      crop: 0.0,
      cleanMetadata: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'vpreset_builtin_soft',
    name: 'Soft',
    description: 'Slightly reduced brightness and saturation for a calm, cinematic tone.',
    isBuiltIn: true,
    variation: {
      enabled: true,
      brightness: -0.02,
      saturation: 0.9,
      hue: 0.0,
      pitch: 0.0,
      speed: 1.00,
      mode: 'center',
      crop: 0.0,
      cleanMetadata: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'vpreset_builtin_subtle_motion',
    name: 'Subtle Motion',
    description: 'Minimal speed change with slight crop for natural in-camera feel.',
    isBuiltIn: true,
    variation: {
      enabled: true,
      brightness: 0.0,
      saturation: 1.0,
      hue: 0.0,
      pitch: 0.0,
      speed: 1.02,
      mode: 'center',
      crop: 1.0,
      cleanMetadata: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'vpreset_builtin_reframe_focus',
    name: 'Reframe Focus',
    description: 'Center-focused crop for tighter, more intentional composition.',
    isBuiltIn: true,
    variation: {
      enabled: true,
      brightness: 0.0,
      saturation: 1.0,
      hue: 0.0,
      pitch: 0.0,
      speed: 1.00,
      mode: 'center',
      crop: 2.0,
      cleanMetadata: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const BUILTIN_IDS = new Set(CANONICAL_BUILTIN_PRESETS.map(p => p.id));

/**
 * Checks for prototype pollution attempt keys.
 * @param {*} obj
 */
function assertNoPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return;
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of dangerousKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new Error(`Prototype pollution attempt detected: key "${key}" is prohibited`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (dangerousKeys.includes(k)) {
      throw new Error(`Prototype pollution attempt detected: key "${k}" is prohibited`);
    }
    if (v && typeof v === 'object') {
      assertNoPrototypePollution(v);
    }
  }
}

/**
 * Resolves the path to the variation-presets.json file.
 * @param {string} [customDir]
 * @returns {string}
 */
function getVariationPresetsFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, VARIATION_PRESETS_FILENAME);
  }
  try {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, VARIATION_PRESETS_FILENAME);
  } catch {
    return path.join(process.cwd(), VARIATION_PRESETS_FILENAME);
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
 * Validates and normalizes a variation config object through the authoritative engine validator.
 * The variation must pass validateProductVariationConfig() from the variation engine.
 *
 * @param {*} variation
 * @returns {Object} normalized variation config
 */
function validatePresetVariation(variation) {
  if (!variation || typeof variation !== 'object' || Array.isArray(variation)) {
    throw new Error('Preset variation must be a non-null object');
  }

  assertNoPrototypePollution(variation);

  for (const [k, v] of Object.entries(variation)) {
    if (typeof v === 'function') {
      throw new Error(`Invalid variation property ${k}: functions are not allowed`);
    }
  }

  // Pass through authoritative engine validator
  const result = validateProductVariationConfig(variation);
  if (!result || !result.valid) {
    throw new Error('Variation configuration failed engine validation');
  }

  return result.config;
}

/**
 * Validates preset input data.
 * @param {Object} input
 * @param {boolean} [isUpdate=false]
 * @returns {{ name: string|undefined, description: string|undefined, variation: Object|undefined }}
 */
function validatePresetInput(input, isUpdate = false) {
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

  let variation;
  if (!isUpdate || input.variation !== undefined) {
    variation = validatePresetVariation(input.variation);
  }

  return { name, description, variation };
}

/**
 * Loads custom presets from disk. Recovers gracefully from corrupt, empty, or missing files.
 * @param {string} [customDir]
 * @returns {Array<Object>} custom presets array
 */
function loadCustomPresets(customDir) {
  const filePath = getVariationPresetsFilePath(customDir);
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
    const seenIds = new Set(BUILTIN_IDS);

    for (const item of candidateList) {
      if (!item || typeof item !== 'object' || !item.id || item.isBuiltIn) {
        continue;
      }
      const idStr = String(item.id);
      if (seenIds.has(idStr)) {
        continue; // Skip duplicate or built-in collision
      }
      seenIds.add(idStr);

      try {
        const validatedVariation = validatePresetVariation(item.variation || {});
        validCustom.push({
          id: idStr,
          name: validatePresetName(item.name),
          description: validatePresetDescription(item.description),
          isBuiltIn: false,
          variation: validatedVariation,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        });
      } catch (itemErr) {
        logger.warn('VariationPresets', `Skipping invalid preset record during load: ${itemErr.message}`);
      }
    }
    return validCustom;
  } catch (err) {
    logger.warn('VariationPresets', `Failed to read or parse ${filePath}: ${err.message}. Recovering safely.`);
    return [];
  }
}

/**
 * Atomically saves custom presets to disk.
 * @param {Array<Object>} customPresets
 * @param {string} [customDir]
 */
function saveCustomPresets(customPresets, customDir) {
  const filePath = getVariationPresetsFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = JSON.stringify(
    {
      version: 1,
      presets: customPresets.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isBuiltIn: false,
        variation: p.variation,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    },
    null,
    2
  );

  const tmpPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmpPath, payload, 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (_) {
    // Windows rename fallback
    fs.copyFileSync(tmpPath, filePath);
    try { fs.unlinkSync(tmpPath); } catch (__) {}
  }
}

/**
 * Lists all variation presets (canonical built-ins + saved custom presets).
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function getVariationPresets(customDir) {
  const custom = loadCustomPresets(customDir);
  return [...deepClone(CANONICAL_BUILTIN_PRESETS), ...custom];
}

/**
 * Retrieves a single variation preset by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getVariationPreset(id, customDir) {
  if (!id || typeof id !== 'string') return null;

  const builtin = CANONICAL_BUILTIN_PRESETS.find(p => p.id === id);
  if (builtin) {
    return deepClone(builtin);
  }

  const custom = loadCustomPresets(customDir);
  const found = custom.find(p => p.id === id);
  return found ? deepClone(found) : null;
}

/**
 * Searches and filters variation presets by query and type.
 * @param {Object} options
 * @param {string} [options.query] Search term for name or description
 * @param {'all'|'builtin'|'custom'} [options.type='all'] Filter by preset category
 * @param {string} [options.customDir]
 * @returns {Array<Object>}
 */
function searchVariationPresets({ query = '', type = 'all', customDir } = {}) {
  const allPresets = getVariationPresets(customDir);
  const q = String(query).trim().toLowerCase();
  const filterType = String(type).trim().toLowerCase();

  return allPresets.filter(preset => {
    if (filterType === 'builtin' && !preset.isBuiltIn) return false;
    if (filterType === 'custom' && preset.isBuiltIn) return false;

    if (!q) return true;
    const nameMatch = preset.name.toLowerCase().includes(q);
    const descMatch = (preset.description || '').toLowerCase().includes(q);
    return nameMatch || descMatch;
  });
}

/**
 * Creates a new custom variation preset.
 * @param {Object} data
 * @param {string} [customDir]
 * @returns {Object} created preset
 */
function createVariationPreset(data, customDir) {
  const validated = validatePresetInput(data, false);
  const custom = loadCustomPresets(customDir);

  if (custom.length >= MAX_CUSTOM_PRESETS) {
    throw new Error(`Maximum number of custom presets (${MAX_CUSTOM_PRESETS}) reached`);
  }

  const now = new Date().toISOString();
  const newPreset = {
    id: generatePresetId(),
    name: validated.name,
    description: validated.description || '',
    isBuiltIn: false,
    variation: validated.variation,
    createdAt: now,
    updatedAt: now,
  };

  custom.push(newPreset);
  saveCustomPresets(custom, customDir);
  logger.info('VariationPresets', `Created custom preset: ${newPreset.name} (${newPreset.id})`);
  return deepClone(newPreset);
}

/**
 * Updates an existing custom variation preset.
 * Built-in presets cannot be updated.
 * @param {string} id
 * @param {Object} data
 * @param {string} [customDir]
 * @returns {Object} updated preset
 */
function updateVariationPreset(id, data, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Preset ID is required');
  }

  if (BUILTIN_IDS.has(id)) {
    throw new Error('Built-in presets cannot be modified');
  }

  const custom = loadCustomPresets(customDir);
  const idx = custom.findIndex(p => p.id === id);
  if (idx === -1) {
    throw new Error(`Variation preset not found: ${id}`);
  }

  const validated = validatePresetInput(data, true);
  const target = custom[idx];

  if (validated.name !== undefined) target.name = validated.name;
  if (validated.description !== undefined) target.description = validated.description;
  if (validated.variation !== undefined) target.variation = validated.variation;
  target.updatedAt = new Date().toISOString();

  saveCustomPresets(custom, customDir);
  logger.info('VariationPresets', `Updated custom preset: ${target.name} (${target.id})`);
  return deepClone(target);
}

/**
 * Deletes a custom variation preset.
 * Built-in presets cannot be deleted.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ success: boolean, id: string }}
 */
function deleteVariationPreset(id, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Preset ID is required');
  }

  if (BUILTIN_IDS.has(id)) {
    throw new Error('Built-in presets cannot be deleted');
  }

  const custom = loadCustomPresets(customDir);
  const filtered = custom.filter(p => p.id !== id);
  if (filtered.length === custom.length) {
    throw new Error(`Variation preset not found: ${id}`);
  }

  saveCustomPresets(filtered, customDir);
  logger.info('VariationPresets', `Deleted custom preset: ${id}`);
  return { success: true, id };
}

/**
 * Helper to compute an incremental unique duplicate name.
 * e.g., "Punchy" -> "Punchy Copy", "Punchy Copy 2", etc.
 * @param {string} baseName
 * @param {Array<Object>} existingPresets
 * @returns {string}
 */
function getUniqueDuplicateName(baseName, existingPresets) {
  const existingNames = new Set(existingPresets.map(p => p.name.toLowerCase()));
  let candidate = `${baseName} Copy`;
  if (candidate.length > MAX_NAME_LENGTH) {
    candidate = candidate.slice(0, MAX_NAME_LENGTH).trim();
  }

  if (!existingNames.has(candidate.toLowerCase())) {
    return candidate;
  }

  let counter = 2;
  while (counter < 1000) {
    const suffixed = `${baseName} Copy ${counter}`;
    const truncated = suffixed.length > MAX_NAME_LENGTH ? suffixed.slice(0, MAX_NAME_LENGTH).trim() : suffixed;
    if (!existingNames.has(truncated.toLowerCase())) {
      return truncated;
    }
    counter++;
  }
  return candidate;
}

/**
 * Duplicates a built-in or custom variation preset into a new custom preset.
 * @param {string} id
 * @param {Object} [overrides={}]
 * @param {string} [customDir]
 * @returns {Object} newly created custom preset
 */
function duplicateVariationPreset(id, overrides = {}, customDir) {
  const source = getVariationPreset(id, customDir);
  if (!source) {
    throw new Error(`Variation preset not found: ${id}`);
  }

  const custom = loadCustomPresets(customDir);
  if (custom.length >= MAX_CUSTOM_PRESETS) {
    throw new Error(`Maximum number of custom presets (${MAX_CUSTOM_PRESETS}) reached`);
  }

  const allPresets = getVariationPresets(customDir);
  let dupName = overrides.name ? String(overrides.name).trim() : getUniqueDuplicateName(source.name, allPresets);
  if (dupName.length > MAX_NAME_LENGTH) {
    dupName = dupName.slice(0, MAX_NAME_LENGTH);
  }

  const now = new Date().toISOString();
  const duplicated = {
    id: generatePresetId(),
    name: dupName,
    description: overrides.description !== undefined
      ? validatePresetDescription(overrides.description)
      : source.description,
    isBuiltIn: false,
    variation: deepClone(
      overrides.variation
        ? validatePresetVariation(overrides.variation)
        : source.variation
    ),
    createdAt: now,
    updatedAt: now,
  };

  custom.push(duplicated);
  saveCustomPresets(custom, customDir);
  logger.info('VariationPresets', `Duplicated preset ${source.name} (${source.id}) -> ${duplicated.name} (${duplicated.id})`);
  return deepClone(duplicated);
}

/**
 * Compares two variation configurations or presets and returns meaningful creative differences.
 * "Variation Difference" / "Creative Difference"
 *
 * @param {Object} currentOrA Current export variation config or preset
 * @param {Object} selectedOrB Selected preset or second variation config
 * @returns {{ title: string, hasDifferences: boolean, differences: Array<string>, details: Object }}
 */
function compareVariationPresets(currentOrA, selectedOrB) {
  const varA = currentOrA?.variation || currentOrA || {};
  const varB = selectedOrB?.variation || selectedOrB || {};

  const normA = {
    enabled: Boolean(varA.enabled),
    brightness: Number(varA.brightness) || 0,
    saturation: varA.saturation !== undefined ? Number(varA.saturation) : 1.0,
    hue: Number(varA.hue) || 0,
    pitch: Number(varA.pitch) || 0,
    speed: varA.speed !== undefined ? Number(varA.speed) : 1.0,
    crop: Number(varA.crop) || 0,
    mode: String(varA.mode || 'center').toLowerCase(),
    cleanMetadata: varA.cleanMetadata !== undefined ? Boolean(varA.cleanMetadata) : true,
  };

  const normB = {
    enabled: Boolean(varB.enabled),
    brightness: Number(varB.brightness) || 0,
    saturation: varB.saturation !== undefined ? Number(varB.saturation) : 1.0,
    hue: Number(varB.hue) || 0,
    pitch: Number(varB.pitch) || 0,
    speed: varB.speed !== undefined ? Number(varB.speed) : 1.0,
    crop: Number(varB.crop) || 0,
    mode: String(varB.mode || 'center').toLowerCase(),
    cleanMetadata: varB.cleanMetadata !== undefined ? Boolean(varB.cleanMetadata) : true,
  };

  const differences = [];
  const details = {};

  if (Math.abs(normB.brightness - normA.brightness) > 0.001) {
    const diff = normB.brightness - normA.brightness;
    const sign = diff > 0 ? '+' : '';
    differences.push(`Brightness: ${sign}${diff.toFixed(2)}`);
    details.brightness = { from: normA.brightness, to: normB.brightness, diff };
  }

  if (Math.abs(normB.saturation - normA.saturation) > 0.001) {
    const diff = normB.saturation - normA.saturation;
    const sign = diff > 0 ? '+' : '';
    differences.push(`Saturation: ${sign}${diff.toFixed(2)}`);
    details.saturation = { from: normA.saturation, to: normB.saturation, diff };
  }

  if (Math.abs(normB.hue - normA.hue) > 0.1) {
    const diff = normB.hue - normA.hue;
    const sign = diff > 0 ? '+' : '';
    differences.push(`Hue: ${sign}${Math.round(diff)}°`);
    details.hue = { from: normA.hue, to: normB.hue, diff };
  }

  if (Math.abs(normB.speed - normA.speed) > 0.0001) {
    differences.push(`Speed: ${normB.speed.toFixed(2)}x`);
    details.speed = { from: normA.speed, to: normB.speed };
  }

  if (Math.abs(normB.crop - normA.crop) > 0.01) {
    differences.push(`Crop: ${normB.crop.toFixed(1)}%`);
    details.crop = { from: normA.crop, to: normB.crop };
  }

  if (Math.abs(normB.pitch - normA.pitch) > 0.01) {
    const diff = normB.pitch - normA.pitch;
    const sign = diff > 0 ? '+' : '';
    differences.push(`Pitch: ${sign}${diff.toFixed(2)}`);
    details.pitch = { from: normA.pitch, to: normB.pitch, diff };
  }

  if (normB.mode !== normA.mode) {
    differences.push(`Mode: ${normA.mode} → ${normB.mode}`);
    details.mode = { from: normA.mode, to: normB.mode };
  }

  if (normB.cleanMetadata !== normA.cleanMetadata) {
    differences.push(`Clean Metadata: ${normB.cleanMetadata ? 'On' : 'Off'}`);
    details.cleanMetadata = { from: normA.cleanMetadata, to: normB.cleanMetadata };
  }

  return {
    title: 'Creative Difference',
    hasDifferences: differences.length > 0,
    differences,
    details,
  };
}

/**
 * Applies a variation preset to a current export variation config.
 * Deep-clones the preset variation, leaving the saved preset and current export completely isolated.
 *
 * @param {string|Object} presetOrId Preset ID or preset object
 * @param {Object} [currentConfig] Current export configuration
 * @param {string} [customDir]
 * @returns {Object} new export-ready variation config
 */
function applyVariationPreset(presetOrId, currentConfig = {}, customDir) {
  let presetObj = null;
  if (typeof presetOrId === 'string') {
    presetObj = getVariationPreset(presetOrId, customDir);
    if (!presetObj) {
      throw new Error(`Variation preset not found: ${presetOrId}`);
    }
  } else if (presetOrId && typeof presetOrId === 'object') {
    presetObj = presetOrId;
  } else {
    throw new Error('Preset or preset ID must be provided');
  }

  const presetVariation = presetObj.variation || presetObj;
  const validated = validatePresetVariation(presetVariation);

  // Return a new deep clone combining any preserved current export options with preset settings
  const applied = deepClone({
    ...currentConfig,
    ...validated,
    enabled: validated.enabled !== undefined ? validated.enabled : true,
  });

  return applied;
}

/**
 * Resolves a variation preset by ID and returns the validated variation config snapshot.
 * Returns a deep clone of the variation config suitable for export plan or schedule use.
 * If not found, returns null.
 *
 * @param {string} presetId
 * @param {string} [customDir]
 * @returns {{ presetId: string, presetName: string, variation: Object } | null}
 */
function resolveVariationPresetSnapshot(presetId, customDir) {
  if (!presetId || typeof presetId !== 'string') {
    return null;
  }
  const preset = getVariationPreset(presetId, customDir);
  if (!preset) {
    return null;
  }
  return {
    presetId: preset.id,
    presetName: preset.name,
    variation: deepClone(preset.variation),
  };
}

/**
 * Returns safe default variation values for editor reset.
 * @returns {Object}
 */
function getSafeVariationDefaults() {
  return deepClone(DEFAULT_PRODUCT_VARIATION);
}

/**
 * Resets built-in presets to their canonical definitions.
 * Does NOT delete or alter custom presets.
 * @param {string} [customDir]
 * @returns {Array<Object>} all presets after reset
 */
function resetVariationPresets(customDir) {
  logger.info('VariationPresets', 'Resetting built-in variation presets to canonical definitions');
  return getVariationPresets(customDir);
}

module.exports = {
  VARIATION_PRESETS_FILENAME,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CUSTOM_PRESETS,
  CANONICAL_BUILTIN_PRESETS,
  BUILTIN_IDS,
  getVariationPresetsFilePath,
  validatePresetName,
  validatePresetDescription,
  validatePresetVariation,
  validatePresetInput,
  getVariationPresets,
  getVariationPreset,
  searchVariationPresets,
  createVariationPreset,
  updateVariationPreset,
  deleteVariationPreset,
  duplicateVariationPreset,
  compareVariationPresets,
  applyVariationPreset,
  resolveVariationPresetSnapshot,
  getSafeVariationDefaults,
  resetVariationPresets,
  deepClone,
};
