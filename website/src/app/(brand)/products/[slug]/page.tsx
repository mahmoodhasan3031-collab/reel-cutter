import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Accordion,
  Badge,
  Button,
  Container,
  DeviceFrame,
  Eyebrow,
  Grid,
  Icon,
  Section,
  SectionHeader,
  Surface,
  cx,
} from "@/components/ui";
import { ACCENT_CLASSES, ProductGrid } from "@/components/brand";
import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  PRICING_MODEL_LABELS,
  STATUS_LABELS,
  getAllProducts,
  getProduct,
  getRelatedProducts,
} from "@/lib/products";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllProducts().map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);

  if (!product) {
    return { title: "Product not found" };
  }

  return {
    title: product.seo.title,
    description: product.seo.description,
    keywords: product.seo.keywords,
    alternates: {
      canonical: product.links.detail,
    },
    openGraph: {
      title: product.seo.title,
      description: product.seo.description,
      url: product.links.detail,
      type: "website",
      siteName: "DialDazzle",
      locale: "en_US",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "DialDazzle - Software for modern work.",
        },
      ],
    },
  };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const product = getProduct(slug);

  if (!product) {
    notFound();
  }

  const accent = ACCENT_CLASSES[product.accent];
  const related = getRelatedProducts(product.slug);
  const shipped = product.features.filter((feature) => feature.status === "shipped");
  const planned = product.features.filter((feature) => feature.status === "planned");
  const platformLabels = product.platforms
    .map((platform) => PLATFORM_LABELS[platform])
    .join(", ");

  const meta: { label: string; value: string }[] = [
    { label: "Category", value: CATEGORY_LABELS[product.category] },
    { label: "Status", value: STATUS_LABELS[product.status] },
    { label: "Platform", value: platformLabels },
    {
      label: "Pricing",
      value: product.pricing.startingAt
        ? `${PRICING_MODEL_LABELS[product.pricing.model]} · ${product.pricing.startingAt}`
        : PRICING_MODEL_LABELS[product.pricing.model],
    },
  ];

  if (product.download) {
    meta.push({
      label: "Version",
      value: `${product.download.version} for ${PLATFORM_LABELS[product.download.platform]}`,
    });
  }

  return (
    <>
      <Section spacing="large" id="product-hero" ariaLabelledBy="product-title">
        <Container className="flex flex-col gap-8">
          <Link
            href="/products"
            className="dd-focus dd-caption inline-flex w-fit items-center gap-1.5 rounded-dd-sm text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-right" size={16} className="rotate-180" />
            All products
          </Link>

          <div className="flex flex-col gap-4">
            <Eyebrow>{CATEGORY_LABELS[product.category]}</Eyebrow>
            <h1 id="product-title" className="dd-display text-foreground">
              {product.name}
            </h1>
            <p className="dd-body max-w-[70ch] text-muted-foreground">
              {product.short}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={product.status}>{STATUS_LABELS[product.status]}</Badge>
              {product.platforms.map((platform) => (
                <Badge key={platform} variant="neutral" size="sm">
                  {PLATFORM_LABELS[platform]}
                </Badge>
              ))}
              {product.download ? (
                <Badge variant="neutral" size="sm">
                  Version {product.download.version}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {product.download ? (
              <Button href={product.download.url} size="lg">
                <Icon name="download" size={16} />
                {product.download.label}
              </Button>
            ) : null}
            <Button href={product.pricing.url} variant="secondary" size="lg">
              {product.pricing.startingAt
                ? `View pricing — ${product.pricing.startingAt}`
                : "View pricing"}
            </Button>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
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
                <p className="dd-caption text-muted-foreground">
                  Placeholder preview
                </p>
              </div>
            </DeviceFrame>

            <Surface tone="raised" radius="lg" className="h-full p-5 sm:p-6">
              <dl className="grid gap-5 sm:grid-cols-2">
                {meta.map((item) => (
                  <div key={item.label} className="flex flex-col gap-1">
                    <dt className="dd-eyebrow text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="text-sm font-medium text-foreground">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Surface>
          </div>
        </Container>
      </Section>

      <Section
        spacing="normal"
        id="product-description"
        ariaLabelledBy="product-description-title"
      >
        <Container className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Overview"
            title={`About ${product.name}`}
            id="product-description-title"
          />
          <p className="dd-body max-w-[78ch] text-muted-foreground">
            {product.description}
          </p>
        </Container>
      </Section>

      {shipped.length > 0 ? (
        <Section
          spacing="normal"
          id="product-features"
          ariaLabelledBy="product-features-title"
        >
          <Container className="flex flex-col gap-8">
            <SectionHeader
              eyebrow="Features"
              title="Shipped features"
              description={`What ${product.name} does today, as listed in the DialDazzle product registry.`}
              id="product-features-title"
            />
            <Grid cols={3} gap="md">
              {shipped.map((feature) => (
                <Surface
                  key={feature.title}
                  tone="raised"
                  radius="lg"
                  className="flex h-full flex-col gap-2 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <Badge variant="success" size="sm">
                      Shipped
                    </Badge>
                  </div>
                  <p className="dd-small text-muted-foreground">
                    {feature.description}
                  </p>
                </Surface>
              ))}
            </Grid>
          </Container>
        </Section>
      ) : null}

      {planned.length > 0 ? (
        <Section
          spacing="normal"
          id="product-planned"
          ariaLabelledBy="product-planned-title"
        >
          <Container className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Roadmap"
              title="Planned features"
              id="product-planned-title"
            />
            <Grid cols={3} gap="md">
              {planned.map((feature) => (
                <Surface
                  key={feature.title}
                  tone="inset"
                  radius="lg"
                  className="flex h-full flex-col gap-2 border border-dashed border-border-subtle p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <Badge variant="neutral" size="sm">
                      Planned
                    </Badge>
                  </div>
                  <p className="dd-small text-muted-foreground">
                    {feature.description}
                  </p>
                </Surface>
              ))}
            </Grid>
          </Container>
        </Section>
      ) : null}

      {product.faq.length > 0 ? (
        <Section spacing="normal" id="product-faq" ariaLabelledBy="product-faq-title">
          <Container className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <SectionHeader
              eyebrow="FAQ"
              title="Frequently asked questions"
              id="product-faq-title"
            />
            <Accordion
              items={product.faq.map((item, index) => ({
                id: `${product.slug}-faq-${index}`,
                question: item.q,
                answer: item.a,
              }))}
            />
          </Container>
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Section
          spacing="normal"
          id="related-products"
          ariaLabelledBy="related-products-title"
        >
          <Container className="flex flex-col gap-8">
            <SectionHeader
              eyebrow="More from DialDazzle"
              title="Related products"
              id="related-products-title"
            />
            <ProductGrid products={related} columns={3} />
          </Container>
        </Section>
      ) : null}
    </>
  );
}
