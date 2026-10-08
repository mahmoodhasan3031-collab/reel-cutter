import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Section, SectionHeader, Surface } from "@/components/ui";

export const metadata: Metadata = {
  title: "Support",
  description:
    "DialDazzle support for Reel Cutter — installation help, license questions, troubleshooting, and frequently asked questions.",
  alternates: {
    canonical: "/support",
  },
  openGraph: {
    title: "Support | DialDazzle",
    description:
      "Get help with Reel Cutter: FAQs, troubleshooting, and ways to reach support.",
    url: "/support",
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

const faqItems = [
  {
    question: "What is Reel Cutter?",
    answer:
      "Reel Cutter is a professional desktop video editing application for Windows. It helps you create short-form content — reels, social media clips, and vertical videos — from longer video files.",
  },
  {
    question: "What video formats are supported?",
    answer:
      "Reel Cutter supports common video formats including MP4, MOV, AVI, MKV, WebM, and more. The application uses FFmpeg for video processing, which supports a wide range of input formats.",
  },
  {
    question: "Do I need an internet connection?",
    answer:
      "Reel Cutter works entirely offline. An internet connection is only needed for license activation, auto-updates, and AI caption generation (if using that feature).",
  },
  {
    question: "How do I activate my license?",
    answer:
      "After launching Reel Cutter, enter your license key when prompted. The key is provided after purchase and is tied to your machine for security. You can manage your license from within the application.",
  },
  {
    question: "Can I use Reel Cutter on multiple computers?",
    answer:
      "Each license key is tied to a single machine via hardware ID. If you need to use Reel Cutter on a different computer, you can deactivate the license on the current machine and activate it on the new one.",
  },
  {
    question: "What export quality is available?",
    answer:
      "Reel Cutter supports 1080p Full HD export on all tiers. Standard and Pro tiers include 4K Ultra HD export (3840x2160). All tiers include multiple output modes: blur, crop, pad, and smart crop.",
  },
];

const troubleshootingItems = [
  {
    problem: "Installation fails or installer won't open",
    solution:
      "Ensure you're running Windows 10 or later (64-bit). Try running the installer as administrator. If your antivirus blocks it, add Reel Cutter to the exceptions list.",
  },
  {
    problem: "Video export is slow or stuck",
    solution:
      "Video processing depends on your hardware and the video length/resolution. Ensure your system meets the minimum requirements. Close other resource-intensive applications during export.",
  },
  {
    problem: "Exported video has no audio",
    solution:
      "Check your export settings to ensure audio is enabled. Some input formats may require specific audio encoding settings. Try re-importing the source video and exporting again.",
  },
  {
    problem: "Application crashes during export",
    solution:
      "Try exporting a shorter segment first. If the issue persists, check that your system has sufficient memory (8 GB minimum, 16 GB recommended). Update to the latest version of Reel Cutter.",
  },
  {
    problem: "License key not accepted",
    solution:
      "Ensure you're entering the exact key from your purchase confirmation. License keys are case-sensitive. If you've recently changed hardware, you may need to deactivate and reactivate your license.",
  },
];

export default function SupportPage() {
  return (
    <>
      {/* Hero */}
      <Section spacing="large" id="support-hero" ariaLabelledBy="support-title">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>DialDazzle support</Eyebrow>
          <h1 id="support-title" className="dd-display text-foreground">
            Support
          </h1>
          <p className="dd-body max-w-[68ch] text-muted-foreground">
            Get help with Reel Cutter. Find answers to common questions,
            troubleshoot issues, and contact our support team.
          </p>
        </Container>
      </Section>

      {/* Quick Help */}
      <Section spacing="normal" id="support-quick-help" ariaLabelledBy="support-quick-help-title">
        <Container className="flex flex-col gap-6">
          <h2 id="support-quick-help-title" className="sr-only">
            Quick help
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/docs"
              className="flex items-center gap-3 rounded-dd-lg border border-border-subtle bg-surface-elevated p-4 transition-colors duration-dd-base hover:border-accent dd-focus"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-dd-md bg-accent-soft text-accent-text">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Documentation</div>
                <div className="text-sm text-muted-foreground">
                  Browse guides and tutorials
                </div>
              </div>
            </Link>
            <a
              href="https://github.com/mahmoodhasan3031-collab/reel-cutter/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-dd-lg border border-border-subtle bg-surface-elevated p-4 transition-colors duration-dd-base hover:border-accent dd-focus"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-dd-md bg-accent-soft text-accent-text">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Report an Issue</div>
                <div className="text-sm text-muted-foreground">
                  Open a GitHub issue
                </div>
              </div>
            </a>
            <Link
              href="/download"
              className="flex items-center gap-3 rounded-dd-lg border border-border-subtle bg-surface-elevated p-4 transition-colors duration-dd-base hover:border-accent dd-focus"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-dd-md bg-accent-soft text-accent-text">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Download</div>
                <div className="text-sm text-muted-foreground">
                  Get the latest version
                </div>
              </div>
            </Link>
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section spacing="large" id="support-faq" ariaLabelledBy="support-faq-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Answers"
            title="Frequently Asked Questions"
            id="support-faq-title"
          />
          <div className="grid gap-6 sm:grid-cols-2">
            {faqItems.map((item) => (
              <Surface key={item.question} tone="inset" radius="lg" className="p-6">
                <h3 className="dd-h3 text-foreground">{item.question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </Surface>
            ))}
          </div>
        </Container>
      </Section>

      {/* Troubleshooting */}
      <Section spacing="large" id="support-troubleshooting" ariaLabelledBy="support-troubleshooting-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Fix it"
            title="Troubleshooting"
            description="Common issues and their solutions."
            id="support-troubleshooting-title"
          />
          <div className="flex flex-col gap-6">
            {troubleshootingItems.map((item) => (
              <Surface key={item.problem} tone="raised" radius="lg" className="p-6">
                <h3 className="dd-h3 text-danger">{item.problem}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.solution}
                </p>
              </Surface>
            ))}
          </div>
        </Container>
      </Section>

      {/* Contact */}
      <Section spacing="large" id="support-contact" ariaLabelledBy="support-contact-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Reach us"
            title="Contact Support"
            description="Can't find the answer you're looking for? Reach out to our support team."
            id="support-contact-title"
          />
          <Surface tone="inset" radius="lg" className="p-6">
            <p className="text-sm text-muted-foreground">
              Support contact coming soon. In the meantime, you can{" "}
              <a
                href="https://github.com/mahmoodhasan3031-collab/reel-cutter/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent-text underline-offset-4 hover:underline dd-focus"
              >
                open an issue on GitHub
              </a>{" "}
              for technical questions, bugs, or feature requests.
            </p>
          </Surface>

          <Surface tone="base" radius="lg" className="border border-border-subtle p-6">
            <SectionHeader
              eyebrow="Other products"
              title="Support for other DialDazzle products is not available yet"
              description="This page covers Reel Cutter, the current DialDazzle product. Support for additional products will be added here when those products ship."
              level={3}
              id="support-future-title"
            />
          </Surface>
        </Container>
      </Section>
    </>
  );
}
