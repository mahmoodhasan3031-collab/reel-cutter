import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about Reel Cutter, including supported formats, licensing, offline use, and export quality.",
  openGraph: {
    title: "Frequently Asked Questions | Reel Cutter",
    description:
      "Answers to common questions about Reel Cutter, including supported formats, licensing, offline use, and export quality.",
  },
};

const topics = [
  {
    href: "/support#support-faq",
    title: "Frequently Asked Questions",
    description:
      "What Reel Cutter is, supported formats, offline use, licensing, and export quality.",
  },
  {
    href: "/support#support-troubleshooting",
    title: "Troubleshooting",
    description:
      "Installation, export, audio, crash, and license key problems with suggested fixes.",
  },
  {
    href: "/docs",
    title: "Documentation",
    description: "Step-by-step guides and tutorials for every feature.",
  },
];

export default function SupportFaqPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Frequently Asked Questions
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Answers to common questions about Reel Cutter live on the support
            page, together with troubleshooting guidance.
          </p>
        </div>
      </section>

      {/* Topic index */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800">
            {topics.map((topic) => (
              <li key={topic.href}>
                <Link
                  href={topic.href}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {topic.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                      {topic.description}
                    </p>
                  </div>
                  <span className="mt-0.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    Open
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/support"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Go to support
            </Link>
            <Link
              href="/support/contact"
              className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
