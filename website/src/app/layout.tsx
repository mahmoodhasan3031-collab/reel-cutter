import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Root metadata is intentionally neutral/base only.
// Route groups own their own branding:
//   (brand)/layout.tsx      -> DialDazzle metadata
//   (reelcutter)/layout.tsx -> Reel Cutter metadata
// metadataBase is set here so root-level relative metadata (the file-based
// opengraph-image used by error pages) resolves to the production origin.
export const metadata: Metadata = {
  metadataBase: new URL("https://dialdazzle.site"),
  openGraph: {
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
