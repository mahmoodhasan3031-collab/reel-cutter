import type { MetadataRoute } from "next";

/**
 * Robots policy for DialDazzle. (STEP 65)
 *
 * Public marketing routes are crawlable; account, checkout, payment, auth and
 * admin routes are private and must not be indexed. The sitemap URL is a
 * constant here so this file never reads process.env.
 */

const SITE_ORIGIN = "https://dialdazzle.site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/account/", "/checkout/", "/payment/", "/auth/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
