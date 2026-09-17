import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Reel Cutter video editing software.",
};

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Support
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          This page is under development. Support resources will be available soon.
        </p>
      </div>
    </div>
  );
}
