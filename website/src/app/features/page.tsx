import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore the full feature set of Reel Cutter — professional desktop video editing for short-form content, reels, captions, bulk export, and workflow automation.",
  openGraph: {
    title: "Features | Reel Cutter",
    description:
      "Professional desktop video editing for short-form content, reels, captions, bulk export, and workflow automation.",
  },
};

const coreTools = [
  {
    name: "Cut",
    description:
      "Extract precise segments from any video with millisecond-accurate start and end timestamps. Perfect for pulling the best moments from longer content.",
  },
  {
    name: "Reel",
    description:
      "Transform horizontal videos into vertical 9:16 reels with smart framing. Choose from blur, crop, or pad modes to fill the frame naturally.",
  },
  {
    name: "Split",
    description:
      "Automatically divide long videos into shorter segments at configurable intervals. Ideal for creating batches of social media clips from a single source.",
  },
];

const aspectRatios = [
  { ratio: "9:16", use: "Reels, TikTok, YouTube Shorts, Snapchat" },
  { ratio: "1:1", use: "Instagram Feed, Facebook Feed" },
  { ratio: "4:5", use: "Instagram Portrait, Facebook Mobile" },
  { ratio: "16:9", use: "YouTube, LinkedIn, Twitter/X" },
];

const outputOptions = [
  "1080p Full HD export",
  "4K Ultra HD export (3840x2160)",
  "Multiple output modes: blur, crop, pad, smart crop",
  "Configurable resolution and quality settings",
  "Automatic output filename generation",
];

const smartEditing = [
  {
    name: "Smart Crop",
    description:
      "AI-powered subject tracking automatically reframes your video to keep the action centered. The crop follows faces and subjects through the entire clip.",
    tier: "Pro",
  },
  {
    name: "AI Thumbnails",
    description:
      "Automatically extract the best frame from your video to use as a cover image or thumbnail. Analyzes the entire clip to find the most visually appealing moment.",
    tier: "Pro",
  },
  {
    name: "Text Overlays",
    description:
      "Add customizable text overlays to your videos with control over font, size, color, position, background, and timing. Perfect for titles, captions, and call-to-action text.",
    tier: "All",
  },
];

const contentVariation = [
  {
    name: "Reframing",
    description:
      "Adapt your content for different platforms by reframing the focal point. Adjust the visible area to match each platform's ideal composition.",
  },
  {
    name: "Visual Variations",
    description:
      "Apply color adjustments, speed modifications, and visual effects to create alternate creative versions of your content for different publishing needs.",
  },
  {
    name: "Audio Variations",
    description:
      "Modify audio levels, apply effects, and create audio variations to complement your visual content across different platforms.",
  },
  {
    name: "Variation Presets",
    description:
      "Save and reuse your favorite variation configurations. Create presets for different platforms and content styles to maintain consistency across your output.",
  },
];

const captionFeatures = [
  {
    name: "Caption Templates",
    description:
      "Create and save reusable caption templates with customizable styling, positioning, and formatting. Apply consistent caption design across all your exports.",
  },
  {
    name: "AI Caption Generator",
    description:
      "Generate captions automatically using AI-assisted transcription. Create accurate captions for your videos without manual transcription work.",
    tier: "Pro",
  },
  {
    name: "Caption Quality & Intelligence",
    description:
      "Analyze caption quality with readability scoring and AI-assisted improvement suggestions. Ensure your captions are clear and engaging.",
    tier: "Pro",
  },
  {
    name: "Caption Workspace & Smart Rewrite",
    description:
      "Edit captions in a dedicated workspace with AI-powered smart rewrite. Generate multiple versions and track quality feedback across iterations.",
    tier: "Pro",
  },
  {
    name: "Caption Experiments",
    description:
      "A/B test different caption variations to find what works best. Compare quality scores and optimize your caption strategy with data-driven insights.",
    tier: "Pro",
  },
];

const workflowRecipes = [
  {
    name: "Quick Reel",
    description: "Fast 9:16 reel export with blur mode — ideal for Instagram Reels and TikTok.",
    exportType: "reel",
  },
  {
    name: "Clean Social Export",
    description: "Standard 1:1 square export for Facebook and Instagram feed posts.",
    exportType: "cut",
  },
  {
    name: "Captioned Reel",
    description: "9:16 reel with bottom caption overlay for accessible short-form content.",
    exportType: "reel",
  },
  {
    name: "Vertical Short",
    description: "9:16 vertical export optimized for YouTube Shorts and Snapchat Spotlight.",
    exportType: "reel",
  },
  {
    name: "Bulk Social Package",
    description: "Multi-format split into 30-second reels for batch social media posting.",
    exportType: "split",
  },
];

