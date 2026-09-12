import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import NewsManager, { type SitePhoto } from "@/components/NewsManager";
import { getDb } from "@/lib/db";
import { loadAllPosts } from "@/lib/news";
import { getProducts } from "@/lib/catalog";
import { RECENT } from "@/lib/recent";
import { asset } from "@/lib/assets";
import { SITE_URL } from "@/lib/site";
import type { NewsPost } from "@/lib/newsFormat";

export const metadata: Metadata = {
  title: "News & events",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminNewsPage() {
  const sql = getDb();
  let posts: NewsPost[] = [];
  let error = "";
  if (!sql) {
    error = "No database connected yet. Posts are saved in the database (README step 3).";
  } else {
    try {
      posts = await loadAllPosts(sql);
    } catch {
      error =
        "The news table isn't in the database yet. Run the latest schema.sql in Neon (it's safe to re-run), then reload this page.";
    }
  }

  // Photos already on the site, so a post can have a picture even before
  // photo uploads (Vercel Blob) are connected.
  const products = await getProducts();
  const seen = new Set<string>();
  const photos: SitePhoto[] = [];
  const add = (src: string, label: string) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    photos.push({ src, label, preview: /^https?:\/\//.test(src) ? src : asset(src) });
  };
  for (const r of RECENT) add(r.src, `Recent work · ${r.title}`);
  for (const p of products) {
    add(p.image, `${p.name} · design page photo`);
    add(p.card, `${p.name} · lineup photo`);
  }
  add("/images/detail.jpg", "Close up of a bleached shirt");
  add("/images/artist.jpg", "The artist");
  add("/images/hero-texture.jpg", "Home page texture");

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">News &amp; events</h1>
      <AdminNav active="news" />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
        Craft fairs, markets, new designs. An <strong className="text-bone">event</strong> gets a
        countdown card on the home page until it&apos;s over, calendar and directions buttons, and
        shows up for Google event searches. A <strong className="text-bone">news post</strong> is
        just a post. Drafts stay private until you hit Publish.
      </p>
      <NewsManager initialPosts={posts} error={error} photos={photos} siteUrl={SITE_URL} />
    </div>
  );
}
