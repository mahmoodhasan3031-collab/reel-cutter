import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "System Status",
  description:
    "Reel Cutter runs offline on Windows, so there is no hosted service to report status for. See what needs an internet connection and where to report problems.",
  openGraph: {
    title: "System Status | Reel Cutter",
    description:
      "Reel Cutter runs offline on Windows, so there is no hosted service to report status for. See what needs an internet connection and where to report problems.",
  },
};

const RELEASES_URL =
  "https://github.com/mahmoodhasan3031-collab/reel-cutter/releases";
const ISSUES_URL =
  "https://github.com/mahmoodhasan3031-collab/reel-cutter/issues";

const offlineItems = [
  { label: "Editing and export", detail: "Run entirely on your own machine." },
  {
    label: "Internet required",
    detail: "License activation, auto-updates, and AI caption generation.",
  },
];

export default function SupportStatusPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            System Status
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Reel Cutter is a Windows desktop application that processes video
            offline on your machine, so there is no hosted service status
            page to report here.
          </p>
        </div>
      </section>

      {/* What runs where */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-2">
            {offlineItems.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800"
              >
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {item.label}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Release notices and problem reports
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Release notices are published on the public GitHub releases
              channel. To report a problem with the application, open a
              GitHub issue.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                View releases
              </a>
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Open a GitHub issue
              </a>
              <Link
                href="/support"
                className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Go to support
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
