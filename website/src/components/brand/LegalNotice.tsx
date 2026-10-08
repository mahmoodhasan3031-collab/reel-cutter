import { cx } from "@/components/ui";

export type LegalNoticeTone = "muted" | "accent";

export interface LegalNoticeProps {
  children: React.ReactNode;
  label?: string;
  tone?: LegalNoticeTone;
  className?: string;
}

export default function LegalNotice({
  children,
  label,
  tone = "muted",
  className,
}: LegalNoticeProps) {
  return (
    <p
      className={cx(
        "dd-caption max-w-[70ch]",
        tone === "accent" ? "text-accent-text" : "text-muted-foreground",
        className,
      )}
    >
      {label ? (
        <span className="font-medium text-foreground">{label} </span>
      ) : null}
      {children}
    </p>
  );
}
