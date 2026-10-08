import type { ReactNode } from "react";
import {
  Container,
  Grid,
  Reveal,
  Section,
  SectionHeader,
  Surface,
} from "@/components/ui";

export interface WhyDialDazzleItem {
  title: string;
  description: string;
}

export interface WhyDialDazzleProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  items?: readonly WhyDialDazzleItem[];
  id?: string;
  className?: string;
}

const DEFAULT_ITEMS: readonly WhyDialDazzleItem[] = [
  {
    title: "Focused software",
    description:
      "Each product is built around one job, so the interface stays readable and the tool stays fast.",
  },
  {
    title: "Thoughtful workflows",
    description:
      "Tools are arranged in the order people actually work, from opening a file to finishing an export, without hidden steps.",
  },
  {
    title: "Continuous improvement",
    description:
      "Releases are published with clear version numbers through a public GitHub channel, so changes are easy to follow.",
  },
  {
    title: "User-focused product design",
    description:
      "Defaults, labels and states are written for the person using the tool rather than for a feature checklist.",
  },
];

export default function WhyDialDazzle({
  eyebrow = "Why DialDazzle",
  title = "Software that respects your attention",
  description = "Small, deliberate choices that hold across every DialDazzle product.",
  items = DEFAULT_ITEMS,
  id = "why-dialdazzle",
  className,
}: WhyDialDazzleProps) {
  return (
    <Section spacing="large" id={id} ariaLabelledBy={`${id}-title`} className={className}>
      <Container>
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          align="center"
          id={`${id}-title`}
        />
        <Grid cols={4} gap="md" className="mt-10">
          {items.map((item, index) => (
            <Reveal key={item.title} delay={index * 60}>
              <Surface
                tone="raised"
                radius="lg"
                className="flex h-full flex-col gap-3 p-5"
              >
                <span className="dd-eyebrow text-accent-text">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="dd-small text-muted-foreground">
                  {item.description}
                </p>
              </Surface>
            </Reveal>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}
