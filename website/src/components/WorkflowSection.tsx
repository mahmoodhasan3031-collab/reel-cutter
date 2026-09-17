const steps = [
  {
    number: "1",
    title: "Import",
    description: "Import your video files into Reel Cutter. Support for common video formats.",
  },
  {
    number: "2",
    title: "Create",
    description: "Select your export type: reels, cuts, or split videos. Choose aspect ratios and output settings.",
  },
  {
    number: "3",
    title: "Customize",
    description: "Apply captions, variations, and workflow recipes. Fine-tune your content for each platform.",
  },
  {
    number: "4",
    title: "Export",
    description: "Export with professional quality. Batch processing and scheduling available for bulk operations.",
  },
  {
    number: "5",
    title: "Organize",
    description: "Track your export history. Retry failed exports and manage your content library.",
  },
];

export default function WorkflowSection() {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Simple Five-Step Workflow
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            From import to export, Reel Cutter streamlines your content creation process.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="relative">
            <div className="absolute left-4 top-0 h-full w-px bg-slate-200 sm:left-1/2 sm:-translate-x-px dark:bg-slate-800" />
            <div className="space-y-12">
              {steps.map((step, index) => (
                <div
                  key={step.number}
                  className={`relative flex items-start gap-6 sm:flex-row-reverse ${
                    index % 2 === 0 ? "sm:flex-row" : ""
                  }`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white sm:absolute sm:left-1/2 sm:-translate-x-1/2">
                    {step.number}
                  </div>
                  <div
                    className={`sm:w-1/2 ${
                      index % 2 === 0 ? "sm:pr-12 sm:text-right" : "sm:pl-12"
                    }`}
                  >
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {step.description}
                    </p>
                  </div>
                  <div className="hidden sm:block sm:w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
