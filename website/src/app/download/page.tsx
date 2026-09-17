import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download Reel Cutter for Windows. Professional desktop video editing for short-form content, reels, and social media videos.",
  openGraph: {
    title: "Download Reel Cutter",
    description:
      "Professional desktop video editing for short-form content. Available for Windows.",
  },
};

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
      "Click the download button to get the Reel Cutter installer for Windows. The installer is approximately 150 MB.",
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
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Download Reel Cutter
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Professional desktop video editing for Windows. Create reels, social media clips,
            and short-form content from longer videos.
          </p>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
              <div className="text-center sm:text-left">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Latest Version
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  Reel Cutter v1.0.2
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Windows 10+ (64-bit) &middot; ~150 MB
                </div>
              </div>
              <a
                href="https://github.com/mahmoodhasan3031-collab/reel-cutter/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download for Windows
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Free to download. License activation required for full features.
            </p>
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            System Requirements
          </h2>
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800">
            <table className="w-full text-left text-sm">
              <tbody>
                {systemRequirements.map((req, i) => (
                  <tr
                    key={req.label}
                    className={i < systemRequirements.length - 1 ? "border-b border-slate-200 dark:border-slate-700" : ""}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {req.label}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {req.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Installation Steps */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Installation Guide
          </h2>
          <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
            Get started in five simple steps.
          </p>
          <div className="mt-10 space-y-8">
            {installationSteps.map((step) => (
              <div key={step.step} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {step.step}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Happens After Installation */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            After Installation
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                License Activation
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Enter your license key to unlock features. Different tiers (Basic, Standard, Pro)
                provide access to different capabilities. See the pricing page for tier details.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Auto-Updates
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Reel Cutter includes a built-in updater. When a new version is available,
                you&apos;ll be notified and can update directly from within the application.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Import Your First Video
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Drag and drop a video file into Reel Cutter, or use the file picker.
                Supported formats include MP4, MOV, AVI, MKV, and more.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Start Creating
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Choose Cut, Reel, or Split mode. Configure your output settings, add captions
                if needed, and export professional short-form content.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Questions About Installation?
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            Check the documentation or contact our support team for help.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50"
            >
              View Documentation
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center rounded-lg border border-indigo-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
