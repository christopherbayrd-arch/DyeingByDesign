import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import ExpensesManager from "@/components/ExpensesManager";
import { getDb } from "@/lib/db";
import { loadHistory } from "@/lib/history";
import { byMonth } from "@/lib/historyMath";
import type { SalesMonth } from "@/lib/opex";

export const metadata: Metadata = {
  title: "Expenses",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// The running costs of the business, and what's left after the shirts
// have paid for themselves. Sales come from the same rows as the Sales
// history page, grouped by month, so EBITDA needs no separate bookkeeping.
export default async function AdminExpensesPage() {
  const sql = getDb();
  let sales: SalesMonth[] = [];
  let note = "";

  if (sql) {
    try {
      const data = await loadHistory(sql);
      sales = byMonth(data.orders).map(({ key, summary }) => ({
        key,
        revenue: summary.revenue / 100,
        cogs: summary.cogs / 100,
        gross: summary.gross / 100,
        net: summary.net / 100,
        units: summary.units,
        orders: summary.orders,
        uncosted: summary.uncostedUnits,
      }));
      if (data.error) note = data.error;
    } catch {
      note = "Could not read the sales history, so the EBITDA numbers are blank for now.";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Expenses</h1>
      <AdminNav active="expenses" />
      {!sql ? (
        <p className="mt-6 text-faded">
          No database connected yet. Add <code>DATABASE_URL</code> from Neon (README has the
          walkthrough), run <code>schema.sql</code>, then reload.
        </p>
      ) : (
        <>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
            What the business pays whether it sells five shirts or five hundred. The COGS page
            handles what each shirt eats; this one handles the rest, month by month, and works out
            EBITDA against your real sales. Everything updates as you type — hit Save when
            you&apos;re done. Nothing here shows on the site.
          </p>
          {note && (
            <p className="mt-6 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{note}</p>
          )}
          <div className="mt-8">
            <ExpensesManager sales={sales} />
          </div>
        </>
      )}
    </div>
  );
}
