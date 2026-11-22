import type { MetadataRoute } from "next";

/**
 * Crawling is deliberately allowed: a crawler must be able to fetch a page to see its
 * noindex (meta tag + X-Robots-Tag header). Blocking crawling here would let URLs be
 * listed from external links without ever seeing the noindex. No sitemap is published.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
