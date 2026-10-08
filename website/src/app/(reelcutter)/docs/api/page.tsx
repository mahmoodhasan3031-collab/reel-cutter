import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API Reference",
  description:
    "Reel Cutter does not publish a public API at this time. See the documentation and features for what the desktop application supports.",
  openGraph: {
    title: "API Reference | Reel Cutter",
    description:
      "Reel Cutter does not publish a public API at this time. See the documentation and features for what the desktop application supports.",
  },
};

export default function ApiReferencePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            API Reference
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Reel Cutter is a Windows desktop application. It does not publish
            a public API, so there are no public endpoints to document here.
          </p>
        </div>
      </section>

      {/* Status of the API surface */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            No public API at this time
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Editing, export, licensing, and automation all run inside the
            desktop application on your own machine. If a public API is
            introduced later, its endpoints will be documented on this page.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Read the documentation
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              See what Reel Cutter supports
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
