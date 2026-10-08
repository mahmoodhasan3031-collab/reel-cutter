"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon, cx } from "@/components/ui";
import NavLinks, { type NavLink } from "./NavLinks";

export interface MobileMenuProps {
  links: readonly NavLink[];
  activePath?: string;
  label?: string;
  actions?: ReactNode;
  className?: string;
}

export default function MobileMenu({
  links,
  activePath,
  label = "Main menu",
  actions,
  className,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open) return undefined;

    const panel = panelRef.current;
    if (!panel) return undefined;

    const focusable = panel.querySelector<HTMLElement>("a[href], button:not([disabled])");
    (focusable ?? panel).focus();
    return undefined;
  }, [open]);

  return (
    <div className={cx("md:hidden", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="dd-focus inline-flex h-10 w-10 items-center justify-center rounded-dd-sm text-foreground transition-colors duration-dd-fast ease-dd-soft hover:bg-accent-soft"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? "close" : "menu"} />
      </button>

      <div
        id={panelId}
        ref={panelRef}
        tabIndex={-1}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border-subtle bg-background p-4 shadow-elevated outline-none"
      >
        <nav aria-label={label}>
          <NavLinks
            links={links}
            activePath={activePath}
            orientation="vertical"
            className="gap-0.5"
            onNavigate={() => closeMenu(false)}
          />
        </nav>
        {actions ? <div className="mt-3 border-t border-border-subtle pt-3">{actions}</div> : null}
      </div>
    </div>
  );
}
