'use strict';

/**
 * Bulk Multi-Profile Export Plan — Phase 2C-1
 *
 * Provides validated, immutable job planning for multi-profile exports.
 * Takes snapshots of authoritative profile presets and generates deterministic,
 * traversal-safe output paths.
 */

const path = require('path');
const fs = require('fs');
const { loadProfiles, resolveProfilePreset } = require('./profileManager');
const { getCaptionTemplate } = require('../captions/captionTemplateManager');
const { validateProductVariationConfig, DEFAULT_PRODUCT_VARIATION } = require('../../engine/variation/validator');

const MIN_BULK_PROFILES = 1;
const MAX_BULK_PROFILES = 10; // Conservative limit: maximum 10 profiles per bulk plan
const VALID_EXPORT_TYPES = ['cut', 'reel', 'split'];

/**
 * Validated, legitimate preset templates for export-time content variation.
 * Phase 2D: Provides predictable, safe creative presets for bulk repurposing.
 */
const BULK_VARIATION_TEMPLATES = {
  neutral: {
    name: 'Neutral',
    brightness: 0.0,
    saturation: 1.0,
    hue: 0.0,
    pitch: 0.0,
    speed: 1.00,
    mode: 'center',
    crop: 0.0,
    cleanMetadata: true,
  },
  lightColor: {
    name: 'Light Color',
    brightness: 0.05,
    saturation: 1.05,
    hue: 0.0,
    pitch: 0.0,
    speed: 1.00,
    mode: 'center',
    crop: 0.0,
    cleanMetadata: true,
  },
  punchyColor: {
    name: 'Punchy Color',
    brightness: 0.05,
    saturation: 1.15,
    hue: 0.0,
    pitch: 0.0,
    speed: 1.00,
    mode: 'center',
    crop: 0.0,
    cleanMetadata: true,
  },
  subtleMotion: {
    name: 'Subtle Motion',
    brightness: 0.0,
    saturation: 1.0,
    hue: 0.0,
    pitch: 0.0,
    speed: 1.02,
    mode: 'center',
    crop: 1.0,
    cleanMetadata: true,
  },
  custom: {
    name: 'Custom',
  },
};

/**
 * Returns a clone of the requested bulk variation template by key.
 *
 * @param {string} key
 * @returns {Object|null}
 */
function getBulkVariationTemplate(key) {
  if (!key) return null;
  const k = String(key).toLowerCase().replace(/[\s-_]/g, '');
  if (k === 'neutral') return { ...BULK_VARIATION_TEMPLATES.neutral };
  if (k === 'lightcolor') return { ...BULK_VARIATION_TEMPLATES.lightColor };
  if (k === 'punchycolor') return { ...BULK_VARIATION_TEMPLATES.punchyColor };
  if (k === 'subtlemotion') return { ...BULK_VARIATION_TEMPLATES.subtleMotion };
  if (k === 'custom') return { ...BULK_VARIATION_TEMPLATES.custom };
  return null;
}

