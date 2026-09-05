export const FEATURE_KEYS = {
  CUTTING: 'cutting',
  EXPORT_1080P: '1080p_export',
  EXPORT_4K: '4k_export',
  ALL_ASPECT_RATIOS: 'all_aspect_ratios',
  CUSTOM_DURATIONS: 'custom_durations',
  AI_THUMBNAILS: 'ai_thumbnails',
  SMART_CROP: 'smart_crop',
  BATCH_QUEUE: 'batch_queue',
};

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
};

export const TIER_HIERARCHY = {
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
  ],
};

export const FEATURE_METADATA = [
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
];

export const TIER_PRICING = {
  basic: { name: 'Basic', price: 10, label: '$10 one-time' },
  standard: { name: 'Standard', price: 20, label: '$20 one-time' },
  pro: { name: 'Pro', price: 30, label: '$30 one-time' },
};

export function hasFeature(tier, featureName) {
  if (!tier || typeof tier !== 'string') return false;
  if (!featureName || typeof featureName !== 'string') return false;

  const normalizedTier = tier.trim().toLowerCase();
  const normalizedKey = FEATURE_ALIASES[featureName.trim().toLowerCase()] || featureName.trim().toLowerCase();

  const allowedFeatures = TIER_HIERARCHY[normalizedTier];
  if (!allowedFeatures) return false;

  return allowedFeatures.includes(normalizedKey);
}

export function getTierFeatureList(tier) {
  const currentTier = (tier || 'basic').toLowerCase();
  return FEATURE_METADATA.map((f) => ({
    ...f,
    unlocked: hasFeature(currentTier, f.key),
  }));
}
