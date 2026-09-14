'use strict';

/**
 * Caption Experiment & Optimization Manager — Phase 4B-9
 *
 * Implements a complete A/B creative caption experiment and optimization system:
 * - Validated experiment and variant data models
 * - Non-destructive, immutable variant versioning
 * - Persistence to %APPDATA%/Reel Cutter/caption-experiments.json (atomic writes, 100 limit FIFO, safe recovery)
 * - Reuse of existing quality analyzer (captionQualityAnalyzer.js)
 * - Reuse of existing AI provider abstraction (MockAiProvider & HttpAiProvider)
 * - Read-only side-by-side variant comparison with heuristic disclaimers
 * - Best variant detection and experiment-wide weakest signal analysis
 * - Smart heuristic variant optimization (before/after comparison)
 * - Multi-profile bulk experiment with snapshot isolation
 * - Integrations with Text Overlay, Caption Templates, and Caption History
 */

const path = require('path');
const fs = require('fs');
const { analyzeCaption, MAX_CAPTION_LENGTH } = require('./captionQualityAnalyzer');
const { getActiveProvider } = require('./aiProviderAdapter');
const { validateCaptionSuggestions } = require('./aiCaptionValidator');
const { applyCaptionToOverlays } = require('./aiCaptionService');
const { createCaptionTemplate } = require('./captionTemplateManager');
const { createHistoryRecord } = require('./captionHistoryManager');

// ── Constants & Limits ───────────────────────────────────────────────────────

const MAX_EXPERIMENTS = 100;
const MAX_VARIANTS_PER_EXPERIMENT = 10;
const MIN_VARIANTS_PER_EXPERIMENT = 1;
const MAX_EXPERIMENT_NAME_LENGTH = 100;
const MAX_TOPIC_LENGTH = 500;

const ALLOWED_VARIANT_SOURCES = ['original', 'manual', 'ai', 'workspace', 'improved'];
const ALLOWED_LANGUAGES = ['english', 'bangla'];
const ALLOWED_TONES = ['professional', 'casual', 'educational', 'promotional', 'storytelling', 'neutral'];
const ALLOWED_LENGTHS = ['short', 'medium', 'long'];
const ALLOWED_PLATFORMS = ['facebook', 'instagram', 'youtube', 'tiktok', 'other', 'general'];

const LIMITS = {
  maxExperiments: MAX_EXPERIMENTS,
  maxVariants: MAX_VARIANTS_PER_EXPERIMENT,
  minVariants: MIN_VARIANTS_PER_EXPERIMENT,
  maxNameLength: MAX_EXPERIMENT_NAME_LENGTH,
  maxCaptionLength: MAX_CAPTION_LENGTH || 500,
  maxTopicLength: MAX_TOPIC_LENGTH,
  minSuggestions: 1,
  maxSuggestions: 5,
  defaultSuggestions: 3,
};

// ── Persistence Helpers ─────────────────────────────────────────────────────

function getDefaultUserDataDir() {
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'Reel Cutter');
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'Reel Cutter');
  }
  return path.join(process.env.HOME || '', '.config', 'reel-cutter');
}

function getExperimentsFilePath(customDir) {
  const baseDir = customDir || getDefaultUserDataDir();
  return path.join(baseDir, 'caption-experiments.json');
}

/**
 * Loads experiments from disk with corrupt-file recovery.
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function loadExperiments(customDir) {
  const filePath = getExperimentsFilePath(customDir);
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
      : Array.isArray(parsed?.experiments)
      ? parsed.experiments
      : [];

    const validList = [];
    for (const item of candidateList) {
      if (!item || typeof item !== 'object' || !item.id) continue;
      try {
        validateExperiment(item);
        validList.push(JSON.parse(JSON.stringify(item)));
      } catch (_) {
        // Skip malformed individual experiment without throwing
      }
    }
    return validList;
  } catch (_) {
    // Recover safely from corrupt JSON by returning empty valid list
    return [];
  }
}

/**
 * Atomically saves experiments to disk enforcing FIFO bounded limit.
 * @param {Array<Object>} experiments
 * @param {string} [customDir]
 */
function saveExperiments(experiments, customDir) {
  const filePath = getExperimentsFilePath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Enforce FIFO limit
  const trimmed = experiments.slice(0, MAX_EXPERIMENTS);

  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      experiments: trimmed,
    },
    null,
    2
  );

  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tempPath, payload, 'utf8');
    try {
      fs.renameSync(tempPath, filePath);
    } catch (_) {
      // Fallback if atomic rename fails on Windows lock
      fs.writeFileSync(filePath, payload, 'utf8');
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  } catch (writeErr) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    throw writeErr;
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

