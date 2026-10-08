import type { ReactNode } from "react";
import { cx } from "./cx";
import Eyebrow from "./Eyebrow";

export interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  level?: 1 | 2 | 3;
  id?: string;
  className?: string;
}

export default function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  level = 2,
  id,
  className,
}: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : level === 3 ? "h3" : "h2";
  const centered = align === "center";

  return (
    <div
      className={cx(
        "flex flex-col gap-4",
        centered && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading id={id} className={cx("dd-h2 text-foreground", centered && "max-w-3xl")}>
        {title}
      </Heading>
      {description ? (
        <p
          className={cx(
            "dd-body max-w-[68ch] text-muted-foreground",
            centered && "mx-auto",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
