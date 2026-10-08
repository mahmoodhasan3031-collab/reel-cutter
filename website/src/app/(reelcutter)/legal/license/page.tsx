import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "License Agreement",
  description:
    "Where to find the Reel Cutter license terms: the Terms of Service, plus license activation and license management guidance in the documentation.",
  openGraph: {
    title: "License Agreement | Reel Cutter",
    description:
      "Where to find the Reel Cutter license terms: the Terms of Service, plus license activation and license management guidance in the documentation.",
  },
};

const sources = [
  {
    href: "/legal/terms",
    title: "Terms of Service",
    description:
      "The binding terms for using Reel Cutter, including accounts and activation, subscriptions and payment, and the software itself.",
  },
  {
    href: "/docs#getting-started",
    title: "License Activation",
    description:
      "How to activate your license key after installing Reel Cutter.",
  },
  {
    href: "/docs#management",
    title: "License Management",
    description:
      "Manage your license and subscription tier from inside the application.",
  },
  {
    href: "/legal/privacy",
    title: "Privacy Policy",
    description: "What information is collected and how it is handled.",
  },
];

export default function LegalLicensePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            License Agreement
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Reel Cutter is licensed per machine. The terms themselves live in
            the Terms of Service, and activation is documented in the
            documentation.
          </p>
        </div>
      </section>

      {/* Where the terms live */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800">
            {sources.map((source) => (
              <li key={source.href}>
                <Link
                  href={source.href}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {source.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                      {source.description}
                    </p>
                  </div>
                  <span className="mt-0.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    Open
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              This page adds no new terms
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              This page only points at the existing license sources. The
              Terms of Service is the document that governs your use of Reel
              Cutter.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