function generateExperimentId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateVariantId() {
  return `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Validates raw input for experiment creation.
 * @param {Object} raw
 * @returns {Object} Normalized experiment payload
 */
function validateExperimentInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Experiment input must be a valid object');
  }

  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error('Experiment name is required and must be a string');
  }
  const name = raw.name.trim();
  if (name.length === 0) {
    throw new Error('Experiment name cannot be empty');
  }
  if (name.length > MAX_EXPERIMENT_NAME_LENGTH) {
    throw new Error(`Experiment name exceeds maximum length of ${MAX_EXPERIMENT_NAME_LENGTH} characters`);
  }

  const rawCaption = raw.sourceCaption || raw.caption || raw.originalCaption;
  if (!rawCaption || typeof rawCaption !== 'string') {
    throw new Error('Source caption is required and must be a string');
  }
  const sourceCaption = rawCaption.trim();
  if (sourceCaption.length === 0) {
    throw new Error('Source caption cannot be empty');
  }
  if (sourceCaption.length > LIMITS.maxCaptionLength) {
    throw new Error(`Source caption exceeds maximum length of ${LIMITS.maxCaptionLength} characters`);
  }

  let topic = null;
  if (raw.topic !== undefined && raw.topic !== null && raw.topic !== '') {
    if (typeof raw.topic !== 'string') throw new Error('Topic must be a string');
    const t = raw.topic.trim();
    if (t.length > MAX_TOPIC_LENGTH) throw new Error(`Topic exceeds ${MAX_TOPIC_LENGTH} characters`);
    topic = t;
  }

  let language = 'english';
  if (raw.language !== undefined && raw.language !== null && raw.language !== '') {
    const l = String(raw.language).trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.includes(l)) {
      throw new Error(`Invalid language "${raw.language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}`);
    }
    language = l;
  }

  let tone = 'casual';
  if (raw.tone !== undefined && raw.tone !== null && raw.tone !== '') {
    const t = String(raw.tone).trim().toLowerCase();
    if (!ALLOWED_TONES.includes(t)) {
      throw new Error(`Invalid tone "${raw.tone}". Allowed: ${ALLOWED_TONES.join(', ')}`);
    }
    tone = t;
  }

  let length = 'medium';
  if (raw.length !== undefined && raw.length !== null && raw.length !== '') {
    const len = String(raw.length).trim().toLowerCase();
    if (!ALLOWED_LENGTHS.includes(len)) {
      throw new Error(`Invalid length "${raw.length}". Allowed: ${ALLOWED_LENGTHS.join(', ')}`);
    }
    length = len;
  }

  let platform = 'general';
  if (raw.platform !== undefined && raw.platform !== null && raw.platform !== '') {
    const p = String(raw.platform).trim().toLowerCase();
    if (!ALLOWED_PLATFORMS.includes(p)) {
      throw new Error(`Invalid platform "${raw.platform}". Allowed: ${ALLOWED_PLATFORMS.join(', ')}`);
    }
    platform = p;
  }

  const profileId = (raw.profileId && typeof raw.profileId === 'string') ? raw.profileId.trim() : null;
  const profileName = (raw.profileName && typeof raw.profileName === 'string') ? raw.profileName.trim() : null;
  const captionTemplateId = (raw.captionTemplateId && typeof raw.captionTemplateId === 'string') ? raw.captionTemplateId.trim() : null;

  return {
    name,
    sourceCaption,
    topic,
    language,
    tone,
    length,
    platform,
    profileId,
    profileName,
    captionTemplateId,
  };
}

/**
 * Validates variant input.
 * @param {Object} raw
 * @returns {Object} Normalized variant payload
 */
function validateVariantInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Variant must be a valid object');
  }

  const rawText = raw.text || raw.caption;
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Variant text is required and must be a string');
  }
  const text = rawText.trim();
  if (text.length === 0) {
    throw new Error('Variant text cannot be empty');
  }
  if (text.length > LIMITS.maxCaptionLength) {
    throw new Error(`Variant text exceeds maximum length of ${LIMITS.maxCaptionLength} characters`);
  }

  let name = 'Variant';
  if (raw.name !== undefined && raw.name !== null && raw.name !== '') {
    if (typeof raw.name !== 'string') throw new Error('Variant name must be a string');
    const n = raw.name.trim();
    if (n.length > MAX_EXPERIMENT_NAME_LENGTH) {
      throw new Error(`Variant name exceeds ${MAX_EXPERIMENT_NAME_LENGTH} characters`);
    }
    name = n;
  }

  let source = 'manual';
  if (raw.source !== undefined && raw.source !== null && raw.source !== '') {
    const s = String(raw.source).trim().toLowerCase();
    if (!ALLOWED_VARIANT_SOURCES.includes(s)) {
      throw new Error(`Invalid variant source "${raw.source}". Allowed: ${ALLOWED_VARIANT_SOURCES.join(', ')}`);
    }
    source = s;
  }

  return {
    name,
    text,
    source,
    qualityResult: raw.qualityResult || null,
  };
}

/**
 * Validates an entire experiment object.
 * @param {Object} exp
 * @returns {boolean}
 */
