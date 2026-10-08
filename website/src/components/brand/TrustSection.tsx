import type { ReactNode } from "react";
import {
  Container,
  Grid,
  Icon,
  Reveal,
  Section,
  SectionHeader,
  Surface,
} from "@/components/ui";

export interface TrustSectionItem {
  title: string;
  description: string;
}

export interface TrustSectionProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  items?: readonly TrustSectionItem[];
  id?: string;
  className?: string;
}

const DEFAULT_ITEMS: readonly TrustSectionItem[] = [
  {
    title: "Public release channel",
    description:
      "Installers are published on GitHub with version numbers you can check before you download.",
  },
  {
    title: "Transparent product information",
    description:
      "Platforms, features and pricing are listed openly on each product page so you can evaluate before buying.",
  },
  {
    title: "Windows-native software",
    description:
      "DialDazzle desktop software runs on Windows 10 or later (64-bit) and processes files on your own machine.",
  },
  {
    title: "Clear licensing",
    description:
      "Plan limits and license activation rules are published with pricing and explained inside the application.",
  },
];

export default function TrustSection({
  eyebrow = "Trust",
  title = "What you can check for yourself",
  description = "Plain facts about how DialDazzle products ship and how they are sold.",
  items = DEFAULT_ITEMS,
  id = "trust-dialdazzle",
  className,
}: TrustSectionProps) {
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
        <Grid cols={2} gap="md" className="mt-10">
          {items.map((item, index) => (
            <Reveal key={item.title} delay={index * 60}>
              <Surface
                tone="raised"
                radius="lg"
                className="flex h-full items-start gap-4 p-5 sm:p-6"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-dd-md bg-success/10 text-success"
                >
                  <Icon name="check" size={16} />
                </span>
                <span className="flex flex-col gap-1.5">
                  <h3 className="text-base font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="dd-small text-muted-foreground">
                    {item.description}
                  </p>
                </span>
              </Surface>
            </Reveal>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}
