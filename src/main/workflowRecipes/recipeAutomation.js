'use strict';

/**
 * Recipe Automation — Phase 5L
 *
 * Extends Workflow Recipes to automate:
 * - Bulk multi-profile export from a recipe
 * - Scheduled export from a recipe
 * - Bulk scheduled export from a recipe
 *
 * Recipe remains an immutable source configuration.
 * All snapshots are deep-cloned for isolation.
 */

const path = require('path');
const fs = require('fs');
const {
  getWorkflowRecipe,
  applyWorkflowRecipe,
  incrementUsageCount,
  deepClone,
} = require('./workflowRecipeManager');

const { listProfiles, getProfile, resolveProfilePreset } = require('../profiles/profileManager');
const {
  generateBulkOutputFilename,
  sanitizeFilename,
} = require('../profiles/exportPlan');
const { createSchedule, validateScheduleInput } = require('../scheduler/scheduleManager');
const { createBulkSchedule } = require('../scheduler/bulkScheduleManager');

// ─── ID Generation ──────────────────────────────────────────────────────────

let _counter = 0;

function generatePlanId() {
  _counter = (_counter + 1) % 100000;
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `plan_${ts}_${_counter}_${rand}`;
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

function assertString(val, name) {
  if (!val || typeof val !== 'string') throw new Error(`${name} must be a non-empty string`);
}

function assertArray(val, name) {
  if (!Array.isArray(val)) throw new Error(`${name} must be an array`);
}

function assertNonEmptyArray(val, name) {
  assertArray(val, name);
  if (val.length === 0) throw new Error(`${name} must not be empty`);
}

function assertValidExportType(val) {
  const valid = ['cut', 'reel', 'split'];
  if (!valid.includes(val)) throw new Error(`Invalid export type: ${val}. Must be one of: ${valid.join(', ')}`);
}

function assertNoPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return;
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerous.includes(key)) {
      throw new Error(`Rejected dangerous key: ${key}`);
    }
    if (typeof obj[key] === 'function') {
      throw new Error(`Rejected function value for key: ${key}`);
    }
  }
}

// ─── A. Recipe → Bulk Export Plan ───────────────────────────────────────────

/**
 * Creates a bulk export plan from a recipe and selected profiles.
 *
 * Each job receives:
 * - The recipe's export type, output settings, text overlays
 * - The profile's variation preset, export preset, caption template
 * - An independent immutable snapshot
 *
 * @param {Object} input
 * @param {string} input.recipeId - Recipe ID
 * @param {string[]} input.profileIds - Array of profile IDs (1-10)
 * @param {string} input.sourcePath - Path to source video
 * @param {string} [input.outputDir] - Optional output directory (defaults to source dirname)
 * @param {boolean} [input.checkCollision=true] - Check for output collisions
 * @param {string} [customDir] - Optional custom data directory
 * @returns {Object} Bulk export plan with recipe metadata
 */
