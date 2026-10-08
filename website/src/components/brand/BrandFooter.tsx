import Link from "next/link";
import { Container, Divider, cx } from "@/components/ui";
import LegalNotice from "./LegalNotice";

export interface BrandFooterLink {
  href: string;
  label: string;
}

export interface BrandFooterColumn {
  title: string;
  links: readonly BrandFooterLink[];
}

export interface BrandFooterProps {
  columns?: readonly BrandFooterColumn[];
  className?: string;
}

export const BRAND_FOOTER_COLUMNS: readonly BrandFooterColumn[] = [
  {
    title: "Products",
    links: [
      { href: "/products", label: "Products" },
      { href: "/products/reel-cutter", label: "Reel Cutter" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/download", label: "Download" },
    ],
  },
  {
    title: "Support",
    links: [{ href: "/support", label: "Support" }],
  },
  {
    title: "Company",
    links: [{ href: "/about", label: "About" }],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
];

export default function BrandFooter({
  columns = BRAND_FOOTER_COLUMNS,
  className,
}: BrandFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cx("border-t border-border-subtle bg-surface-inset", className)}
    >
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-dd-md bg-accent-hover text-sm font-semibold text-white"
              >
                DD
              </span>
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
                DialDazzle
              </span>
            </p>
            <p className="dd-small mt-3 text-muted-foreground">
              Software for modern work.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="dd-eyebrow text-muted-foreground">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="dd-focus inline-flex rounded-dd-sm text-sm text-muted-foreground transition-colors duration-dd-fast ease-dd-soft hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <Divider className="my-8" />

        <LegalNotice>
          {`\u00a9 ${year} DialDazzle. All rights reserved.`}
        </LegalNotice>
      </Container>
    </footer>
  );
}
