import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Step-by-step guides and tutorials for Reel Cutter, from installation and editing to captions, automation, and license management.",
  openGraph: {
    title: "Guides | Reel Cutter",
    description:
      "Step-by-step guides and tutorials for Reel Cutter, from installation and editing to captions, automation, and license management.",
  },
};

const guides = [
  {
    anchor: "getting-started",
    title: "Getting Started",
    description: "Everything you need to install, configure, and create your first export.",
  },
  {
    anchor: "editing",
    title: "Editing",
    description: "Core video editing modes and output configuration.",
  },
  {
    anchor: "content",
    title: "Content",
    description: "Content variation, profiles, and export presets.",
  },
  {
    anchor: "captions",
    title: "Captions",
    description: "Caption templates, AI generation, and quality tools.",
  },
  {
    anchor: "automation",
    title: "Automation",
    description: "Workflow recipes, bulk export, batch processing, and scheduling.",
  },
  {
    anchor: "management",
    title: "Management",
    description:
      "Export history, recovery, analytics, and license management.",
  },
];

export default function GuidesPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Guides
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Step-by-step guides and tutorials for Reel Cutter. Each guide
            below opens the matching section of the documentation.
          </p>
        </div>
      </section>

      {/* Guide index */}
      <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800">
            {guides.map((guide) => (
              <li key={guide.anchor}>
                <Link
                  href={`/docs#${guide.anchor}`}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {guide.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                      {guide.description}
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
              href="/docs"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Browse all documentation
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Get help
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
