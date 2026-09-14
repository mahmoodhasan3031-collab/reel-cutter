/**
 * Feature Tiers & Capabilities Definition for Reel Cutter
 *
 * Tier Structure:
 * - Basic ($10): cutting, 1080p export
 * - Standard ($20): everything in basic + 4K export, all aspect ratios, custom durations
 * - Pro ($30): everything in standard + AI thumbnails, smart crop, batch queue
 */

const FEATURE_KEYS = {
  CUTTING: 'cutting',
  EXPORT_1080P: '1080p_export',
  EXPORT_4K: '4k_export',
  ALL_ASPECT_RATIOS: 'all_aspect_ratios',
  CUSTOM_DURATIONS: 'custom_durations',
  AI_THUMBNAILS: 'ai_thumbnails',
  SMART_CROP: 'smart_crop',
  BATCH_QUEUE: 'batch_queue',
  AI_CAPTIONS: 'ai_captions',
  CAPTION_QUALITY: 'caption_quality',
  CAPTION_WORKSPACE: 'caption_workspace',
  CAPTION_EXPERIMENT: 'caption_experiment',
  VARIATION_PRESETS: 'variation_presets',
  EXPORT_PRESETS: 'export_presets',
  INTELLIGENT_PROFILES: 'intelligent_profiles',
  BULK_EXPORT_INTELLIGENCE: 'bulk_export_intelligence',
  EXPORT_HISTORY: 'export_history',
  EXPORT_HISTORY_INTELLIGENCE: 'export_history_intelligence',
  EXPORT_RECOVERY_CENTER: 'export_recovery_center',
};

// Aliases mapping flexible string inputs (e.g. '4K export', 'Smart Crop') to internal keys
const FEATURE_ALIASES = {
  cutting: FEATURE_KEYS.CUTTING,
  '1080p': FEATURE_KEYS.EXPORT_1080P,
  '1080p export': FEATURE_KEYS.EXPORT_1080P,
  '1080p_export': FEATURE_KEYS.EXPORT_1080P,

  '4k': FEATURE_KEYS.EXPORT_4K,
  '4k export': FEATURE_KEYS.EXPORT_4K,
  '4k_export': FEATURE_KEYS.EXPORT_4K,

  'all aspect ratios': FEATURE_KEYS.ALL_ASPECT_RATIOS,
  all_aspect_ratios: FEATURE_KEYS.ALL_ASPECT_RATIOS,
  aspect_ratios: FEATURE_KEYS.ALL_ASPECT_RATIOS,

  'custom durations': FEATURE_KEYS.CUSTOM_DURATIONS,
  custom_durations: FEATURE_KEYS.CUSTOM_DURATIONS,

  'ai thumbnails': FEATURE_KEYS.AI_THUMBNAILS,
  ai_thumbnails: FEATURE_KEYS.AI_THUMBNAILS,
  thumbnails: FEATURE_KEYS.AI_THUMBNAILS,

  'smart crop': FEATURE_KEYS.SMART_CROP,
  smart_crop: FEATURE_KEYS.SMART_CROP,

  'batch queue': FEATURE_KEYS.BATCH_QUEUE,
  batch_queue: FEATURE_KEYS.BATCH_QUEUE,
  batch: FEATURE_KEYS.BATCH_QUEUE,
  batchqueue: FEATURE_KEYS.BATCH_QUEUE,
  batchQueue: FEATURE_KEYS.BATCH_QUEUE,

  'ai captions': FEATURE_KEYS.AI_CAPTIONS,
  ai_captions: FEATURE_KEYS.AI_CAPTIONS,
  'ai caption': FEATURE_KEYS.AI_CAPTIONS,
  ai_caption: FEATURE_KEYS.AI_CAPTIONS,
  'ai caption generator': FEATURE_KEYS.AI_CAPTIONS,
  'ai caption generation': FEATURE_KEYS.AI_CAPTIONS,
  aicaptions: FEATURE_KEYS.AI_CAPTIONS,
  aiCaptions: FEATURE_KEYS.AI_CAPTIONS,

  'caption quality': FEATURE_KEYS.CAPTION_QUALITY,
  caption_quality: FEATURE_KEYS.CAPTION_QUALITY,
  captionquality: FEATURE_KEYS.CAPTION_QUALITY,
  'quality analyzer': FEATURE_KEYS.CAPTION_QUALITY,
  'caption quality analyzer': FEATURE_KEYS.CAPTION_QUALITY,
  'caption quality intelligence': FEATURE_KEYS.CAPTION_QUALITY,
  'caption quality & intelligence': FEATURE_KEYS.CAPTION_QUALITY,

  'caption workspace': FEATURE_KEYS.CAPTION_WORKSPACE,
  caption_workspace: FEATURE_KEYS.CAPTION_WORKSPACE,
  captionworkspace: FEATURE_KEYS.CAPTION_WORKSPACE,
  'smart rewrite': FEATURE_KEYS.CAPTION_WORKSPACE,
  smart_rewrite: FEATURE_KEYS.CAPTION_WORKSPACE,
  'caption workspace & smart rewrite': FEATURE_KEYS.CAPTION_WORKSPACE,

  'caption experiment': FEATURE_KEYS.CAPTION_EXPERIMENT,
  caption_experiment: FEATURE_KEYS.CAPTION_EXPERIMENT,
  captionexperiment: FEATURE_KEYS.CAPTION_EXPERIMENT,
  'caption experiments': FEATURE_KEYS.CAPTION_EXPERIMENT,
  'caption optimization': FEATURE_KEYS.CAPTION_EXPERIMENT,
  caption_optimization: FEATURE_KEYS.CAPTION_EXPERIMENT,
  'caption experiment & optimization': FEATURE_KEYS.CAPTION_EXPERIMENT,

  'variation presets': FEATURE_KEYS.VARIATION_PRESETS,
  variation_presets: FEATURE_KEYS.VARIATION_PRESETS,
  variationpresets: FEATURE_KEYS.VARIATION_PRESETS,
  variationPresets: FEATURE_KEYS.VARIATION_PRESETS,
  'content variation presets': FEATURE_KEYS.VARIATION_PRESETS,
  'variation preset': FEATURE_KEYS.VARIATION_PRESETS,
  'export presets': FEATURE_KEYS.EXPORT_PRESETS,
  export_presets: FEATURE_KEYS.EXPORT_PRESETS,
  exportpresets: FEATURE_KEYS.EXPORT_PRESETS,
  exportPresets: FEATURE_KEYS.EXPORT_PRESETS,
  'export preset': FEATURE_KEYS.EXPORT_PRESETS,
  exportpreset: FEATURE_KEYS.EXPORT_PRESETS,
  exportPreset: FEATURE_KEYS.EXPORT_PRESETS,
  'export preset manager': FEATURE_KEYS.EXPORT_PRESETS,
  'repurposing presets': FEATURE_KEYS.VARIATION_PRESETS,
  'intelligent profiles': FEATURE_KEYS.INTELLIGENT_PROFILES,
  intelligent_profiles: FEATURE_KEYS.INTELLIGENT_PROFILES,
  intelligentprofiles: FEATURE_KEYS.INTELLIGENT_PROFILES,
  intelligentProfiles: FEATURE_KEYS.INTELLIGENT_PROFILES,
  'profile configuration': FEATURE_KEYS.INTELLIGENT_PROFILES,
  'bulk export intelligence': FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,
  bulk_export_intelligence: FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,
  bulkgintelligence: FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,
  bulkExportIntelligence: FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,
  'intelligent bulk export': FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,

  'export history': FEATURE_KEYS.EXPORT_HISTORY,
  export_history: FEATURE_KEYS.EXPORT_HISTORY,
  exporthistory: FEATURE_KEYS.EXPORT_HISTORY,
  exportHistory: FEATURE_KEYS.EXPORT_HISTORY,
  'export history & organization': FEATURE_KEYS.EXPORT_HISTORY,

  'export history intelligence': FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,
  export_history_intelligence: FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,
  exporthistoryintelligence: FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,
  exportHistoryIntelligence: FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,
  'export history & organization 2.0': FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,

  'export recovery center': FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
  export_recovery_center: FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
  exportrecoverycenter: FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
  exportRecoveryCenter: FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
  recovery_center: FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
  recoveryCenter: FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
};

