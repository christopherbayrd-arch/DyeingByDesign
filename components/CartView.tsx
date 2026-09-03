"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/CartContext";
import { COLORS, ORDER_MODE, SHIPPING_CENTS, colorName, fmtPrice } from "@/lib/products";
import { asset } from "@/lib/assets";

type Done = { orderRef: string; mailto?: string; customerEmailed?: boolean; emailFailed?: boolean };

export default function CartView() {
  const { lines, ready, remove, setQty, subtotalCents, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  async function sendOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/email-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          items: lines.map(({ slug, size, color, qty }) => ({ slug, size, color, qty })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.orderRef) {
        setDone(body);
        clear();
      } else {
        setError(body.error ?? "That didn't go through. Try again in a minute.");
      }
    } catch {
      setError("That didn't go through. Try again in a minute.");
    }
    setBusy(false);
  }

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map(({ slug, size, color, qty }) => ({ slug, size, color, qty })),
        }),
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

  if (done) {
    return (
      <div className="card mx-auto max-w-2xl px-8 py-12 text-center">
        <p className="kicker">Order {done.orderRef}</p>
        {done.mailto ? (
          <>
            <p className="mt-2 font-display text-3xl">One more tap.</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-faded">
              Your order is written up — open it in your mail app and hit send. It goes
              straight to the shop, and we&apos;ll reply with payment details and a timeline.
            </p>
            <a href={done.mailto} className="btn btn-gold mt-6">
              Open in your mail app
            </a>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-3xl">Got it. Thank you.</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-faded">
              Nothing has been charged. We&apos;ll reply within a day with how to pay and
              when your shirt will ship
              {done.customerEmailed ? " — a copy is in your inbox now." : "."}
            </p>
          </>
        )}
        <Link href="/shop" className="btn btn-ghost mt-6">
          Back to the lineup
        </Link>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="card px-8 py-14 text-center">
        <p className="font-display text-2xl">Nothing in here yet.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-faded">
          Every shirt is one of a kind — go find the one that&apos;s yours.
        </p>
        <Link href="/shop" className="btn btn-gold mt-6">
          Shop the lineup
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {lines.map((line, i) => (
          <li key={`${line.slug}-${line.size}-${line.color}`} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24">
              {line.card ? (
                <Image src={asset(line.card)} alt={line.name} fill sizes="96px" className="object-cover" />
              ) : (
                <div className="h-full w-full bg-black/30" />
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">{line.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-faded">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-bone/30"
                    style={{ background: COLORS.find((c) => c.key === line.color)?.hex }}
                  />
                  {colorName(line.color)} · Size {line.size}
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
                  aria-label={`Quantity for ${line.name}`}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="w-16 text-right font-semibold text-goldlight">
                  {fmtPrice(line.priceCents * line.qty)}
                </span>
              </div>
            </div>
          </li>
        ))}
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

        {ORDER_MODE === "email" ? (
          <form onSubmit={sendOrder} className="mt-6 space-y-3">
            <p className="text-xs leading-relaxed text-faded">
              No card needed here. Send us the order and we reply within a day with
              payment details and a ship date.
            </p>
            <input name="name" required maxLength={120} className="input" placeholder="Your name" autoComplete="name" />
            <input name="email" type="email" required maxLength={200} className="input" placeholder="Email" autoComplete="email" />
            <input name="line1" required maxLength={200} className="input" placeholder="Street address" autoComplete="address-line1" />
            <input name="line2" maxLength={200} className="input" placeholder="Apt, unit (optional)" autoComplete="address-line2" />
            <div className="grid grid-cols-[1fr_64px_84px] gap-2">
              <input name="city" required maxLength={120} className="input" placeholder="City" autoComplete="address-level2" />
              <input name="state" required maxLength={2} className="input px-2 text-center uppercase" placeholder="ME" autoComplete="address-level1" />
              <input name="postal" required maxLength={10} className="input px-2" placeholder="ZIP" autoComplete="postal-code" inputMode="numeric" />
            </div>
            <textarea name="note" maxLength={2000} rows={2} className="input resize-y" placeholder="Anything we should know? (optional)" />
            {/* honeypot */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <button className="btn btn-gold w-full" disabled={busy}>
              {busy ? "Sending…" : "Send the order"}
            </button>
            {error && <p className="text-sm text-rust">{error}</p>}
            <p className="text-xs leading-relaxed text-faded">
              US shipping only for now. You&apos;ll get a copy of the order by email, and
              nothing is charged until you hear from us.
            </p>
          </form>
        ) : (
          <>
            <button className="btn btn-gold mt-6 w-full" onClick={checkout} disabled={busy}>
              {busy ? "One sec…" : "Check out"}
            </button>
            {error && <p className="mt-3 text-sm text-rust">{error}</p>}
            <p className="mt-4 text-xs leading-relaxed text-faded">
              Secure card, Apple Pay, and Google Pay checkout by Stripe. Prices and
              availability are double checked at checkout.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
