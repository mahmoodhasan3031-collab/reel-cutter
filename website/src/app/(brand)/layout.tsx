import type { Metadata } from "next";
import { BrandFooter, BrandHeader } from "@/components/brand";

export const metadata: Metadata = {
  metadataBase: new URL("https://dialdazzle.site"),
  title: {
    default: "DialDazzle",
    template: "%s | DialDazzle",
  },
  description: "Software for modern work. Focused desktop products by DialDazzle.",
  openGraph: {
    siteName: "DialDazzle",
    type: "website",
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

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-dd-sm focus:bg-accent-hover focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <BrandHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <BrandFooter />
    </>
  );
}
