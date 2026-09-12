import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import QuickSale, { type QuickDesign, type QuickEvent } from "@/components/QuickSale";
import { getDb } from "@/lib/db";
import { getProducts } from "@/lib/catalog";
import { asset } from "@/lib/assets";
import { todayInMaine } from "@/lib/newsFormat";
import { stockMapsSafe } from "@/lib/inventory";

export const metadata: Metadata = {
  title: "Quick sale",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

// The booth / cash sale screen. Built for a phone at a craft fair table,
// works the same on an iPad or a laptop.
export default async function QuickSalePage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const products = await getProducts();
  const designs: QuickDesign[] = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    image: p.card ? (/^https?:\/\//.test(p.card) ? p.card : asset(p.card)) : "",
  }));

  const sql = getDb();
  const today = todayInMaine();
  const asked = Number((await searchParams).event) || 0;
  let events: QuickEvent[] = [];
  if (sql) {
    try {
      // events from two weeks back to two months out (plus one asked for by link)
      const rows = (await sql`
        select id, title, to_char(starts_on, 'YYYY-MM-DD') as starts_on_s, to_char(ends_on, 'YYYY-MM-DD') as ends_on_s
        from news_posts
        where kind = 'event' and starts_on is not null
          and (id = ${asked}
               or (coalesce(ends_on, starts_on) >= ${today}::date - 14 and starts_on <= ${today}::date + 60))
        order by starts_on asc, id asc
      `) as Row[];
      events = rows.map((r) => ({
        id: Number(r.id),
        title: String(r.title ?? ""),
        startsOn: String(r.starts_on_s ?? ""),
        endsOn: String(r.ends_on_s ?? ""),
      }));
    } catch {
      // news table not there yet (schema.sql) — sales still work without an event
    }
  }
  // what's on the Inventory shelf, so the booth screen shows what's left
  const shelf = await stockMapsSafe(sql);

  // Default to the event happening today, or the one the link asked for
  const happening = events.find((e) => e.startsOn <= today && today <= (e.endsOn || e.startsOn));
  const defaultEventId = events.some((e) => e.id === asked) ? asked : happening?.id ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-48 pt-8 sm:px-5 sm:pt-14 md:pb-10">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Quick sale</h1>
      <AdminNav active="sell" />
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-faded">
        Tap the shirt, the price, how they paid, then Record.{" "}
        <span className="hidden sm:inline">
          It lands in Sales history with its cost, comes off the Inventory count, and the cash is totaled
          up top so you can check the box at the end of the day.{" "}
        </span>
        No signal? It saves on this device and sends itself later.
      </p>
      <QuickSale
        designs={designs}
        events={events}
        defaultEventId={defaultEventId}
        dbReady={Boolean(sql)}
        initialStock={{ shirts: shelf.shirts, others: shelf.others }}
      />
    </div>
  );
}
