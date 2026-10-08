import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EyebrowProps {
  tone?: "accent" | "muted";
  className?: string;
  children: ReactNode;
}

export default function Eyebrow({
  tone = "accent",
  className,
  children,
}: EyebrowProps) {
  return (
    <span
      className={cx(
        "dd-eyebrow",
        tone === "accent" ? "text-accent-text" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