let _planCounter = 0;
function generatePlanId() {
  return `plan_${Date.now()}_${++_planCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Sanitizes a string for safe use as a filename on Windows and POSIX filesystems.
 * Strips reserved characters, control characters, path traversal sequences,
 * and trailing dots/spaces.
 *
 * @param {string} rawName
 * @returns {string}
 */
function sanitizeFilename(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return 'profile';
  }

  // Remove control characters (0x00-0x1F, 0x7F) and Windows reserved chars: < > : " / \ | ? *
  let clean = rawName.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_');

  // Strip path traversal attempts (e.g. "..")
  clean = clean.replace(/\.{2,}/g, '_');

  // Collapse multiple underscores or spaces
  clean = clean.replace(/[_\s]+/g, '_');

  // Trim leading/trailing dots, underscores, and whitespace
  clean = clean.replace(/^[\s._]+|[\s._]+$/g, '');

  if (clean.length === 0) {
    return 'profile';
  }

  // Windows MAX_PATH safety: limit sanitized component length
  return clean.slice(0, 60);
}

/**
 * Generates a deterministic, traversal-safe output filename and path for a profile job.
 * Ensures the output path is strictly contained within the intended target directory
 * and never matches the source file.
 *
 * @param {Object} opts
 * @param {string} opts.sourcePath
 * @param {string} opts.profileName
 * @param {string} [opts.exportType='cut']
 * @param {string} [opts.outputDir]
 * @returns {{ filename: string, outputPath: string }}
 */
function generateBulkOutputFilename(opts = {}) {
  const { sourcePath, profileName, exportType = 'cut', outputDir, index, checkCollision = true } = opts;

  if (!sourcePath || typeof sourcePath !== 'string') {
    throw new Error('sourcePath is required for output filename generation');
  }

  const sourceBase = path.basename(sourcePath, path.extname(sourcePath));
  const cleanSourceBase = sanitizeFilename(sourceBase);
  const cleanProfile = sanitizeFilename(profileName || 'profile');
  const typeSuffix = exportType === 'reel' ? 'reel' : exportType === 'split' ? 'split' : 'clip';
  const indexStr = index !== undefined ? String(index).padStart(2, '0') : null;

  // Deterministic naming pattern: <source-name>__<profile-name>__<index>.mp4 (per section 5)
  // Or if index is omitted, fall back to <source-name>__<profile-name>_<suffix>.mp4 for backwards compatibility
  let filename = indexStr
    ? `${cleanSourceBase}__${cleanProfile}__${indexStr}.mp4`
    : `${cleanSourceBase}__${cleanProfile}_${typeSuffix}.mp4`;

  // Target directory resolution
  const targetDir = outputDir ? path.resolve(outputDir) : path.dirname(path.resolve(sourcePath));
  let resolvedOutputPath = path.resolve(targetDir, filename);

  // Path traversal verification: output path must reside strictly inside targetDir
  const relative = path.relative(targetDir, resolvedOutputPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal detected in bulk output generation');
  }

  // Source overwrite protection
  const resolvedSource = path.resolve(sourcePath);
  if (resolvedOutputPath.toLowerCase() === resolvedSource.toLowerCase()) {
    // Append conflict resolution suffix
    const safeBase = indexStr
      ? `${cleanSourceBase}__${cleanProfile}__${indexStr}`
      : `${cleanSourceBase}__${cleanProfile}_${typeSuffix}`;
    filename = `${safeBase}_export.mp4`;
    resolvedOutputPath = path.resolve(targetDir, filename);
  }

  // Collision safety: prevent silent overwrite of existing disk files
  if (checkCollision && fs.existsSync(resolvedOutputPath)) {
    const baseWithoutExt = path.basename(filename, path.extname(filename));
    let counter = 1;
    let candidatePath = resolvedOutputPath;
    let candidateFilename = filename;
    while (fs.existsSync(candidatePath)) {
      candidateFilename = `${baseWithoutExt}_${counter}.mp4`;
      candidatePath = path.resolve(targetDir, candidateFilename);
      counter++;
    }
    filename = candidateFilename;
    resolvedOutputPath = candidatePath;
  }

  return {
    filename,
    outputPath: resolvedOutputPath,
  };
}

/**
 * Creates an immutable Bulk Export Plan from selected profile IDs.
 *
 * @param {Object} input
 * @param {string} input.sourcePath Path to the source media file
 * @param {string} [input.exportType='cut'] 'cut' | 'reel' | 'split'
 * @param {string[]} input.profileIds Array of selected profile IDs
 * @param {string} [input.outputDir] Optional output directory
 * @param {string} [customDir] Custom directory for loading profiles (used in tests)
 * @returns {Object} Bulk Export Plan
 */
function createBulkExportPlan(input = {}, customDir) {
  const { sourcePath, exportType = 'cut', profileIds, outputDir, variationOverrides } = input;

  if (!sourcePath || typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw new Error('Source media file path is required');
  }

  if (!VALID_EXPORT_TYPES.includes(exportType)) {
    throw new Error(`Invalid exportType "${exportType}". Must be one of: ${VALID_EXPORT_TYPES.join(', ')}`);
  }

  if (!Array.isArray(profileIds)) {
    throw new Error('profileIds must be an array of profile IDs');
  }

  // Check for duplicate profile IDs
  const uniqueIds = new Set(profileIds);
  if (uniqueIds.size !== profileIds.length) {
    throw new Error('Duplicate profile IDs are not allowed in a bulk export plan');
  }

  // Enforce selection count rules
  if (uniqueIds.size < MIN_BULK_PROFILES) {
    throw new Error(`Please select at least ${MIN_BULK_PROFILES} profile for bulk export`);
  }

  if (uniqueIds.size > MAX_BULK_PROFILES) {
    throw new Error(`Cannot select more than ${MAX_BULK_PROFILES} profiles in a single bulk export plan`);
  }

  // Fetch authoritative profiles directly from storage
  const profileStore = loadProfiles(customDir);
  const authoritativeList = profileStore.profiles || [];

  const planId = generatePlanId();
  const jobs = [];

  for (let i = 0; i < profileIds.length; i++) {
    const pId = profileIds[i];
    const profile = authoritativeList.find(p => p.id === pId);

    if (!profile) {
      throw new Error(`Profile not found or deleted: ${pId}`);
    }

    if (profile.enabled === false) {
      throw new Error(`Profile "${profile.name}" (${pId}) is disabled and cannot be added to a bulk export plan`);
    }

    // Saved preset from authoritative profile
    const savedPresetCopy = resolveProfilePreset(profile.variationPreset);
    let presetToUse = profile.variationPreset;
    let isOverridden = false;

    // Check for export-time override
    const rawOverride = variationOverrides && (variationOverrides[pId] || variationOverrides[profile.name]);
    if (rawOverride && typeof rawOverride === 'object') {
      // Validate override directly against product rules
      const overrideVal = validateProductVariationConfig({
        ...profile.variationPreset,
        ...rawOverride,
        enabled: true,
      });
      if (!overrideVal.valid) {
        throw new Error(`Profile "${profile.name}" has invalid variation override settings`);
      }
      presetToUse = { ...profile.variationPreset, ...rawOverride };
      isOverridden = true;
    }

    // Resolve and validate preset copy
    const resolvedPreset = resolveProfilePreset(presetToUse);

    // Strict validation: must pass engine product validation
    const validation = validateProductVariationConfig(resolvedPreset);
    if (!validation.valid) {
      throw new Error(`Profile "${profile.name}" has invalid variation preset settings`);
    }

    const { filename, outputPath } = generateBulkOutputFilename({
      sourcePath,
      profileName: profile.name,
      exportType,
      outputDir,
      index: i + 1,
      checkCollision: input.checkCollision !== false,
    });

    // Resolve caption template snapshot if assigned
    let captionTemplateId = profile.captionTemplateId || null;
    let captionTemplateName = null;
    let textOverlays = null;

    if (captionTemplateId) {
      const tpl = getCaptionTemplate(captionTemplateId, customDir);
      if (tpl) {
        captionTemplateId = tpl.id;
        captionTemplateName = tpl.name;
        textOverlays = Array.isArray(tpl.overlays) ? JSON.parse(JSON.stringify(tpl.overlays)) : null;
      } else {
        captionTemplateId = null;
      }
    }

    // Take an independent immutable snapshot
    const jobSnapshot = {
      jobId: `job_${planId}_${i + 1}_${profile.id}`,
      orderIndex: i + 1,
      profileId: profile.id,
      profileName: profile.name,
      platform: profile.platform,
      // Deep clone ensures future edits to the profile do NOT mutate this plan
      variationPreset: JSON.parse(JSON.stringify(resolvedPreset)),
      savedPreset: JSON.parse(JSON.stringify(savedPresetCopy)),
      isOverridden,
      captionTemplateId,
      captionTemplateName,
      textOverlays,
      outputFilename: filename,
      outputPath,
      status: 'READY',
    };

    jobs.push(jobSnapshot);
  }

  const plan = {
    planId,
    createdAt: new Date().toISOString(),
    sourceFile: sourcePath,
    exportType,
    totalJobs: jobs.length,
    jobs,
  };

  return plan;
}

/**
 * Removes a job from an existing plan and recalculates order and total count.
 * Returns a new plan object (pure function, does not mutate original).
 *
 * @param {Object} plan
 * @param {string} jobId
 * @returns {Object} updated plan
 */
function removeJobFromPlan(plan, jobId) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Invalid plan object');
  }

  const filteredJobs = plan.jobs.filter(j => j.jobId !== jobId);
  if (filteredJobs.length === plan.jobs.length) {
    throw new Error(`Job "${jobId}" not found in plan`);
  }

  const reorderedJobs = filteredJobs.map((job, idx) => ({
    ...job,
    orderIndex: idx + 1,
    variationPreset: JSON.parse(JSON.stringify(job.variationPreset)),
    textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
  }));

  return {
    ...plan,
    totalJobs: reorderedJobs.length,
    jobs: reorderedJobs,
  };
}

/**
 * Reorders jobs in a plan deterministically from one index to another.
 * Returns a new plan object.
 *
 * @param {Object} plan
 * @param {number} fromIndex 0-based index
 * @param {number} toIndex 0-based index
 * @returns {Object} updated plan
 */
function reorderJobsInPlan(plan, fromIndex, toIndex) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Invalid plan object');
  }

  if (
    fromIndex < 0 ||
    fromIndex >= plan.jobs.length ||
    toIndex < 0 ||
    toIndex >= plan.jobs.length
  ) {
    throw new Error('Reorder indices out of bounds');
  }

  const newJobs = [...plan.jobs];
  const [moved] = newJobs.splice(fromIndex, 1);
  newJobs.splice(toIndex, 0, moved);

  const reordered = newJobs.map((job, idx) => ({
    ...job,
    orderIndex: idx + 1,
    variationPreset: JSON.parse(JSON.stringify(job.variationPreset)),
    textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
  }));

  return {
    ...plan,
    jobs: reordered,
  };
}

/**
 * Updates the variation preset of an individual job in an export plan.
 * Returns a new deep-cloned plan without mutating the original plan.
 * The saved Page Profile on disk is NOT modified.
 *
 * @param {Object} plan
 * @param {string} targetId jobId or profileId
 * @param {Object} variationOverride
 * @returns {Object} updated export plan
 */
function updateJobVariationInPlan(plan, targetId, variationOverride) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Valid export plan is required');
  }
  if (!targetId) {
    throw new Error('Target jobId or profileId is required');
  }
  if (!variationOverride || typeof variationOverride !== 'object') {
    throw new Error('variationOverride must be an object');
  }

  // Validate override directly against product rules
  const validation = validateProductVariationConfig({
    ...DEFAULT_PRODUCT_VARIATION,
    ...variationOverride,
    enabled: true,
  });
  if (!validation.valid) {
    throw new Error('Invalid variation override settings');
  }

  const resolved = resolveProfilePreset(variationOverride);

  const newJobs = plan.jobs.map(job => {
    if (job.jobId === targetId || job.profileId === targetId) {
      return {
        ...job,
        variationPreset: JSON.parse(JSON.stringify(resolved)),
        savedPreset: job.savedPreset ? JSON.parse(JSON.stringify(job.savedPreset)) : undefined,
        textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
        isOverridden: true,
      };
    }
    return {
      ...job,
      variationPreset: JSON.parse(JSON.stringify(job.variationPreset)),
      savedPreset: job.savedPreset ? JSON.parse(JSON.stringify(job.savedPreset)) : undefined,
      textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
    };
  });

  return {
    ...plan,
    jobs: newJobs,
  };
}

/**
 * Applies a single variation configuration to ALL jobs in an export plan.
 * Returns a new deep-cloned plan without mutating the original plan.
 * Saved Page Profiles on disk remain untouched.
 *
 * @param {Object} plan
 * @param {Object} variation
 * @returns {Object} updated export plan
 */
function applyVariationToAllJobsInPlan(plan, variation) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Valid export plan is required');
  }
  if (!variation || typeof variation !== 'object') {
    throw new Error('variation must be an object');
  }

  const validation = validateProductVariationConfig({
    ...DEFAULT_PRODUCT_VARIATION,
    ...variation,
    enabled: true,
  });
  if (!validation.valid) {
    throw new Error('Invalid variation configuration');
  }

  const resolved = resolveProfilePreset(variation);

  const newJobs = plan.jobs.map(job => ({
    ...job,
    variationPreset: JSON.parse(JSON.stringify(resolved)),
    savedPreset: job.savedPreset ? JSON.parse(JSON.stringify(job.savedPreset)) : undefined,
    textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
    isOverridden: true,
  }));

  return {
    ...plan,
    jobs: newJobs,
  };
}

/**
 * Restores a job's variation preset back to the profile's saved preset.
 *
 * @param {Object} plan
 * @param {string} targetId jobId or profileId
 * @param {string} [customDir]
 * @returns {Object} updated export plan
 */
function restoreJobVariationToProfilePreset(plan, targetId, customDir) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Valid export plan is required');
  }
  if (!targetId) {
    throw new Error('Target jobId or profileId is required');
  }

  const profileStore = loadProfiles(customDir);
  const profiles = profileStore.profiles || [];

  const newJobs = plan.jobs.map(job => {
    if (job.jobId === targetId || job.profileId === targetId) {
      const profile = profiles.find(p => p.id === job.profileId);
      const savedPreset = profile ? resolveProfilePreset(profile.variationPreset) : (job.savedPreset || resolveProfilePreset(null));
      return {
        ...job,
        variationPreset: JSON.parse(JSON.stringify(savedPreset)),
        savedPreset: JSON.parse(JSON.stringify(savedPreset)),
        textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
        isOverridden: false,
      };
    }
    return {
      ...job,
      variationPreset: JSON.parse(JSON.stringify(job.variationPreset)),
      savedPreset: job.savedPreset ? JSON.parse(JSON.stringify(job.savedPreset)) : undefined,
      textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
    };
  });

  return {
    ...plan,
    jobs: newJobs,
  };
}

/**
 * Resets a job's variation preset to safe neutral defaults.
 * Saved profile on disk is NOT modified.
 *
 * @param {Object} plan
 * @param {string} targetId jobId or profileId
 * @returns {Object} updated export plan
 */
function resetJobVariationInPlan(plan, targetId) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Valid export plan is required');
  }
  if (!targetId) {
    throw new Error('Target jobId or profileId is required');
  }

  const neutral = { ...BULK_VARIATION_TEMPLATES.neutral, enabled: true };
  const resolved = resolveProfilePreset(neutral);

  const newJobs = plan.jobs.map(job => {
    if (job.jobId === targetId || job.profileId === targetId) {
      return {
        ...job,
        variationPreset: JSON.parse(JSON.stringify(resolved)),
        savedPreset: job.savedPreset ? JSON.parse(JSON.stringify(job.savedPreset)) : undefined,
        textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
        isOverridden: true,
      };
    }
    return {
      ...job,
      variationPreset: JSON.parse(JSON.stringify(job.variationPreset)),
      savedPreset: job.savedPreset ? JSON.parse(JSON.stringify(job.savedPreset)) : undefined,
      textOverlays: job.textOverlays ? JSON.parse(JSON.stringify(job.textOverlays)) : null,
    };
  });

  return {
    ...plan,
    jobs: newJobs,
  };
}

/**
 * Adapter helper that converts a bulk export plan's jobs into items compatible
 * with the existing Batch Queue engine.
 *
 * @param {Object} plan
 * @param {Object} [extraOptions]
 * @returns {Array<Object>} BatchQueue-compatible item objects
 */
function planToBatchQueueItems(plan, extraOptions = {}) {
  if (!plan || !Array.isArray(plan.jobs)) {
    throw new Error('Invalid plan object');
  }

  return plan.jobs.map(job => ({
    inputPath: plan.sourceFile,
    outputPath: job.outputPath,
    outputDir: plan.exportType === 'split' ? path.dirname(job.outputPath) : undefined,
    operation: plan.exportType === 'split' ? 'split' : plan.exportType === 'reel' ? 'reel' : 'cut',
    variation: JSON.parse(JSON.stringify(job.variationPreset)),
    aspectRatio: extraOptions.aspectRatio || (plan.exportType === 'reel' ? '9:16' : undefined),
    mode: extraOptions.mode || 'blur',
    start: extraOptions.start !== undefined ? extraOptions.start : 0,
    duration: extraOptions.duration !== undefined ? extraOptions.duration : undefined,
    interval: extraOptions.interval !== undefined ? extraOptions.interval : 30,
    generateThumbnail: Boolean(extraOptions.generateThumbnail),
    thumbnailTitle: `${job.profileName} - ${path.basename(plan.sourceFile, path.extname(plan.sourceFile))}`,
    bulkPlanId: plan.planId,
    bulkJobId: job.jobId,
    profileId: job.profileId,
    profileName: job.profileName,
    platform: job.platform,
    orderIndex: job.orderIndex,
    captionTemplateId: job.captionTemplateId || null,
    captionTemplateName: job.captionTemplateName || null,
    textOverlays: job.textOverlays && Array.isArray(job.textOverlays) && job.textOverlays.length > 0
      ? JSON.parse(JSON.stringify(job.textOverlays))
      : (job.textOverlays === undefined && Array.isArray(extraOptions.textOverlays) && extraOptions.textOverlays.length > 0
          ? JSON.parse(JSON.stringify(extraOptions.textOverlays))
          : null),
  }));
}

module.exports = {
  MIN_BULK_PROFILES,
  MAX_BULK_PROFILES,
  VALID_EXPORT_TYPES,
  BULK_VARIATION_TEMPLATES,
  getBulkVariationTemplate,
  sanitizeFilename,
  generateBulkOutputFilename,
  createBulkExportPlan,
  removeJobFromPlan,
  reorderJobsInPlan,
  updateJobVariationInPlan,
  applyVariationToAllJobsInPlan,
  restoreJobVariationToProfilePreset,
  resetJobVariationInPlan,
  planToBatchQueueItems,
};

const bulkExec = require('./bulkExecutor');
Object.assign(module.exports, bulkExec);