const TIER_HIERARCHY = {
  basic: [
    FEATURE_KEYS.CUTTING,
    FEATURE_KEYS.EXPORT_1080P,
  ],
  standard: [
    FEATURE_KEYS.CUTTING,
    FEATURE_KEYS.EXPORT_1080P,
    FEATURE_KEYS.EXPORT_4K,
    FEATURE_KEYS.ALL_ASPECT_RATIOS,
    FEATURE_KEYS.CUSTOM_DURATIONS,
  ],
  pro: [
    FEATURE_KEYS.CUTTING,
    FEATURE_KEYS.EXPORT_1080P,
    FEATURE_KEYS.EXPORT_4K,
    FEATURE_KEYS.ALL_ASPECT_RATIOS,
    FEATURE_KEYS.CUSTOM_DURATIONS,
    FEATURE_KEYS.AI_THUMBNAILS,
    FEATURE_KEYS.SMART_CROP,
    FEATURE_KEYS.BATCH_QUEUE,
    FEATURE_KEYS.AI_CAPTIONS,
    FEATURE_KEYS.CAPTION_QUALITY,
    FEATURE_KEYS.CAPTION_WORKSPACE,
    FEATURE_KEYS.CAPTION_EXPERIMENT,
    FEATURE_KEYS.VARIATION_PRESETS,
    FEATURE_KEYS.EXPORT_PRESETS,
    FEATURE_KEYS.INTELLIGENT_PROFILES,
    FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,
    FEATURE_KEYS.EXPORT_HISTORY,
    FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,
    FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
  ],
};

