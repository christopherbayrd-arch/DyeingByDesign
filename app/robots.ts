import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Served at /robots.txt. Search engines may crawl the storefront but stay
// out of the owner area, the API, and pages that are only meaningful to
// the person in the middle of an order.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/success", "/unsubscribe"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
