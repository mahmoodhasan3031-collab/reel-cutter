import type { Metadata } from "next";
import { Container, Section, SectionHeader, Surface } from "@/components/ui";
import {
  CTASection,
  EcosystemDiagram,
  HeroEcosystem,
  ProductGrid,
  ProductSpotlight,
  TrustSection,
  WhyDialDazzle,
} from "@/components/brand";
import { REEL_CUTTER_V106_URL, getAllProducts } from "@/lib/products";

export const metadata: Metadata = {
  title: {
    absolute: "DialDazzle",
  },
  description:
    "DialDazzle builds focused desktop software that does one job well. Reel Cutter is the current available product.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "DialDazzle",
    description:
      "DialDazzle builds focused desktop software that does one job well. Reel Cutter is the current available product.",
    url: "/",
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
const reelCutter = products.find((product) => product.slug === "reel-cutter");
const comingSoon = products.filter((product) => product.status !== "available");

const WHY_DIALDAZZLE_THEMES = [
  {
    title: "Craft quality",
    description:
      "Each product is built around one job, so the interface stays readable and the tool stays fast.",
  },
  {
    title: "Modern workflows",
    description:
      "Tools are arranged in the order people actually work, from opening a file to finishing an export, without hidden steps.",
  },
  {
    title: "Continuous shipping",
    description:
      "Releases are published with clear version numbers through a public GitHub channel, so changes are easy to follow.",
  },
  {
    title: "User-owned licensing",
    description:
      "License-key activation runs on a single machine from inside the application, and plan limits are published with pricing.",
  },
];

export default function BrandHomePage() {
  return (
    <>
      <HeroEcosystem
        id="home-hero"
        eyebrow="Software ecosystem"
        heading="Software for modern work."
        description="DialDazzle builds focused desktop software that does one job well and stays out of your way."
        primaryAction={{ label: "Explore products", href: "/products" }}
        secondaryAction={{ label: "View Reel Cutter", href: "/products/reel-cutter" }}
        products={products}
        headingLevel={1}
        visual={
          <Surface tone="raised" radius="xl" className="relative p-6 sm:p-8">
            <EcosystemDiagram products={products} />
          </Surface>
        }
      />

      <Section
        spacing="normal"
        id="product-ecosystem"
        ariaLabelledBy="product-ecosystem-title"
      >
        <Container className="flex flex-col gap-8">
          <SectionHeader
            eyebrow="Products"
            title="Product ecosystem"
            description="One brand, a focused set of desktop products. Every card lists the platform and release status straight from the DialDazzle product registry."
            align="center"
            id="product-ecosystem-title"
          />
          <ProductGrid products={products} columns={2} />
        </Container>
      </Section>

      {reelCutter ? (
        <ProductSpotlight
          product={reelCutter}
          cta={{ label: "View Reel Cutter", href: "/products/reel-cutter" }}
          secondaryCta={{
            label: reelCutter.download?.label ?? "Download",
            href: REEL_CUTTER_V106_URL,
          }}
        />
      ) : null}

      <WhyDialDazzle items={WHY_DIALDAZZLE_THEMES} />

      <Section spacing="normal" id="coming-soon" ariaLabelledBy="coming-soon-title">
        <Container>
          <Surface
            tone="inset"
            radius="xl"
            className="flex flex-col items-center gap-8 px-5 py-10 text-center sm:px-10 sm:py-12"
          >
            <SectionHeader
              eyebrow="Roadmap"
              title={
                comingSoon.length > 0
                  ? "Coming soon"
                  : "More tools in the pipeline"
              }
              align="center"
              id="coming-soon-title"
            />
            {comingSoon.length > 0 ? (
              <ProductGrid
                products={comingSoon}
                columns={3}
                featuredVariant="standard"
                featuredSpan="none"
                className="w-full text-left"
              />
            ) : null}
          </Surface>
        </Container>
      </Section>

      <TrustSection />

      <CTASection
        eyebrow="Get started"
        heading="Start with Reel Cutter"
        description={reelCutter ? reelCutter.short : undefined}
        primaryAction={{ label: "View Reel Cutter", href: "/products/reel-cutter" }}
        secondaryAction={{
          label: "Download for Windows",
          href: REEL_CUTTER_V106_URL,
        }}
        id="home-cta"
      />
    </>
  );
}
