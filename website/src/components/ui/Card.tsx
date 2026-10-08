import type { ReactNode } from "react";
import { cx } from "./cx";

export type CardVariant = "default" | "interactive" | "elevated";

export interface CardProps {
  variant?: CardVariant;
  as?: "div" | "article" | "li" | "section";
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: "border border-border-subtle bg-surface-elevated shadow-subtle",
  elevated: "border border-border-subtle bg-surface-elevated shadow-elevated",
  interactive:
    "border border-border-subtle bg-surface-elevated shadow-subtle hover:-translate-y-0.5 hover:border-accent hover:shadow-hover",
};

export default function Card({
  variant = "default",
  as = "div",
  className,
  children,
}: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={cx(
        "rounded-dd-lg transition-[transform,box-shadow,border-color] duration-dd-base ease-dd-soft",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
