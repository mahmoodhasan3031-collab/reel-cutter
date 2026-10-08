import type { ReactNode } from "react";
import { cx } from "./cx";

export type GridColumns = 1 | 2 | 3 | 4;
export type GridGap = "sm" | "md" | "lg";

export interface GridProps {
  cols?: GridColumns;
  gap?: GridGap;
  as?: "div" | "ul" | "ol";
  className?: string;
  children: ReactNode;
}

const columnsClasses: Record<GridColumns, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

const gapClasses: Record<GridGap, string> = {
  sm: "gap-4",
  md: "gap-6",
  lg: "gap-8",
};

export default function Grid({
  cols = 3,
  gap = "md",
  as = "div",
  className,
  children,
}: GridProps) {
  const Tag = as;
  return (
    <Tag className={cx("grid", columnsClasses[cols], gapClasses[gap], className)}>
      {children}
    </Tag>
  );
}
