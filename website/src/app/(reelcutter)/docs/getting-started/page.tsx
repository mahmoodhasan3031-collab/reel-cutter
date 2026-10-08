import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Getting Started",
  description:
    "Everything you need to install Reel Cutter, configure it, and create your first export.",
  openGraph: {
    title: "Getting Started | Reel Cutter",
    description:
      "Everything you need to install Reel Cutter, configure it, and create your first export.",
  },
};

const steps = [
  {
    title: "Installation",
    description: "Download and install Reel Cutter on Windows.",
  },
  {
    title: "First Reel",
    description: "Create your first 9:16 reel from a video file.",
  },
  {
    title: "Exporting",
    description:
      "Understand export settings, output modes, and quality options.",
  },
  {
    title: "License Activation",
    description: "Activate your license key and unlock features.",
  },
];

export default function GettingStartedPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Getting Started
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Everything you need to install, configure, and create your first
            export.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/download"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
            >
              Download Reel Cutter
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Your first session
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            The same four steps listed in the documentation Getting Started
            section.
          </p>
          <ol className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4 px-5 py-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            href="/docs#getting-started"
            className="mt-6 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            View the full Getting Started section in the documentation
          </Link>
        </div>
      </section>
    </>
  );
}
