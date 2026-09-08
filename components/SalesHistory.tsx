"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COLORS, SIZES, colorName } from "@/lib/products";
import {
  CHANNEL_LABELS,
  byDesign,
  byMonth,
  fmtMoney,
  fmtPct,
  lineMarginPct,
  marginPct,
  summarize,
  type HistoryOrder,
} from "@/lib/historyMath";

// ============================================================
//  Sales history table — filters, totals, the orders themselves,
//  and the "Record a sale" form for sales that never touched the site.
//  Every number here comes from order_lines, where the cost was frozen
//  the day the shirt was paid for.
// ============================================================

type ProductOpt = { slug: string; name: string; priceCents: number; sizes: string[] };

type Props = {
  orders: HistoryOrder[];
  withoutLines: number;
  hasSheet: boolean;
  products: ProductOpt[];
};

const CHANNEL_OPTIONS = ["market", "instagram", "other"] as const;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// The day a sale happened, in this browser's time zone (YYYY-MM-DD)
function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return iso;
  }
}
function dollarsInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export default function SalesHistory({ orders, withoutLines, hasSheet, products }: Props) {
  const router = useRouter();

  // ---- filters ----
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [design, setDesign] = useState("");
  const [channel, setChannel] = useState("");

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        const day = localDay(o.at);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (channel && o.channel !== channel) return false;
        if (design && !o.lines.some((l) => l.slug === design)) return false;
        return true;
      })
      .map((o) =>
        design
          ? // a design view is shirts only: drop the other designs and the order-level money
            { ...o, lines: o.lines.filter((l) => l.slug === design), shippingCents: 0, feeCents: 0, postageCents: 0 }
          : o
      );
  }, [orders, from, to, design, channel]);

  const total = useMemo(() => summarize(filtered), [filtered]);
  const months = useMemo(() => byMonth(filtered), [filtered]);
  const designs = useMemo(() => byDesign(filtered), [filtered]);
  const margin = marginPct(total);

  const designOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) for (const l of o.lines) if (!seen.has(l.slug)) seen.set(l.slug, l.name);
    return [...seen.entries()];
  }, [orders]);

  // ---- housekeeping actions ----
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "That didn't work.");
    return data;
  }

  async function backfill() {
    setBusy("backfill");
    setMsg("");
    try {
      const d = await post("/api/admin/history/backfill");
      setMsg(`Added ${d.lines} shirt${d.lines === 1 ? "" : "s"} from ${d.orders} older order${d.orders === 1 ? "" : "s"}, costed with today's sheet and marked as estimates.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Backfill didn't run.");
    }
    setBusy("");
  }

  async function costMissing() {
    setBusy("missing");
    setMsg("");
    try {
      let n = 0;
      for (const o of orders) {
        if (o.lines.some((l) => l.unitCogsCents === null)) {
          const d = await post("/api/admin/history/recost", { id: o.id, force: false });
          n += Number(d.costed) || 0;
        }
      }
      setMsg(n > 0 ? `Costed ${n} shirt${n === 1 ? "" : "s"}.` : "Nothing could be costed yet — check the COGS page for missing blank prices or unlinked designs.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't cost those.");
    }
    setBusy("");
  }

  async function recost(id: number) {
    setBusy(`recost-${id}`);
    setMsg("");
    try {
      await post("/api/admin/history/recost", { id, force: true });
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't recost that order.");
    }
    setBusy("");
  }

  async function saveOrderMoney(id: number, field: "postage" | "fee", value: string) {
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.error ?? "Didn't save.");
        return;
      }
      router.refresh();
    } catch {
      setMsg("Didn't save — check your connection.");
    }
  }

  // ---- record a sale ----
  const [showForm, setShowForm] = useState(false);
  const firstProduct = products[0];
  const [sale, setSale] = useState({
    slug: firstProduct?.slug ?? "custom",
    size: "M",
    color: "black",
    qty: "1",
    unitPrice: firstProduct ? (firstProduct.priceCents / 100).toFixed(2) : "",
    channel: "market",
    soldAt: today(),
    shipping: "0",
    fee: "",
    postage: "",
    buyer: "",
    note: "",
  });
  const [saleMsg, setSaleMsg] = useState("");

  function setSaleField(k: keyof typeof sale, v: string) {
    setSale((s) => {
      const next = { ...s, [k]: v };
      if (k === "slug") {
        const p = products.find((x) => x.slug === v);
        if (p) next.unitPrice = (p.priceCents / 100).toFixed(2);
        if (p && !p.sizes.includes(next.size)) next.size = p.sizes[0] ?? "M";
      }
      return next;
    });
  }

  async function recordSale(e: React.FormEvent) {
    e.preventDefault();
    setBusy("sale");
    setSaleMsg("");
    try {
      const d = await post("/api/admin/sales", sale);
      setSaleMsg(
        d.costed > 0
          ? "Recorded, with today's cost frozen on it."
          : "Recorded. No cost yet — link the design to a shirt type on the COGS page, then cost it from the table."
      );
      setSale((s) => ({ ...s, qty: "1", buyer: "", note: "" }));
      router.refresh();
    } catch (err) {
      setSaleMsg(err instanceof Error ? err.message : "Couldn't record that.");
    }
    setBusy("");
  }

  const sizeOptions = products.find((p) => p.slug === sale.slug)?.sizes ?? SIZES;
  const exportHref = `/api/admin/history/export${from || to ? `?${[from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&")}` : ""}`;

  return (
    <div className="space-y-8">
      {/* ---------- notices ---------- */}
      {withoutLines > 0 && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <p>
            <strong className="text-bone">{withoutLines} older order{withoutLines === 1 ? "" : "s"}</strong>{" "}
            <span className="text-faded">
              {withoutLines === 1 ? "is" : "are"} from before the history existed, so {withoutLines === 1 ? "it isn't" : "they aren't"} counted yet.
              Backfilling builds a line for each shirt and costs it with today&apos;s sheet, marked as an estimate.
            </span>
          </p>
          <button type="button" onClick={backfill} disabled={busy !== ""} className="btn btn-gold mt-3">
            {busy === "backfill" ? "Working…" : "Backfill older orders"}
          </button>
        </div>
      )}
      {!hasSheet && (
        <p className="rounded-xl border border-bone/10 bg-black/20 p-4 text-sm text-faded">
          There&apos;s no COGS sheet saved yet, so nothing can be costed. Fill in the{" "}
          <Link href="/admin/cogs" className="text-goldlight underline underline-offset-2">COGS page</Link> and hit Save;
          from then on every sale freezes its cost the day it&apos;s paid.
        </p>
      )}
      {total.uncostedUnits > 0 && hasSheet && (
        <div className="rounded-xl border border-bone/10 bg-black/20 p-4 text-sm">
          <p className="text-faded">
            <strong className="text-bone">{total.uncostedUnits} shirt{total.uncostedUnits === 1 ? "" : "s"}</strong> in this view{" "}
            {total.uncostedUnits === 1 ? "has" : "have"} no cost — usually a design that isn&apos;t linked to a shirt type on the COGS page.
            Fix that, then cost them here. They&apos;re left out of the margin until then.
          </p>
          <button type="button" onClick={costMissing} disabled={busy !== ""} className="btn btn-ghost mt-3">
            {busy === "missing" ? "Working…" : "Cost the missing ones"}
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-goldlight">{msg}</p>}

      {/* ---------- filters ---------- */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-faded">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 block py-1.5 text-sm" />
          </label>
          <label className="text-xs text-faded">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 block py-1.5 text-sm" />
          </label>
          <label className="text-xs text-faded">
            Design
            <select value={design} onChange={(e) => setDesign(e.target.value)} className="input mt-1 block py-1.5 text-sm">
              <option value="">All designs</option>
              {designOptions.map(([slug, name]) => (
                <option key={slug} value={slug}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-faded">
            Sold through
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input mt-1 block py-1.5 text-sm">
              <option value="">Everywhere</option>
              {Object.entries(CHANNEL_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              ["This month", today().slice(0, 7) + "-01", ""],
              ["Last 30 days", daysAgo(30), ""],
              ["This year", today().slice(0, 4) + "-01-01", ""],
              ["All time", "", ""],
            ].map(([label, f, t]) => (
              <button
                key={label}
                type="button"
                onClick={() => { setFrom(f); setTo(t); }}
                className={"rounded-full border px-2.5 py-1 transition " + (from === f && to === t ? "border-gold/60 text-goldlight" : "border-bone/10 text-faded hover:text-goldlight")}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button type="button" onClick={() => setShowForm((v) => !v)} className={"btn " + (showForm ? "btn-ghost" : "btn-gold")}>
            {showForm ? "Close" : "Record a sale"}
          </button>
          <a href={exportHref} className="btn btn-ghost">Download CSV</a>
        </div>
      </div>

      {/* ---------- record a sale ---------- */}
      {showForm && (
        <form onSubmit={recordSale} className="card p-5">
          <p className="kicker">Record a sale</p>
          <p className="mt-1 text-sm text-faded">
            For a market table, a DM, Tap to Pay — anything that didn&apos;t go through the site. The cost is
            frozen with the COGS sheet from the sale date.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-faded">
              Design
              <select value={sale.slug} onChange={(e) => setSaleField("slug", e.target.value)} className="input mt-1 block w-full py-1.5 text-sm">
                {products.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
                <option value="custom">Custom piece</option>
              </select>
            </label>
            <label className="text-xs text-faded">
              Color
              <select value={sale.color} onChange={(e) => setSaleField("color", e.target.value)} className="input mt-1 block w-full py-1.5 text-sm">
                {COLORS.map((c) => (
                  <option key={c.key} value={c.key}>{c.name}</option>
                ))}
                <option value="">Other / not a blank</option>
              </select>
            </label>
            <label className="text-xs text-faded">
              Size
              <select value={sale.size} onChange={(e) => setSaleField("size", e.target.value)} className="input mt-1 block w-full py-1.5 text-sm">
                {sizeOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-faded">
              How many
              <input value={sale.qty} onChange={(e) => setSaleField("qty", e.target.value)} inputMode="numeric" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Price each ($)
              <input value={sale.unitPrice} onChange={(e) => setSaleField("unitPrice", e.target.value)} inputMode="decimal" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Sold through
              <select value={sale.channel} onChange={(e) => setSaleField("channel", e.target.value)} className="input mt-1 block w-full py-1.5 text-sm">
                {CHANNEL_OPTIONS.map((k) => (
                  <option key={k} value={k}>{CHANNEL_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-faded">
              Date
              <input type="date" value={sale.soldAt} onChange={(e) => setSaleField("soldAt", e.target.value)} className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Shipping charged ($)
              <input value={sale.shipping} onChange={(e) => setSaleField("shipping", e.target.value)} inputMode="decimal" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Card fee ($, optional)
              <input value={sale.fee} onChange={(e) => setSaleField("fee", e.target.value)} inputMode="decimal" placeholder="Tap to Pay fee" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Postage paid ($, optional)
              <input value={sale.postage} onChange={(e) => setSaleField("postage", e.target.value)} inputMode="decimal" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Buyer (optional)
              <input value={sale.buyer} onChange={(e) => setSaleField("buyer", e.target.value)} className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Note (optional)
              <input value={sale.note} onChange={(e) => setSaleField("note", e.target.value)} placeholder="Brunswick farmers market" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy !== ""} className="btn btn-gold">
              {busy === "sale" ? "Saving…" : "Save this sale"}
            </button>
            {saleMsg && <p className="text-sm text-faded">{saleMsg}</p>}
          </div>
        </form>
      )}

      {/* ---------- totals ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-faded">Shirts sold</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{total.units}</p>
          <p className="mt-1 text-xs text-faded">{total.orders} order{total.orders === 1 ? "" : "s"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-faded">Revenue (shirts)</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-goldlight">{fmtMoney(total.revenue)}</p>
          <p className="mt-1 text-xs text-faded">+ {fmtMoney(total.shippingCharged)} shipping charged</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-faded">Cost of those shirts</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{fmtMoney(total.cogs)}</p>
          <p className="mt-1 text-xs text-faded">
            {total.uncostedUnits > 0 ? `${total.uncostedUnits} not costed · ` : ""}
            {total.estimatedUnits > 0 ? `${total.estimatedUnits} estimated` : "all frozen at sale"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-faded">Margin</p>
          <p className={"mt-1 font-display text-3xl font-semibold tabular-nums " + (margin !== null && margin < 50 ? "text-rust" : "")}>
            {fmtPct(margin)}
          </p>
          <p className="mt-1 text-xs text-faded">
            {fmtMoney(total.gross)} on shirts · {fmtMoney(total.net)} after fees &amp; postage
          </p>
        </div>
      </div>

      {/* ---------- by month ---------- */}
      <section>
        <h2 className="font-display text-2xl font-semibold">By month</h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-bone/10 text-xs uppercase tracking-wider text-faded">
                <th className="p-3">Month</th>
                <th className="p-3 text-right">Shirts</th>
                <th className="p-3 text-right">Revenue</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3 text-right">Margin</th>
                <th className="p-3 text-right">Margin %</th>
                <th className="p-3 text-right">Shipping in</th>
                <th className="p-3 text-right">Card fees</th>
                <th className="p-3 text-right">Postage</th>
                <th className="p-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 && (
                <tr><td colSpan={10} className="p-4 text-faded">Nothing sold in this range yet.</td></tr>
              )}
              {months.map((m) => {
                const p = marginPct(m.summary);
                return (
                  <tr key={m.key} className="border-b border-bone/5">
                    <td className="p-3 font-medium">{m.label}</td>
                    <td className="p-3 text-right">{m.summary.units}</td>
                    <td className="p-3 text-right">{fmtMoney(m.summary.revenue)}</td>
                    <td className="p-3 text-right">{m.summary.costedUnits > 0 ? fmtMoney(m.summary.cogs) : "—"}{m.summary.uncostedUnits > 0 && <span className="text-faded"> *</span>}</td>
                    <td className="p-3 text-right">{fmtMoney(m.summary.gross)}</td>
                    <td className={"p-3 text-right font-semibold " + (p !== null && p < 50 ? "text-rust" : "text-goldlight")}>{fmtPct(p)}</td>
                    <td className="p-3 text-right text-faded">{fmtMoney(m.summary.shippingCharged)}</td>
                    <td className="p-3 text-right text-faded">{fmtMoney(m.summary.fees)}</td>
                    <td className="p-3 text-right text-faded">{fmtMoney(m.summary.postage)}</td>
                    <td className="p-3 text-right font-semibold">{fmtMoney(m.summary.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-faded">
          Margin is on the shirts alone. Net adds the shipping you charged and takes off card fees and postage.
          * some shirts in that month have no cost yet.
        </p>
      </section>

      {/* ---------- by design ---------- */}
      <section>
        <h2 className="font-display text-2xl font-semibold">By design</h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-bone/10 text-xs uppercase tracking-wider text-faded">
                <th className="p-3">Design</th>
                <th className="p-3 text-right">Shirts</th>
                <th className="p-3 text-right">Revenue</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3 text-right">Margin %</th>
                <th className="p-3">Blanks that sold</th>
              </tr>
            </thead>
            <tbody>
              {designs.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-faded">Nothing sold in this range yet.</td></tr>
              )}
              {designs.map((d) => {
                const p = marginPct(d.summary);
                return (
                  <tr key={d.slug} className="border-b border-bone/5 align-top">
                    <td className="p-3 font-medium">{d.name}</td>
                    <td className="p-3 text-right">{d.summary.units}</td>
                    <td className="p-3 text-right">{fmtMoney(d.summary.revenue)}</td>
                    <td className="p-3 text-right">{d.summary.costedUnits > 0 ? fmtMoney(d.summary.cogs) : "—"}{d.summary.uncostedUnits > 0 && <span className="text-faded"> *</span>}</td>
                    <td className={"p-3 text-right font-semibold " + (p !== null && p < 50 ? "text-rust" : "text-goldlight")}>{fmtPct(p)}</td>
                    <td className="p-3 text-xs text-faded">
                      {d.blanks.map((b) => {
                        const [color, size] = b.split(" ");
                        const rest = b.slice(color.length + 1 + size.length);
                        return `${color === "?" ? "?" : colorName(color)} ${size}${rest}`;
                      }).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- every sale ---------- */}
      <section>
        <h2 className="font-display text-2xl font-semibold">Every sale</h2>
        <p className="mt-1 text-sm text-faded">
          Cost is per shirt, frozen the day it was paid. <em>est.</em> means something was missing when it was
          costed (hover for why). Type a postage or card fee and click away to save it.
        </p>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-bone/10 text-xs uppercase tracking-wider text-faded">
                <th className="p-3">When</th>
                <th className="p-3">Through</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Shirt</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3 text-right">Margin</th>
                <th className="p-3 text-right">Fee</th>
                <th className="p-3 text-right">Postage</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-4 text-faded">Nothing here yet.</td></tr>
              )}
              {filtered.map((o) => {
                const lines = o.lines.length > 0 ? o.lines : [null];
                return lines.map((l, i) => {
                  const first = i === 0;
                  const span = lines.length;
                  const m = l ? lineMarginPct(l) : null;
                  return (
                    <tr key={`${o.id}-${l ? l.id : "none"}`} className={"align-top " + (i === span - 1 ? "border-b border-bone/5" : "")}>
                      {first && (
                        <>
                          <td rowSpan={span} className="p-3 whitespace-nowrap text-faded">
                            {fmtDate(o.at)}
                            <div className="text-[0.65rem] uppercase tracking-wider">{o.status}</div>
                          </td>
                          <td rowSpan={span} className="p-3 text-faded">
                            {CHANNEL_LABELS[o.channel] ?? o.channel}
                            <div className="text-[0.65rem]">{o.ref}</div>
                          </td>
                          <td rowSpan={span} className="p-3">
                            <div className="font-medium">{o.customer || "—"}</div>
                            {o.note && <div className="max-w-[14rem] text-xs text-faded">{o.note}</div>}
                          </td>
                        </>
                      )}
                      {l ? (
                        <>
                          <td className="p-3">
                            {l.name}
                            <span className="text-faded"> · {l.color ? colorName(l.color) : "—"} · {l.size || "—"}</span>
                            {l.priceSource === "catalog" && (
                              <span className="ml-1 text-[0.65rem] text-faded" title="This order didn't record its price; today's catalog price was used.">price est.</span>
                            )}
                          </td>
                          <td className="p-3 text-right">{l.qty}</td>
                          <td className="p-3 text-right">{fmtMoney(l.unitPriceCents)}</td>
                          <td className="p-3 text-right">
                            {l.unitCogsCents === null ? (
                              <span className="text-rust" title={l.reason || "No cost yet"}>not costed</span>
                            ) : (
                              <span title={[l.typeName, l.blankCents !== null ? `blank ${fmtMoney(l.blankCents)}` : "", l.materialsCents !== null ? `materials ${fmtMoney(l.materialsCents)}` : "", l.reason].filter(Boolean).join(" · ")}>
                                {fmtMoney(l.unitCogsCents)}
                                {l.estimated && <span className="ml-1 text-[0.65rem] text-faded">est.</span>}
                              </span>
                            )}
                          </td>
                          <td className={"p-3 text-right font-semibold " + (m !== null && m < 50 ? "text-rust" : "text-goldlight")}>{fmtPct(m)}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="p-3 text-faded">
                          Not in the history yet — use <em>Backfill older orders</em> above.
                        </td>
                      )}
                      {first && (
                        <>
                          <td rowSpan={span} className="p-3 text-right">
                            <input
                              key={`fee-${o.id}-${o.feeCents ?? "n"}`}
                              defaultValue={dollarsInput(o.feeCents)}
                              onBlur={(e) => { if (e.target.value !== dollarsInput(o.feeCents)) saveOrderMoney(o.id, "fee", e.target.value); }}
                              inputMode="decimal"
                              placeholder="—"
                              aria-label="Card fee"
                              className="input w-20 py-1 text-right text-xs"
                            />
                          </td>
                          <td rowSpan={span} className="p-3 text-right">
                            <input
                              key={`post-${o.id}-${o.postageCents ?? "n"}`}
                              defaultValue={dollarsInput(o.postageCents)}
                              onBlur={(e) => { if (e.target.value !== dollarsInput(o.postageCents)) saveOrderMoney(o.id, "postage", e.target.value); }}
                              inputMode="decimal"
                              placeholder="—"
                              aria-label="Postage paid"
                              className="input w-20 py-1 text-right text-xs"
                            />
                          </td>
                          <td rowSpan={span} className="p-3 text-right">
                            {o.lines.length > 0 && (
                              <button
                                type="button"
                                onClick={() => recost(o.id)}
                                disabled={busy !== ""}
                                title="Freeze the cost again with the sheet from this order's paid date"
                                className="text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
                              >
                                {busy === `recost-${o.id}` ? "…" : "recost"}
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
