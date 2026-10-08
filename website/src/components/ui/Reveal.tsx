"use client";

import { useLayoutEffect, useRef, type ElementType, type ReactNode } from "react";
import { cx } from "./cx";

export type RevealElement = "div" | "section" | "article";

export interface RevealProps {
  children: ReactNode;
  as?: RevealElement;
  delay?: number;
  className?: string;
}

export default function Reveal({
  children,
  as = "div",
  delay = 0,
  className,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    if (typeof IntersectionObserver === "undefined") return undefined;

    node.dataset.reveal = "hidden";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.dataset.reveal = "shown";
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const Tag = as as ElementType;

  return (
    <Tag
      ref={ref}
      data-reveal="shown"
      className={cx("dd-reveal", className)}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