const FEATURE_METADATA = [
  {
    key: FEATURE_KEYS.CUTTING,
    name: 'Video Cutting',
    description: 'Precision segment extraction and splitting',
    minTier: 'basic',
  },
  {
    key: FEATURE_KEYS.EXPORT_1080P,
    name: '1080p Export',
    description: 'Full HD export in 9:16 and native dimensions',
    minTier: 'basic',
  },
  {
    key: FEATURE_KEYS.EXPORT_4K,
    name: '4K Ultra HD Export',
    description: 'Ultra-crisp 4K rendering (3840x2160)',
    minTier: 'standard',
  },
  {
    key: FEATURE_KEYS.ALL_ASPECT_RATIOS,
    name: 'All Aspect Ratios',
    description: '1:1 Square, 4:5 Portrait, 16:9 Landscape & 9:16 Reel',
    minTier: 'standard',
  },
  {
    key: FEATURE_KEYS.CUSTOM_DURATIONS,
    name: 'Custom Durations',
    description: 'Millisecond-accurate custom start and end timestamps',
    minTier: 'standard',
  },
  {
    key: FEATURE_KEYS.AI_THUMBNAILS,
    name: 'AI Thumbnails',
    description: 'Smart best-frame extraction and cover generation',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.SMART_CROP,
    name: 'Smart Crop (AI)',
    description: 'AI subject tracking and automated focal reframing',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.BATCH_QUEUE,
    name: 'Batch Queue',
    description: 'Multi-video automated queue and bulk processing',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.AI_CAPTIONS,
    name: 'AI Caption Generator',
    description: 'AI-assisted video caption and hook generation',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.CAPTION_QUALITY,
    name: 'Caption Quality & Intelligence',
    description: 'Offline caption quality scoring, readability analysis, and AI-assisted improvement',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.CAPTION_WORKSPACE,
    name: 'Caption Workspace & Smart Rewrite',
    description: 'Unified caption workspace with AI smart rewrite, multi-version history, and quality feedback',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.CAPTION_EXPERIMENT,
    name: 'Caption Experiment & Optimization',
    description: 'A/B creative caption variant testing, quality comparison, and smart heuristic optimization',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.VARIATION_PRESETS,
    name: 'Content Variation Presets',
    description: 'Save, manage, and apply named variation presets for creative repurposing across profiles and exports',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.EXPORT_PRESETS,
    name: 'Export Preset Manager',
    description: 'Save, manage, compare, and apply unified export presets across single, profile, bulk, and scheduled workflows',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.INTELLIGENT_PROFILES,
    name: 'Intelligent Profile Configuration',
    description: 'Unified configuration resolver with status, preview, diff, and field-level overrides for page profiles',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.BULK_EXPORT_INTELLIGENCE,
    name: 'Intelligent Bulk Export',
    description: 'Advanced bulk export with preflight analysis, conflict detection, retry, and execution summaries',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.EXPORT_HISTORY,
    name: 'Export History & Organization',
    description: 'Track, search, filter, and manage completed export executions with full configuration snapshots',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.EXPORT_HISTORY_INTELLIGENCE,
    name: 'Export History Intelligence & Organization 2.0',
    description: 'Advanced history grouping, saved views, tags, notes, attempt tracking, bulk actions, timeline, and export',
    minTier: 'pro',
  },
  {
    key: FEATURE_KEYS.EXPORT_RECOVERY_CENTER,
    name: 'Export Recovery Center',
    description: 'Output health checks, retry readiness, recovery diagnostics, archive, pin, and workspace organization',
    minTier: 'pro',
  },
];

const TIER_PRICING = {
  basic: { name: 'Basic', price: 10, label: '$10 one-time' },
  standard: { name: 'Standard', price: 20, label: '$20 one-time' },
  pro: { name: 'Pro', price: 30, label: '$30 one-time' },
};

/**
 * Checks whether a given license tier has access to a specific feature.
 *
 * @param {string} tier Current license tier ('basic' | 'standard' | 'pro')
 * @param {string} featureName Feature name or identifier
 * @returns {boolean}
 */
function hasFeature(tier, featureName) {
  if (!tier || typeof tier !== 'string') return false;
  if (!featureName || typeof featureName !== 'string') return false;

  const normalizedTier = tier.trim().toLowerCase();
  const normalizedKey = FEATURE_ALIASES[featureName.trim().toLowerCase()] || featureName.trim().toLowerCase();

  const allowedFeatures = TIER_HIERARCHY[normalizedTier];
  if (!allowedFeatures) return false;

  return allowedFeatures.includes(normalizedKey);
}

/**
 * Returns a list of all features with their unlocked status for a given tier.
 * @param {string} tier
 * @returns {Array<Object>}
 */
function getTierFeatureList(tier) {
  const currentTier = (tier || 'basic').toLowerCase();
  return FEATURE_METADATA.map((f) => ({
    ...f,
    unlocked: hasFeature(currentTier, f.key),
  }));
}

module.exports = {
  FEATURE_KEYS,
  TIER_HIERARCHY,
  FEATURE_METADATA,
  TIER_PRICING,
  hasFeature,
  getTierFeatureList,
};
