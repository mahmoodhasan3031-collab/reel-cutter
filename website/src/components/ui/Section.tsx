import type { ReactNode } from "react";
import { cx } from "./cx";

export type SectionSpacing = "compact" | "normal" | "large";

export interface SectionProps {
  spacing?: SectionSpacing;
  id?: string;
  ariaLabelledBy?: string;
  className?: string;
  children: ReactNode;
}

const spacingClasses: Record<SectionSpacing, string> = {
  compact: "dd-section--compact",
  normal: "dd-section",
  large: "dd-section--large",
};

export default function Section({
  spacing = "normal",
  id,
  ariaLabelledBy,
  className,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={cx(spacingClasses[spacing], className)}
    >
      {children}
    </section>
  );
}
