'use strict';

/**
 * Page Profile Manager — Phase 2A
 *
 * Local profile management for organizing export configurations across
 * different pages, brands, or platform destinations.
 *
 * Persists to profiles.json in Electron userData (or customDir in test).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {
  validateProductVariationConfig,
  DEFAULT_PRODUCT_VARIATION,
} = require('../../engine/variation/validator');
const { getCaptionTemplate } = require('../captions/captionTemplateManager');
const { getVariationPreset } = require('../variations/variationPresetManager');

const SUPPORTED_PLATFORMS = ['Facebook', 'Instagram', 'YouTube', 'TikTok', 'Other'];
const PROFILES_FILENAME = 'profiles.json';
const MAX_NAME_LENGTH = 80;

let _counter = 0;
function generateProfileId() {
  return `prof_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Resolves the path to the profiles.json file.
 * @param {string} [customDir]
 * @returns {string}
 */
function getProfilesFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, PROFILES_FILENAME);
  }
  try {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, PROFILES_FILENAME);
  } catch {
    return path.join(process.cwd(), PROFILES_FILENAME);
  }
}

/**
 * Validates profile name.
 * @param {*} name
 * @returns {string} trimmed name
 */
function validateProfileName(name) {
  if (typeof name !== 'string') {
    throw new Error('Profile name is required and must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Profile name cannot be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Profile name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Validates platform selection.
 * @param {*} platform
 * @returns {string} valid platform
 */
function validatePlatform(platform) {
  if (!platform) return 'Other';
  const str = String(platform).trim();
  const matched = SUPPORTED_PLATFORMS.find(p => p.toLowerCase() === str.toLowerCase());
  return matched || 'Other';
}

/**
 * Normalizes and validates a variation preset using product-level validation.
 * @param {Object} [preset]
 * @returns {Object} normalized preset
 */
function normalizeVariationPreset(preset) {
  if (!preset || typeof preset !== 'object') {
    return {
      brightness: DEFAULT_PRODUCT_VARIATION.brightness,
      saturation: DEFAULT_PRODUCT_VARIATION.saturation,
      hue: DEFAULT_PRODUCT_VARIATION.hue,
      pitch: DEFAULT_PRODUCT_VARIATION.pitch,
      speed: DEFAULT_PRODUCT_VARIATION.speed,
      reframeMode: DEFAULT_PRODUCT_VARIATION.mode,
      mode: DEFAULT_PRODUCT_VARIATION.mode,
      crop: DEFAULT_PRODUCT_VARIATION.crop,
      cleanMetadata: DEFAULT_PRODUCT_VARIATION.cleanMetadata,
    };
  }

  // Validate with product rules (enforcing -1 to 1 brightness, 0-3 sat, -3 to 3 pitch, 1.00-1.05 speed, etc.)
  const { config: validated } = validateProductVariationConfig({
    ...preset,
    enabled: true,
  });

  return {
    brightness: validated.brightness,
    saturation: validated.saturation,
    hue: validated.hue,
    pitch: validated.pitch,
    speed: validated.speed,
    reframeMode: validated.mode,
    mode: validated.mode,
    crop: validated.crop,
    cleanMetadata: validated.cleanMetadata,
  };
}

/**
 * Validates caption template ID if provided.
 * Must be null/undefined or an existing template ID.
 * @param {*} captionTemplateId
 * @param {string} [customDir]
 * @returns {string|null}
 */
function validateCaptionTemplateId(captionTemplateId, customDir) {
  if (captionTemplateId === undefined || captionTemplateId === null || captionTemplateId === '') {
    return null;
  }
  if (typeof captionTemplateId !== 'string') {
    throw new Error('captionTemplateId must be a string or null');
  }
  const tpl = getCaptionTemplate(captionTemplateId, customDir);
  if (!tpl) {
    throw new Error(`Caption template not found: ${captionTemplateId}`);
  }
  return captionTemplateId;
}

/**
 * Resolves the caption template for a profile, returning deep-cloned overlays or null.
 * @param {Object} profile
 * @param {string} [customDir]
 * @returns {{ templateId: string|null, templateName: string|null, overlays: Array<Object>|null }}
 */
function resolveProfileCaptionTemplate(profile, customDir) {
  if (!profile || !profile.captionTemplateId) {
    return { templateId: null, templateName: null, overlays: null };
  }
  const tpl = getCaptionTemplate(profile.captionTemplateId, customDir);
  if (!tpl) {
    return { templateId: null, templateName: null, overlays: null };
  }
  return {
    templateId: tpl.id,
    templateName: tpl.name,
    overlays: Array.isArray(tpl.overlays) ? JSON.parse(JSON.stringify(tpl.overlays)) : null,
  };
}

/**
 * Validates variation preset ID if provided.
 * Must be null/undefined or an existing preset ID.
 * @param {*} variationPresetId
 * @param {string} [customDir]
 * @returns {string|null}
 */
function validateVariationPresetId(variationPresetId, customDir) {
  if (variationPresetId === undefined || variationPresetId === null || variationPresetId === '') {
    return null;
  }
  if (typeof variationPresetId !== 'string') {
    throw new Error('variationPresetId must be a string or null');
  }
  const preset = getVariationPreset(variationPresetId, customDir);
  if (!preset) {
    throw new Error(`Variation preset not found: ${variationPresetId}`);
  }
  return variationPresetId;
}

/**
 * Resolves the variation preset for a profile, returning deep-cloned variation config or fallback.
 * If profile references a variationPresetId, attempts to look it up.
 * If not found (e.g. deleted preset), falls back safely to profile.variationPreset (or default).
 * @param {Object} profile
 * @param {string} [customDir]
 * @returns {{ presetId: string|null, presetName: string|null, variation: Object }}
 */
function resolveProfileVariationPreset(profile, customDir) {
  if (!profile) {
    return { presetId: null, presetName: null, variation: getDefaultVariation() };
  }

  if (profile.variationPresetId) {
    const preset = getVariationPreset(profile.variationPresetId, customDir);
    if (preset) {
      return {
        presetId: preset.id,
        presetName: preset.name,
        variation: JSON.parse(JSON.stringify(resolveProfilePreset(preset.variation))),
      };
    }
    // Fallback if deleted or not found
  }

  return {
    presetId: null,
    presetName: null,
    variation: resolveProfilePreset(profile.variationPreset),
  };
}

/**
 * Safely loads profiles from disk.
 * @param {string} [customDir]
 * @returns {{ selectedProfileId: string|null, profiles: Array<Object> }}
 */
function loadProfiles(customDir) {
  const filePath = getProfilesFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return { selectedProfileId: null, profiles: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return { selectedProfileId: null, profiles: [] };
    }

    const profiles = Array.isArray(data.profiles)
      ? data.profiles
          .filter(p => p && typeof p === 'object' && p.id)
          .map(p => {
            let name = 'Untitled Profile';
            try {
              name = validateProfileName(p.name);
            } catch (_) {
              name = String(p.name || 'Untitled Profile').slice(0, MAX_NAME_LENGTH);
            }

            let preset;
            try {
              preset = normalizeVariationPreset(p.variationPreset);
            } catch (_) {
              preset = normalizeVariationPreset(null);
            }

            let captionTemplateId = null;
            if (p.captionTemplateId && typeof p.captionTemplateId === 'string') {
              captionTemplateId = p.captionTemplateId;
            }

            let variationPresetId = null;
            if (p.variationPresetId && typeof p.variationPresetId === 'string') {
              variationPresetId = p.variationPresetId;
            }

            return {
              id: String(p.id),
              name,
              platform: validatePlatform(p.platform),
              enabled: p.enabled !== undefined ? Boolean(p.enabled) : true,
              variationPreset: preset,
              variationPresetId,
              captionTemplateId,
              createdAt: p.createdAt || new Date().toISOString(),
              updatedAt: p.updatedAt || new Date().toISOString(),
            };
          })
      : [];

    const selectedProfileId = typeof data.selectedProfileId === 'string' && profiles.some(p => p.id === data.selectedProfileId)
      ? data.selectedProfileId
      : null;

    return { selectedProfileId, profiles };
  } catch (err) {
    console.warn('[ProfileManager] Warning: failed to parse profiles.json, using defaults:', err.message);
    return { selectedProfileId: null, profiles: [] };
  }
}

/**
 * Safely saves profiles to disk using atomic write.
 * @param {{ selectedProfileId: string|null, profiles: Array<Object> }} data
 * @param {string} [customDir]
 */
function saveProfiles(data, customDir) {
  const filePath = getProfilesFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = JSON.stringify(
    {
      selectedProfileId: data.selectedProfileId || null,
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
    },
    null,
    2
  );

  const tmpPath = `${filePath}.tmp_${Date.now()}`;
  fs.writeFileSync(tmpPath, payload, 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (_) {
    // Windows fallback if rename is busy
    fs.copyFileSync(tmpPath, filePath);
    try { fs.unlinkSync(tmpPath); } catch (__) {}
  }
}

/**
 * Lists all profiles and current active selection.
 * Returns an array of profiles with selectedProfileId attached,
 * so it works whether caller expects an array or an object.
 * @param {string} [customDir]
 * @returns {Array<Object> & { selectedProfileId: string|null, profiles: Array<Object> }}
 */
function listProfiles(customDir) {
  const data = loadProfiles(customDir);
  const list = [...data.profiles];
  list.selectedProfileId = data.selectedProfileId;
  list.profiles = list;
  return list;
}

/**
 * Creates a new profile.
 * @param {Object} input
 * @param {string} [customDir]
 * @returns {Object} created profile
 */
function createProfile(input, customDir) {
  if (!input || typeof input !== 'object') {
    throw new Error('Profile input must be an object');
  }

  const name = validateProfileName(input.name);
  const platform = validatePlatform(input.platform);
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : true;
  const variationPreset = normalizeVariationPreset(input.variationPreset);
  const captionTemplateId = validateCaptionTemplateId(input.captionTemplateId, customDir);
  const variationPresetId = validateVariationPresetId(input.variationPresetId, customDir);

  const data = loadProfiles(customDir);

  // Generate guaranteed unique ID
  let id = generateProfileId();
  while (data.profiles.some(p => p.id === id)) {
    id = generateProfileId();
  }

  const now = new Date().toISOString();
  const newProfile = {
    id,
    name,
    platform,
    enabled,
    variationPreset,
    variationPresetId,
    captionTemplateId,
    createdAt: now,
    updatedAt: now,
  };

  data.profiles.push(newProfile);

  // If this is the only profile, select it by default
  if (!data.selectedProfileId && data.profiles.length === 1) {
    data.selectedProfileId = id;
  }

  saveProfiles(data, customDir);
  return newProfile;
}

/**
 * Updates an existing profile.
 * @param {string} id
 * @param {Object} updates
 * @param {string} [customDir]
 * @returns {Object} updated profile
 */
function updateProfile(id, updates, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Profile ID is required');
  }
  if (!updates || typeof updates !== 'object') {
    throw new Error('Updates must be an object');
  }

  const data = loadProfiles(customDir);
  const idx = data.profiles.findIndex(p => p.id === id);
  if (idx === -1) {
    throw new Error(`Profile not found: ${id}`);
  }

  const existing = data.profiles[idx];
  const name = updates.name !== undefined ? validateProfileName(updates.name) : existing.name;
  const platform = updates.platform !== undefined ? validatePlatform(updates.platform) : existing.platform;
  const enabled = updates.enabled !== undefined ? Boolean(updates.enabled) : existing.enabled;

  let variationPreset = existing.variationPreset;
  if (updates.variationPreset !== undefined) {
    variationPreset = normalizeVariationPreset(updates.variationPreset);
  }

  let captionTemplateId = existing.captionTemplateId !== undefined ? existing.captionTemplateId : null;
  if (updates.captionTemplateId !== undefined) {
    captionTemplateId = validateCaptionTemplateId(updates.captionTemplateId, customDir);
  }

  let variationPresetId = existing.variationPresetId !== undefined ? existing.variationPresetId : null;
  if (updates.variationPresetId !== undefined) {
    variationPresetId = validateVariationPresetId(updates.variationPresetId, customDir);
  }

  const updatedProfile = {
    ...existing,
    id: existing.id, // Strictly preserve original ID
    name,
    platform,
    enabled,
    variationPreset,
    variationPresetId,
    captionTemplateId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  data.profiles[idx] = updatedProfile;
  saveProfiles(data, customDir);
  return updatedProfile;
}

/**
 * Deletes a profile.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {boolean} true if deleted
 */
function deleteProfile(id, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Profile ID is required');
  }

  const data = loadProfiles(customDir);
  const initialCount = data.profiles.length;
  data.profiles = data.profiles.filter(p => p.id !== id);

  if (data.profiles.length === initialCount) {
    throw new Error(`Profile not found: ${id}`);
  }

  if (data.selectedProfileId === id) {
    // Select first remaining profile or null
    data.selectedProfileId = data.profiles.length > 0 ? data.profiles[0].id : null;
  }

  saveProfiles(data, customDir);
  return true;
}

/**
 * Duplicates an existing profile.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object} cloned profile
 */
function duplicateProfile(id, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Profile ID is required');
  }

  const data = loadProfiles(customDir);
  const existing = data.profiles.find(p => p.id === id);
  if (!existing) {
    throw new Error(`Profile not found: ${id}`);
  }

  // Generate unique copy name (e.g. "Name Copy", "Name Copy 2")
  const existingNames = data.profiles.map(p => p.name);
  const lowerNames = existingNames.map(n => n.toLowerCase());
  const match = existing.name.match(/^(.*?)\s+Copy(\s+(\d+))?$/i);
  const root = match ? match[1] : existing.name;

  let copyName = `${root} Copy`;
  if (copyName.length > MAX_NAME_LENGTH) {
    copyName = copyName.slice(0, MAX_NAME_LENGTH).trim();
  }

  if (lowerNames.includes(copyName.toLowerCase())) {
    let counter = 2;
    while (true) {
      let numbered = `${root} Copy ${counter}`;
      if (numbered.length > MAX_NAME_LENGTH) {
        numbered = numbered.slice(0, MAX_NAME_LENGTH).trim();
      }
      if (!lowerNames.includes(numbered.toLowerCase())) {
        copyName = numbered;
        break;
      }
      counter++;
    }
  }

  let newId = generateProfileId();
  while (data.profiles.some(p => p.id === newId)) {
    newId = generateProfileId();
  }

  const now = new Date().toISOString();
  const clonedProfile = {
    id: newId,
    name: copyName,
    platform: existing.platform,
    enabled: existing.enabled,
    variationPreset: { ...existing.variationPreset },
    variationPresetId: existing.variationPresetId !== undefined ? existing.variationPresetId : null,
    captionTemplateId: existing.captionTemplateId !== undefined ? existing.captionTemplateId : null,
    createdAt: now,
    updatedAt: now,
  };

  data.profiles.push(clonedProfile);
  saveProfiles(data, customDir);
  return clonedProfile;
}

/**
 * Sets the active selected profile ID.
 * @param {string|null} id
 * @param {string} [customDir]
 * @returns {string|null}
 */
function setSelectedProfile(id, customDir) {
  const data = loadProfiles(customDir);

  if (id === null || id === undefined || id === '') {
    data.selectedProfileId = null;
  } else {
    const exists = data.profiles.some(p => p.id === id);
    if (!exists) {
      throw new Error(`Cannot select non-existent profile: ${id}`);
    }
    data.selectedProfileId = id;
  }

  saveProfiles(data, customDir);
  return data.selectedProfileId;
}

/**
 * Resolves a profile variation preset into export-ready configuration,
 * clamping values safely within product bounds to ensure invalid values
 * never reach FFmpeg.
 * @param {Object} [variationPreset]
 * @returns {Object}
 */
const REFRAME_MODES = ['center', 'left', 'right', 'top', 'bottom'];

function getDefaultVariation() {
  return {
    enabled: false,
    brightness: 0,
    saturation: 1,
    hue: 0,
    pitch: 0,
    speed: 1.0,
    mode: 'center',
    crop: 0,
    cleanMetadata: true,
  };
}

function resolveProfilePreset(variationPreset) {
  if (!variationPreset || typeof variationPreset !== 'object') {
    return getDefaultVariation();
  }

  const clamp = (v, min, max, def) => {
    const n = Number(v);
    if (typeof v === 'boolean' || isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  };

  const brightness = clamp(variationPreset.brightness, -1.0, 1.0, 0.0);
  const saturation = clamp(variationPreset.saturation, 0.0, 3.0, 1.0);
  const hue = clamp(variationPreset.hue, -180.0, 180.0, 0.0);
  const pitch = clamp(variationPreset.pitch, -3.0, 3.0, 0.0);
  const speed = clamp(variationPreset.speed, 1.00, 1.05, 1.00);
  const crop = clamp(variationPreset.crop, 0.0, 2.0, 0.0);

  const rawMode = variationPreset.mode || variationPreset.reframeMode || 'center';
  const mode = REFRAME_MODES.includes(String(rawMode).toLowerCase().trim())
    ? String(rawMode).toLowerCase().trim()
    : 'center';

  const cleanMetadata = variationPreset.cleanMetadata !== undefined
    ? Boolean(variationPreset.cleanMetadata)
    : true;

  return {
    enabled: true,
    brightness,
    saturation,
    hue,
    pitch,
    speed,
    mode,
    crop,
    cleanMetadata,
  };
}

module.exports = {
  SUPPORTED_PLATFORMS,
  MAX_NAME_LENGTH,
  validateProfileName,
  validatePlatform,
  normalizeVariationPreset,
  resolveProfilePreset,
  getDefaultVariation,
  loadProfiles,
  saveProfiles,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  setSelectedProfile,
  validateCaptionTemplateId,
  resolveProfileCaptionTemplate,
  validateVariationPresetId,
  resolveProfileVariationPreset,
};