function validateExperiment(exp) {
  if (!exp || typeof exp !== 'object' || Array.isArray(exp)) {
    throw new Error('Experiment must be a valid object');
  }
  if (!exp.id || typeof exp.id !== 'string') {
    throw new Error('Experiment id is required and must be a string');
  }
  if (!exp.name || typeof exp.name !== 'string' || exp.name.trim().length === 0) {
    throw new Error('Experiment name is required');
  }
  if (!exp.sourceCaption || typeof exp.sourceCaption !== 'string') {
    throw new Error('Experiment sourceCaption is required');
  }
  if (!Array.isArray(exp.variants) || exp.variants.length < MIN_VARIANTS_PER_EXPERIMENT) {
    throw new Error(`Experiment must have at least ${MIN_VARIANTS_PER_EXPERIMENT} variant`);
  }
  if (exp.variants.length > MAX_VARIANTS_PER_EXPERIMENT) {
    throw new Error(`Experiment cannot exceed ${MAX_VARIANTS_PER_EXPERIMENT} variants`);
  }
  if (!exp.selectedVariantId || typeof exp.selectedVariantId !== 'string') {
    throw new Error('Experiment selectedVariantId is required');
  }
  const selectedExists = exp.variants.some((v) => v.id === exp.selectedVariantId);
  if (!selectedExists) {
    throw new Error(`selectedVariantId "${exp.selectedVariantId}" does not exist in variants`);
  }
  return true;
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Creates and persists a new caption experiment with an initial original variant.
 *
 * @param {Object} rawInput
 * @param {string} [customDir]
 * @returns {Object} Created experiment
 */
function createExperiment(rawInput, customDir) {
  const validated = validateExperimentInput(rawInput);
  const now = new Date().toISOString();
  const expId = generateExperimentId();
  const initialVariantId = `var_orig_${Date.now()}`;

  // Analyze initial variant quality
  let qualityResult = null;
  try {
    qualityResult = analyzeCaption({
      caption: validated.sourceCaption,
      topic: validated.topic,
      language: validated.language,
      tone: validated.tone,
      platform: validated.platform,
    });
  } catch (_) {
    qualityResult = null;
  }

  const initialVariant = {
    id: initialVariantId,
    name: 'Variant A — Original',
    text: validated.sourceCaption,
    source: 'original',
    qualityResult: qualityResult ? JSON.parse(JSON.stringify(qualityResult)) : null,
    createdAt: now,
    updatedAt: now,
  };

  const experiment = {
    id: expId,
    name: validated.name,
    sourceCaption: validated.sourceCaption,
    topic: validated.topic,
    language: validated.language,
    tone: validated.tone,
    length: validated.length,
    platform: validated.platform,
    profileId: validated.profileId,
    profileName: validated.profileName,
    captionTemplateId: validated.captionTemplateId,
    variants: [initialVariant],
    selectedVariantId: initialVariantId,
    createdAt: now,
    updatedAt: now,
  };

  validateExperiment(experiment);

  const existing = loadExperiments(customDir);
  const updated = [experiment, ...existing];
  saveExperiments(updated, customDir);

  return JSON.parse(JSON.stringify(experiment));
}

/**
 * Retrieves experiments with optional filtering, search, and sorting.
 *
 * @param {Object} [options]
 * @param {string} [options.search]
 * @param {string} [options.profileId]
 * @param {string} [options.platform]
 * @param {'newest'|'oldest'|'highest_score'|'name'} [options.sort='newest']
 * @param {string} [customDir]
 * @returns {Array<Object>}
 */
function getExperiments(options = {}, customDir) {
  if (typeof options === 'string') {
    const tmp = options;
    options = (customDir && typeof customDir === 'object') ? customDir : {};
    customDir = tmp;
  }

  let list = loadExperiments(customDir);

  // Search filter
  if (options.search && typeof options.search === 'string') {
    const q = options.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          (e.name && e.name.toLowerCase().includes(q)) ||
          (e.sourceCaption && e.sourceCaption.toLowerCase().includes(q)) ||
          (e.topic && e.topic.toLowerCase().includes(q)) ||
          (e.profileName && e.profileName.toLowerCase().includes(q))
      );
    }
  }

  // Profile filter
  if (options.profileId && typeof options.profileId === 'string') {
    list = list.filter((e) => e.profileId === options.profileId.trim());
  }

  // Platform filter
  if (options.platform && typeof options.platform === 'string') {
    const p = options.platform.trim().toLowerCase();
    list = list.filter((e) => e.platform && e.platform.toLowerCase() === p);
  }

  // Sorting
  const sortMode = (options.sort || options.sortBy || 'newest').toLowerCase();
  list.sort((a, b) => {
    if (sortMode === 'oldest') {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    }
    if (sortMode === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortMode === 'highest_score') {
      const getTopScore = (exp) => {
        let max = 0;
        for (const v of exp.variants || []) {
          const s = v.qualityResult?.score || 0;
          if (s > max) max = s;
        }
        return max;
      };
      return getTopScore(b) - getTopScore(a);
    }
    // Default newest
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return JSON.parse(JSON.stringify(list));
}

/**
 * Retrieves a single experiment by ID.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object|null}
 */
function getExperiment(id, customDir) {
  if (!id || typeof id !== 'string') return null;
  const list = loadExperiments(customDir);
  const found = list.find((e) => e.id === id.trim());
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

/**
 * Updates experiment metadata (name, topic, tone, etc.).
 * @param {string} id
 * @param {Object} updates
 * @param {string} [customDir]
 * @returns {Object} Updated experiment
 */
function updateExperiment(id, updates = {}, customDir) {
  if (!id || typeof id !== 'string') throw new Error('Experiment ID is required');
  const list = loadExperiments(customDir);
  const idx = list.findIndex((e) => e.id === id.trim());
  if (idx === -1) throw new Error(`Experiment not found: ${id}`);

  const target = JSON.parse(JSON.stringify(list[idx]));

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
      throw new Error('Experiment name cannot be empty');
    }
    if (updates.name.trim().length > MAX_EXPERIMENT_NAME_LENGTH) {
      throw new Error(`Experiment name exceeds ${MAX_EXPERIMENT_NAME_LENGTH} characters`);
    }
    target.name = updates.name.trim();
  }

  if (updates.topic !== undefined) {
    target.topic = updates.topic ? String(updates.topic).trim() : null;
  }
  if (updates.tone !== undefined && ALLOWED_TONES.includes(String(updates.tone).toLowerCase())) {
    target.tone = String(updates.tone).toLowerCase();
  }
  if (updates.length !== undefined && ALLOWED_LENGTHS.includes(String(updates.length).toLowerCase())) {
    target.length = String(updates.length).toLowerCase();
  }
  if (updates.platform !== undefined && ALLOWED_PLATFORMS.includes(String(updates.platform).toLowerCase())) {
    target.platform = String(updates.platform).toLowerCase();
  }

  target.updatedAt = new Date().toISOString();
  validateExperiment(target);

  list[idx] = target;
  saveExperiments(list, customDir);
  return JSON.parse(JSON.stringify(target));
}

