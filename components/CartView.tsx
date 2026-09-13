"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { lineKey, markPaid, useCart, type CartLine } from "@/components/CartContext";
import { useSession } from "next-auth/react";
import { COLORS, SET_PRICE_CENTS, SHIPPING_CENTS, colorName, fmtPrice, setDiscount } from "@/lib/products";

// what a bandana costs on its own, for the "add one and save" hint
const BANDANA_HINT_CENTS = 1000;
import { asset } from "@/lib/assets";

type Done = { orderRef: string; mailto?: string; customerEmailed?: boolean; emailFailed?: boolean };

// `shelf` = how many of each exact piece (design · color · size · the design
// on a bandana) are finished and on the shelf right now; `stripeReady` = the
// shop's Stripe keys are in. A line that's on the shelf can be paid for here
// and ships in a day or two. Everything else is made to order and goes in as
// a request Corey answers with a payment link. A cart holding both doesn't
// get mashed together: the ready ones check out first and the rest stay in
// the cart, or the whole lot goes as one order — the customer picks.
export default function CartView({
  shelf = {},
  stripeReady = false,
}: {
  shelf?: Record<string, number>;
  stripeReady?: boolean;
}) {
  const { lines, ready, remove, removeKeys, setQty, subtotalCents } = useCart();
  const onShelf = (l: CartLine) => (shelf[lineKey(l)] ?? 0) >= l.qty;
  const canCard = (l: CartLine) => stripeReady && onShelf(l);
  const indexed = lines.map((line, i) => ({ line, i }));
  const payNow = indexed.filter(({ line }) => canCard(line));
  const payLater = indexed.filter(({ line }) => !canCard(line));
  const nNow = payNow.reduce((s, { line }) => s + line.qty, 0);
  const nLater = payLater.reduce((s, { line }) => s + line.qty, 0);
  const allCard = lines.length > 0 && payLater.length === 0;
  const mixed = payNow.length > 0 && payLater.length > 0;
  // what a group costs on its own: its own pairing, its own flat rate shipping
  const groupTotal = (g: typeof indexed) => {
    const sub = g.reduce((s, { line }) => s + line.priceCents * line.qty, 0);
    const d = setDiscount(g.map(({ line }) => ({ kind: line.kind, qty: line.qty, unitPriceCents: line.priceCents })));
    return sub - d.off + SHIPPING_CENTS;
  };
  // shirt + bandana together = the set price
  const set = setDiscount(lines.map((l) => ({ kind: l.kind, qty: l.qty, unitPriceCents: l.priceCents })));
  const hasShirt = lines.some((l) => l.kind !== "bandana");
  const hasBandana = lines.some((l) => l.kind === "bandana");
  const SET_FULL_HINT = (lines.find((l) => l.kind !== "bandana")?.priceCents ?? 4500) + BANDANA_HINT_CENTS;
  // Signed in customers get their name and email filled in (still editable)
  const { data: session } = useSession();
  const me = session?.user;
  const [oneOrder, setOneOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  async function sendOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    // mixed cart, "send it all as one order" → everything; otherwise whatever
    // isn't being paid for by card
    const sending = oneOrder ? indexed : payLater;
    try {
      const res = await fetch("/api/email-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          items: sending.map(({ line: { slug, size, color, qty, variant } }) => ({ slug, size, color, qty, variant })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.orderRef) {
        setDone(body);
        removeKeys(sending.map(({ line }) => lineKey(line)));
      } else {
        setError(body.error ?? "That didn't go through. Try again in a minute.");
      }
    } catch {
      setError("That didn't go through. Try again in a minute.");
    }
    setBusy(false);
  }

  async function checkout(group: typeof indexed) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: group.map(({ line: { slug, size, color, qty, variant } }) => ({ slug, size, color, qty, variant })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        // only these come out of the cart when the customer lands on /success
        markPaid(group.map(({ line }) => lineKey(line)));
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

  // The order request form. Used on its own when nothing in the cart is ready
  // to ship, and as the "send it all as one order" option on a mixed cart.
  const orderForm = (intro: string) => (
    <form onSubmit={sendOrder} className="mt-5 space-y-3">
      <p className="text-xs leading-relaxed text-faded">{intro}</p>
      <input key={`n-${me?.name ?? ""}`} name="name" required maxLength={120} className="input" placeholder="Your name" autoComplete="name" defaultValue={me?.name ?? ""} />
      <input key={`e-${me?.email ?? ""}`} name="email" type="email" required maxLength={200} className="input" placeholder="Email" autoComplete="email" defaultValue={me?.email ?? ""} />
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
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {lines.map((line, i) => (
          <li key={`${line.slug}-${line.size}-${line.color}-${line.variant ?? ""}`} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24">
              {line.card ? (
                <Image src={asset(line.card)} alt={line.name} fill sizes="96px" className="object-cover" />
              ) : (
                <div className="h-full w-full bg-black/30" />
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">
                  {line.name}
                  {line.variant && <span className="text-faded"> · {line.variant.charAt(0).toUpperCase() + line.variant.slice(1)}</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-faded">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-bone/30"
                    style={{ background: COLORS.find((c) => c.key === line.color)?.hex }}
                  />
                  {colorName(line.color)}{line.size ? ` · ${line.size === "One size" ? line.size : `Size ${line.size}`}` : ""}
                </p>
                <p className="mt-1.5 text-xs">
                  {onShelf(line) ? (
                    <span className="font-medium text-goldlight">Ready to ship · 1 to 2 days</span>
                  ) : (
                    <span className="text-faded">Made for you · 1 to 2 weeks</span>
                  )}
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
          {set.off > 0 && (
            <div className="flex justify-between text-goldlight">
              <dt>
                Shirt + bandana set{set.pairs > 1 ? ` × ${set.pairs}` : ""}
              </dt>
              <dd>−{fmtPrice(set.off)}</dd>
            </div>
          )}
          <div className="flex justify-between text-faded">
            <dt>Shipping (flat rate, US)</dt>
            <dd>{fmtPrice(SHIPPING_CENTS)}</dd>
          </div>
          <div className="flex justify-between border-t border-bone/15 pt-3 text-base font-semibold text-bone">
            <dt>Total</dt>
            <dd>{fmtPrice(subtotalCents - set.off + SHIPPING_CENTS)}</dd>
          </div>
        </dl>
        {set.off === 0 && hasShirt && !hasBandana && (
          <p className="mt-3 rounded-xl bg-black/20 px-4 py-3 text-xs leading-relaxed text-faded">
            Add a matching{" "}
            <a href="/shop/bandana" className="font-semibold text-goldlight underline underline-offset-2">
              bandana
            </a>{" "}
            and the pair is {fmtPrice(SET_PRICE_CENTS)} instead of {fmtPrice(SET_FULL_HINT)}.
          </p>
        )}

        {allCard ? (
          <>
            <button className="btn btn-gold mt-6 w-full" onClick={() => checkout(payNow)} disabled={busy}>
              {busy ? "One sec…" : "Check out"}
            </button>
            {error && <p className="mt-3 text-sm text-rust">{error}</p>}
            <p className="mt-4 text-xs leading-relaxed text-faded">
              Everything here is bleached, washed, and on the shelf — out the door in 1 to 2
              days. Secure card, Apple Pay, and Google Pay checkout by Stripe. Prices and
              availability are double checked at checkout.
            </p>
          </>
        ) : mixed ? (
          <>
            <div className="mt-6 rounded-xl border border-gold/25 bg-black/20 p-4">
              <p className="kicker text-goldlight">{nNow} ready to ship</p>
              <p className="mt-2 text-xs leading-relaxed text-faded">
                {nNow === 1 ? "One piece" : `${nNow} pieces`} in your cart{" "}
                {nNow === 1 ? "is" : "are"} already made and on the shelf. Pay for{" "}
                {nNow === 1 ? "it" : "them"} now and {nNow === 1 ? "it ships" : "they ship"} in
                1 to 2 days — the {nLater} made to order{" "}
                {nLater === 1 ? "one stays" : "ones stay"} in your cart to send right after.
              </p>
              <button className="btn btn-gold mt-3 w-full" onClick={() => checkout(payNow)} disabled={busy}>
                {busy
                  ? "One sec…"
                  : `Check out the ready ${nNow === 1 ? "one" : "ones"} · ${fmtPrice(groupTotal(payNow))}`}
              </button>
              {error && !oneOrder && <p className="mt-3 text-sm text-rust">{error}</p>}
              <p className="mt-2 text-[0.7rem] leading-relaxed text-faded">
                Two orders, so the flat rate lands on each one.
              </p>
            </div>

            {!oneOrder ? (
              <>
                <p className="mt-5 text-xs leading-relaxed text-faded">
                  Rather have it all in one box? Send the whole cart as one order instead —
                  nothing is charged, we reply with a single payment link, and it all ships
                  together once the made to order {nLater === 1 ? "piece is" : "pieces are"} done.
                </p>
                <button className="btn btn-ghost mt-3 w-full" onClick={() => setOneOrder(true)}>
                  Send all {nNow + nLater} as one order · {fmtPrice(subtotalCents - set.off + SHIPPING_CENTS)}
                </button>
              </>
            ) : (
              orderForm(
                `All ${nNow + nLater} pieces go in as one order — one payment link, one shipping charge, shipped together. Send it over and we reply within a day with a secure link and a ship date.`
              )
            )}
          </>
        ) : (
          orderForm(
            stripeReady
              ? "Every piece here is made for you after you order, so nothing is charged now. Send us the order and we reply within a day with a secure payment link and a ship date."
              : "No card needed here. Send us the order and we reply within a day with a secure payment link and a ship date."
          )
        )}
      </aside>
    </div>
  );
}
