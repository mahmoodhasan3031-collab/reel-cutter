import type { ReactNode } from "react";
import {
  Button,
  Container,
  Section,
  SectionHeader,
  Surface,
  cx,
} from "@/components/ui";

export interface CTASectionProps {
  eyebrow?: ReactNode;
  heading: ReactNode;
  description?: ReactNode;
  primaryAction: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  align?: "left" | "center";
  id?: string;
  className?: string;
}

export default function CTASection({
  eyebrow,
  heading,
  description,
  primaryAction,
  secondaryAction,
  align = "center",
  id = "dialdazzle-cta",
  className,
}: CTASectionProps) {
  const centered = align === "center";

  return (
    <Section
      spacing="large"
      id={id}
      ariaLabelledBy={`${id}-title`}
      className={className}
    >
      <Container>
        <Surface
          tone="raised"
          radius="xl"
          className="px-6 py-12 sm:px-10 sm:py-16"
        >
          <div
            className={cx(
              "flex flex-col gap-6",
              centered && "items-center text-center",
            )}
          >
            <SectionHeader
              eyebrow={eyebrow}
              title={heading}
              description={description}
              align={centered ? "center" : "left"}
              id={`${id}-title`}
            />
            <div className="flex flex-wrap gap-3">
              <Button href={primaryAction.href} size="lg">
                {primaryAction.label}
              </Button>
              {secondaryAction ? (
                <Button
                  href={secondaryAction.href}
                  variant="secondary"
                  size="lg"
                >
                  {secondaryAction.label}
                </Button>
              ) : null}
            </div>
          </div>
        </Surface>
      </Container>
    </Section>
  );
}
