import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeVariant =
  | "available"
  | "coming-soon"
  | "in-development"
  | "featured"
  | "neutral"
  | "success"
  | "warning";

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  available: "bg-success/10 text-success",
  success: "bg-success/10 text-success",
  "coming-soon": "bg-warning/10 text-warning",
  warning: "bg-warning/10 text-warning",
  "in-development": "bg-accent-soft text-accent-text",
  featured: "bg-accent-hover text-white",
  neutral: "bg-surface-inset text-muted-foreground border border-border-subtle",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "h-5 px-2 text-[0.6875rem]",
  md: "h-6 px-2.5 text-xs",
};

export default function Badge({
  variant = "neutral",
  size = "md",
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-dd-pill font-medium tracking-wide",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {children}
    </span>
  );
}
