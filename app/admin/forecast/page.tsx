import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import Forecaster from "@/components/Forecaster";
import { getDb } from "@/lib/db";
import { getAllProducts } from "@/lib/catalog";
import { normalizeDoc, typeCost } from "@/lib/cogs";
import { loadHistory } from "@/lib/history";
import { SHIPPING_CENTS, SET_PRICE_CENTS } from "@/lib/products";
import { emptySeed, type Seed } from "@/lib/forecast";

export const metadata: Metadata = {
  title: "Forecast",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ONLINE_CHANNELS = new Set(["site", "request", "custom"]);
const RECENT_DAYS = 90;

function avg(xs: number[]): number | null {
  const good = xs.filter((n) => Number.isFinite(n) && n > 0);
  if (good.length === 0) return null;
  return good.reduce((a, b) => a + b, 0) / good.length;
}

// Everything the forecaster can read off the site, gathered in one place.
export default async function AdminForecastPage() {
  const sql = getDb();
  const seed: Seed = { ...emptySeed(), shipping: SHIPPING_CENTS / 100 };
  let note = "";

  if (sql) {
    // --- prices, straight from Products & stock ---
    let bandanaSlug = "";
    try {
      const products = (await getAllProducts()) ?? [];
      const shirts = products.filter((p) => p.kind !== "bandana");
      const bandana = products.find((p) => p.kind === "bandana") ?? null;
      bandanaSlug = bandana?.slug ?? "";
      seed.price = avg(shirts.map((p) => p.priceCents / 100));
      // A bandana bought with a shirt is what the pair costs less the shirt
      if (bandana && seed.price !== null) {
        seed.bandanaPrice = Math.max(0, SET_PRICE_CENTS / 100 - seed.price);
      }

      // --- cost per shirt, from the COGS sheet ---
      const rows = (await sql`select data from cogs where id = 1`) as { data: unknown }[];
      const doc = normalizeDoc(rows[0]?.data ?? null);
      if (doc) {
        const shipped: number[] = [];
        const inPerson: number[] = [];
        for (const p of shirts) {
          const t = doc.types.find((x) => x.id === doc.designs[p.slug]);
          if (!t) continue;
          const c = typeCost(t, doc.materials, doc.blanks, p.priceCents / 100);
          if (c.typical > 0) {
            shipped.push(c.typical);
            inPerson.push(c.inPerson);
          }
        }
        seed.costedDesigns = shipped.length;
        seed.shirtCost = avg(shipped);
        seed.shirtCostInPerson = avg(inPerson);
        if (bandana) {
          const t = doc.types.find((x) => x.id === doc.designs[bandana.slug]);
          if (t) {
            const c = typeCost(t, doc.materials, doc.blanks, bandana.priceCents / 100);
            if (c.typical > 0) seed.bandanaCost = c.typical;
          }
        }
      }
    } catch {
      note = "Could not read the catalog or the COGS sheet, so some figures below start blank.";
    }

    // --- how it has actually been selling ---
    try {
      const data = await loadHistory(sql);
      const since = Date.now() - RECENT_DAYS * 86400000;
      let onlineUnits = 0;
      let onlineOrders = 0;
      let units = 0;
      let revenue = 0;
      let recentUnits = 0;
      let postage = 0;
      let postageOrders = 0;
      for (const o of data.orders) {
        const shirtLines = o.lines.filter((l) => l.slug !== bandanaSlug);
        const qty = shirtLines.reduce((a, l) => a + l.qty, 0);
        units += qty;
        revenue += shirtLines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0) / 100;
        if (new Date(o.at).getTime() >= since) recentUnits += qty;
        if (ONLINE_CHANNELS.has(o.channel)) {
          onlineUnits += qty;
          if (qty > 0) onlineOrders++;
        }
        if ((o.postageCents ?? 0) > 0) {
          postage += (o.postageCents ?? 0) / 100;
          postageOrders++;
        }
      }
      seed.units = units;
      if (units > 0) {
        seed.onlineSharePct = (onlineUnits / units) * 100;
        seed.avgPriceSold = revenue / units;
      }
      if (onlineOrders > 0) seed.shirtsPerOrder = onlineUnits / onlineOrders;
      if (postageOrders > 0) seed.postagePerOrder = postage / postageOrders;
      if (recentUnits > 0) seed.shirtsPerMonth = recentUnits / (RECENT_DAYS / 30);
    } catch {
      // no history yet — the dials just start from the defaults
    }

    // --- cash or card at the booth ---
    try {
      const rows = (await sql`
        select coalesce(pay_method, '') as m, count(*)::int as n
        from orders
        where pay_method is not null and status <> 'cancelled'
        group by 1
      `) as { m: string; n: number }[];
      const total = rows.reduce((a, r) => a + r.n, 0);
      const card = rows.find((r) => r.m === "card")?.n ?? 0;
      if (total > 0) seed.cardShareInPersonPct = (card / total) * 100;
    } catch {
      // older database without pay_method — leave it to the assumption
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Forecast</h1>
      <AdminNav active="forecast" />
      {!sql ? (
        <p className="mt-6 text-faded">
          No database connected yet. Add <code>DATABASE_URL</code> from Neon (README has the
          walkthrough), run <code>schema.sql</code>, then reload.
        </p>
      ) : (
        <>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
            Slide the shirts up and down and watch gross margin, EBITDA and profit move. Prices
            come from Products &amp; stock, cost per shirt from the COGS sheet, overhead from the
            Expenses page, and the rest from how the shirts have actually been selling. Anything
            the site doesn&apos;t know is an assumption you can type over — they&apos;re all at the
            bottom, labelled with where they came from.
          </p>
          {note && (
            <p className="mt-6 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{note}</p>
          )}
          <div className="mt-8">
            <Forecaster seed={seed} />
          </div>
        </>
      )}
    </div>
  );
}
