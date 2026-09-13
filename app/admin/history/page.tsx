import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import SalesHistory from "@/components/SalesHistory";
import { getDb } from "@/lib/db";
import { getAllProducts } from "@/lib/catalog";
import { loadHistory } from "@/lib/history";
import { loadRemovals } from "@/lib/historyRemovals";
import { BIN_DAYS } from "@/lib/orderAdmin";
import type { BinnedOrder } from "@/components/SalesHistory";

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
  // What's currently out of the books and could come back: single pieces
  // (removed_lines) and whole sales sitting in the 30 day bin.
  const removals = await loadRemovals(sql).catch(() => []);
  let binned: BinnedOrder[] = [];
  try {
    const rows = (await sql`
      select id, stripe_session_id, name, amount_total,
             to_jsonb(orders) ->> 'delete_reason' as delete_reason,
             to_jsonb(orders) ->> 'deleted_at'    as deleted_at
      from orders
      where (to_jsonb(orders) ->> 'deleted_at') is not null
      order by (to_jsonb(orders) ->> 'deleted_at')::timestamptz desc
      limit 50
    `) as Record<string, unknown>[];
    binned = rows.map((r) => {
      const sid = String(r.stripe_session_id ?? "");
      const t = new Date(String(r.deleted_at ?? "")).getTime();
      return {
        id: Number(r.id),
        ref: sid.startsWith("email_")
          ? sid.replace("email_", "")
          : sid.startsWith("manual_booth_")
            ? "quick sale"
            : sid.startsWith("manual_")
              ? "hand entered"
              : sid.startsWith("custom_")
                ? "custom piece"
                : "card",
        customer: String(r.name ?? ""),
        amountTotal: typeof r.amount_total === "number" ? r.amount_total : null,
        reason: String(r.delete_reason ?? ""),
        deletedAt: String(r.deleted_at ?? ""),
        daysLeft: Number.isNaN(t)
          ? null
          : Math.max(0, Math.ceil((t + BIN_DAYS * 86400000 - Date.now()) / 86400000)),
      };
    });
  } catch {
    // no bin columns yet — nothing has been removed
  }
  let products: { slug: string; name: string; priceCents: number; sizes: string[]; kind: "shirt" | "bandana" }[] = [];
  try {
    products = ((await getAllProducts()) ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      priceCents: p.priceCents,
      sizes: p.sizes,
      kind: p.kind,
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
          removals={removals}
          binned={binned}
        />
      </div>
    </div>
  );
}
