import type { Metadata } from "next";
import { Container, Eyebrow, Section } from "@/components/ui";
import { CTASection, ProductGrid } from "@/components/brand";
import { getAllProducts, getDownloadableProducts } from "@/lib/products";

export const metadata: Metadata = {
  title: "Products",
  description:
    "DialDazzle products: focused desktop software with platforms, features and pricing listed up front.",
  keywords: ["DialDazzle products", "desktop software", "Reel Cutter"],
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Products | DialDazzle",
    description:
      "Focused desktop software from DialDazzle, with platforms, features and pricing listed up front.",
    url: "/products",
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

export default function ProductsPage() {
  const products = getAllProducts();
  const [downloadable] = getDownloadableProducts();

  return (
    <>
      <Section spacing="large" id="products-intro" ariaLabelledBy="products-title">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>DialDazzle</Eyebrow>
          <h1 id="products-title" className="dd-display text-foreground">
            Products
          </h1>
          <p className="dd-body max-w-[68ch] text-muted-foreground">
            Focused desktop software from DialDazzle. Each product lists its
            platforms, features and pricing up front, so you can evaluate it
            before you download.
          </p>
        </Container>
      </Section>

      <Section spacing="normal" id="product-grid" ariaLabelledBy="product-grid-title">
        <Container className="flex flex-col gap-8">
          <h2 id="product-grid-title" className="sr-only">
            All products
          </h2>
          <ProductGrid products={products} columns={2} />
        </Container>
      </Section>

      {downloadable?.download ? (
        <CTASection
          eyebrow={downloadable.name}
          heading={downloadable.download.label}
          description={downloadable.short}
          primaryAction={{
            label: downloadable.download.label,
            href: downloadable.download.url,
          }}
          secondaryAction={{ label: "See pricing", href: "/pricing" }}
          id="products-cta"
        />
      ) : null}
    </>
  );
}
