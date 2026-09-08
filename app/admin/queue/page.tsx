import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import QueueBoard from "@/components/QueueBoard";
import { getDb } from "@/lib/db";
import { loadQueue } from "@/lib/queue";

export const metadata: Metadata = {
  title: "Make queue",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// The order to work orders in: rush, then first come first served, holds last.
export default async function AdminQueuePage() {
  const sql = getDb();

  if (!sql) {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-14">
        <p className="kicker">Order desk</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Make queue</h1>
        <AdminNav active="queue" />
        <p className="mt-6 text-faded">
          No database connected yet. Add <code>DATABASE_URL</code> from Neon (README has the
          walkthrough), run <code>schema.sql</code>, then reload.
        </p>
      </div>
    );
  }

  const data = await loadQueue(sql);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">
        Make queue <span className="hidden text-base font-normal text-faded print:inline">· {today}</span>
      </h1>
      <div className="no-print">
        <AdminNav active="queue" />
      </div>
      {data.error && (
        <p className="mt-6 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{data.error}</p>
      )}
      <QueueBoard data={data} />
    </div>
  );
}
