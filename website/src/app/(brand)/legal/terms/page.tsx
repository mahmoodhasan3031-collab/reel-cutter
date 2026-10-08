import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Section, SectionHeader, Surface } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that apply when you use the DialDazzle website and Reel Cutter, including accounts, subscriptions, license activation and acceptable use.",
  alternates: {
    canonical: "/legal/terms",
  },
  openGraph: {
    title: "Terms of Service | DialDazzle",
    description:
      "The terms that apply when you use the DialDazzle website and Reel Cutter.",
    url: "/legal/terms",
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

const sections = [
  {
    id: "using-the-service",
    title: "Using the service",
    items: [
      "By using this website or Reel Cutter you agree to these terms. If you do not agree, do not use the service.",
      "You are responsible for the account you create, for keeping your credentials private, and for the activity that happens under your account.",
      "You must use the service only in a way that is lawful and that does not interfere with other people's use of it.",
    ],
  },
  {
    id: "accounts",
    title: "Accounts and activation",
    items: [
      "Reel Cutter is free to download and evaluate. A license key is required to unlock full functionality.",
      "Each license key activates on a single machine using a hardware identifier. You can deactivate a key on one machine and activate it on another if your setup changes.",
      "Please provide accurate information when you create an account or make a purchase, and keep it up to date.",
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions and payment",
    items: [
      "Paid plans are monthly subscriptions. Prices and what each plan includes are listed on the pricing page.",
      "You can cancel a subscription at any time. Access continues until the end of the billing period you already paid for.",
      "Payments are handled by our payment processor. Some purchases can also be paid manually using the manual payment option.",
      "Software updates for Reel Cutter are included while your subscription is active.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    items: [
      "Do not reverse engineer, decompile or attempt to bypass license checks, except where the law allows it and only to the extent that the law permits.",
      "Do not resell, sublicense or redistribute your license key.",
      "Do not use the service to break the law, to infringe the rights of others, or to upload content you do not have the right to use.",
    ],
  },
  {
    id: "your-content",
    title: "Your content",
    items: [
      "You keep ownership of the videos and other material you bring into Reel Cutter.",
      "The export files you create are yours to use. You are responsible for making sure you have the rights to the material you work with.",
    ],
  },
  {
    id: "software",
    title: "The software",
    items: [
      "Reel Cutter is licensed, not sold. We keep ownership of the software, and we grant you a personal, non-transferable right to use it under these terms.",
      "The service is provided as is, without warranties of any kind, to the extent permitted by law. We do not promise that the service will be uninterrupted or error free.",
      "To the extent permitted by law, DialDazzle is not liable for indirect, incidental or consequential damages arising from your use of the service.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    items: [
      "We may update these terms from time to time. The current version is always published on this page, and the date below shows when it was last updated.",
      "Continuing to use the service after the terms change means you accept the updated terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <Section spacing="large" id="terms-hero" ariaLabelledBy="terms-title">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>Legal</Eyebrow>
          <h1 id="terms-title" className="dd-display text-foreground">
            Terms of Service
          </h1>
          <p className="dd-body max-w-[68ch] text-muted-foreground">
            These terms apply when you use this website and Reel Cutter. They cover
            accounts, subscriptions, license activation and what you can expect from
            the service.
          </p>
          <p className="dd-caption text-muted-foreground">Last updated: October 2026</p>
        </Container>
      </Section>

      <Section spacing="normal" id="terms-body" ariaLabelledBy="terms-body-title">
        <Container className="flex flex-col gap-8">
          <h2 id="terms-body-title" className="sr-only">
            Terms of service details
          </h2>

          <Surface tone="inset" radius="lg" className="p-6 sm:p-8">
            <SectionHeader
              eyebrow="Overview"
              title="Summary"
              description="Reel Cutter is a desktop application licensed per machine, sold as a monthly subscription. This page sets out the terms in general terms for the DialDazzle website and software; the pricing page lists current prices and plan features."
              id="terms-overview-title"
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-dd-md bg-accent-hover px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] duration-dd-base ease-dd-soft hover:bg-accent-press dd-focus"
              >
                View pricing
              </Link>
              <Link
                href="/legal/privacy"
                className="inline-flex items-center justify-center rounded-dd-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors duration-dd-base hover:bg-surface-elevated dd-focus"
              >
                Read the Privacy Policy
              </Link>
            </div>
          </Surface>

          {sections.map((section) => (
            <div key={section.id} id={section.id}>
              <SectionHeader title={section.title} />
              <ul className="mt-4 flex flex-col gap-3">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="dd-body max-w-[75ch] text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <Surface tone="raised" radius="lg" className="p-6 sm:p-8">
            <SectionHeader
              eyebrow="Contact"
              title="Questions about these terms"
              description="If you have a question about these terms, contact us through the support page."
              level={3}
              id="terms-contact-title"
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/support"
                className="inline-flex items-center justify-center rounded-dd-md bg-accent-hover px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] duration-dd-base ease-dd-soft hover:bg-accent-press dd-focus"
              >
                Contact support
              </Link>
            </div>
          </Surface>
        </Container>
      </Section>
    </>
  );
}
