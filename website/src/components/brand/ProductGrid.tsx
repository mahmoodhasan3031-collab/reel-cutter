import { Grid, cx } from "@/components/ui";
import type { Product } from "@/data/products";
import ProductCard from "./ProductCard";

export type ProductGridColumns = 1 | 2 | 3;
export type ProductGridGap = "sm" | "md" | "lg";
export type ProductGridFeaturedVariant = "featured" | "standard";
export type ProductGridFeaturedSpan = "none" | "wide";

export interface ProductGridProps {
  products: readonly Product[];
  columns?: ProductGridColumns;
  gap?: ProductGridGap;
  featuredVariant?: ProductGridFeaturedVariant;
  featuredSpan?: ProductGridFeaturedSpan;
  className?: string;
}

export default function ProductGrid({
  products,
  columns = 3,
  gap = "md",
  featuredVariant = "featured",
  featuredSpan = "wide",
  className,
}: ProductGridProps) {
  const spanIndex =
    featuredVariant === "featured" &&
    featuredSpan === "wide" &&
    columns > 1 &&
    products.length > 0
      ? products.findIndex((product) => product.featured)
      : -1;

  return (
    <Grid cols={columns} gap={gap} className={cx("items-stretch", className)}>
      {products.map((product, index) => {
        const featured = product.featured && featuredVariant === "featured";
        const applySpan = index === spanIndex;

        return (
          <ProductCard
            key={product.slug}
            product={product}
            variant={featured ? "featured" : "standard"}
            className={applySpan ? "sm:col-span-2" : undefined}
          />
        );
      })}
    </Grid>
  );
}
