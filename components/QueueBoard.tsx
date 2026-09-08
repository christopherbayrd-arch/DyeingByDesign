"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { colorName } from "@/lib/products";
import { kindLabel } from "@/lib/requests";
import type { QueueData, QueueOrder } from "@/lib/queue";

// ============================================================
//  /admin/queue — the make queue. Every open order in the order to work
//  it: rush first, then first come first served, holds at the bottom.
//  Tick each shirt as it's made; the order moves down to "made, waiting"
//  on its own. Print button for a paper copy at the bench.
// ============================================================

const STATUS_LABEL: Record<string, string> = {
  requested: "Awaiting payment",
  paid: "Paid",
  made: "Made",
};

function age(days: number) {
  return days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
}

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't save.");
  return data;
}

function Flag({ tone, children }: { tone: "rush" | "hold" | "paid" | "unpaid"; children: React.ReactNode }) {
  const cls =
    tone === "rush" ? "border-transparent bg-gold text-inkdeep"
    : tone === "hold" ? "border-bone/30 text-faded"
    : tone === "paid" ? "border-transparent bg-gold/20 text-goldlight"
    : "border-rust/70 text-rust";
  return <span className={"rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider " + cls}>{children}</span>;
}

function Tiny({ onClick, busy, children, title, tone = "faded" }: { onClick: () => void; busy?: boolean; children: React.ReactNode; title?: string; tone?: "faded" | "gold" | "rust" }) {
  const cls = tone === "gold" ? "border-gold/60 text-goldlight hover:bg-gold/10" : tone === "rust" ? "border-bone/15 text-faded hover:border-rust hover:text-rust" : "border-bone/15 text-faded hover:border-gold/60 hover:text-goldlight";
  return (
    <button type="button" onClick={onClick} disabled={busy} title={title} className={"rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold transition disabled:opacity-50 " + cls}>
      {children}
    </button>
  );
}

function lineText(l: QueueOrder["lines"][number]) {
  return `${l.qty} × ${l.name}${l.color ? ` · ${colorName(l.color)}` : ""}${l.size ? ` · ${l.size}` : ""}`;
}

