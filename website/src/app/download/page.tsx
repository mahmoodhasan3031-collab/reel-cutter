import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download",
  description: "Download Reel Cutter video editing software for Windows.",
};

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Download Reel Cutter
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          This page is under development. Download links will be available soon.
        </p>
      </div>
    </div>
  );
}
