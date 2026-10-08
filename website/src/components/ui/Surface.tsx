import type { ReactNode } from "react";
import { cx } from "./cx";

export type SurfaceTone = "base" | "raised" | "inset" | "accent" | "transparent";
export type SurfaceRadius = "none" | "sm" | "md" | "lg" | "xl" | "pill";

export interface SurfaceProps {
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  as?: "div" | "section" | "aside" | "article";
  className?: string;
  children: ReactNode;
}

const toneClasses: Record<SurfaceTone, string> = {
  base: "bg-background",
  raised: "border border-border-subtle bg-surface-elevated",
  inset: "bg-surface-inset border border-border-subtle",
  accent: "bg-accent-soft",
  transparent: "bg-transparent",
};

const radiusClasses: Record<SurfaceRadius, string> = {
  none: "rounded-none",
  sm: "rounded-dd-sm",
  md: "rounded-dd-md",
  lg: "rounded-dd-lg",
  xl: "rounded-dd-xl",
  pill: "rounded-dd-pill",
};

export default function Surface({
  tone = "base",
  radius = "lg",
  as = "div",
  className,
  children,
}: SurfaceProps) {
  const Tag = as;
  return (
    <Tag className={cx(toneClasses[tone], radiusClasses[radius], className)}>
      {children}
    </Tag>
  );
}
