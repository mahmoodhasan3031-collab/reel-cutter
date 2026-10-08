import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Reel Cutter shell metadata (moved from the former root layout so the
// (brand) route group can own DialDazzle metadata independently).
export const metadata: Metadata = {
  title: {
    default: "Reel Cutter - Professional Video Editing Software",
    template: "%s | Reel Cutter",
  },
  description:
    "Reel Cutter is a professional desktop video editing application for creating short-form content, reels, and social media videos from longer videos.",
  keywords: [
    "video editor",
    "reel maker",
    "short form video",
    "social media",
    "video cutter",
    "desktop application",
  ],
  openGraph: {
    title: "Reel Cutter - Professional Video Editing Software",
    description:
      "Professional desktop video editing for creating short-form content and social media videos.",
    type: "website",
    locale: "en_US",
    siteName: "Reel Cutter",
  },
};

export default function ReelCutterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
