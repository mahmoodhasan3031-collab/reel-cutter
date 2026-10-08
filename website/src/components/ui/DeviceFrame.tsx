import Image from "next/image";
import type { ReactNode } from "react";
import { cx } from "./cx";

export type DeviceFrameVariant = "browser" | "desktop";

export interface DeviceFrameImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}

export interface DeviceFrameProps {
  variant?: DeviceFrameVariant;
  label?: string;
  image?: DeviceFrameImage;
  className?: string;
  children?: ReactNode;
}

export default function DeviceFrame({
  variant = "browser",
  label,
  image,
  className,
  children,
}: DeviceFrameProps) {
  return (
    <div
      className={cx(
        "overflow-hidden rounded-dd-xl border border-border-subtle bg-surface-elevated shadow-elevated",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-inset px-4 py-2.5">
        {variant === "browser" ? (
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          </span>
        ) : (
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </span>
        )}
        {label ? (
          <span className="dd-caption ml-2 truncate font-mono text-muted-foreground">
            {label}
          </span>
        ) : null}
      </div>

      <div className="relative aspect-video w-full bg-surface-inset">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            priority={image.priority}
            className="h-full w-full object-cover"
          />
        ) : children ? (
          children
        ) : (
          <div
            aria-hidden="true"
            className="m-4 h-[calc(100%-2rem)] rounded-dd-md border border-dashed border-border-subtle"
          />
        )}
      </div>
    </div>
  );
}
