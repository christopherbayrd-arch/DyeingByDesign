import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import SalesHistory from "@/components/SalesHistory";
import { getDb } from "@/lib/db";
import { getAllProducts } from "@/lib/catalog";
import { loadHistory } from "@/lib/history";

export const metadata: Metadata = {
  title: "Sales history",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Every shirt sold, with the cost that was true the day it was paid for.
export default async function AdminHistoryPage() {
  const sql = getDb();

  if (!sql) {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-14">
        <p className="kicker">Order desk</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Sales history</h1>
        <AdminNav active="history" />
        <p className="mt-6 text-faded">
          No database connected yet. Add <code>DATABASE_URL</code> from Neon (README has the
          walkthrough), run <code>schema.sql</code>, then reload.
        </p>
      </div>
    );
  }

  const data = await loadHistory(sql);
  let products: { slug: string; name: string; priceCents: number; sizes: string[] }[] = [];
  try {
    products = ((await getAllProducts()) ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      priceCents: p.priceCents,
      sizes: p.sizes,
    }));
  } catch {
    products = [];
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Sales history</h1>
      <AdminNav active="history" />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
        Every shirt sold, with what it cost you the day it was paid for. Changing prices on the
        COGS page later never touches these numbers. Card orders and paid order requests land here
        on their own; sales from a market table or a DM you add with <em>Record a sale</em>.
      </p>
      {data.error && (
        <p className="mt-6 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{data.error}</p>
      )}
      <div className="mt-8">
        <SalesHistory
          orders={data.orders}
          withoutLines={data.withoutLines}
          hasSheet={data.hasSheet}
          products={products}
        />
      </div>
    </div>
  );
}
