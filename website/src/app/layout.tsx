import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
