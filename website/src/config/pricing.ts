/**
 * Centralized Pricing Configuration for Reel Cutter Website
 *
 * Source of truth for plan names, prices, features, and display configuration.
 * The server-side Stripe configuration (server/config.js) maintains the actual
 * payment price IDs and server-side validation. This file is for the website UI only.
 *
 * DO NOT add Stripe secret keys, Supabase service-role keys, or any secrets here.
 */

export type TierId = "basic" | "standard" | "pro";

export interface PlanFeature {
  name: string;
  included: boolean;
  note?: string;
}

export interface PricingPlan {
  id: TierId;
  name: string;
  price: number;
  priceDisplay: string;
  billingPeriod: string;
  billingModel: "subscription";
  description: string;
  highlight: boolean;
  features: PlanFeature[];
  cta: string;
}

/**
 * Feature comparison categories for the plan comparison table.
 * Each category maps to the actual feature keys in src/shared/features.js.
 */
export const FEATURE_CATEGORIES = [
  {
    category: "Core Video Tools",
    features: [
      { name: "Video Cutting", basic: true, standard: true, pro: true },
      { name: "1080p Export", basic: true, standard: true, pro: true },
      { name: "4K Ultra HD Export", basic: false, standard: true, pro: true },
      { name: "All Aspect Ratios (9:16, 1:1, 4:5, 16:9)", basic: false, standard: true, pro: true },
      { name: "Custom Durations", basic: false, standard: true, pro: true },
    ],
  },
  {
    category: "AI & Smart Features",
    features: [
      { name: "AI Thumbnails", basic: false, standard: false, pro: true },
      { name: "Smart Crop (AI Subject Tracking)", basic: false, standard: false, pro: true },
    ],
  },
  {
    category: "Captions",
    features: [
      { name: "AI Caption Generator", basic: false, standard: false, pro: true },
      { name: "Caption Quality & Intelligence", basic: false, standard: false, pro: true },
      { name: "Caption Workspace & Smart Rewrite", basic: false, standard: false, pro: true },
      { name: "Caption Experiments & Optimization", basic: false, standard: false, pro: true },
    ],
  },
  {
    category: "Content Variation",
    features: [
      { name: "Content Variation Presets", basic: false, standard: false, pro: true },
      { name: "Export Presets", basic: false, standard: false, pro: true },
      { name: "Intelligent Profile Configuration", basic: false, standard: false, pro: true },
    ],
  },
  {
    category: "Bulk Export & Automation",
    features: [
      { name: "Batch Queue", basic: false, standard: false, pro: true },
      { name: "Intelligent Bulk Export", basic: false, standard: false, pro: true },
      { name: "Workflow Recipes", basic: false, standard: false, pro: true },
      { name: "Recipe Automation (Bulk & Schedule)", basic: false, standard: false, pro: true },
    ],
  },
  {
    category: "History & Recovery",
    features: [
      { name: "Export History & Organization", basic: false, standard: false, pro: true },
      { name: "Export History Intelligence", basic: false, standard: false, pro: true },
      { name: "Export Recovery Center", basic: false, standard: false, pro: true },
      { name: "Export Intelligence Dashboard", basic: false, standard: false, pro: true },
      { name: "Export Command Center", basic: false, standard: false, pro: true },
    ],
  },
] as const;

export const PLANS: PricingPlan[] = [
  {
    id: "basic",
    name: "Basic",
    price: 10,
    priceDisplay: "$10",
    billingPeriod: "per month",
    billingModel: "subscription",
    description: "Essential video cutting and export for getting started.",
    highlight: false,
    features: [
      { name: "Video cutting and segment extraction", included: true },
      { name: "1080p Full HD export", included: true },
      { name: "9:16 vertical reel format", included: true },
      { name: "Basic output modes (blur, crop, pad)", included: true },
      { name: "4K export", included: false },
      { name: "All aspect ratios", included: false },
      { name: "AI features", included: false },
      { name: "Bulk export & automation", included: false },
    ],
    cta: "Subscribe Basic",
  },
  {
    id: "standard",
    name: "Standard",
    price: 20,
    priceDisplay: "$20",
    billingPeriod: "per month",
    billingModel: "subscription",
    description: "Full aspect ratio support and higher quality export.",
    highlight: false,
    features: [
      { name: "Everything in Basic", included: true },
      { name: "4K Ultra HD export (3840x2160)", included: true },
      { name: "All aspect ratios (9:16, 1:1, 4:5, 16:9)", included: true },
      { name: "Custom duration timestamps", included: true },
      { name: "Multiple output modes", included: true },
      { name: "AI features", included: false },
      { name: "Bulk export & automation", included: false },
    ],
    cta: "Subscribe Standard",
  },
  {
    id: "pro",
    name: "Pro",
    price: 30,
    priceDisplay: "$30",
    billingPeriod: "per month",
    billingModel: "subscription",
    description: "Complete toolkit with AI features, bulk export, and automation.",
    highlight: true,
    features: [
      { name: "Everything in Standard", included: true },
      { name: "AI Thumbnails", included: true },
      { name: "Smart Crop (AI subject tracking)", included: true },
      { name: "AI Caption Generator", included: true },
      { name: "Caption quality, workspace & experiments", included: true },
      { name: "Content Variation & Export Presets", included: true },
      { name: "Intelligent Profiles", included: true },
      { name: "Batch Queue & Bulk Export", included: true },
      { name: "Workflow Recipes & Automation", included: true },
      { name: "Export History & Recovery", included: true },
      { name: "Intelligence Dashboard & Command Center", included: true },
    ],
    cta: "Subscribe Pro",
  },
];

/**
 * Get a plan by its ID. Returns null for invalid plan IDs.
 */
export function getPlanById(planId: string): PricingPlan | null {
  return PLANS.find((p) => p.id === planId) ?? null;
}

/**
 * Validate that a plan ID is valid.
 */
export function isValidPlanId(planId: string): planId is TierId {
  return PLANS.some((p) => p.id === planId);
}

/**
 * Get the minimum tier that includes a given feature.
 * Returns null if the feature is not in any tier.
 */
export function getMinimumTierForFeature(featureName: string): TierId | null {
  const tierOrder: TierId[] = ["basic", "standard", "pro"];
  for (const tier of tierOrder) {
    const category = FEATURE_CATEGORIES.find((c) =>
      c.features.some((f) => f.name === featureName)
    );
    if (category) {
      const feature = category.features.find((f) => f.name === featureName);
      if (feature && feature[tier]) {
        return tier;
      }
    }
  }
  return null;
}
