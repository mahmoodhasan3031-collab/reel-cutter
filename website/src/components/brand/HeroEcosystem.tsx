import type { ReactNode } from "react";
import { Button, Container, Eyebrow, Section, Surface } from "@/components/ui";
import { REEL_CUTTER_V106_URL, type Product } from "@/data/products";
import EcosystemDiagram from "./EcosystemDiagram";

export interface HeroEcosystemAction {
  label: string;
  href: string;
}

export interface HeroEcosystemProps {
  eyebrow?: ReactNode;
  heading?: ReactNode;
  description?: ReactNode;
  primaryAction?: HeroEcosystemAction;
  secondaryAction?: HeroEcosystemAction;
  visual?: ReactNode;
  products?: readonly Product[];
  headingLevel?: 1 | 2;
  id?: string;
  className?: string;
}

export default function HeroEcosystem({
  eyebrow = "DialDazzle",
  heading = "Software for modern work.",
  description = "One brand, a focused set of desktop products. Each one is built to do a single job well and stay out of your way.",
  primaryAction = { label: "Explore products", href: "/products" },
  secondaryAction = { label: "Download", href: REEL_CUTTER_V106_URL },
  visual,
  products,
  headingLevel = 1,
  id = "dialdazzle-hero",
  className,
}: HeroEcosystemProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <Section
      spacing="large"
      id={id}
      ariaLabelledBy={`${id}-title`}
      className={className}
    >
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="flex max-w-xl flex-col gap-6">
            <div className="flex flex-col gap-4">
              <Eyebrow>{eyebrow}</Eyebrow>
              <Heading id={`${id}-title`} className="dd-display text-foreground">
                {heading}
              </Heading>
              <p className="dd-body text-muted-foreground">{description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button href={primaryAction.href} size="lg">
                {primaryAction.label}
              </Button>
              <Button href={secondaryAction.href} variant="secondary" size="lg">
                {secondaryAction.label}
              </Button>
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
            />
            {visual ? (
              <div className="relative">{visual}</div>
            ) : (
              <Surface tone="raised" radius="xl" className="relative p-6 sm:p-8">
                <EcosystemDiagram products={products} />
              </Surface>
            )}
          </div>
        </div>
      </Container>
    </Section>
  );
}
