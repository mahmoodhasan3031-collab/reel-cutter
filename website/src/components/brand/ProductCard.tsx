import { Badge, Button, Card, Icon, cx } from "@/components/ui";
import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  type Product,
} from "@/data/products";
import { ACCENT_CLASSES } from "./accentStyles";

export type ProductCardVariant =
  | "featured"
  | "standard"
  | "compact"
  | "placeholder";

export interface ProductCardProps {
  product: Product;
  variant?: ProductCardVariant;
  href?: string;
  ctaLabel?: string;
  className?: string;
}

export default function ProductCard({
  product,
  variant = "standard",
  href = product.links.detail,
  ctaLabel = "View product",
  className,
}: ProductCardProps) {
  const accent = ACCENT_CLASSES[product.accent];
  const featured = variant === "featured";
  const compact = variant === "compact";
  const placeholder = variant === "placeholder";

  return (
    <Card
      as="article"
      variant={featured ? "elevated" : placeholder ? "default" : "interactive"}
      className={cx(
        "flex h-full flex-col gap-4",
        featured ? "p-6 sm:p-7" : compact ? "p-4" : "p-5 sm:p-6",
        placeholder && "border-dashed",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "flex items-center justify-center rounded-dd-md font-semibold",
            featured ? "h-12 w-12 text-base" : "h-10 w-10 text-sm",
            accent.tile,
          )}
        >
          {product.logo}
        </span>
        <Badge variant={product.status}>{STATUS_LABELS[product.status]}</Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="dd-eyebrow text-muted-foreground">
          {CATEGORY_LABELS[product.category]}
        </p>
        <h3
          className={cx(
            "text-foreground",
            featured ? "dd-h3" : compact ? "text-base font-semibold" : "dd-h3",
          )}
        >
          {product.name}
        </h3>
        <p
          className={cx(
            "text-sm text-muted-foreground",
            compact && "line-clamp-2",
          )}
        >
          {product.short}
        </p>
      </div>

      <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <dt className="sr-only">Platform</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          {product.platforms.map((platform) => (
            <Badge key={platform} variant="neutral" size="sm">
              {PLATFORM_LABELS[platform]}
            </Badge>
          ))}
        </dd>
      </dl>

      <div className="mt-auto pt-1">
        {placeholder ? (
          <p className="dd-caption text-muted-foreground">
            Product details are on the way.
          </p>
        ) : (
          <Button
            href={href}
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            aria-label={`${ctaLabel}: ${product.name}`}
          >
            {ctaLabel}
            <Icon name="arrow-right" size={16} />
          </Button>
        )}
      </div>
    </Card>
  );
}
