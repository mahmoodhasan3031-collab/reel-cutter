import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Documentation and guides for Reel Cutter — learn how to use video cutting, reels, captions, bulk export, and workflow automation.",
  openGraph: {
    title: "Documentation | Reel Cutter",
    description:
      "Learn how to use Reel Cutter with guides, tutorials, and reference documentation.",
  },
};

const docSections = [
  {
    title: "Getting Started",
    description: "Everything you need to install, configure, and create your first export.",
    articles: [
      { title: "Installation", description: "Download and install Reel Cutter on Windows.", status: "available" },
      { title: "First Reel", description: "Create your first 9:16 reel from a video file.", status: "available" },
      { title: "Exporting", description: "Understand export settings, output modes, and quality options.", status: "available" },
      { title: "License Activation", description: "Activate your license key and unlock features.", status: "coming" },
    ],
  },
  {
    title: "Editing",
    description: "Core video editing modes and output configuration.",
    articles: [
      { title: "Cut", description: "Extract precise segments with millisecond-accurate timestamps.", status: "available" },
      { title: "Reel", description: "Create vertical 9:16 reels with blur, crop, or pad modes.", status: "available" },
      { title: "Split", description: "Divide long videos into shorter segments at configurable intervals.", status: "available" },
      { title: "Aspect Ratio", description: "Configure output dimensions for different platforms.", status: "available" },
      { title: "Text Overlays", description: "Add customizable text overlays to your exports.", status: "coming" },
    ],
  },
  {
    title: "Content",
    description: "Content variation, profiles, and export presets.",
    articles: [
      { title: "Content Variation", description: "Create alternate versions of your content for different platforms.", status: "coming" },
      { title: "Variation Presets", description: "Save and reuse variation configurations.", status: "coming" },
      { title: "Page Profiles", description: "Configure intelligent profiles for different export workflows.", status: "coming" },
      { title: "Export Presets", description: "Save and apply complete export configurations.", status: "coming" },
    ],
  },
  {
    title: "Captions",
    description: "Caption templates, AI generation, and quality tools.",
    articles: [
      { title: "Caption Templates", description: "Create and manage reusable caption styles.", status: "coming" },
      { title: "AI Caption Generator", description: "Generate captions automatically with AI assistance.", status: "coming" },
      { title: "Caption Quality", description: "Analyze and improve caption readability.", status: "coming" },
      { title: "Caption Workspace", description: "Edit captions with smart rewrite tools.", status: "coming" },
      { title: "Caption Experiments", description: "A/B test different caption variations.", status: "coming" },
    ],
  },
  {
    title: "Automation",
    description: "Workflow recipes, bulk export, batch processing, and scheduling.",
    articles: [
      { title: "Workflow Recipes", description: "Save and reuse one-click export workflows.", status: "available" },
      { title: "Bulk Export", description: "Process multiple videos with intelligent bulk export.", status: "coming" },
      { title: "Batch Queue", description: "Queue and process multiple export jobs automatically.", status: "coming" },
      { title: "Scheduling", description: "Schedule export jobs to run at specific times.", status: "coming" },
    ],
  },
  {
    title: "Management",
    description: "Export history, recovery, analytics, and license management.",
    articles: [
      { title: "Export History", description: "Track, search, and organize your export history.", status: "coming" },
      { title: "Recovery & Retry", description: "Recover from failed exports and retry with original settings.", status: "coming" },
      { title: "Analytics Dashboard", description: "View export performance metrics and insights.", status: "coming" },
      { title: "License Management", description: "Manage your license and subscription tier.", status: "coming" },
    ],
  },
];

function ArticleStatus({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
        Available
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      Coming Soon
    </span>
  );
}

export default function DocsPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Documentation
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
            Learn how to use Reel Cutter with step-by-step guides, tutorials,
            and reference documentation.
          </p>
        </div>
      </section>

      {/* Quick Links */}
      <section className="bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/docs#getting-started"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:hover:border-indigo-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Getting Started</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Install and create your first export</div>
              </div>
            </Link>
            <Link
              href="/features"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:hover:border-indigo-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Features</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Explore the full feature set</div>
              </div>
            </Link>
            <Link
              href="/support"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-800 dark:hover:border-indigo-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Support</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Get help with Reel Cutter</div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl">
          {docSections.map((section, sIdx) => (
            <div key={section.title} className={sIdx > 0 ? "mt-12" : ""} id={section.title.toLowerCase().replace(/\s+/g, "-")}>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {section.title}
              </h2>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                {section.description}
              </p>
              <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {section.articles.map((article) => (
                  <div
                    key={article.title}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {article.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {article.description}
                      </p>
                    </div>
                    <ArticleStatus status={article.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Can&apos;t Find What You Need?
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            Contact our support team for personalized help with Reel Cutter.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/support"
              className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50"
            >
              Contact Support
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center rounded-lg border border-indigo-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Download Reel Cutter
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
