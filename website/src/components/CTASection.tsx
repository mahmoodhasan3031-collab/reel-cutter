import Link from "next/link";

export default function CTASection() {
  return (
    <section className="bg-indigo-600 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to Create Professional Short-Form Content?
        </h2>
        <p className="mt-4 text-lg text-indigo-100">
          Download Reel Cutter and start transforming your videos into engaging short-form content.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/download"
            className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-60 shadow-sm transition-colors hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Download for Free
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center rounded-lg border border-indigo-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
