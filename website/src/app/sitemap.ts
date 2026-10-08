import type { MetadataRoute } from "next";
import { getAllProducts } from "@/lib/products";

/**
 * Public sitemap for DialDazzle. (STEP 65)
 *
 * The site origin is a build-time constant on purpose: sitemap/robots files
 * must not read process.env, so the STEP53 public-env gate stays the single
 * place that validates the deployed origin.
 *
 * Only routes that are publicly reachable without an account are listed.
 * Auth, account, checkout, payment, admin and callback routes are excluded.
 */

const SITE_ORIGIN = "https://dialdazzle.site";

/** Marketing routes that stay publicly indexable. */
const STATIC_ROUTES: ReadonlyArray<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "monthly", priority: 1 },
  { path: "/products", changeFrequency: "monthly", priority: 0.9 },
  { path: "/about", changeFrequency: "yearly", priority: 0.6 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/download", changeFrequency: "weekly", priority: 0.9 },
  { path: "/support", changeFrequency: "monthly", priority: 0.7 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(
    ({ path, changeFrequency, priority }) => ({
      url: `${SITE_ORIGIN}${path}`,
      changeFrequency,
      priority,
    }),
  );

  // Product pages are data-driven from the DialDazzle product registry, so a
  // new product only needs a registry entry to appear here.
  const productEntries: MetadataRoute.Sitemap = getAllProducts().map(
    (product) => ({
      url: `${SITE_ORIGIN}/products/${product.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }),
  );

  return [...staticEntries, ...productEntries];
}
