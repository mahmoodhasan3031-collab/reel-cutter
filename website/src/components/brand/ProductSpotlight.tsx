import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Container,
  DeviceFrame,
  Eyebrow,
  Icon,
  Section,
  cx,
} from "@/components/ui";
import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  type Product,
  type ProductFeature,
} from "@/data/products";
import { ACCENT_CLASSES } from "./accentStyles";

export interface ProductSpotlightAction {
  label: string;
  href: string;
}

export interface ProductSpotlightProps {
  product: Product;
  title?: ReactNode;
  description?: ReactNode;
  cta?: ProductSpotlightAction;
  secondaryCta?: ProductSpotlightAction;
  media?: ReactNode;
  showFeatures?: boolean;
  className?: string;
}

function FeatureRow({ feature }: { feature: ProductFeature }) {
  const planned = feature.status === "planned";

  return (
    <li
      className={cx(
        "flex items-start gap-3 rounded-dd-md border border-border-subtle bg-surface-elevated px-4 py-3",
        planned && "border-dashed",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-dd-sm",
          planned
            ? "bg-surface-inset text-muted-foreground"
            : "bg-success/10 text-success",
        )}
      >
        <Icon name={planned ? "plus" : "check"} size={16} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {feature.title}
          </span>
          {planned ? <Badge variant="neutral" size="sm">Planned</Badge> : null}
        </span>
        <span className="dd-small text-muted-foreground">
          {feature.description}
        </span>
      </span>
    </li>
  );
}

export default function ProductSpotlight({
  product,
  title,
  description,
  cta = { label: "View product", href: product.links.detail },
  secondaryCta,
  media,
  showFeatures = true,
  className,
}: ProductSpotlightProps) {
  const accent = ACCENT_CLASSES[product.accent];
  const features = showFeatures ? product.features : [];

  const fallbackMedia = (
    <DeviceFrame variant="desktop" label={product.name}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-inset p-6 text-center">
        <span
          aria-hidden="true"
          className={cx(
            "flex h-14 w-14 items-center justify-center rounded-dd-lg text-lg font-semibold",
            accent.tile,
          )}
        >
          {product.logo}
        </span>
        <p className="dd-small max-w-[36ch] text-muted-foreground">
          {product.short}
        </p>
      </div>
    </DeviceFrame>
  );

  return (
    <Section spacing="large" className={className}>
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <Eyebrow>{CATEGORY_LABELS[product.category]}</Eyebrow>
              <h2 className="dd-h2 text-foreground">{title ?? product.name}</h2>
              <p className="dd-body text-muted-foreground">
                {description ?? product.description}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={product.status}>
                  {STATUS_LABELS[product.status]}
                </Badge>
                {product.platforms.map((platform) => (
                  <Badge key={platform} variant="neutral" size="sm">
                    {PLATFORM_LABELS[platform]}
                  </Badge>
                ))}
              </div>
            </div>

            {features.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {features.map((feature) => (
                  <FeatureRow key={feature.title} feature={feature} />
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button href={cta.href} size="lg">
                {cta.label}
                <Icon name="arrow-right" size={16} />
              </Button>
              {secondaryCta ? (
                <Button href={secondaryCta.href} variant="secondary" size="lg">
                  {secondaryCta.label}
                </Button>
              ) : null}
            </div>
          </div>

          <div>{media ?? fallbackMedia}</div>
        </div>
      </Container>
    </Section>
  );
}
