import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  PRODUCTS,
  STATUS_LABELS,
  type Product,
  type ProductCategory,
  type ProductPlatform,
  type ProductStatus,
} from "@/data/products";

const productsBySlug: ReadonlyMap<string, Product> = new Map(
  PRODUCTS.map((product) => [product.slug, product]),
);

const registryOrder: ReadonlyMap<string, number> = new Map(
  PRODUCTS.map((product, index) => [product.slug, index]),
);

export function getAllProducts(): Product[] {
  return [...PRODUCTS];
}

export function getProduct(slug: string): Product | undefined {
  return productsBySlug.get(slug);
}

export function getFeaturedProducts(): Product[] {
  return PRODUCTS.filter((product) => product.featured);
}

export function getRelatedProducts(slug: string): Product[] {
  const current = getProduct(slug);
  const others = PRODUCTS.filter((product) => product.slug !== slug);

  if (!current) {
    return [...others];
  }

  return [...others].sort((left, right) => {
    const leftRank = left.category === current.category ? 0 : 1;
    const rightRank = right.category === current.category ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return (registryOrder.get(left.slug) ?? 0) - (registryOrder.get(right.slug) ?? 0);
  });
}

export function getDownloadableProducts(): Product[] {
  return PRODUCTS.filter(
    (product) => product.download !== undefined && product.status === "available",
  );
}

export function getCategoryLabel(category: ProductCategory): string {
  return CATEGORY_LABELS[category];
}

export function getStatusLabel(status: ProductStatus): string {
  return STATUS_LABELS[status];
}

export function getPlatformLabels(platforms: readonly ProductPlatform[]): string[] {
  return platforms.map((platform) => PLATFORM_LABELS[platform]);
}

export type {
  Product,
  ProductAccent,
  ProductCategory,
  ProductDownload,
  ProductFaq,
  ProductFeature,
  ProductFeatureStatus,
  ProductLinks,
  ProductPlatform,
  ProductPricing,
  ProductPricingModel,
  ProductScreenshot,
  ProductSeo,
  ProductStatus,
} from "@/data/products";

export {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  PRICING_MODEL_LABELS,
  REEL_CUTTER_V106_URL,
  STATUS_LABELS,
} from "@/data/products";
