import Hero from "@/components/Hero";
import FeatureSection from "@/components/FeatureSection";
import WorkflowSection from "@/components/WorkflowSection";
import ProductPreview from "@/components/ProductPreview";
import WhyReelCutter from "@/components/WhyReelCutter";
import CTASection from "@/components/CTASection";

export default function Home() {
  return (
    <>
      <Hero />
      <FeatureSection />
      <WorkflowSection />
      <ProductPreview />
      <WhyReelCutter />
      <CTASection />
    </>
  );
}
