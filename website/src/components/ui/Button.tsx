import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type ButtonAnchorProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "className" | "children"
> & { href: string };

type ButtonNativeProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
> & { href?: undefined };

export type ButtonProps = ButtonBaseProps &
  (ButtonAnchorProps | ButtonNativeProps);

const baseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium dd-focus disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent-hover text-white shadow-subtle hover:bg-accent-press",
  secondary:
    "border border-border bg-surface-elevated text-foreground hover:border-accent hover:bg-accent-soft",
  ghost: "text-foreground hover:bg-accent-soft",
  link: "text-accent-text underline-offset-4 hover:underline",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm rounded-dd-sm",
  md: "h-11 px-5 text-sm rounded-dd-md",
  lg: "h-12 px-6 text-base rounded-dd-lg",
};

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cx(
    baseClasses,
    "transition-[background-color,color,border-color,box-shadow,transform] duration-dd-base ease-dd-soft",
    variant === "link" ? "p-0 text-sm" : sizeClasses[size],
    variantClasses[variant],
    className,
  );

  if (typeof rest.href === "string") {
    const { href, ...anchorRest } = rest;
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