/**
 * Deletes an experiment from disk.
 * @param {string} id
 * @param {string} [customDir]
 * @returns {{ success: boolean, id: string }}
 */
function deleteExperiment(id, customDir) {
  if (!id || typeof id !== 'string') throw new Error('Experiment ID is required');
  const list = loadExperiments(customDir);
  const filtered = list.filter((e) => e.id !== id.trim());
  if (filtered.length === list.length) {
    throw new Error(`Experiment not found: ${id}`);
  }
  saveExperiments(filtered, customDir);
  return { success: true, id: id.trim() };
}

/**
 * Duplicates an existing experiment with new IDs and timestamps.
 * Guarantees zero shared mutable references.
 *
 * @param {string} id
 * @param {string} [customDir]
 * @returns {Object} Newly created duplicate experiment
 */
function duplicateExperiment(id, customDir) {
  if (!id || typeof id !== 'string') throw new Error('Experiment ID is required');
  const orig = getExperiment(id, customDir);
  if (!orig) throw new Error(`Experiment not found: ${id}`);

  const now = new Date().toISOString();
  const newExpId = generateExperimentId();

  // Create new independent variant IDs
  const idMap = new Map();
  const duplicatedVariants = orig.variants.map((v, i) => {
    const newVarId = `var_${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
    idMap.set(v.id, newVarId);
    return {
      ...JSON.parse(JSON.stringify(v)),
      id: newVarId,
      createdAt: now,
      updatedAt: now,
    };
  });

  const newSelectedId = idMap.get(orig.selectedVariantId) || duplicatedVariants[0].id;

  const duplicated = {
    ...JSON.parse(JSON.stringify(orig)),
    id: newExpId,
    name: `${orig.name} (Copy)`.slice(0, MAX_EXPERIMENT_NAME_LENGTH),
    variants: duplicatedVariants,
    selectedVariantId: newSelectedId,
    createdAt: now,
    updatedAt: now,
  };

  validateExperiment(duplicated);

  const existing = loadExperiments(customDir);
  const updated = [duplicated, ...existing];
  saveExperiments(updated, customDir);

  return JSON.parse(JSON.stringify(duplicated));
}

// ── Variant Management ───────────────────────────────────────────────────────

/**
 * Adds a new variant to an existing experiment.
 * Enforces maximum 10 variants limit.
 *
 * @param {string} experimentId
 * @param {Object} rawVariant
 * @param {string} [customDir]
 * @returns {{ experiment: Object, variant: Object }}
 */
function addVariant(experimentId, rawVariant, customDir) {
  if (!experimentId || typeof experimentId !== 'string') {
    throw new Error('Experiment ID is required');
  }
  const list = loadExperiments(customDir);
  const idx = list.findIndex((e) => e.id === experimentId.trim());
  if (idx === -1) throw new Error(`Experiment not found: ${experimentId}`);

  const exp = JSON.parse(JSON.stringify(list[idx]));

  if (exp.variants.length >= MAX_VARIANTS_PER_EXPERIMENT) {
    throw new Error(`Cannot add variant: maximum limit of ${MAX_VARIANTS_PER_EXPERIMENT} variants reached`);
  }

  const validatedVar = validateVariantInput(rawVariant);

  // Analyze quality if not provided
  let qualityResult = validatedVar.qualityResult || null;
  if (!qualityResult) {
    try {
      qualityResult = analyzeCaption({
        caption: validatedVar.text,
        topic: exp.topic,
        language: exp.language,
        tone: exp.tone,
        platform: exp.platform,
      });
    } catch (_) {
      qualityResult = null;
    }
  }

  const now = new Date().toISOString();
  const nextLetter = String.fromCharCode(65 + exp.variants.length); // A, B, C, D...
  const defaultName = `Variant ${nextLetter} — ${validatedVar.source.charAt(0).toUpperCase() + validatedVar.source.slice(1)}`;

  const newVariant = {
    id: generateVariantId(),
    name: validatedVar.name !== 'Variant' ? validatedVar.name : defaultName,
    text: validatedVar.text,
    source: validatedVar.source,
    qualityResult: qualityResult ? JSON.parse(JSON.stringify(qualityResult)) : null,
    createdAt: now,
    updatedAt: now,
  };

  exp.variants.push(newVariant);
  exp.updatedAt = now;
  validateExperiment(exp);

  list[idx] = exp;
  saveExperiments(list, customDir);

  return {
    experiment: JSON.parse(JSON.stringify(exp)),
    variant: JSON.parse(JSON.stringify(newVariant)),
  };
}

/**
 * Updates a variant within an experiment.
 *
 * @param {string} experimentId
 * @param {string} variantId
 * @param {Object} rawUpdates
 * @param {string} [customDir]
 * @returns {{ experiment: Object, variant: Object }}
 */
function updateVariant(experimentId, variantId, rawUpdates = {}, customDir) {
  if (!experimentId || !variantId) throw new Error('experimentId and variantId are required');
  const list = loadExperiments(customDir);
  const expIdx = list.findIndex((e) => e.id === experimentId.trim());
  if (expIdx === -1) throw new Error(`Experiment not found: ${experimentId}`);

  const exp = JSON.parse(JSON.stringify(list[expIdx]));
  const varIdx = exp.variants.findIndex((v) => v.id === variantId.trim());
  if (varIdx === -1) throw new Error(`Variant not found: ${variantId}`);

  const targetVar = exp.variants[varIdx];
  const now = new Date().toISOString();

  if (rawUpdates.text !== undefined) {
    const text = String(rawUpdates.text).trim();
    if (!text) throw new Error('Variant text cannot be empty');
    if (text.length > LIMITS.maxCaptionLength) {
      throw new Error(`Variant text exceeds ${LIMITS.maxCaptionLength} characters`);
    }
    targetVar.text = text;
    // Re-analyze quality
    try {
      targetVar.qualityResult = analyzeCaption({
        caption: text,
        topic: exp.topic,
        language: exp.language,
        tone: exp.tone,
        platform: exp.platform,
      });
    } catch (_) {
      targetVar.qualityResult = null;
    }
  }

  if (rawUpdates.name !== undefined) {
    const name = String(rawUpdates.name).trim();
    if (!name) throw new Error('Variant name cannot be empty');
    targetVar.name = name.slice(0, MAX_EXPERIMENT_NAME_LENGTH);
  }

  targetVar.updatedAt = now;
  exp.updatedAt = now;
  validateExperiment(exp);

  list[expIdx] = exp;
  saveExperiments(list, customDir);

  return {
    experiment: JSON.parse(JSON.stringify(exp)),
    variant: JSON.parse(JSON.stringify(targetVar)),
  };
}

/**
 * Deletes a variant from an experiment.
 * Enforces minimum 1 variant remains.
 *
 * @param {string} experimentId
 * @param {string} variantId
 * @param {string} [customDir]
 * @returns {Object} Updated experiment
 */
function deleteVariant(experimentId, variantId, customDir) {
  if (!experimentId || !variantId) throw new Error('experimentId and variantId are required');
  const list = loadExperiments(customDir);
  const expIdx = list.findIndex((e) => e.id === experimentId.trim());
  if (expIdx === -1) throw new Error(`Experiment not found: ${experimentId}`);

  const exp = JSON.parse(JSON.stringify(list[expIdx]));

  if (exp.variants.length <= MIN_VARIANTS_PER_EXPERIMENT) {
    throw new Error('Cannot delete the only variant in an experiment');
  }

  const filtered = exp.variants.filter((v) => v.id !== variantId.trim());
  if (filtered.length === exp.variants.length) {
    throw new Error(`Variant not found: ${variantId}`);
  }

  exp.variants = filtered;

  // If deleted variant was selected, fall back to first remaining
  if (exp.selectedVariantId === variantId.trim()) {
    exp.selectedVariantId = filtered[0].id;
  }

  exp.updatedAt = new Date().toISOString();
  validateExperiment(exp);

  list[expIdx] = exp;
  saveExperiments(list, customDir);

  return JSON.parse(JSON.stringify(exp));
}

/**
 * Marks a variant as the preferred selection.
 * Does not mutate other variants or original text.
 *
 * @param {string} experimentId
 * @param {string} variantId
 * @param {string} [customDir]
 * @returns {Object} Updated experiment
 */
function selectPreferredVariant(experimentId, variantId, customDir) {
  if (!experimentId || !variantId) throw new Error('experimentId and variantId are required');
  const list = loadExperiments(customDir);
  const expIdx = list.findIndex((e) => e.id === experimentId.trim());
  if (expIdx === -1) throw new Error(`Experiment not found: ${experimentId}`);

  const exp = JSON.parse(JSON.stringify(list[expIdx]));
  const variantExists = exp.variants.some((v) => v.id === variantId.trim());
  if (!variantExists) {
    throw new Error(`Variant not found: ${variantId}`);
  }

  exp.selectedVariantId = variantId.trim();
  exp.updatedAt = new Date().toISOString();
  validateExperiment(exp);

  list[expIdx] = exp;
  saveExperiments(list, customDir);

  return JSON.parse(JSON.stringify(exp));
}

// ── Quality Analysis, Comparison & Optimization ─────────────────────────────

/**
 * Performs a read-only side-by-side comparison of two variants.
 * Computes score diff, winner, signal differences, and standard disclaimer.
 *
 * @param {Object} variantA
 * @param {Object} variantB
 * @returns {Object}
 */
function compareVariants(variantA, variantB) {
  if (!variantA || typeof variantA !== 'object') throw new Error('Variant A must be a valid object');
  if (!variantB || typeof variantB !== 'object') throw new Error('Variant B must be a valid object');

  const textA = (variantA.text || variantA.caption || '').trim();
  const textB = (variantB.text || variantB.caption || '').trim();

  if (!textA) throw new Error('Variant A has no caption text');
  if (!textB) throw new Error('Variant B has no caption text');

  const analysisA = variantA.qualityResult || analyzeCaption({ caption: textA });
  const analysisB = variantB.qualityResult || analyzeCaption({ caption: textB });

  const scoreDiff = analysisB.score - analysisA.score;
  const winner = scoreDiff > 0 ? 'B' : scoreDiff < 0 ? 'A' : 'EQUAL';

  const signalDiffs = {
    readability: analysisB.signals.readability - analysisA.signals.readability,
    relevance: analysisB.signals.relevance - analysisA.signals.relevance,
    clarity: analysisB.signals.clarity - analysisA.signals.clarity,
    cta: analysisB.signals.cta - analysisA.signals.cta,
    structure: analysisB.signals.structure - analysisA.signals.structure,
  };

  let strongestSignal = 'clarity';
  let maxAbsDiff = -1;
  let strongestVal = 0;
  for (const [sig, diff] of Object.entries(signalDiffs)) {
    if (Math.abs(diff) > maxAbsDiff) {
      maxAbsDiff = Math.abs(diff);
      strongestSignal = sig;
      strongestVal = diff;
    }
  }

  const verdict = winner === 'EQUAL'
    ? 'Both caption variants demonstrate equal overall quality under the current heuristic.'
    : `Higher quality score according to the current heuristic (${winner === 'B' ? 'Variant B' : 'Variant A'} leads by ${Math.abs(scoreDiff)} point(s)).`;

  return {
    variantA: {
      id: variantA.id || 'A',
      name: variantA.name || 'Variant A',
      text: textA,
      score: analysisA.score,
      grade: analysisA.grade,
      signals: analysisA.signals,
    },
    variantB: {
      id: variantB.id || 'B',
      name: variantB.name || 'Variant B',
      text: textB,
      score: analysisB.score,
      grade: analysisB.grade,
      signals: analysisB.signals,
    },
    scoreDiff,
    winner,
    signalDiffs,
    signalComparisons: signalDiffs, // alias for consistency
    strongestDifference: {
      signal: strongestSignal,
      diff: strongestVal,
      winner: strongestVal > 0 ? 'B' : strongestVal < 0 ? 'A' : 'EQUAL',
    },
    verdict,
  };
}

/**
 * Finds the variant with the highest quality score in an experiment.
 * @param {Object} experiment
 * @returns {{ variant: Object|null, score: number, reason: string }}
 */
function getBestVariant(experiment) {
  if (!experiment || !Array.isArray(experiment.variants) || experiment.variants.length === 0) {
    return { variant: null, score: 0, reason: 'No variants available' };
  }

  let best = experiment.variants[0];
  let maxScore = best.qualityResult?.score ?? 0;

  for (const v of experiment.variants) {
    const s = v.qualityResult?.score ?? 0;
    if (s > maxScore) {
      maxScore = s;
      best = v;
    }
  }

  return {
    variant: JSON.parse(JSON.stringify(best)),
    score: maxScore,
    reason: 'Highest overall quality score in this experiment.',
  };
}

/**
 * Identifies the weakest average quality signal across all variants in an experiment.
 * @param {Object} experiment
 * @returns {{ weakestSignal: string, averageSignals: Object, summary: string }}
 */
function getWeakestSignalAcrossExperiment(experiment) {
  const signalTotals = { readability: 0, relevance: 0, clarity: 0, cta: 0, structure: 0 };
  const counts = { readability: 0, relevance: 0, clarity: 0, cta: 0, structure: 0 };

  const variants = experiment?.variants || [];
  for (const v of variants) {
    const signals = v.qualityResult?.signals || {};
    for (const [key, val] of Object.entries(signals)) {
      if (typeof val === 'number' && signalTotals[key] !== undefined) {
        signalTotals[key] += val;
        counts[key] += 1;
      }
    }
  }

  const averageSignals = {};
  let lowestSig = 'cta';
  let minAvg = 101;

  for (const key of Object.keys(signalTotals)) {
    const avg = counts[key] > 0 ? Math.round(signalTotals[key] / counts[key]) : 70;
    averageSignals[key] = avg;
    if (avg < minAvg) {
      minAvg = avg;
      lowestSig = key;
    }
  }

  const signalLabels = {
    readability: 'Readability',
    relevance: 'Relevance',
    clarity: 'Clarity',
    cta: 'CTA Quality',
    structure: 'Structure',
  };

  const label = signalLabels[lowestSig] || 'CTA Quality';
  const summary = `${label} is the lowest average signal across these variants.`;

  return {
    weakestSignal: lowestSig,
    averageSignals,
    summary,
  };
}

/**
 * Optimizes a variant using heuristic quality analysis + AI rewrite feedback loop.
 * Analyzes variant -> finds weakest signal -> rewrites -> returns before/after.
 *
 * @param {string} variantText
 * @param {Object} [context]
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function optimizeVariant(variantText, context = {}, options = {}) {
  try {
    const text = typeof variantText === 'string' ? variantText.trim() : '';
    if (!text) throw new Error('Variant text cannot be empty');

    // 1. Quality analysis of current variant
    const beforeAnalysis = analyzeCaption({
      caption: text,
      topic: context.topic,
      language: context.language,
      tone: context.tone,
      platform: context.platform,
    });

    // 2. Identify weakest signal
    let weakestSignal = 'clarity';
    let minScore = 101;
    for (const [sig, val] of Object.entries(beforeAnalysis.signals)) {
      if (val < minScore) {
        minScore = val;
        weakestSignal = sig;
      }
    }

    // 3. Map weakest signal to optimal rewrite mode
    let mode = 'clearer';
    if (weakestSignal === 'cta') mode = 'stronger_cta';
    else if (weakestSignal === 'relevance') mode = 'better_hook';
    else if (weakestSignal === 'readability') mode = 'shorter';
    else if (weakestSignal === 'clarity') mode = 'clearer';
    else if (weakestSignal === 'structure') mode = 'professional';

    // 4. Generate rewrite with AI provider
    const provider = options.provider || getActiveProvider();
    let rawSuggestions;
    if (typeof provider.rewrite === 'function') {
      rawSuggestions = await provider.rewrite({
        caption: text,
        mode,
        language: context.language || 'english',
        tone: context.tone || 'casual',
        length: context.length || 'medium',
        platform: context.platform || 'general',
        count: 2,
      });
    } else if (typeof provider.generate === 'function') {
      rawSuggestions = await provider.generate({
        caption: text,
        mode,
        language: context.language || 'english',
        count: 2,
      });
    } else {
      throw new Error('AI provider must implement rewrite() or generate()');
    }

    const validatedSuggestions = validateCaptionSuggestions(rawSuggestions, { maxCount: 2 });
    const optimizedText = validatedSuggestions[0] || text;

    // 5. Re-analyze quality of optimized text
    const afterAnalysis = analyzeCaption({
      caption: optimizedText,
      topic: context.topic,
      language: context.language,
      tone: context.tone,
      platform: context.platform,
    });

    const scoreDiff = afterAnalysis.score - beforeAnalysis.score;

    return {
      success: true,
      original: text,
      beforeScore: beforeAnalysis.score,
      beforeGrade: beforeAnalysis.grade,
      beforeSignals: beforeAnalysis.signals,
      weakestSignal,
      recommendedMode: mode,
      optimizedText,
      afterScore: afterAnalysis.score,
      afterGrade: afterAnalysis.grade,
      afterSignals: afterAnalysis.signals,
      scoreDiff,
      disclaimer: 'Quality score based on the current heuristic.',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Variant optimization failed',
    };
  }
}

/**
 * Generates 3–5 AI variant suggestions using the active AI provider.
 * Each suggestion is scored with quality analysis.
 *
 * @param {Object} rawRequest
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function generateAiVariants(rawRequest = {}, options = {}) {
  try {
    const rawCaption = rawRequest.sourceCaption || rawRequest.caption;
    if (!rawCaption || typeof rawCaption !== 'string') {
      throw new Error('Source caption is required');
    }
    const caption = rawCaption.trim();
    if (!caption) throw new Error('Source caption cannot be empty');

    const mode = rawRequest.mode || 'better_hook';
    const count = Math.min(5, Math.max(1, Number(rawRequest.count) || 3));
    const provider = options.provider || getActiveProvider();

    let rawSuggestions;
    if (typeof provider.rewrite === 'function') {
      rawSuggestions = await provider.rewrite({
        caption,
        mode,
        language: rawRequest.language || 'english',
        tone: rawRequest.tone || 'casual',
        length: rawRequest.length || 'medium',
        platform: rawRequest.platform || 'general',
        count,
      });
    } else if (typeof provider.generate === 'function') {
      rawSuggestions = await provider.generate({
        caption,
        mode,
        language: rawRequest.language || 'english',
        count,
      });
    } else {
      throw new Error('AI provider must implement rewrite() or generate()');
    }

    const cleanSuggestions = validateCaptionSuggestions(rawSuggestions, { maxCount: count });

    const scored = cleanSuggestions.map((text, idx) => {
      const analysis = analyzeCaption({
        caption: text,
        topic: rawRequest.topic,
        language: rawRequest.language,
        tone: rawRequest.tone,
        platform: rawRequest.platform,
      });
      return {
        id: `sug_${idx + 1}_${Date.now()}`,
        name: `AI Variant ${idx + 1} (${mode.replace(/_/g, ' ')})`,
        text,
        source: 'ai',
        score: analysis.score,
        grade: analysis.grade,
        signals: analysis.signals,
        qualityResult: analysis,
      };
    });

    return {
      success: true,
      suggestions: scored,
      count: scored.length,
      mode,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'AI variant generation failed',
    };
  }
}

// ── Bulk Experiment & Snapshot Isolation ─────────────────────────────────────

/**
 * Processes bulk experiments for multiple profiles with snapshot isolation.
 *
 * @param {Object} bulkInput
 * @param {Array<Object>} bulkInput.entries
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function bulkExperiment(bulkInput = {}, options = {}) {
  try {
    if (!bulkInput || typeof bulkInput !== 'object') {
      throw new Error('Bulk experiment input must be an object');
    }

    const items = bulkInput.entries || bulkInput.items || (Array.isArray(bulkInput) ? bulkInput : []);
    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: true,
        results: [],
        summary: { totalEntries: 0, processed: 0 },
      };
    }

    // Snapshot isolation: deep clone upfront
    const isolatedEntries = JSON.parse(JSON.stringify(items));
    const results = [];

    for (const item of isolatedEntries) {
      if (!item || typeof item !== 'object') continue;
      const caption = item.caption || item.sourceCaption || '';
      if (!caption.trim()) continue;

      const exp = createExperiment({
        name: item.name || `${item.profileName || 'Profile'} Experiment`,
        sourceCaption: caption,
        topic: item.topic || null,
        platform: item.platform || 'general',
        tone: item.tone || 'casual',
        profileId: item.profileId || null,
        profileName: item.profileName || null,
      }, options.customDir);

      // Generate additional AI variants if requested
      const aiRes = await generateAiVariants({
        sourceCaption: caption,
        mode: item.mode || 'better_hook',
        count: item.variantCount || 2,
      }, options);

      if (aiRes.success && Array.isArray(aiRes.suggestions)) {
        for (const sug of aiRes.suggestions) {
          addVariant(exp.id, {
            name: sug.name,
            text: sug.text,
            source: 'ai',
            qualityResult: sug.qualityResult,
          }, options.customDir);
        }
      }

      const refreshed = getExperiment(exp.id, options.customDir);
      results.push(refreshed);
    }

    return {
      success: true,
      results,
      summary: {
        totalEntries: isolatedEntries.length,
        processed: results.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Bulk experiment processing failed',
    };
  }
}

// ── Integrations ────────────────────────────────────────────────────────────

/**
 * Applies a variant caption to existing overlays while preserving all styling.
 *
 * @param {string} variantText
 * @param {Array<Object>} existingOverlays
 * @param {Object} [styleOverrides]
 * @returns {Array<Object>}
 */
function applyVariantToOverlays(variantText, existingOverlays = [], styleOverrides = {}) {
  return applyCaptionToOverlays(variantText, existingOverlays, styleOverrides);
}

/**
 * Saves a variant caption as a custom template in the Template Library.
 *
 * @param {Object} payload
 * @param {string} [customDir]
 * @returns {Object} Created template
 */
function saveVariantAsTemplate(payload, customDir) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Template payload must be an object');
  }
  return createCaptionTemplate({
    name: payload.name || `Variant Template ${Date.now()}`,
    description: payload.description || 'Saved from Caption Experiment',
    overlays: payload.overlays || [],
  }, customDir || payload.customDir);
}

/**
 * Saves a variant caption and quality score to persistent history.
 *
 * @param {Object} payload
 * @param {string} [customDir]
 * @returns {Object} Created history record
 */
function saveVariantToHistory(payload, customDir) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('History payload must be an object');
  }
  return createHistoryRecord({
    ...payload,
    source: 'experiment',
  }, customDir || payload.customDir);
}

module.exports = {
  createExperiment,
  getExperiments,
  getExperiment,
  updateExperiment,
  deleteExperiment,
  duplicateExperiment,
  addVariant,
  updateVariant,
  deleteVariant,
  selectPreferredVariant,
  compareVariants,
  getBestVariant,
  getWeakestSignalAcrossExperiment,
  optimizeVariant,
  generateAiVariants,
  bulkExperiment,
  applyVariantToOverlays,
  saveVariantAsTemplate,
  saveVariantToHistory,
  validateExperimentInput,
  validateVariantInput,
  validateExperiment,
  MAX_EXPERIMENTS,
  MAX_VARIANTS_PER_EXPERIMENT,
  MIN_VARIANTS_PER_EXPERIMENT,
  MAX_EXPERIMENT_NAME_LENGTH,
  ALLOWED_VARIANT_SOURCES,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  ALLOWED_LENGTHS,
  ALLOWED_PLATFORMS,
  LIMITS,
};
