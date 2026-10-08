import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Section, SectionHeader, Surface } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How DialDazzle handles information when you use this website and Reel Cutter: what is collected, why it is used, and the choices you have.",
  alternates: {
    canonical: "/legal/privacy",
  },
  openGraph: {
    title: "Privacy Policy | DialDazzle",
    description:
      "How DialDazzle handles information when you use this website and Reel Cutter.",
    url: "/legal/privacy",
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
    id: "information-we-collect",
    title: "Information we collect",
    items: [
      "Information you provide directly, such as an email address when you create an account, details you enter during checkout, and anything you send when you contact support.",
      "Payment information for manual payment submissions, such as the details you choose to include with a transaction. Card payments are handled by our payment processor and are not stored on our servers.",
      "Technical information needed to run and protect the software, including device and application details used for activation and updates.",
    ],
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    items: [
      "To provide the website, the Reel Cutter application, accounts, activations and purchases.",
      "To process payments, deliver licenses and keep a record of your subscription.",
      "To respond to questions, bug reports and support requests.",
      "To keep the service secure, prevent abuse and diagnose problems.",
    ],
  },
  {
    id: "sharing",
    title: "When information is shared",
    items: [
      "With service providers that help us operate the service, such as payment processing, authentication, hosting and public release distribution.",
      "When it is required to follow the law or to protect the rights, safety and property of users and of DialDazzle.",
      "We do not sell your personal information.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    items: [
      "We use cookies and local storage where they are needed to keep you signed in, remember your preferences and make the website work as expected.",
      "You can control cookies through your browser settings. Blocking required cookies may stop parts of the website from working.",
    ],
  },
  {
    id: "retention-security",
    title: "Retention and security",
    items: [
      "We keep information for as long as it is needed to provide the service, meet our obligations and resolve disputes.",
      "We use reasonable technical and organisational measures to protect the information we hold. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.",
    ],
  },
  {
    id: "choices",
    title: "Your choices",
    items: [
      "You can review and update account information from your account page.",
      "You can contact support to ask about the information we hold about you or to request deletion, subject to what we need to keep for lawful or operational reasons.",
    ],
  },
  {
    id: "children",
    title: "Children",
    items: [
      "The website and Reel Cutter are not directed at children, and we do not knowingly collect information from children.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    items: [
      "We may update this policy from time to time. The current version is always published on this page, and the date below shows when it was last updated.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Section spacing="large" id="privacy-hero" ariaLabelledBy="privacy-title">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>Legal</Eyebrow>
          <h1 id="privacy-title" className="dd-display text-foreground">
            Privacy Policy
          </h1>
          <p className="dd-body max-w-[68ch] text-muted-foreground">
            This policy explains what information DialDazzle handles when you use
            this website and Reel Cutter, how that information is used, and the
            choices available to you.
          </p>
          <p className="dd-caption text-muted-foreground">Last updated: October 2026</p>
        </Container>
      </Section>

      <Section spacing="normal" id="privacy-body" ariaLabelledBy="privacy-body-title">
        <Container className="flex flex-col gap-8">
          <h2 id="privacy-body-title" className="sr-only">
            Privacy policy details
          </h2>

          <Surface tone="inset" radius="lg" className="p-6 sm:p-8">
            <SectionHeader
              eyebrow="Overview"
              title="What this policy covers"
              description="DialDazzle builds software. We collect only what we need to run this website, provide Reel Cutter, process purchases and answer support requests. This policy applies to this website and to Reel Cutter. It is written as a general-level description of how we handle information, not as a product-by-product breakdown."
              id="privacy-overview-title"
            />
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
              title="Questions about privacy"
              description="If you have a question about this policy or about the information we hold, contact us through the support page."
              level={3}
              id="privacy-contact-title"
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/support"
                className="inline-flex items-center justify-center rounded-dd-md bg-accent-hover px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] duration-dd-base ease-dd-soft hover:bg-accent-press dd-focus"
              >
                Contact support
              </Link>
              <Link
                href="/legal/terms"
                className="inline-flex items-center justify-center rounded-dd-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors duration-dd-base hover:bg-surface-elevated dd-focus"
              >
                Read the Terms of Service
              </Link>
            </div>
          </Surface>
        </Container>
      </Section>
    </>
  );
}
