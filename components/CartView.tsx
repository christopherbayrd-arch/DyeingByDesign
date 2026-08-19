"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/CartContext";
import { COLOR, PRODUCTS, SHIPPING_CENTS, fmtPrice } from "@/lib/products";

export default function CartView() {
  const { lines, ready, remove, setQty, subtotalCents } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Checkout hit a snag. Try again in a minute.");
    } catch {
      setError("Checkout hit a snag. Try again in a minute.");
    }
    setBusy(false);
  }

  if (!ready) {
    return <p className="text-faded">Loading your cart…</p>;
  }

  if (lines.length === 0) {
    return (
      <div className="card px-8 py-14 text-center">
        <p className="font-display text-2xl">Nothing in here yet.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-faded">
          Every shirt is one of a kind — go find the leaf that&apos;s yours.
        </p>
        <Link href="/shop" className="btn btn-gold mt-6">
          Shop the designs
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {lines.map((line, i) => {
          const p = PRODUCTS.find((p) => p.slug === line.slug);
          if (!p) return null;
          return (
            <li key={`${line.slug}-${line.size}`} className="card flex gap-4 p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <Image src={p.card} alt={p.name} fill sizes="96px" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">{p.name}</p>
                  <p className="mt-0.5 text-sm text-faded">
                    {COLOR} · Size {line.size}
                  </p>
                  <button
                    onClick={() => remove(i)}
                    className="mt-2 text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <select
                    value={line.qty}
                    onChange={(e) => setQty(i, Number(e.target.value))}
                    className="input w-auto py-1.5 text-sm"
                    aria-label={`Quantity for ${p.name}`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="w-16 text-right font-semibold text-goldlight">
                    {fmtPrice(p.priceCents * line.qty)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="card h-fit p-6">
        <h2 className="font-display text-xl font-semibold">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-faded">
            <dt>Subtotal</dt>
            <dd>{fmtPrice(subtotalCents)}</dd>
          </div>
          <div className="flex justify-between text-faded">
            <dt>Shipping (flat, US)</dt>
            <dd>{fmtPrice(SHIPPING_CENTS)}</dd>
          </div>
          <div className="flex justify-between border-t border-bone/15 pt-3 text-base font-semibold text-bone">
            <dt>Total</dt>
            <dd>{fmtPrice(subtotalCents + SHIPPING_CENTS)}</dd>
          </div>
        </dl>
        <button className="btn btn-gold mt-6 w-full" onClick={checkout} disabled={busy}>
          {busy ? "One sec…" : "Check out"}
        </button>
        {error && <p className="mt-3 text-sm text-rust">{error}</p>}
        <p className="mt-4 text-xs leading-relaxed text-faded">
          Secure card, Apple Pay, and Google Pay checkout by Stripe. Every shirt is made
          for you — allow 5 to 7 days before it ships.
        </p>
      </aside>
    </div>
  );
}
