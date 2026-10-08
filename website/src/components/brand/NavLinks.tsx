"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export interface NavLink {
  href: string;
  label: string;
}

export type NavLinksOrientation = "horizontal" | "vertical";

export interface NavLinksProps {
  links: readonly NavLink[];
  activePath?: string;
  orientation?: NavLinksOrientation;
  className?: string;
  itemClassName?: string;
  onNavigate?: () => void;
}

function isActivePath(current: string, href: string): boolean {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}

export default function NavLinks({
  links,
  activePath,
  orientation = "horizontal",
  className,
  itemClassName,
  onNavigate,
}: NavLinksProps) {
  const pathname = usePathname();
  const current = activePath ?? pathname;

  return (
    <ul
      className={cx(
        "flex",
        orientation === "horizontal" ? "items-center gap-1" : "flex-col gap-1",
        className,
      )}
    >
      {links.map((link) => {
        const active = isActivePath(current, link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cx(
                "dd-focus inline-flex items-center rounded-dd-sm px-3 py-2 text-sm font-medium transition-colors duration-dd-fast ease-dd-soft",
                active
                  ? "bg-accent-soft text-foreground"
                  : "text-muted-foreground hover:bg-accent-soft hover:text-foreground",
                itemClassName,
              )}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