function createRecipeBulkPlan(input = {}, customDir) {
  const { recipeId, profileIds, sourcePath, outputDir, checkCollision = true } = input;

  // Validate inputs
  assertString(recipeId, 'recipeId');
  assertNonEmptyArray(profileIds, 'profileIds');
  assertString(sourcePath, 'sourcePath');

  if (profileIds.length > 10) {
    throw new Error('Maximum 10 profiles allowed per bulk plan');
  }

  // Deduplicate profile IDs
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length !== profileIds.length) {
    throw new Error('Duplicate profile IDs are not allowed');
  }

  // Verify source file exists
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  // Load and apply recipe
  const recipe = getWorkflowRecipe(recipeId, customDir);
  if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);

  const recipeConfig = applyWorkflowRecipe(recipe, customDir);
  const exportType = recipeConfig.exportType;
  assertValidExportType(exportType);

  // Resolve output directory
  const resolvedOutputDir = outputDir || path.dirname(sourcePath);
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));

  // Load all profiles
  const allProfiles = listProfiles(customDir);
  const profileMap = new Map(allProfiles.map(p => [p.id, p]));

  const jobs = [];
  const outputPaths = [];

  for (let i = 0; i < uniqueIds.length; i++) {
    const pid = uniqueIds[i];
    const profile = profileMap.get(pid);
    if (!profile) throw new Error(`Profile not found: ${pid}`);
    if (profile.enabled === false) throw new Error(`Profile is disabled: ${profile.name}`);

    // Resolve profile presets (variation, export, caption)
    const resolvedVariation = resolveProfilePreset(profile.variationPreset);

    // Merge recipe output settings with profile presets
    const outputSettings = recipeConfig.outputSettings || {};
    const mode = outputSettings.mode || 'blur';
    const aspectRatio = outputSettings.aspectRatio || '9:16';
    const interval = outputSettings.interval || 30;

    // Generate output filename
    const filenameResult = generateBulkOutputFilename({
      sourcePath,
      profileName: profile.name,
      exportType,
      outputDir: resolvedOutputDir,
      index: i,
      checkCollision,
    });
    const outputFilename = filenameResult.filename;
    const outputPath = filenameResult.outputPath;

    // Collision check
    if (checkCollision && outputPaths.includes(outputPath)) {
      throw new Error(`Output collision detected: ${outputPath}`);
    }
    outputPaths.push(outputPath);

    // Source overwrite check
    if (path.resolve(outputPath) === path.resolve(sourcePath)) {
      throw new Error('Output path cannot overwrite the source file');
    }

    // Path traversal check
    if (outputPath.includes('..')) {
      throw new Error('Output path contains path traversal');
    }

    const job = {
      jobId: `job_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      orderIndex: i,
      profileId: profile.id,
      profileName: profile.name,
      platform: profile.platform || 'Other',

      // Recipe snapshot (immutable)
      recipeId: recipe.id,
      recipeName: recipe.name,

      // Recipe output settings
      mode,
      aspectRatio,
      interval,
      resolution: outputSettings.resolution || '1080p',

      // Profile presets (deep-cloned, independent)
      variationPreset: deepClone(resolvedVariation),
      savedPreset: deepClone(resolvedVariation),
      isOverridden: false,
      variationPresetId: profile.variationPresetId || null,
      variationPresetName: null,

      exportPresetId: profile.exportPresetId || null,
      exportPresetName: null,
      exportPresetSnapshot: null,

      captionTemplateId: recipeConfig.captionTemplateId || profile.captionTemplateId || null,
      captionTemplateName: recipeConfig.captionTemplateName || null,

      // Text overlays from recipe
      textOverlays: recipeConfig.textOverlays ? deepClone(recipeConfig.textOverlays) : [],

      outputFilename,
      outputPath,
      status: 'READY',
    };

    jobs.push(job);
  }

  const plan = {
    planId: generatePlanId(),
    createdAt: new Date().toISOString(),
    sourceFile: sourcePath,
    sourceName: path.basename(sourcePath),
    exportType,
    totalJobs: jobs.length,
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeSnapshot: deepClone(recipeConfig),
    outputDir: resolvedOutputDir,
    jobs,
  };

  return plan;
}

// ─── B. Recipe → Schedule ───────────────────────────────────────────────────

/**
 * Creates a scheduled export from a recipe.
 *
 * @param {Object} input
 * @param {string} input.recipeId - Recipe ID
 * @param {string} input.sourcePath - Path to source video
 * @param {string} input.scheduledAt - ISO 8601 timestamp
 * @param {string} [input.profileId] - Optional profile ID
 * @param {string} [input.outputDirectory] - Optional output directory
 * @param {string} [customDir] - Optional custom data directory
 * @returns {Object} Created schedule record with recipe metadata
 */
function createRecipeSchedule(input = {}, customDir) {
  const { recipeId, sourcePath, scheduledAt, profileId, outputDirectory } = input;

  // Validate inputs
  assertString(recipeId, 'recipeId');
  assertString(sourcePath, 'sourcePath');
  assertString(scheduledAt, 'scheduledAt');

  // Load recipe
  const recipe = getWorkflowRecipe(recipeId, customDir);
  if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);

  const recipeConfig = applyWorkflowRecipe(recipe, customDir);
  const exportType = recipeConfig.exportType;
  assertValidExportType(exportType);

  // Resolve profile (optional)
  let profileSnapshot = null;
  if (profileId) {
    const profile = getProfile(profileId, customDir);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);
    profileSnapshot = deepClone({
      id: profile.id,
      name: profile.name,
      platform: profile.platform || 'Other',
    });
  }

  // Build schedule input using recipe config
  const outputSettings = recipeConfig.outputSettings || {};
  const scheduleInput = {
    sourcePath,
    exportType,
    scheduledAt,
    outputDirectory: outputDirectory || path.dirname(sourcePath),
    profileSnapshot: profileSnapshot || { id: null, name: 'No Profile', platform: 'Other' },
    variationPreset: recipeConfig.variationPresetSnapshot ? deepClone(recipeConfig.variationPresetSnapshot) : {},
    variationPresetId: recipeConfig.variationPresetId || null,
    exportPresetId: recipeConfig.exportPresetId || null,
    exportPresetSnapshot: recipeConfig.exportPresetSnapshot ? deepClone(recipeConfig.exportPresetSnapshot) : null,
    exportOptions: {
      mode: outputSettings.mode || 'blur',
      aspectRatio: outputSettings.aspectRatio || '9:16',
      resolution: outputSettings.resolution || '1080p',
      interval: outputSettings.interval || 30,
      textOverlays: recipeConfig.textOverlays ? deepClone(recipeConfig.textOverlays) : [],
      captionTemplateId: recipeConfig.captionTemplateId || null,
      captionTemplateName: recipeConfig.captionTemplateName || null,
    },
    // Recipe metadata
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeSnapshot: deepClone(recipeConfig),
  };

  // Validate and create schedule
  const validated = validateScheduleInput(scheduleInput, customDir);
  if (!validated.valid) {
    throw new Error(`Invalid schedule input: ${validated.error}`);
  }

  const schedule = createSchedule(scheduleInput, customDir);

  // Store recipe metadata in the schedule record
  schedule.recipeId = recipe.id;
  schedule.recipeName = recipe.name;
  schedule.recipeSnapshot = deepClone(recipeConfig);

  // Increment usage count
  incrementUsageCount(recipe.id, customDir);

  return schedule;
}

// ─── C. Recipe → Bulk Schedule ──────────────────────────────────────────────

/**
 * Creates bulk scheduled exports from a recipe and multiple profiles.
 *
 * @param {Object} input
 * @param {string} input.recipeId - Recipe ID
 * @param {string[]} input.profileIds - Array of profile IDs (1-10)
 * @param {string} input.sourcePath - Path to source video
 * @param {string} input.startAt - ISO 8601 timestamp for first schedule
 * @param {number} input.gapMinutes - Minutes between schedules (1-1440)
 * @param {string} [input.outputDir] - Optional output directory
 * @param {string} [customDir] - Optional custom data directory
 * @returns {Object} Bulk schedule result with schedule records
 */
function createRecipeBulkSchedule(input = {}, customDir) {
  const { recipeId, profileIds, sourcePath, startAt, gapMinutes, outputDir } = input;

  // Validate inputs
  assertString(recipeId, 'recipeId');
  assertNonEmptyArray(profileIds, 'profileIds');
  assertString(sourcePath, 'sourcePath');
  assertString(startAt, 'startAt');

  if (typeof gapMinutes !== 'number' || !Number.isInteger(gapMinutes) || gapMinutes < 1 || gapMinutes > 1440) {
    throw new Error('gapMinutes must be an integer between 1 and 1440');
  }

  if (profileIds.length > 10) {
    throw new Error('Maximum 10 profiles allowed per bulk schedule');
  }

  // Deduplicate
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length !== profileIds.length) {
    throw new Error('Duplicate profile IDs are not allowed');
  }

  // Verify source file exists
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  // Load recipe
  const recipe = getWorkflowRecipe(recipeId, customDir);
  if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);

  const recipeConfig = applyWorkflowRecipe(recipe, customDir);
  const exportType = recipeConfig.exportType;
  assertValidExportType(exportType);

  // Load profiles
  const allProfiles = listProfiles(customDir);
  const profileMap = new Map(allProfiles.map(p => [p.id, p]));

  // Build a plan-compatible object for createBulkSchedule
  const planJobs = [];
  const outputSettings = recipeConfig.outputSettings || {};
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));
  const resolvedOutputDir = outputDir || path.dirname(sourcePath);

  for (let i = 0; i < uniqueIds.length; i++) {
    const pid = uniqueIds[i];
    const profile = profileMap.get(pid);
    if (!profile) throw new Error(`Profile not found: ${pid}`);
    if (profile.enabled === false) throw new Error(`Profile is disabled: ${profile.name}`);

    const resolvedVariation = resolveProfilePreset(profile.variationPreset);

    const filenameResult = generateBulkOutputFilename({
      sourcePath,
      profileName: profile.name,
      exportType,
      outputDir: resolvedOutputDir,
      index: i,
      checkCollision: true,
    });
    const outputFilename = filenameResult.filename;
    const outputPath = filenameResult.outputPath;

    // Path traversal check
    if (outputPath.includes('..')) {
      throw new Error('Output path contains path traversal');
    }

    planJobs.push({
      jobId: `job_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      profileId: profile.id,
      profileName: profile.name,
      platform: profile.platform || 'Other',
      variationPreset: deepClone(resolvedVariation),
      savedPreset: deepClone(resolvedVariation),
      isOverridden: false,
      variationPresetId: profile.variationPresetId || null,
      variationPresetName: null,
      exportPresetId: profile.exportPresetId || null,
      exportPresetName: null,
      exportPresetSnapshot: null,
      captionTemplateId: recipeConfig.captionTemplateId || profile.captionTemplateId || null,
      captionTemplateName: recipeConfig.captionTemplateName || null,
      textOverlays: recipeConfig.textOverlays ? deepClone(recipeConfig.textOverlays) : [],
      outputPath,
      outputFilename,
      recipeId: recipe.id,
      recipeName: recipe.name,
    });
  }

  const plan = {
    planId: generatePlanId(),
    sourceFile: sourcePath,
    sourceName: path.basename(sourcePath),
    exportType,
    totalJobs: planJobs.length,
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeSnapshot: deepClone(recipeConfig),
    outputDir: resolvedOutputDir,
    jobs: planJobs,
  };

  // Use existing bulk schedule manager
  const result = createBulkSchedule({
    plan,
    startAt,
    gapMinutes,
    options: {
      mode: outputSettings.mode || 'blur',
      aspectRatio: outputSettings.aspectRatio || '9:16',
      interval: outputSettings.interval || 30,
      textOverlays: recipeConfig.textOverlays ? deepClone(recipeConfig.textOverlays) : [],
    },
  }, customDir);

  // Inject recipe metadata into each created schedule
  if (result.schedules) {
    for (const sched of result.schedules) {
      sched.recipeId = recipe.id;
      sched.recipeName = recipe.name;
      sched.recipeSnapshot = deepClone(recipeConfig);
    }
  }

  // Increment usage count once
  incrementUsageCount(recipe.id, customDir);

  return result;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  createRecipeBulkPlan,
  createRecipeSchedule,
  createRecipeBulkSchedule,
  generatePlanId,
  assertString,
  assertArray,
  assertNonEmptyArray,
  assertValidExportType,
  assertNoPrototypePollution,
};
