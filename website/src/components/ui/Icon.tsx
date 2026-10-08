import { cx } from "./cx";

export type IconName =
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "arrow-right"
  | "arrow-up-right"
  | "plus"
  | "minus"
  | "download"
  | "menu"
  | "close";

export type IconSize = 16 | 20 | 24;

export interface IconProps {
  name: IconName;
  size?: IconSize;
  title?: string;
  className?: string;
}

const iconPaths: Record<IconName, string[]> = {
  check: ["M20 6 9 17l-5-5"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "chevron-right": ["m9 6 6 6-6 6"],
  "arrow-right": ["M5 12h14", "m12 5 7 7-7 7"],
  "arrow-up-right": ["M7 17 17 7", "M7 7h10v10"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M4 20h16"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6 6 18"],
};

export default function Icon({
  name,
  size = 20,
  title,
  className,
}: IconProps) {
  const decorative = title === undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      {decorative ? null : <title>{title}</title>}
      {iconPaths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
