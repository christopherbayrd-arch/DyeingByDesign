import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/catalog";
import { getPublishedPosts } from "@/lib/news";
import { SITE_URL } from "@/lib/site";

// Served at /sitemap.xml. Lists every public page plus every shown design,
// straight from the database, so new designs added in /admin get picked up
// by Google on their own. Rebuilt at most once an hour.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/custom`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/artist`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/news`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  const products = await getProducts();
  const designs: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}/shop/${p.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // every live news post and event (written in /admin/news)
  const posts = await getPublishedPosts();
  const news: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/news/${p.slug}`,
    lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...pages, ...designs, ...news];
}
