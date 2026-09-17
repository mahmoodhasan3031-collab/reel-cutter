import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white px-4 py-20 sm:px-6 sm:py-28 lg:px-8 dark:bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.15),transparent)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl dark:text-white">
            Professional Video Editing
            <span className="block text-indigo-600">for Short-Form Content</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-400">
            Reel Cutter is a powerful desktop application that transforms longer videos into
            engaging short-form content. Create reels, social media clips, and vertical videos
            with professional-quality output.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/download"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Download for Free
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
            >
              View Features
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Available for Windows. Free to get started.
          </p>
        </div>
      </div>
    </section>
  );
}
