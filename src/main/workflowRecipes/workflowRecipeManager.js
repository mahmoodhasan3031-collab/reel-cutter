'use strict';

/**
 * Workflow Recipe Manager — Phase 5K
 *
 * Manages reusable, immutable production configurations ("recipes")
 * that combine existing export settings with profile/preset/caption
 * configuration into one reusable workflow.
 *
 * Architecture:
 *   Built-in recipes: 5 canonical recipes defined in code (immutable)
 *   Custom recipes: stored in workflow-recipes.json (CRUD)
 *   Snapshots: deep cloned at creation time, never mutated
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Constants ──────────────────────────────────────────────────────────────

const RECIPES_FILENAME = 'workflow-recipes.json';
const MAX_CUSTOM_RECIPES = 50;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

let _counter = 0;
function generateRecipeId() {
  return `recipe_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Built-in Recipes ───────────────────────────────────────────────────────

const CANONICAL_BUILTIN_RECIPES = [
  {
    id: 'recipe_builtin_quick_reel',
    name: 'Quick Reel',
    description: 'Fast 9:16 reel export with blur mode — ideal for Instagram Reels and TikTok',
    isBuiltIn: true,
    exportType: 'reel',
    profileId: null,
    profileSnapshot: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    variationPresetId: null,
    variationPresetSnapshot: null,
    variationOverrides: null,
    captionTemplateId: null,
    captionTemplateSnapshot: null,
    textOverlays: [],
    outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
  },
  {
    id: 'recipe_builtin_clean_social',
    name: 'Clean Social Export',
    description: 'Standard 1:1 square export for Facebook and Instagram feed posts',
    isBuiltIn: true,
    exportType: 'cut',
    profileId: null,
    profileSnapshot: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    variationPresetId: null,
    variationPresetSnapshot: null,
    variationOverrides: null,
    captionTemplateId: null,
    captionTemplateSnapshot: null,
    textOverlays: [],
    outputSettings: { mode: 'crop', aspectRatio: '1:1', resolution: '1080p' },
  },
  {
    id: 'recipe_builtin_captioned_reel',
    name: 'Captioned Reel',
    description: '9:16 reel with built-in bottom caption overlay for accessible short-form content',
    isBuiltIn: true,
    exportType: 'reel',
    profileId: null,
    profileSnapshot: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    variationPresetId: null,
    variationPresetSnapshot: null,
    variationOverrides: null,
    captionTemplateId: null,
    captionTemplateSnapshot: null,
    textOverlays: [
      {
        id: 'recipe_caption_default',
        text: '',
        fontFamily: 'Arial',
        fontSize: 48,
        fontWeight: 'bold',
        color: '#FFFFFF',
        opacity: 1,
        backgroundColor: '#000000',
        backgroundOpacity: 0.6,
        outlineColor: '#000000',
        outlineWidth: 2,
        position: 'bottom',
        x: 0.5,
        y: 0.9,
        alignment: 'center',
        startTime: 0,
        endTime: null,
        enabled: true,
      },
    ],
    outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
  },
  {
    id: 'recipe_builtin_vertical_short',
    name: 'Vertical Short',
    description: '9:16 vertical export optimized for YouTube Shorts and Snapchat Spotlight',
    isBuiltIn: true,
    exportType: 'reel',
    profileId: null,
    profileSnapshot: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    variationPresetId: null,
    variationPresetSnapshot: null,
    variationOverrides: null,
    captionTemplateId: null,
    captionTemplateSnapshot: null,
    textOverlays: [],
    outputSettings: { mode: 'pad', aspectRatio: '9:16', resolution: '1080p' },
  },
  {
    id: 'recipe_builtin_bulk_social',
    name: 'Bulk Social Package',
    description: 'Multi-format split into 30-second reels — perfect for batch social media posting',
    isBuiltIn: true,
    exportType: 'split',
    profileId: null,
    profileSnapshot: null,
    exportPresetId: null,
    exportPresetSnapshot: null,
    variationPresetId: null,
    variationPresetSnapshot: null,
    variationOverrides: null,
    captionTemplateId: null,
    captionTemplateSnapshot: null,
    textOverlays: [],
    outputSettings: { mode: 'blur', aspectRatio: '9:16', resolution: '1080p', interval: 30 },
  },
];

const BUILTIN_IDS = new Set(CANONICAL_BUILTIN_RECIPES.map((r) => r.id));

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_EXPORT_TYPES = ['cut', 'reel', 'split'];
const VALID_ASPECT_RATIOS = ['9:16', '1:1', '4:5', '16:9'];
const VALID_RESOLUTIONS = ['1080p', '4k'];
const VALID_MODES = ['blur', 'crop', 'pad', 'smart_crop'];

function assertNoPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return;
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerous.includes(key)) {
      throw new Error(`Rejected property: ${key}`);
    }
    if (typeof obj[key] === 'function') {
      throw new Error(`Function values are not allowed in recipe data`);
    }
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      assertNoPrototypePollution(obj[key]);
    }
  }
}

function validateRecipeName(name) {
  if (!name || typeof name !== 'string') throw new Error('Recipe name is required');
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error('Recipe name cannot be empty');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`Recipe name must be ${MAX_NAME_LENGTH} characters or less`);
  return trimmed;
}

function validateRecipeDescription(desc) {
  if (desc === null || desc === undefined) return '';
  if (typeof desc !== 'string') throw new Error('Description must be a string');
  const trimmed = desc.trim();
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
  return trimmed;
}

function validateExportType(type) {
  if (!type || typeof type !== 'string') throw new Error('Export type is required');
  if (!VALID_EXPORT_TYPES.includes(type)) throw new Error(`Invalid export type: ${type}. Must be one of: ${VALID_EXPORT_TYPES.join(', ')}`);
  return type;
}

function validateOutputSettings(settings) {
  if (!settings || typeof settings !== 'object') return { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' };
  const out = {};
  out.mode = VALID_MODES.includes(settings.mode) ? settings.mode : 'blur';
  out.aspectRatio = VALID_ASPECT_RATIOS.includes(settings.aspectRatio) ? settings.aspectRatio : '9:16';
  out.resolution = VALID_RESOLUTIONS.includes(settings.resolution) ? settings.resolution : '1080p';
  if (typeof settings.interval === 'number' && settings.interval > 0) {
    out.interval = Math.max(1, Math.min(300, Math.round(settings.interval)));
  }
  return out;
}

function validateTextOverlays(overlays) {
  if (!Array.isArray(overlays)) return [];
  return overlays.filter((o) => o && typeof o === 'object' && typeof o.id === 'string').map((o) => ({
    id: String(o.id).slice(0, 50),
    text: typeof o.text === 'string' ? o.text.slice(0, 500) : '',
    fontFamily: typeof o.fontFamily === 'string' ? o.fontFamily : 'Arial',
    fontSize: typeof o.fontSize === 'number' ? Math.max(12, Math.min(160, o.fontSize)) : 48,
    fontWeight: ['normal', 'bold'].includes(o.fontWeight) ? o.fontWeight : 'normal',
    color: typeof o.color === 'string' ? o.color : '#FFFFFF',
    opacity: typeof o.opacity === 'number' ? Math.max(0, Math.min(1, o.opacity)) : 1,
    backgroundColor: typeof o.backgroundColor === 'string' ? o.backgroundColor : '#000000',
    backgroundOpacity: typeof o.backgroundOpacity === 'number' ? Math.max(0, Math.min(1, o.backgroundOpacity)) : 0.3,
    outlineColor: typeof o.outlineColor === 'string' ? o.outlineColor : '#000000',
    outlineWidth: typeof o.outlineWidth === 'number' ? Math.max(0, Math.min(10, o.outlineWidth)) : 0,
    position: ['top', 'center', 'bottom'].includes(o.position) ? o.position : 'bottom',
    x: typeof o.x === 'number' ? Math.max(0, Math.min(1, o.x)) : 0.5,
    y: typeof o.y === 'number' ? Math.max(0, Math.min(1, o.y)) : 0.9,
    alignment: ['left', 'center', 'right'].includes(o.alignment) ? o.alignment : 'center',
    startTime: typeof o.startTime === 'number' ? Math.max(0, o.startTime) : 0,
    endTime: typeof o.endTime === 'number' ? o.endTime : null,
    enabled: o.enabled !== false,
  }));
}

function validateRecipeInput(input, isUpdate = false) {
  if (!input || typeof input !== 'object') throw new Error('Recipe data is required');
  if (Array.isArray(input)) throw new Error('Recipe data must be an object, not an array');
  assertNoPrototypePollution(input);

  const result = {};
  if (!isUpdate || input.name !== undefined) {
    result.name = validateRecipeName(input.name);
  }
  if (!isUpdate || input.description !== undefined) {
    result.description = validateRecipeDescription(input.description);
  }
  if (!isUpdate || input.exportType !== undefined) {
    result.exportType = validateExportType(input.exportType);
  }
  if (input.profileId !== undefined) result.profileId = typeof input.profileId === 'string' ? input.profileId : null;
  if (input.profileSnapshot !== undefined) result.profileSnapshot = deepClone(input.profileSnapshot);
  if (input.exportPresetId !== undefined) result.exportPresetId = typeof input.exportPresetId === 'string' ? input.exportPresetId : null;
  if (input.exportPresetSnapshot !== undefined) result.exportPresetSnapshot = deepClone(input.exportPresetSnapshot);
  if (input.variationPresetId !== undefined) result.variationPresetId = typeof input.variationPresetId === 'string' ? input.variationPresetId : null;
  if (input.variationPresetSnapshot !== undefined) result.variationPresetSnapshot = deepClone(input.variationPresetSnapshot);
  if (input.variationOverrides !== undefined) result.variationOverrides = deepClone(input.variationOverrides);
  if (input.captionTemplateId !== undefined) result.captionTemplateId = typeof input.captionTemplateId === 'string' ? input.captionTemplateId : null;
  if (input.captionTemplateSnapshot !== undefined) result.captionTemplateSnapshot = deepClone(input.captionTemplateSnapshot);
  if (input.textOverlays !== undefined) result.textOverlays = validateTextOverlays(input.textOverlays);
  if (input.outputSettings !== undefined) result.outputSettings = validateOutputSettings(input.outputSettings);

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function getRecipesFilePath(customDir) {
  if (customDir) return path.join(customDir, RECIPES_FILENAME);
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), RECIPES_FILENAME);
  } catch {
    return path.join(process.cwd(), RECIPES_FILENAME);
  }
}

function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const json = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmp, json, 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch {
    try {
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch (finalErr) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw finalErr;
    }
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

function loadCustomRecipes(customDir) {
  const filePath = getRecipesFilePath(customDir);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.recipes)) return [];
    return data.recipes.filter((r) => r && typeof r === 'object' && !r.isBuiltIn && typeof r.id === 'string');
  } catch (err) {
    console.warn(`[WorkflowRecipes] Failed to load recipes: ${err.message}. Recovering safely.`);
    return [];
  }
}

function saveCustomRecipes(recipes, customDir) {
  const filePath = getRecipesFilePath(customDir);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    recipes: recipes.filter((r) => r && typeof r === 'object' && !r.isBuiltIn),
  };
  atomicWrite(filePath, payload);
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

function getWorkflowRecipes(customDir) {
  const custom = loadCustomRecipes(customDir);
  const customIds = new Set(custom.map((r) => r.id));
  const builtins = CANONICAL_BUILTIN_RECIPES.map((r) => deepClone(r));
  const all = [...builtins, ...custom.filter((r) => !customIds.has(r.id) || true)];
  return all.map((r) => deepClone(r));
}

function getWorkflowRecipe(id, customDir) {
  if (!id || typeof id !== 'string') return null;
  const builtin = CANONICAL_BUILTIN_RECIPES.find((r) => r.id === id);
  if (builtin) return deepClone(builtin);
  const custom = loadCustomRecipes(customDir);
  const found = custom.find((r) => r.id === id);
  return found ? deepClone(found) : null;
}

function createWorkflowRecipe(data, customDir) {
  const validated = validateRecipeInput(data, false);
  const custom = loadCustomRecipes(customDir);
  if (custom.length >= MAX_CUSTOM_RECIPES) {
    throw new Error(`Maximum custom recipes reached (${MAX_CUSTOM_RECIPES}). Delete some before creating new ones.`);
  }
  const existingNames = new Set([...CANONICAL_BUILTIN_RECIPES, ...custom].map((r) => r.name.toLowerCase()));
  let name = validated.name;
  if (existingNames.has(name.toLowerCase())) {
    let suffix = 2;
    while (existingNames.has(`${name} (${suffix})`.toLowerCase())) suffix++;
    name = `${name} (${suffix})`;
  }
  const now = new Date().toISOString();
  const recipe = {
    id: generateRecipeId(),
    name,
    description: validated.description || '',
    isBuiltIn: false,
    exportType: validated.exportType,
    profileId: validated.profileId || null,
    profileSnapshot: validated.profileSnapshot || null,
    exportPresetId: validated.exportPresetId || null,
    exportPresetSnapshot: validated.exportPresetSnapshot || null,
    variationPresetId: validated.variationPresetId || null,
    variationPresetSnapshot: validated.variationPresetSnapshot || null,
    variationOverrides: validated.variationOverrides || null,
    captionTemplateId: validated.captionTemplateId || null,
    captionTemplateSnapshot: validated.captionTemplateSnapshot || null,
    textOverlays: validated.textOverlays || [],
    outputSettings: validated.outputSettings || { mode: 'blur', aspectRatio: '9:16', resolution: '1080p' },
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  custom.push(recipe);
  saveCustomRecipes(custom, customDir);
  return deepClone(recipe);
}

function updateWorkflowRecipe(id, data, customDir) {
  if (!id || typeof id !== 'string') throw new Error('Recipe ID is required');
  if (BUILTIN_IDS.has(id)) throw new Error('Cannot modify built-in recipes');
  const custom = loadCustomRecipes(customDir);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Recipe not found: ${id}`);
  const validated = validateRecipeInput(data, true);
  const existingNames = new Set(
    [...CANONICAL_BUILTIN_RECIPES, ...custom.filter((r) => r.id !== id)].map((r) => r.name.toLowerCase())
  );
  if (validated.name && existingNames.has(validated.name.toLowerCase())) {
    let suffix = 2;
    while (existingNames.has(`${validated.name} (${suffix})`.toLowerCase())) suffix++;
    validated.name = `${validated.name} (${suffix})`;
  }
  const updated = {
    ...custom[idx],
    ...validated,
    id,
    isBuiltIn: false,
    usageCount: custom[idx].usageCount,
    lastUsedAt: custom[idx].lastUsedAt,
    createdAt: custom[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  custom[idx] = updated;
  saveCustomRecipes(custom, customDir);
  return deepClone(updated);
}

function deleteWorkflowRecipe(id, customDir) {
  if (!id || typeof id !== 'string') throw new Error('Recipe ID is required');
  if (BUILTIN_IDS.has(id)) throw new Error('Cannot delete built-in recipes');
  const custom = loadCustomRecipes(customDir);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Recipe not found: ${id}`);
  custom.splice(idx, 1);
  saveCustomRecipes(custom, customDir);
  return { success: true, deletedId: id };
}

function duplicateWorkflowRecipe(id, overrides, customDir) {
  const source = getWorkflowRecipe(id, customDir);
  if (!source) throw new Error(`Recipe not found: ${id}`);
  const custom = loadCustomRecipes(customDir);
  if (custom.length >= MAX_CUSTOM_RECIPES) {
    throw new Error(`Maximum custom recipes reached (${MAX_CUSTOM_RECIPES})`);
  }
  const existingNames = new Set([...CANONICAL_BUILTIN_RECIPES, ...custom].map((r) => r.name.toLowerCase()));
  let name = `${source.name} (Copy)`;
  if (existingNames.has(name.toLowerCase())) {
    let suffix = 2;
    while (existingNames.has(`${source.name} (Copy ${suffix})`.toLowerCase())) suffix++;
    name = `${source.name} (Copy ${suffix})`;
  }
  const now = new Date().toISOString();
  const duplicate = {
    ...deepClone(source),
    id: generateRecipeId(),
    name: (overrides && overrides.name) || name,
    description: (overrides && overrides.description !== undefined) ? overrides.description : source.description,
    isBuiltIn: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  custom.push(duplicate);
  saveCustomRecipes(custom, customDir);
  return deepClone(duplicate);
}

function searchWorkflowRecipes(query, customDir) {
  const all = getWorkflowRecipes(customDir);
  if (!query || typeof query !== 'string') return all;
  const q = query.toLowerCase().trim();
  return all.filter(
    (r) =>
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.exportType && r.exportType.toLowerCase().includes(q))
  );
}

function filterWorkflowRecipes(filters, customDir) {
  let recipes = getWorkflowRecipes(customDir);
  if (!filters || typeof filters !== 'object') return recipes;
  if (filters.exportType) {
    const ft = String(filters.exportType).toLowerCase();
    recipes = recipes.filter((r) => r.exportType === ft);
  }
  if (filters.isBuiltIn !== undefined) {
    recipes = recipes.filter((r) => r.isBuiltIn === filters.isBuiltIn);
  }
  if (filters.query) {
    const q = String(filters.query).toLowerCase().trim();
    recipes = recipes.filter(
      (r) =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }
  return recipes;
}

function incrementUsageCount(id, customDir) {
  const custom = loadCustomRecipes(customDir);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx !== -1) {
    custom[idx].usageCount = (custom[idx].usageCount || 0) + 1;
    custom[idx].lastUsedAt = new Date().toISOString();
    custom[idx].updatedAt = new Date().toISOString();
    saveCustomRecipes(custom, customDir);
  }
}

function resetWorkflowRecipes(customDir) {
  saveCustomRecipes([], customDir);
  return CANONICAL_BUILTIN_RECIPES.map((r) => deepClone(r));
}

function applyWorkflowRecipe(recipeOrId, customDir) {
  const recipe = typeof recipeOrId === 'string' ? getWorkflowRecipe(recipeOrId, customDir) : recipeOrId;
  if (!recipe) throw new Error('Recipe not found');
  return {
    exportType: recipe.exportType,
    profileId: recipe.profileId || null,
    profileSnapshot: deepClone(recipe.profileSnapshot),
    exportPresetId: recipe.exportPresetId || null,
    exportPresetSnapshot: deepClone(recipe.exportPresetSnapshot),
    variationPresetId: recipe.variationPresetId || null,
    variationPresetSnapshot: deepClone(recipe.variationPresetSnapshot),
    variationOverrides: deepClone(recipe.variationOverrides),
    captionTemplateId: recipe.captionTemplateId || null,
    captionTemplateSnapshot: deepClone(recipe.captionTemplateSnapshot),
    textOverlays: validateTextOverlays(recipe.textOverlays),
    outputSettings: validateOutputSettings(recipe.outputSettings),
  };
}

function getRecipeUsageStats(customDir) {
  const all = getWorkflowRecipes(customDir);
  return all
    .map((r) => ({
      id: r.id,
      name: r.name,
      isBuiltIn: r.isBuiltIn,
      usageCount: r.usageCount || 0,
      lastUsedAt: r.lastUsedAt || null,
    }))
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  generateRecipeId,
  validateRecipeName,
  validateRecipeDescription,
  validateExportType,
  validateOutputSettings,
  validateTextOverlays,
  validateRecipeInput,
  assertNoPrototypePollution,
  deepClone,
  getRecipesFilePath,
  loadCustomRecipes,
  saveCustomRecipes,
  getWorkflowRecipes,
  getWorkflowRecipe,
  createWorkflowRecipe,
  updateWorkflowRecipe,
  deleteWorkflowRecipe,
  duplicateWorkflowRecipe,
  searchWorkflowRecipes,
  filterWorkflowRecipes,
  incrementUsageCount,
  resetWorkflowRecipes,
  applyWorkflowRecipe,
  getRecipeUsageStats,
  CANONICAL_BUILTIN_RECIPES,
  BUILTIN_IDS,
  VALID_EXPORT_TYPES,
  VALID_ASPECT_RATIOS,
  VALID_RESOLUTIONS,
  VALID_MODES,
  MAX_CUSTOM_RECIPES,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  RECIPES_FILENAME,
};
