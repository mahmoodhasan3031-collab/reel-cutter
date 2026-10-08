import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Section, SectionHeader, Surface } from "@/components/ui";
import { REEL_CUTTER_V106_URL, getProduct } from "@/lib/products";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download DialDazzle software for Windows. Reel Cutter v1.0.6 is the current download, with system requirements and installation steps.",
  alternates: {
    canonical: "/download",
  },
  openGraph: {
    title: "Download | DialDazzle",
    description:
      "Get Reel Cutter for Windows from DialDazzle — system requirements and installation steps included.",
    url: "/download",
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

const reelCutter = getProduct("reel-cutter");

const systemRequirements = [
  { label: "Operating System", value: "Windows 10 or later (64-bit)" },
  { label: "Processor", value: "Intel or AMD multi-core processor" },
  { label: "Memory", value: "8 GB RAM minimum (16 GB recommended)" },
  { label: "Storage", value: "2 GB available disk space" },
  { label: "Display", value: "1280x720 minimum resolution" },
];

const installationSteps = [
  {
    step: 1,
    title: "Download the Installer",
    description:
      "Click the download button to get the Reel Cutter installer for Windows. The installer is approximately 274 MB.",
  },
  {
    step: 2,
    title: "Run the Installer",
    description:
      "Open the downloaded installer file. Follow the installation wizard — you can choose your installation directory and create desktop/start menu shortcuts.",
  },
  {
    step: 3,
    title: "Launch Reel Cutter",
    description:
      "Once installed, launch Reel Cutter from your desktop or Start menu. The application will open to the main workspace.",
  },
  {
    step: 4,
    title: "Activate Your License",
    description:
      "Enter your license key when prompted to unlock full functionality. Different license tiers unlock different features — see the pricing page for details.",
  },
  {
    step: 5,
    title: "Start Creating",
    description:
      "Import a video, choose your export type (Cut, Reel, or Split), configure your settings, and export your first short-form content.",
  },
];

export default function DownloadPage() {
  return (
    <>
      {/* Hero */}
      <Section spacing="large" id="download-hero" ariaLabelledBy="download-title">
        <Container className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>DialDazzle downloads</Eyebrow>
          <h1 id="download-title" className="dd-display text-foreground">
            Download
          </h1>
          <p className="dd-body max-w-[68ch] text-muted-foreground">
            DialDazzle software for Windows. Reel Cutter is the current download —
            professional desktop video editing for reels, social media clips, and
            short-form content from longer videos.
          </p>

          <Surface tone="raised" radius="xl" className="mt-4 w-full px-6 py-8 sm:px-10">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
              <div className="text-center sm:text-left">
                <div className="dd-caption uppercase tracking-wider text-muted-foreground">
                  Latest Version
                </div>
                <div className="mt-1 text-2xl font-bold text-foreground">
                  {reelCutter?.name} v{reelCutter?.download?.version}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Windows 10+ (64-bit) &middot; ~274 MB
                </div>
              </div>
              <a
                href={REEL_CUTTER_V106_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-dd-md bg-accent-hover px-6 text-sm font-semibold text-white shadow-subtle transition-[background-color,box-shadow,transform] duration-dd-base ease-dd-soft hover:bg-accent-press dd-focus"
              >
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
                Download for Windows
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Free to download. License activation required for full features.
            </p>
          </Surface>
        </Container>
      </Section>

      {/* Other products */}
      <Section spacing="compact" id="download-more" ariaLabelledBy="download-more-title">
        <Container>
          <Surface tone="inset" radius="lg" className="px-6 py-8 text-center">
            <SectionHeader
              eyebrow="Roadmap"
              title="More tools in the pipeline"
              description="Reel Cutter is the only DialDazzle download available today. Other DialDazzle products will be listed here when they ship."
              align="center"
              level={3}
              id="download-more-title"
            />
          </Surface>
        </Container>
      </Section>

      {/* System Requirements */}
      <Section spacing="normal" id="system-requirements" ariaLabelledBy="system-requirements-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Before you install"
            title="System Requirements"
            id="system-requirements-title"
          />
          <div className="overflow-hidden rounded-dd-lg border border-border-subtle bg-surface-elevated">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Minimum system requirements for Reel Cutter
              </caption>
              <tbody>
                {systemRequirements.map((req, i) => (
                  <tr
                    key={req.label}
                    className={
                      i < systemRequirements.length - 1
                        ? "border-b border-border-subtle"
                        : ""
                    }
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 font-medium text-foreground"
                    >
                      {req.label}
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">{req.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      {/* Installation Steps */}
      <Section spacing="large" id="installation-guide" ariaLabelledBy="installation-guide-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Install"
            title="Installation Guide"
            description="Get started in five simple steps."
            id="installation-guide-title"
          />
          <ol className="flex flex-col gap-8">
            {installationSteps.map((step) => (
              <li key={step.step} className="flex gap-4">
                <div
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-hover text-sm font-bold text-white"
                >
                  {step.step}
                </div>
                <div>
                  <h3 className="dd-h3 text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* What Happens After Installation */}
      <Section spacing="large" id="after-installation" ariaLabelledBy="after-installation-title">
        <Container className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Next steps"
            title="After Installation"
            id="after-installation-title"
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">License Activation</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your license key to unlock features. Different tiers (Basic, Standard, Pro)
                provide access to different capabilities. See the pricing page for tier details.
              </p>
            </Surface>
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">Auto-Updates</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Reel Cutter includes a built-in updater. When a new version is available,
                you&apos;ll be notified and can update directly from within the application.
              </p>
            </Surface>
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">Import Your First Video</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Drag and drop a video file into Reel Cutter, or use the file picker.
                Supported formats include MP4, MOV, AVI, MKV, and more.
              </p>
            </Surface>
            <Surface tone="raised" radius="lg" className="p-6">
              <h3 className="dd-h3 text-foreground">Start Creating</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose Cut, Reel, or Split mode. Configure your output settings, add captions
                if needed, and export professional short-form content.
              </p>
            </Surface>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section spacing="large" id="download-cta" ariaLabelledBy="download-cta-title">
        <Container>
          <Surface tone="accent" radius="xl" className="px-6 py-12 sm:px-10 sm:py-16">
            <div className="flex flex-col items-center gap-6 text-center">
              <SectionHeader
                eyebrow="Help"
                title="Questions About Installation?"
                description="Check the documentation or contact our support team for help."
                align="center"
                id="download-cta-title"
              />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/docs"
                  className="inline-flex items-center justify-center rounded-lg bg-accent-hover px-6 py-3 text-sm font-semibold text-white transition-colors duration-dd-base hover:bg-accent-press dd-focus"
                >
                  View Documentation
                </Link>
                <Link
                  href="/support"
                  className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors duration-dd-base hover:bg-surface-elevated dd-focus"
                >
                  Contact Support
                </Link>
              </div>
            </div>
          </Surface>
        </Container>
      </Section>
    </>
  );
}
