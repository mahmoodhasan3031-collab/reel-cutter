import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Documentation and guides for Reel Cutter video editing software.",
};

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Documentation
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          This page is under development. Documentation will be available soon.
        </p>
      </div>
    </div>
  );
}