const bulkFeatures = [
  {
    name: "Bulk Export",
    description:
      "Process multiple videos at once with intelligent bulk export. Configure profiles, detect conflicts, and execute large batches with preflight analysis.",
  },
  {
    name: "Batch Queue",
    description:
      "Queue multiple export jobs and process them automatically. Monitor progress, handle failures, and retry when needed — all while you focus on other work.",
  },
  {
    name: "Multi-Profile Export",
    description:
      "Export the same source video in multiple formats and aspect ratios simultaneously. Create platform-specific versions from a single source file.",
  },
  {
    name: "Export Presets",
    description:
      "Save and apply complete export configurations as presets. Switch between different output settings with one click instead of reconfiguring each time.",
  },
];

const historyFeatures = [
  {
    name: "Export History",
    description:
      "Track every export with full configuration snapshots. Search, filter, and organize your export history by status, profile, platform, or date.",
  },
  {
    name: "Recovery & Retry",
    description:
      "Failed exports can be retried with the original configuration. The recovery center detects missing outputs and helps you get back on track quickly.",
  },
  {
    name: "Export Intelligence Dashboard",
    description:
      "View analytics on your export performance — success rates, profile usage, platform distribution, and attention signals for exports that need review.",
  },
  {
    name: "Export Command Center",
    description:
      "A unified operational view showing active exports, queue status, scheduled jobs, recent activity, and items requiring attention.",
  },
];

const schedulingFeatures = [
  {
    name: "Local Scheduling",
    description:
      "Schedule export jobs to run at specific times. Organize your workflow by planning exports ahead and processing them when it suits your schedule.",
  },
  {
    name: "Bulk Scheduling",
    description:
      "Schedule multiple export jobs at once with configurable time gaps between them. Plan your entire content pipeline in advance.",
  },
];

const aiFeatures = [
  {
    name: "Smart Crop (AI)",
    description:
      "AI-powered subject tracking automatically reframes your video to keep faces and subjects centered throughout the clip.",
  },
  {
    name: "AI Thumbnails",
    description:
      "Automatically extract the best frame from your video for cover images and thumbnails.",
  },
  {
    name: "AI Caption Generator",
    description:
      "Generate accurate captions automatically using AI-assisted transcription.",
  },
];

function FeatureBlock({
  name,
  description,
  tier,
}: {
  name: string;
  description: string;
  tier?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base font-semibold text-slate-900 dark:text-white">
          {name}
        </h4>
        {tier && tier !== "All" && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {tier}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Features
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Everything you need to transform longer videos into professional short-form content.
            Explore the complete feature set of Reel Cutter.
          </p>
        </div>
      </section>

      {/* Core Video Tools */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Core Video Tools
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Three powerful export modes to match every content format and platform.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {coreTools.map((tool) => (
              <div
                key={tool.name}
                className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-800"
              >
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {tool.name}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Aspect Ratios
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {aspectRatios.map((ar) => (
                <div
                  key={ar.ratio}
                  className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {ar.ratio}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {ar.use}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Output Options
            </h3>
            <ul className="mt-4 space-y-2">
              {outputOptions.map((opt) => (
                <li key={opt} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {opt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Smart Editing */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Smart Editing
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            AI-powered tools that automate the tedious parts of video editing.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {smartEditing.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} />
            ))}
          </div>
        </div>
      </section>

      {/* Content Variation */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Content Variation
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Create alternate versions of your content for different platforms and publishing needs.
            Adapt visuals, audio, and framing without starting from scratch.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {contentVariation.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} />
            ))}
          </div>
        </div>
      </section>

      {/* Captions */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Captions
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Add professional captions to your videos with templates, AI generation,
            quality analysis, and A/B testing tools.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {captionFeatures.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} />
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Recipes */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Workflow Recipes
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Save and reuse your export configurations as one-click workflow recipes.
            Each recipe combines output settings, profiles, presets, and captions into a single reusable workflow.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflowRecipes.map((recipe) => (
              <div
                key={recipe.name}
                className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-slate-900 dark:text-white">
                    {recipe.name}
                  </h4>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {recipe.exportType}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {recipe.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            You can also create custom recipes and save your own export configurations for repeated use.
          </p>
        </div>
      </section>

      {/* Bulk Export & Queue */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Bulk Export &amp; Queue
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Process multiple videos at once and let the batch queue handle the rest.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {bulkFeatures.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} />
            ))}
          </div>
        </div>
      </section>

      {/* History & Recovery */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Export History &amp; Recovery
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Track every export, recover from failures, and monitor your output health.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {historyFeatures.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} />
            ))}
          </div>
        </div>
      </section>

      {/* Scheduling */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Scheduling
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Plan your exports ahead of time. Schedule individual jobs or bulk operations
            to process when it suits your workflow.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {schedulingFeatures.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} />
            ))}
          </div>
        </div>
      </section>

      {/* AI / Smart Features */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            AI &amp; Smart Features
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Intelligent tools that automate complex editing tasks and improve your output quality.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {aiFeatures.map((feat) => (
              <FeatureBlock key={feat.name} {...feat} tier="Pro" />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to Try Reel Cutter?
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            Download Reel Cutter and start creating professional short-form content today.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/download"
              className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50"
            >
              Download for Free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-lg border border-indigo-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
