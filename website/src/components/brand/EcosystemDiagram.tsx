import { Badge, Surface, cx } from "@/components/ui";
import { PLATFORM_LABELS, STATUS_LABELS, type Product } from "@/data/products";
import { getAllProducts } from "@/lib/products";

export interface EcosystemDiagramProps {
  products?: readonly Product[];
  caption?: string;
  className?: string;
}

export default function EcosystemDiagram({
  products = getAllProducts(),
  caption = "DialDazzle publishes a set of focused products.",
  className,
}: EcosystemDiagramProps) {
  const platforms = [
    ...new Set(products.flatMap((product) => product.platforms)),
  ];

  return (
    <figure className={cx("flex w-full flex-col items-center", className)}>
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <Surface
          tone="raised"
          radius="lg"
          className="flex w-full items-center gap-3 px-5 py-4"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-dd-md bg-accent-hover text-sm font-semibold text-white"
          >
            DD
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              DialDazzle
            </span>
            <span className="dd-caption text-muted-foreground">
              One software brand
            </span>
          </span>
        </Surface>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="56"
          viewBox="0 0 24 56"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="shrink-0 text-accent"
        >
          <path
            d="M12 6v34"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6 34l6 8 6-8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <Surface tone="inset" radius="lg" className="w-full px-5 py-4">
          <div className="flex flex-col gap-3">
            <span className="dd-eyebrow text-accent-text">Products</span>
            {products.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {products.map((product) => (
                  <li
                    key={product.slug}
                    className="flex items-center justify-between gap-3 rounded-dd-md border border-border-subtle bg-surface-elevated px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-dd-sm bg-accent-soft text-[0.6875rem] font-semibold text-accent-text"
                      >
                        {product.logo}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">
                        {product.name}
                      </span>
                    </span>
                    <Badge variant={product.status} size="sm">
                      {STATUS_LABELS[product.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Surface>

        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="40"
          viewBox="0 0 24 40"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="shrink-0 text-accent"
        >
          <path
            d="M12 4v22"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6 22l6 8 6-8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <Surface tone="inset" radius="lg" className="w-full px-5 py-4">
          <div className="flex flex-col gap-3">
            <span className="dd-eyebrow text-accent-text">Platforms</span>
            <div className="flex flex-wrap gap-2">
              {platforms.length > 0 ? (
                platforms.map((platform) => (
                  <Badge key={platform} variant="neutral" size="sm">
                    {PLATFORM_LABELS[platform]}
                  </Badge>
                ))
              ) : (
                <span className="dd-caption text-muted-foreground">
                  No platforms listed yet.
                </span>
              )}
            </div>
          </div>
        </Surface>
      </div>
      <figcaption className="dd-caption mt-4 text-center text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
