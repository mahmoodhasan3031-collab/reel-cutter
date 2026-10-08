import type { Metadata } from "next";
import { Container, Section, SectionHeader } from "@/components/ui";
import {
  CTASection,
  EcosystemDiagram,
  HeroEcosystem,
  ProductSpotlight,
  TrustSection,
  WhyDialDazzle,
} from "@/components/brand";
import { getAllProducts, getProduct } from "@/lib/products";

export const metadata: Metadata = {
  title: "About",
  description:
    "DialDazzle builds focused desktop and workflow software. Reel Cutter is the current available product.",
  keywords: ["DialDazzle", "software studio", "desktop software"],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About | DialDazzle",
    description:
      "DialDazzle builds focused desktop and workflow software. Reel Cutter is the current available product.",
    url: "/about",
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

const products = getAllProducts();
const currentProduct = getProduct("reel-cutter");

export default function AboutPage() {
  return (
    <>
      <HeroEcosystem
        heading="About DialDazzle"
        headingLevel={1}
        id="about-hero"
        products={products}
      />

      <Section spacing="large" id="about-studio" ariaLabelledBy="about-studio-title">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <SectionHeader
              eyebrow="About DialDazzle"
              title="One studio for focused software"
              description="DialDazzle builds focused desktop and workflow software. Multiple products can live under one studio brand, and Reel Cutter is the current available product."
              id="about-studio-title"
            />
            <EcosystemDiagram products={products} />
          </div>
        </Container>
      </Section>

      {currentProduct ? (
        <ProductSpotlight
          product={currentProduct}
          cta={{ label: "View product", href: currentProduct.links.detail }}
          secondaryCta={
            currentProduct.download
              ? {
                  label: currentProduct.download.label,
                  href: currentProduct.download.url,
                }
              : undefined
          }
        />
      ) : null}

      <WhyDialDazzle />
      <TrustSection />

      <CTASection
        eyebrow="Products"
        heading="Explore DialDazzle products"
        description="See what Reel Cutter does, which platforms it runs on, and what it costs."
        primaryAction={{ label: "Browse products", href: "/products" }}
        secondaryAction={{ label: "See pricing", href: "/pricing" }}
        id="about-cta"
      />
    </>
  );
}
