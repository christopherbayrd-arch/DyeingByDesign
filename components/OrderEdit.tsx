"use client";

import { useState } from "react";
import { BANDANA_SIZES, COLORS, ONE_SIZE, SIZES, colorName, fmtPrice } from "@/lib/products";

export type EditLine = {
  id: number;
  slug: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  unitPriceCents: number;
  variant: string;
};

export type EditShipping = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal: string;
};

type Draft = { size: string; color: string; qty: number; price: string; remove: boolean };

const money = (cents: number) => (cents / 100).toFixed(2);

// Change what's in an order and where it's going. Used from the Manage panel
// on /admin. Lines are the truth — saving rewrites the readable item list and
// the order total from them, so the desk, the queue and Sales history agree.
export default function OrderEdit({
  id,
  lines,
  customer,
  shipping,
  paid,
  onSaved,
}: {
  id: number;
  lines: EditLine[];
  customer: { name: string; email: string };
  shipping: EditShipping;
  paid: boolean;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.id, { size: l.size, color: l.color, qty: l.qty, price: money(l.unitPriceCents), remove: false }])
    )
  );
  const [who, setWho] = useState(customer);
  const [ship, setShip] = useState(shipping);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (lineId: number, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [lineId]: { ...d[lineId], ...patch } }));

  const kept = lines.filter((l) => !drafts[l.id]?.remove);
  const newTotal = kept.reduce((s, l) => {
    const d = drafts[l.id];
    const cents = Math.round(parseFloat(d?.price ?? "0") * 100);
    return s + (Number.isFinite(cents) ? cents : 0) * (d?.qty ?? l.qty);
  }, 0);

  async function save() {
    if (kept.length === 0) {
      setError("An order needs at least one thing in it. Cancel or delete the whole order instead.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: who.name,
          email: who.email,
          shipping: ship,
          lines: lines.map((l) => {
            const d = drafts[l.id];
            return d.remove
              ? { id: l.id, remove: true }
              : { id: l.id, size: d.size, color: d.color, qty: d.qty, price: d.price };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't save.");
      } else {
        onSaved();
      }
    } catch {
      setError("That didn't save — check your connection.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {lines.length === 0 ? (
        <p className="rounded-xl bg-inset p-4 text-sm text-faded">
          This order has no line items saved, so there&apos;s nothing to edit here. Older orders
          need the backfill on{" "}
          <a href="/admin/history" className="text-goldlight underline underline-offset-2">
            Sales history
          </a>{" "}
          first.
        </p>
      ) : (
        <div>
          <p className="kicker">What&apos;s in it</p>
          <ul className="mt-2 space-y-2">
            {lines.map((l) => {
              const d = drafts[l.id];
              const oneSize = l.size === ONE_SIZE;
              const sizes = oneSize ? BANDANA_SIZES : SIZES;
              return (
                <li
                  key={l.id}
                  className={"rounded-xl bg-inset p-3 " + (d.remove ? "opacity-55 line-through" : "")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {l.name || l.slug}
                      {l.variant && <span className="text-faded"> · {l.variant}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(l.id, { remove: !d.remove })}
                      className="text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                    >
                      {d.remove ? "keep it" : "take it off"}
                    </button>
                  </div>
                  {!d.remove && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="text-xs text-faded">
                        Size
                        <select
                          value={d.size}
                          onChange={(e) => set(l.id, { size: e.target.value })}
                          className="input mt-1 w-full py-1.5 text-sm"
                        >
                          {sizes.map((s) => (
                            <option key={s} value={s} className="bg-ink">{s}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-faded">
                        Color
                        <select
                          value={d.color}
                          onChange={(e) => set(l.id, { color: e.target.value })}
                          className="input mt-1 w-full py-1.5 text-sm"
                        >
                          {COLORS.map((c) => (
                            <option key={c.key} value={c.key} className="bg-ink">{c.name}</option>
                          ))}
                          {!COLORS.some((c) => c.key === d.color) && (
                            <option value={d.color} className="bg-ink">{colorName(d.color)} (retired)</option>
                          )}
                        </select>
                      </label>
                      <label className="text-xs text-faded">
                        Qty
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={d.qty}
                          onChange={(e) => set(l.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                          className="input mt-1 w-full py-1.5 text-sm"
                        />
                      </label>
                      <label className="text-xs text-faded">
                        Each
                        <input
                          value={d.price}
                          onChange={(e) => set(l.id, { price: e.target.value })}
                          inputMode="decimal"
                          className="input mt-1 w-full py-1.5 text-sm"
                        />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm text-faded">
            New total for the pieces: <span className="font-semibold text-goldlight">{fmtPrice(newTotal)}</span>{" "}
            plus whatever shipping was charged.
          </p>
          {paid && (
            <p className="mt-2 rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs leading-relaxed text-faded">
              This one is already paid. Changing it here does not move the Inventory shelf and
              does not charge or refund anybody — sort the money out in Stripe and the shelf on
              the Inventory tab if this change needs it.
            </p>
          )}
        </div>
      )}

      <div>
        <p className="kicker">Who and where</p>
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} className="input py-2 text-sm" placeholder="Name" />
            <input value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} className="input py-2 text-sm" placeholder="Email" />
          </div>
          <input value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} className="input py-2 text-sm" placeholder="Ship to name" />
          <input value={ship.line1} onChange={(e) => setShip({ ...ship, line1: e.target.value })} className="input py-2 text-sm" placeholder="Street address" />
          <input value={ship.line2} onChange={(e) => setShip({ ...ship, line2: e.target.value })} className="input py-2 text-sm" placeholder="Apt, unit (optional)" />
          <div className="grid grid-cols-[1fr_64px_84px] gap-2">
            <input value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} className="input py-2 text-sm" placeholder="City" />
            <input value={ship.state} onChange={(e) => setShip({ ...ship, state: e.target.value.toUpperCase() })} maxLength={2} className="input px-2 py-2 text-center text-sm uppercase" placeholder="ME" />
            <input value={ship.postal} onChange={(e) => setShip({ ...ship, postal: e.target.value })} maxLength={10} className="input px-2 py-2 text-sm" placeholder="ZIP" />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}
      <button className="btn btn-gold w-full" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save the changes"}
      </button>
    </div>
  );
}
