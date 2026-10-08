import Link from "next/link";
import { Button, Container, Icon, cx } from "@/components/ui";
import { REEL_CUTTER_V106_URL } from "@/data/products";
import MobileMenu from "./MobileMenu";
import NavLinks, { type NavLink } from "./NavLinks";

export const BRAND_NAV_LINKS: readonly NavLink[] = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/support", label: "Support" },
];

export interface BrandHeaderProps {
  downloadHref?: string;
  downloadLabel?: string;
  className?: string;
}

export default function BrandHeader({
  downloadHref = REEL_CUTTER_V106_URL,
  downloadLabel = "Download",
  className,
}: BrandHeaderProps) {
  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b border-border-subtle bg-background/85 backdrop-blur-md",
        className,
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="dd-focus inline-flex items-center gap-2.5 rounded-dd-sm"
            aria-label="DialDazzle home"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-dd-md bg-accent-hover text-sm font-semibold text-white"
            >
              DD
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              DialDazzle
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <NavLinks links={BRAND_NAV_LINKS} />
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button href={downloadHref} size="sm">
              <Icon name="download" size={16} />
              {downloadLabel}
            </Button>
          </div>

          <MobileMenu
            links={BRAND_NAV_LINKS}
            actions={
              <Button href={downloadHref} className="w-full">
                <Icon name="download" size={16} />
                {downloadLabel}
              </Button>
            }
          />
        </div>
      </Container>
    </header>
  );
}
