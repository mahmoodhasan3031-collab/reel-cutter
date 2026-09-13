'use strict';

/**
 * Caption Template Manager — Phase 4B-1
 *
 * Local caption template library management for Reel Cutter.
 * Provides validated, immutable built-in presets and persistent custom templates.
 *
 * Persists custom templates to caption-templates.json in Electron userData (or customDir for tests).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { validateTextOverlayConfig } = require('../../engine/textOverlayValidator');
const logger = require('../logger');

const CAPTION_TEMPLATES_FILENAME = 'caption-templates.json';
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 1;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_OVERLAYS = 5;

let _counter = 0;
function generateTemplateId() {
  return `tpl_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
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
 * 5 Canonical, Immutable Built-in Templates (Phase 4B-1)
 *
 * 1. Clean: Simple white text, subtle background, bottom position, clean readable style
 * 2. Bold: Larger bold text, high contrast outline, strong readability
 * 3. Minimal: Simple typography, low visual weight, clean layout
 * 4. Promo: Stronger text treatment, vibrant color, readable background box
 * 5. Social: Short-form social media style, high contrast, safe margins
 */
const CANONICAL_BUILTINS = [
  {
    id: 'tpl_builtin_clean',
    name: 'Clean',
    description: 'Clean white captions with high readability and subtle bottom positioning',
    isBuiltIn: true,
    overlays: [
      {
        id: 'clean_ov_1',
        text: 'Clean Caption Text',
        fontFamily: 'Arial',
        fontSize: 48,
        fontWeight: 'normal',
        color: '#FFFFFF',
        opacity: 1,
        backgroundColor: '#000000',
        backgroundOpacity: 0.3,
        outlineColor: '#000000',
        outlineWidth: 0,
        position: 'bottom',
        x: 0.5,
        y: 0.9,
        alignment: 'center',
        startTime: 0,
        endTime: null,
        enabled: true
      }
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'tpl_builtin_bold',
    name: 'Bold',
    description: 'High-impact bold typography with dark outline for maximum legibility',
    isBuiltIn: true,
    overlays: [
      {
        id: 'bold_ov_1',
        text: 'Bold Headline Caption',
        fontFamily: 'Arial',
        fontSize: 54,
        fontWeight: 'bold',
        color: '#FFFFFF',
        opacity: 1,
        backgroundColor: '#000000',
        backgroundOpacity: 0,
        outlineColor: '#000000',
        outlineWidth: 3,
        position: 'bottom',
        x: 0.5,
        y: 0.88,
        alignment: 'center',
        startTime: 0,
        endTime: null,
        enabled: true
      }
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'tpl_builtin_minimal',
    name: 'Minimal',
    description: 'Understated, classic serif subtitle text with lightweight visual presence',
    isBuiltIn: true,
    overlays: [
      {
        id: 'minimal_ov_1',
        text: 'Minimal subtitle text',
        fontFamily: 'Georgia',
        fontSize: 32,
        fontWeight: 'normal',
        color: '#FFFFFF',
        opacity: 0.9,
        backgroundColor: '#000000',
        backgroundOpacity: 0,
        outlineColor: '#000000',
        outlineWidth: 0,
        position: 'bottom',
        x: 0.5,
        y: 0.92,
        alignment: 'center',
        startTime: 0,
        endTime: null,
        enabled: true
      }
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'tpl_builtin_promo',
    name: 'Promo',
    description: 'Vibrant text with solid contrast box suitable for calls-to-action and promotions',
    isBuiltIn: true,
    overlays: [
      {
        id: 'promo_ov_1',
        text: 'SPECIAL PROMO • TAP LINK',
        fontFamily: 'Tahoma',
        fontSize: 44,
        fontWeight: 'bold',
        color: '#FFCC00',
        opacity: 1,
        backgroundColor: '#000000',
        backgroundOpacity: 0.75,
        outlineColor: '#000000',
        outlineWidth: 2,
        position: 'bottom',
        x: 0.5,
        y: 0.88,
        alignment: 'center',
        startTime: 0,
        endTime: null,
        enabled: true
      }
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'tpl_builtin_social',
    name: 'Social',
    description: 'High-contrast readable caption layout optimized for mobile social feeds',
    isBuiltIn: true,
    overlays: [
      {
        id: 'social_ov_1',
        text: 'WATCH UNTIL THE END',
        fontFamily: 'Verdana',
        fontSize: 42,
        fontWeight: 'bold',
        color: '#FFFFFF',
        opacity: 1,
        backgroundColor: '#000000',
        backgroundOpacity: 0.65,
        outlineColor: '#000000',
        outlineWidth: 2,
        position: 'bottom',
        x: 0.5,
        y: 0.88,
        alignment: 'center',
        startTime: 0,
        endTime: null,
        enabled: true
      }
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

/**
 * Resolves the path to the caption-templates.json file.
 * @param {string} [customDir]
 * @returns {string}
 */
function getCaptionTemplatesFilePath(customDir) {
  if (customDir) {
    return path.join(customDir, CAPTION_TEMPLATES_FILENAME);
  }
  try {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.appdata');
    return path.join(userData, CAPTION_TEMPLATES_FILENAME);
  } catch {
    return path.join(process.cwd(), CAPTION_TEMPLATES_FILENAME);
  }
}

/**
 * Validates template name.
 * @param {*} name
 * @returns {string}
 */
function validateTemplateName(name) {
  if (typeof name !== 'string') {
    throw new Error('Template name is required and must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) {
    throw new Error('Template name cannot be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Template name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Validates template description.
 * @param {*} desc
 * @returns {string}
 */
function validateTemplateDescription(desc) {
  if (desc === undefined || desc === null) return '';
  if (typeof desc !== 'string') {
    throw new Error('Template description must be a string');
  }
  const trimmed = desc.trim();
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Template description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Validates template input data.
 * @param {Object} input
 * @param {boolean} [isUpdate=false]
 * @returns {{ name: string, description: string, overlays: Array<Object> }}
 */
function validateTemplateInput(input, isUpdate = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Template input must be a non-null object');
  }

  // Reject unexpected executable/function injection
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'function') {
      throw new Error(`Invalid property ${k}: functions are not allowed`);
    }
  }

  let name;
  if (!isUpdate || input.name !== undefined) {
    name = validateTemplateName(input.name);
  }

  let description;
  if (input.description !== undefined) {
    description = validateTemplateDescription(input.description);
  }

  let overlays;
  if (!isUpdate || input.overlays !== undefined) {
    if (!Array.isArray(input.overlays)) {
      throw new Error('Template overlays must be an array');
    }
    if (input.overlays.length === 0) {
      throw new Error('Template must contain at least one overlay');
    }
    if (input.overlays.length > MAX_OVERLAYS) {
      throw new Error(`Template cannot contain more than ${MAX_OVERLAYS} overlays`);
    }
    // Re-use authoritative text overlay validator
    overlays = validateTextOverlayConfig(input.overlays, { fallbackFont: false });
  }

  return { name, description, overlays };
}

/**
 * Loads custom templates from disk, safely recovering if file is corrupt or missing.
 * @param {string} [customDir]
 * @returns {Array<Object>} custom templates array
 */
function loadCustomTemplates(customDir) {
  const filePath = getCaptionTemplatesFilePath(customDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const candidateList = Array.isArray(parsed) ? parsed : Array.isArray(parsed.templates) ? parsed.templates : [];

    const validCustom = [];
    for (const item of candidateList) {
      if (!item || typeof item !== 'object' || !item.id || item.isBuiltIn) {
        continue;
      }
      try {
        const validated = validateTemplateInput(item, false);
        validCustom.push({
          id: String(item.id),
          name: validated.name,
          description: validated.description,
          isBuiltIn: false,
          overlays: validated.overlays,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        });
      } catch (itemErr) {
        logger.warn('CaptionTemplates', `Skipping invalid template record during load: ${itemErr.message}`);
      }
    }
    return validCustom;
  } catch (err) {
    logger.warn('CaptionTemplates', `Failed to read or parse ${filePath}: ${err.message}. Recovering safely.`);
    return [];
  }
}

/**
 * Atomically saves custom templates to disk.
 * @param {Array<Object>} customTemplates
 * @param {string} [customDir]
 */
function saveCustomTemplates(customTemplates, customDir) {
  const filePath = getCaptionTemplatesFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = JSON.stringify(
    {
      version: 1,
      templates: customTemplates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isBuiltIn: false,
        overlays: t.overlays,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
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
    // Windows rename fallback if target is briefly held
    fs.copyFileSync(tmpPath, filePath);
    try { fs.unlinkSync(tmpPath); } catch (__) {}
  }
}

/**
 * Lists all caption templates (canonical built-ins + saved custom templates).
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function getCaptionTemplates(customDir) {
  const custom = loadCustomTemplates(customDir);
  return [...deepClone(CANONICAL_BUILTINS), ...custom];
}

/**
 * Retrieves a single caption template by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getCaptionTemplate(id, customDir) {
  if (!id || typeof id !== 'string') return null;

  // 1. Check built-ins first
  const builtin = CANONICAL_BUILTINS.find(b => b.id === id);
  if (builtin) {
    return deepClone(builtin);
  }

  // 2. Check custom templates
  const custom = loadCustomTemplates(customDir);
  const found = custom.find(c => c.id === id);
  return found ? deepClone(found) : null;
}

/**
 * Creates a new custom caption template.
 * @param {Object} data
 * @param {string} [customDir]
 * @returns {Object} created template
 */
function createCaptionTemplate(data, customDir) {
  const validated = validateTemplateInput(data, false);
  const custom = loadCustomTemplates(customDir);

  const now = new Date().toISOString();
  const newTemplate = {
    id: generateTemplateId(),
    name: validated.name,
    description: validated.description,
    isBuiltIn: false,
    overlays: validated.overlays,
    createdAt: now,
    updatedAt: now,
  };

  custom.push(newTemplate);
  saveCustomTemplates(custom, customDir);
  logger.info('CaptionTemplates', `Created custom template: ${newTemplate.name} (${newTemplate.id})`);
  return deepClone(newTemplate);
}

/**
 * Updates an existing custom caption template.
 * Reject attempts to modify built-in templates.
 * @param {string} id
 * @param {Object} data
 * @param {string} [customDir]
 * @returns {Object} updated template
 */
function updateCaptionTemplate(id, data, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Template ID is required');
  }

  const builtin = CANONICAL_BUILTINS.find(b => b.id === id);
  if (builtin) {
    throw new Error('Built-in templates cannot be modified');
  }

  const custom = loadCustomTemplates(customDir);
  const idx = custom.findIndex(c => c.id === id);
  if (idx === -1) {
    throw new Error(`Caption template not found: ${id}`);
  }

  const validated = validateTemplateInput(data, true);
  const target = custom[idx];

  if (validated.name !== undefined) target.name = validated.name;
  if (validated.description !== undefined) target.description = validated.description;
  if (validated.overlays !== undefined) target.overlays = validated.overlays;
  target.updatedAt = new Date().toISOString();

  saveCustomTemplates(custom, customDir);
  logger.info('CaptionTemplates', `Updated custom template: ${target.name} (${target.id})`);
  return deepClone(target);
}

/**
 * Deletes a custom caption template.
 * Rejects attempts to delete built-in templates.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ success: boolean, id: string }}
 */
function deleteCaptionTemplate(id, customDir) {
  if (!id || typeof id !== 'string') {
    throw new Error('Template ID is required');
  }

  const builtin = CANONICAL_BUILTINS.find(b => b.id === id);
  if (builtin) {
    throw new Error('Built-in templates cannot be deleted');
  }

  const custom = loadCustomTemplates(customDir);
  const filtered = custom.filter(c => c.id !== id);
  if (filtered.length === custom.length) {
    throw new Error(`Caption template not found: ${id}`);
  }

  saveCustomTemplates(filtered, customDir);
  logger.info('CaptionTemplates', `Deleted custom template: ${id}`);
  return { success: true, id };
}

/**
 * Duplicates a built-in or custom caption template into a new custom template.
 * Deep-clones all overlay data and appends ' Copy' to the name.
 * @param {string} id
 * @param {Object} [overrides={}]
 * @param {string} [customDir]
 * @returns {Object} newly created custom template
 */
function duplicateCaptionTemplate(id, overrides = {}, customDir) {
  const source = getCaptionTemplate(id, customDir);
  if (!source) {
    throw new Error(`Caption template not found: ${id}`);
  }

  let dupName = overrides.name ? String(overrides.name).trim() : `${source.name} Copy`;
  if (dupName.length > MAX_NAME_LENGTH) {
    dupName = dupName.slice(0, MAX_NAME_LENGTH);
  }

  const custom = loadCustomTemplates(customDir);
  const now = new Date().toISOString();

  const duplicated = {
    id: generateTemplateId(),
    name: dupName,
    description: overrides.description !== undefined
      ? validateTemplateDescription(overrides.description)
      : source.description,
    isBuiltIn: false,
    overlays: deepClone(overrides.overlays ? validateTextOverlayConfig(overrides.overlays) : source.overlays),
    createdAt: now,
    updatedAt: now,
  };

  custom.push(duplicated);
  saveCustomTemplates(custom, customDir);
  logger.info('CaptionTemplates', `Duplicated template ${source.name} (${source.id}) -> ${duplicated.name} (${duplicated.id})`);
  return deepClone(duplicated);
}

/**
 * Resets built-in templates to their canonical definitions.
 * Does NOT delete or alter custom templates.
 * @param {string} [customDir]
 * @returns {Array<Object>} all templates after reset
 */
function resetCaptionTemplates(customDir) {
  logger.info('CaptionTemplates', 'Resetting built-in caption templates to canonical definitions');
  // Built-ins are code-defined and immutable; custom templates remain preserved
  return getCaptionTemplates(customDir);
}

module.exports = {
  CAPTION_TEMPLATES_FILENAME,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_OVERLAYS,
  CANONICAL_BUILTINS,
  getCaptionTemplatesFilePath,
  validateTemplateName,
  validateTemplateDescription,
  validateTemplateInput,
  getCaptionTemplates,
  getCaptionTemplate,
  createCaptionTemplate,
  updateCaptionTemplate,
  deleteCaptionTemplate,
  duplicateCaptionTemplate,
  resetCaptionTemplates,
  deepClone,
};
