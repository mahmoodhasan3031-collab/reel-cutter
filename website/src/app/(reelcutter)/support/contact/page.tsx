import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Support",
  description:
    "How to reach Reel Cutter support: open a GitHub issue for bugs and questions, or read the contact section of the support page.",
  openGraph: {
    title: "Contact Support | Reel Cutter",
    description:
      "How to reach Reel Cutter support: open a GitHub issue for bugs and questions, or read the contact section of the support page.",
  },
};

const ISSUES_URL =
  "https://github.com/mahmoodhasan3031-collab/reel-cutter/issues";

export default function SupportContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Contact Support
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            The support page collects the contact options for Reel Cutter,
            including how to report a bug or ask a question.
          </p>
        </div>
      </section>

      {/* Contact options */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Support page
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Reach out through the contact section of the support page, and
              browse troubleshooting while you are there.
            </p>
            <Link
              href="/support#support-contact"
              className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Open the contact section
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Report an issue
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Open a GitHub issue for technical questions, bugs, or feature
              requests. This is the channel currently monitored for Reel
              Cutter support.
            </p>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Open a GitHub issue
            </a>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-4xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Looking for answers first?
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The support page also holds frequently asked questions and
            troubleshooting steps.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href="/support#support-faq"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Read the FAQ
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Go to support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
