export default function WhyReelCutter() {
  const reasons = [
    {
      title: "Desktop Application",
      description:
        "Native desktop performance for video processing. No browser limitations, no upload delays.",
    },
    {
      title: "Professional Quality",
      description:
        "FFmpeg-powered processing delivers professional-grade output quality for all your content.",
    },
    {
      title: "Batch Processing",
      description:
        "Process multiple videos at once with bulk export, scheduling, and queue management.",
    },
    {
      title: "Workflow Automation",
      description:
        "Workflow recipes let you save and reuse your export configurations with one click.",
    },
  ];

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Why Choose Reel Cutter
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Built for creators who need reliable, professional video editing tools.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((reason) => (
            <div key={reason.title} className="text-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {reason.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {reason.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
