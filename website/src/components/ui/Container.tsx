import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ContainerProps {
  className?: string;
  children: ReactNode;
}

export default function Container({ className, children }: ContainerProps) {
  return (
    <div className={cx("mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}