function OrderCard({ o, waiting }: { o: QueueOrder; waiting?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ticks, setTicks] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(o.lines.filter((l) => l.id !== null).map((l) => [l.id as number, l.madeAt !== null])),
  );
  const rush = o.priority > 0;
  const hold = o.priority < 0;

  async function run(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(label);
    setErr("");
    let ok = false;
    try {
      await fn();
      ok = true;
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy("");
    }
    return ok;
  }

  const patch = (label: string, body: Record<string, unknown>) => run(label, () => call("/api/admin/orders", "PATCH", { id: o.id, ...body }));

  async function tick(lineId: number, made: boolean) {
    setTicks((t) => ({ ...t, [lineId]: made }));
    const ok = await run(`line-${lineId}`, () => call("/api/admin/queue/line", "POST", { lineId, made }));
    if (!ok) setTicks((t) => ({ ...t, [lineId]: !made }));   // put the box back
  }

  return (
    <article
      id={`q-${o.id}`}
      className={
        "card p-4 text-sm " +
        (hold ? "opacity-60 " : "") +
        (rush && !waiting ? "border-gold/60 " : "")
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-10 shrink-0 text-center font-display text-2xl font-semibold text-goldlight" aria-label={waiting ? "made" : hold ? "on hold" : `number ${o.position} in line`}>
          {waiting ? "✓" : hold ? "–" : o.position}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-bone">{o.customer}</span>
            <span className="text-xs text-faded">{o.email}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faded">
            <span>{o.ref}</span>
            <span>·</span>
            <span>{o.shirts} shirt{o.shirts === 1 ? "" : "s"}</span>
            <span>·</span>
            <span title={new Date(o.createdAt).toLocaleString()}>waiting {age(o.daysWaiting)}</span>
            <Flag tone={o.paid ? "paid" : "unpaid"}>{STATUS_LABEL[o.status] ?? o.status}</Flag>
            {rush && <Flag tone="rush">Rush</Flag>}
            {hold && <Flag tone="hold">On hold</Flag>}
          </p>
          <ul className="mt-2 space-y-1">
            {o.lines.map((l, i) => {
              const done = l.id !== null ? Boolean(ticks[l.id]) : false;
              return (
                <li key={l.id ?? `m${i}`}>
                  <label className="flex cursor-pointer items-center gap-2">
                    {l.id !== null ? (
                      <input type="checkbox" checked={done} disabled={busy !== ""} onChange={(e) => tick(l.id as number, e.target.checked)} className="h-4 w-4 accent-[#cf9440]" />
                    ) : (
                      <span className="inline-block h-4 w-4 rounded border border-bone/20" title="Older order — use All made" />
                    )}
                    <span className={done ? "text-faded line-through" : "text-bone"}>{lineText(l)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {o.note && <p className="mt-2 text-xs text-faded">Customer: &ldquo;{o.note}&rdquo;</p>}
          {o.ownerNote && <p className="mt-1 text-xs text-goldlight">Your note: {o.ownerNote}</p>}
          {waiting && (
            <p className="mt-2 text-xs text-faded">
              {o.paid
                ? <>Paid and made — <a href={`/admin#order-${o.id}`} className="text-goldlight underline underline-offset-2">buy the label on the desk ↗</a></>
                : "Made. Email the customer a Stripe payment link, then mark it paid here."}
            </p>
          )}
          {err && <p className="mt-2 text-xs text-rust">{err}</p>}
        </div>
        <div className="no-print flex shrink-0 flex-col items-end gap-1.5">
          {waiting ? (
            <>
              {!o.paid && (
                <Tiny tone="gold" busy={busy !== ""} onClick={() => run("paid", () => call("/api/admin/orders", "POST", { id: o.id, status: "made" }))} title="Marks it paid and made, and freezes the cost in Sales history">
                  {busy === "paid" ? "…" : "Mark paid"}
                </Tiny>
              )}
              <Tiny busy={busy !== ""} onClick={() => run("unmake", () => call("/api/admin/queue/line", "POST", { orderId: o.id, made: false }))} title="Put it back in line">
                {busy === "unmake" ? "…" : "Back in line"}
              </Tiny>
            </>
          ) : (
            <>
              <Tiny tone="gold" busy={busy !== ""} onClick={() => run("all", () => call("/api/admin/queue/line", "POST", { orderId: o.id, made: true }))} title="Every shirt in this order is made">
                {busy === "all" ? "…" : "All made"}
              </Tiny>
              <Tiny busy={busy !== ""} onClick={() => patch("rush", { priority: rush ? 0 : 1 })} title={rush ? "Back to normal priority" : "Jump the line"}>
                {busy === "rush" ? "…" : rush ? "Un-rush" : "Rush"}
              </Tiny>
              <Tiny busy={busy !== ""} tone={hold ? "gold" : "faded"} onClick={() => patch("hold", { priority: hold ? 0 : -1 })} title={hold ? "Back in line" : "Park it at the bottom (waiting on the customer, blanks, etc.)"}>
                {busy === "hold" ? "…" : hold ? "Release" : "Hold"}
              </Tiny>
              {!hold && o.position > 1 && (
                <Tiny busy={busy !== ""} onClick={() => patch("top", { queue: "top" })} title="Move to the front of its group">
                  {busy === "top" ? "…" : "To top"}
                </Tiny>
              )}
              {!hold && (
                <Tiny busy={busy !== ""} onClick={() => patch("bottom", { queue: "bottom" })} title="Move to the back of the line">
                  {busy === "bottom" ? "…" : "To bottom"}
                </Tiny>
              )}
            </>
          )}
          <a href={`/admin#order-${o.id}`} className="text-[0.65rem] text-faded underline underline-offset-2 hover:text-goldlight">desk ↗</a>
        </div>
      </div>
    </article>
  );
}

function Tile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-faded">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-goldlight">{value}</p>
      {sub && <p className="text-xs text-faded">{sub}</p>}
    </div>
  );
}

export default function QueueBoard({ data }: { data: QueueData }) {
  const { toMake, made, waitingQuote, totals, byDesign, byBlank } = data;
  const inLine = toMake.filter((o) => o.priority >= 0);
  const onHold = toMake.filter((o) => o.priority < 0);
  const cardKey = (o: QueueOrder) => `${o.id}-${o.status}-${o.priority}-${o.made}-${o.queuedAt}`;

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-faded">
          Work from the top. Rush orders go first, then whoever ordered first, and anything on hold sits at the bottom.
          Tick each shirt as you finish it — when the last one&apos;s ticked the order moves down to <em>made, waiting</em>.
        </p>
        <button type="button" onClick={() => window.print()} className="btn btn-ghost no-print min-h-0 px-4 py-2 text-sm">
          Print this
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="In line" value={totals.orders - totals.hold} sub={totals.orders - totals.hold === 1 ? "order" : "orders"} />
        <Tile label="Shirts to make" value={totals.shirtsLeft} sub={`of ${totals.shirts} ordered`} />
        <Tile label="Rush" value={totals.rush} />
        <Tile label="On hold" value={totals.hold} />
        <Tile label="Made, waiting" value={made.length} sub="to be paid or shipped" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold">The line</h2>
          <div className="mt-4 space-y-3">
            {inLine.length === 0 && <p className="card p-5 text-sm text-faded">Nothing to make. {made.length > 0 ? "Everything's made — check the waiting list below." : "Enjoy it."}</p>}
            {inLine.map((o) => <OrderCard key={cardKey(o)} o={o} />)}
          </div>

          {onHold.length > 0 && (
            <>
              <h2 className="mt-10 font-display text-2xl font-semibold">On hold <span className="text-base text-faded">({onHold.length})</span></h2>
              <p className="mt-1 text-sm text-faded">Parked — waiting on the customer, a blank, a design. Release puts them back in line where their order date falls.</p>
              <div className="mt-4 space-y-3">
                {onHold.map((o) => <OrderCard key={cardKey(o)} o={o} />)}
              </div>
            </>
          )}

          <h2 className="mt-10 font-display text-2xl font-semibold">Made, waiting <span className="text-base text-faded">({made.length})</span></h2>
          <p className="mt-1 text-sm text-faded">Every shirt made. Waiting on the customer to pay, or on you to buy the label.</p>
          <div className="mt-4 space-y-3">
            {made.length === 0 && <p className="card p-5 text-sm text-faded">Nothing here.</p>}
            {made.map((o) => <OrderCard key={cardKey(o)} o={o} waiting />)}
          </div>
        </div>

        <aside className="space-y-8">
          <div>
            <h3 className="font-display text-xl font-semibold">Blanks to pull</h3>
            <p className="mt-1 text-xs text-faded">Every shirt still to make, by blank. Holds aren&apos;t counted.</p>
            {byBlank.length === 0 ? (
              <p className="mt-3 text-sm text-faded">—</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {byBlank.map((b) => (
                    <tr key={`${b.color}|${b.size}`} className="border-b border-bone/5">
                      <td className="py-1.5 pr-2 text-bone">{b.color ? colorName(b.color) : "any color"}</td>
                      <td className="py-1.5 pr-2 text-faded">{b.size || "?"}</td>
                      <td className="py-1.5 text-right font-semibold text-goldlight tabular-nums">{b.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold">By design</h3>
            {byDesign.length === 0 ? (
              <p className="mt-3 text-sm text-faded">—</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {byDesign.map((d) => (
                    <tr key={d.name} className="border-b border-bone/5">
                      <td className="py-1.5 pr-2 text-bone">{d.name}</td>
                      <td className="py-1.5 text-right font-semibold text-goldlight tabular-nums">{d.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold">Waiting on a quote <span className="text-sm text-faded">({waitingQuote.length})</span></h3>
            <p className="mt-1 text-xs text-faded">Custom requests that aren&apos;t orders yet. <em>Turn into order</em> on the desk puts one in line.</p>
            {waitingQuote.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {waitingQuote.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-2">
                    <a href={`/admin#request-${r.id}`} className="text-bone underline-offset-2 hover:text-goldlight hover:underline">
                      {r.name} <span className="text-xs text-faded">· {r.kind ? kindLabel(r.kind) : "custom"}</span>
                    </a>
                    <span className="whitespace-nowrap text-xs text-faded">{r.status} · {age(r.daysWaiting)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
