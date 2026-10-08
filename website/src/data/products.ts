export const REEL_CUTTER_V106_URL =
  "https://github.com/mahmoodhasan3031-collab/reel-cutter/releases/download/v1.0.6/Reel-Cutter-Setup-1.0.6.exe";

export type ProductStatus = "available" | "coming-soon" | "in-development";

export type ProductCategory = "creator-tools" | "productivity" | "utilities";

export type ProductPlatform = "windows" | "macos" | "linux" | "web";

export type ProductFeatureStatus = "shipped" | "planned";

export type ProductAccent = "brand" | "success" | "warning";

export type ProductPricingModel =
  | "free"
  | "freemium"
  | "subscription"
  | "one-time"
  | "contact";

export interface ProductFeature {
  title: string;
  description: string;
  status: ProductFeatureStatus;
}

export interface ProductFaq {
  q: string;
  a: string;
}

export interface ProductPricing {
  model: ProductPricingModel;
  startingAt?: string;
  url: string;
}

export interface ProductScreenshot {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface ProductDownload {
  url: string;
  version: string;
  platform: ProductPlatform;
  label: string;
}

export interface ProductLinks {
  detail: string;
  home?: string;
  features?: string;
  pricing?: string;
  download?: string;
  support?: string;
  docs?: string;
  source?: string;
}

export interface ProductSeo {
  title: string;
  description: string;
  keywords: string[];
}

export interface Product {
  slug: string;
  name: string;
  short: string;
  description: string;
  category: ProductCategory;
  status: ProductStatus;
  platforms: ProductPlatform[];
  featured: boolean;
  accent: ProductAccent;
  logo: string;
  heroImage?: string;
  screenshots?: ProductScreenshot[];
  features: ProductFeature[];
  faq: ProductFaq[];
  pricing: ProductPricing;
  download?: ProductDownload;
  links: ProductLinks;
  seo: ProductSeo;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  "creator-tools": "Creator Tools",
  productivity: "Productivity",
  utilities: "Utilities",
};

export const STATUS_LABELS: Record<ProductStatus, string> = {
  available: "Available",
  "coming-soon": "Coming Soon",
  "in-development": "In Development",
};

export const PLATFORM_LABELS: Record<ProductPlatform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  web: "Web",
};

export const PRICING_MODEL_LABELS: Record<ProductPricingModel, string> = {
  free: "Free",
  freemium: "Free with paid plans",
  subscription: "Subscription",
  "one-time": "One-time purchase",
  contact: "Contact for pricing",
};

const reelCutter: Product = {
  slug: "reel-cutter",
  name: "Reel Cutter",
  short:
    "Windows desktop app that cuts long videos into short-form clips, reframes them for vertical and square formats, and exports them in batch.",
  description:
    "Reel Cutter is a Windows desktop application for turning longer videos into short-form content. It cuts precise segments, reframes footage for 9:16, 1:1, 4:5 and 16:9 output, and exports finished clips in 1080p or 4K, one video at a time or in batch, with license activation handled inside the app.",
  category: "creator-tools",
  status: "available",
  platforms: ["windows"],
  featured: true,
  accent: "brand",
  logo: "RC",
  features: [
    {
      title: "Video cutting",
      description:
        "Extract precise segments from a longer video using millisecond-accurate start and end timestamps.",
      status: "shipped",
    },
    {
      title: "Video export",
      description:
        "Export finished clips in 1080p Full HD and 4K Ultra HD with configurable resolution and quality settings.",
      status: "shipped",
    },
    {
      title: "Aspect ratio support",
      description:
        "Render 9:16, 1:1, 4:5 and 16:9 output with blur, crop or pad framing modes.",
      status: "shipped",
    },
    {
      title: "Batch processing",
      description:
        "Queue and process multiple videos at once with bulk export and queue management.",
      status: "shipped",
    },
    {
      title: "Licensing",
      description:
        "License-key activation for a single machine, managed from inside the application.",
      status: "shipped",
    },
    {
      title: "Windows desktop application",
      description:
        "Runs natively on Windows 10 or later (64-bit) and processes video offline on your machine.",
      status: "shipped",
    },
  ],
  faq: [
    {
      q: "Which platforms does Reel Cutter support?",
      a: "Reel Cutter is a Windows desktop application. It runs on Windows 10 or later (64-bit).",
    },
    {
      q: "Do I need an internet connection?",
      a: "Editing and export run offline. An internet connection is needed for license activation, auto-updates and AI caption generation.",
    },
    {
      q: "How does licensing work?",
      a: "Enter your license key when prompted after launch. Each key is tied to a single machine and can be moved by deactivating it on the current machine first.",
    },
    {
      q: "What can I export?",
      a: "Export short-form clips at 1080p or 4K in 9:16, 1:1, 4:5 or 16:9, either one video at a time or in batch.",
    },
    {
      q: "How much does Reel Cutter cost?",
      a: "Reel Cutter is sold as a monthly subscription. Plans start at $10 per month and can be cancelled at any time.",
    },
  ],
  pricing: {
    model: "subscription",
    startingAt: "$10 / month",
    url: "/pricing",
  },
  download: {
    url: REEL_CUTTER_V106_URL,
    version: "1.0.6",
    platform: "windows",
    label: "Download for Windows",
  },
  links: {
    detail: "/products/reel-cutter",
    home: "/",
    features: "/features",
    pricing: "/pricing",
    download: "/download",
    support: "/support",
  },
  seo: {
    title: "Reel Cutter - Windows Desktop Video Cutter and Reel Maker",
    description:
      "Reel Cutter is a Windows desktop app for short-form video: precise cutting, 9:16 to 16:9 aspect ratios, 1080p and 4K export, and batch processing.",
    keywords: [
      "video cutter",
      "reel maker",
      "desktop video editor",
      "windows video app",
      "batch video export",
      "short-form video",
    ],
  },
};

export const PRODUCTS: readonly Product[] = Object.freeze([
  Object.freeze(reelCutter),
]);
