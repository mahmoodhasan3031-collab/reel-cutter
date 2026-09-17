import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Reel Cutter — installation support, license help, export troubleshooting, and frequently asked questions.",
  openGraph: {
    title: "Support | Reel Cutter",
    description: "Get help with Reel Cutter video editing software.",
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
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Support
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Get help with Reel Cutter. Find answers to common questions,
            troubleshoot issues, and contact our support team.
          </p>
        </div>
      </section>

      {/* Quick Help */}
      <section className="bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/docs"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:hover:border-indigo-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Documentation</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Browse guides and tutorials</div>
              </div>
            </Link>
            <a
              href="https://github.com/mahmoodhasan3031-collab/reel-cutter/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:hover:border-indigo-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Report an Issue</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Open a GitHub issue</div>
              </div>
            </a>
            <Link
              href="/download"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:hover:border-indigo-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Download</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Get the latest version</div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 space-y-6">
            {faqItems.map((item) => (
              <div
                key={item.question}
                className="rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Troubleshooting
          </h2>
          <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
            Common issues and their solutions.
          </p>
          <div className="mt-8 space-y-6">
            {troubleshootingItems.map((item) => (
              <div
                key={item.problem}
                className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800"
              >
                <h3 className="text-base font-semibold text-red-600 dark:text-red-400">
                  {item.problem}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {item.solution}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Contact Support
          </h2>
          <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
            Can&apos;t find the answer you&apos;re looking for? Reach out to our support team.
          </p>
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Support contact coming soon. In the meantime, you can{" "}
              <a
                href="https://github.com/mahmoodhasan3031-collab/reel-cutter/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                open an issue on GitHub
              </a>{" "}
              for technical questions, bugs, or feature requests.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
