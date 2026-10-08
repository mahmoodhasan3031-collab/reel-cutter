import type { Metadata } from "next";
import Link from "next/link";
import { getProduct, REEL_CUTTER_V106_URL } from "@/lib/products";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Release notes and version history for Reel Cutter, published through the public GitHub releases channel.",
  openGraph: {
    title: "Changelog | Reel Cutter",
    description:
      "Release notes and version history for Reel Cutter, published through the public GitHub releases channel.",
  },
};

const RELEASES_URL =
  "https://github.com/mahmoodhasan3031-collab/reel-cutter/releases";

const reelCutter = getProduct("reel-cutter");
const currentVersion = reelCutter?.download?.version;

export default function ChangelogPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Changelog
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Reel Cutter releases are published with clear version numbers
            through a public GitHub channel, so changes are easy to follow.
          </p>
        </div>
      </section>

      {/* Current release + version history */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Current release
            </h2>
            {currentVersion ? (
              <p className="mt-2 text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                v{currentVersion}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              The Windows desktop application. Read the download page for
              system requirements and installation steps.
            </p>
            <Link
              href="/download"
              className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Go to the download page
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Version history
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Every published release is listed on the public GitHub releases
              page, including the installer for each version.
            </p>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              View releases on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Installer shortcut */}
      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Current installer
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Download the latest published build directly from the releases
            channel.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <a
              href={REEL_CUTTER_V106_URL}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Download the installer
            </a>
            <Link
              href="/docs"
              className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Read the documentation
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
