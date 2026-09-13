"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markPaid, useCart } from "@/components/CartContext";
import ShirtPreview from "@/components/ShirtPreview";
import {
  COLORS,
  availableQty,
  fmtPrice,
  isSoldOut,
  onHand,
  paysByCard,
  pieceKey,
  type Product,
} from "@/lib/products";

export type DesignChoice = { slug: string; name: string; card: string };

// `stripeReady` = the shop's Stripe keys are in (only the server can see them,
// so the page hands the answer down). Whether THIS piece is paid for by card
// is worked out below from what's on the shelf for the exact color, size and
// design picked: on the shelf means Buy now and paid today; anything else is
// made to order and goes in as a request Corey replies to with a payment link.
export default function AddToCart({
  product,
  stripeReady = false,
  designs = [],
}: {
  product: Product;
  stripeReady?: boolean;
  designs?: DesignChoice[];   // bandanas: which design goes on it
}) {
  const { add } = useCart();
  const router = useRouter();
  const bandana = product.kind === "bandana";
  const oneSize = product.sizes.length === 1;
  const [variant, setVariant] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(oneSize ? product.sizes[0] : null);

  // "Add the matching bandana" links land here with the design already picked
  useEffect(() => {
    if (!bandana || designs.length === 0) return;
    try {
      const want = new URLSearchParams(window.location.search).get("design");
      if (want && designs.some((d) => d.slug === want)) setVariant(want);
    } catch {
      // no query string, no problem
    }
  }, [bandana, designs]);
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const soldOut = isSoldOut(product);
  const maxForSize = size && color ? Math.min(5, availableQty(product, size, color)) : 5;

  function clampQty(s: string | null, c: string | null) {
    if (!s || !c) return;
    const cap = Math.min(5, availableQty(product, s, c));
    if (qty > cap) setQty(Math.max(1, cap));
  }
  function pickSize(s: string) {
    setSize(s);
    setError("");
    clampQty(s, color);
  }
  function pickColor(c: string) {
    setColor(c);
    setError("");
    clampQty(size, c);
  }
  const ready = Boolean(size && color && (!bandana || variant));
  // What's on the shelf for exactly what's been picked, and so whether this
  // one can be paid for now instead of ordered
  const shelf = ready ? onHand(product, size!, color!, variant ?? "") : 0;
  const cardNow = ready && paysByCard(stripeReady, shelf, qty);
  const missing = bandana && !variant
    ? "Pick a design first."
    : !color && !size
      ? "Pick a color and a size first."
      : !color
        ? "Pick a color first."
        : "Pick a size first.";
  const line = () => ({
    slug: product.slug,
    size: size!,
    color: color!,
    qty,
    name: product.name,
    priceCents: product.priceCents,
    card: product.card,
    kind: product.kind,
    variant: variant ?? "",
  });

  function handleAdd() {
    if (!ready) {
      setError(missing);
      return;
    }
    setError("");
    add(line());
    setAdded(true);
    setTimeout(() => setAdded(false), 2600);
  }

  async function handleBuyNow() {
    if (!ready) {
      setError(missing);
      return;
    }
    setError("");
    if (!cardNow) {
      // Not on the shelf (or more wanted than there is) — this one is made to
      // order, so it goes in the cart and on to the order form
      add(line());
      router.push("/cart");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ slug: product.slug, size, color, qty, variant: variant ?? "" }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        // so coming back to /success only empties what was actually bought
        markPaid([pieceKey(product.slug, color!, size!, variant ?? "")]);
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Checkout hit a snag. Try again in a minute.");
    } catch {
      setError("Checkout hit a snag. Try again in a minute.");
    }
    setBuying(false);
  }

  if (soldOut) {
    return (
      <div>
        <p className="inline-block rounded-full border border-rust/60 px-4 py-2 text-sm font-semibold text-rust">
          Sold out — for now
        </p>
        <p className="mt-4 text-sm leading-relaxed text-faded">
          This one went fast. Join the drop list at the bottom of the page and you&apos;ll
          be first to hear when it&apos;s back, or{" "}
          <Link href="/custom" className="underline underline-offset-2 hover:text-goldlight">
            request a custom
          </Link>{" "}
          version.
        </p>
      </div>
    );
  }

  return (
    <div>
      {bandana && designs.length > 0 && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-faded">Which design</span>
            <span className="text-faded">{variant ? designs.find((d) => d.slug === variant)?.name : "Pick one"}</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {designs.map((d) => (
              <button
                key={d.slug}
                type="button"
                data-active={variant === d.slug}
                aria-pressed={variant === d.slug}
                onClick={() => {
                  setVariant(d.slug);
                  setError("");
                }}
                className="size-pill flex min-h-12 items-center gap-2 py-1.5 pl-1.5 pr-4"
              >
                {d.card ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.card} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="h-9 w-9 rounded-full border border-dashed border-bone/30" />
                )}
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-faded">{bandana ? "Bandana color" : "Shirt color"}</span>
        <span className="text-faded">{color ? COLORS.find((c) => c.key === color)?.name : "Pick one"}</span>
      </div>
      <div className="flex items-start gap-4">
      <div className="flex flex-1 flex-wrap gap-2.5">
        {COLORS.map((c) => {
          const anyLeft = product.sizes.some((s) => availableQty(product, s, c.key) > 0);
          return (
            <button
              key={c.key}
              type="button"
              aria-label={c.name}
              title={anyLeft ? c.name : `${c.name} — sold out`}
              disabled={!anyLeft}
              onClick={() => pickColor(c.key)}
              className={
                "relative h-10 w-10 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-30 " +
                (color === c.key ? "border-goldlight scale-110" : "border-bone/20 hover:border-bone/60")
              }
              style={{ background: c.hex }}
            >
              {color === c.key && (
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white drop-shadow">✓</span>
              )}
            </button>
          );
        })}
      </div>
      {!bandana && (
        <div className="shrink-0 rounded-xl bg-black/20 p-2 text-center">
          <ShirtPreview color={color} size={92} />
          <p className="mt-0.5 text-[0.6rem] uppercase tracking-wider text-faded">the blank</p>
        </div>
      )}
      </div>

      <div className="mb-1.5 mt-6 flex items-center justify-between text-sm">
        <span className="font-medium text-faded">
          {oneSize ? "One size — a square that folds to any neck, dog or person" : "Size — relaxed fit, runs roomy"}
        </span>
      </div>
      <div className={"flex flex-wrap gap-2 " + (oneSize ? "hidden" : "")}>
        {product.sizes.map((s) => {
          const avail = color ? availableQty(product, s, color) : availableQty(product, s);
          const out = avail <= 0;
          return (
            <button
              key={s}
              type="button"
              className="size-pill disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through"
              data-active={size === s}
              disabled={out}
              title={out ? "Sold out in this size" : undefined}
              onClick={() => pickSize(s)}
            >
              {s}
            </button>
          );
        })}
      </div>
      {ready && (
        <p className="mt-3 text-sm leading-relaxed">
          {shelf >= qty ? (
            <span className="font-medium text-goldlight">
              Ready to ship — {shelf === 1 ? "this one is" : `${shelf} of these are`} finished and
              on the shelf, out the door in 1 to 2 days.
            </span>
          ) : shelf > 0 ? (
            <span className="text-faded">
              <span className="font-medium text-goldlight">{shelf} ready to ship</span> in this
              color and size. Ask for more than that and the whole lot gets made for you — allow
              1 to 2 weeks.
            </span>
          ) : (
            <span className="text-faded">
              Made for you after you order — allow 1 to 2 weeks, depending on the queue.
            </span>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-faded">
          Qty
          <select
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="input w-auto py-2"
            aria-label="Quantity"
          >
            {Array.from({ length: Math.max(1, maxForSize) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-gold grow sm:grow-0" onClick={handleBuyNow} disabled={buying}>
          {buying ? "Heading to checkout…" : `${cardNow ? "Buy now" : "Order this one"} · ${fmtPrice(product.priceCents * qty)}`}
        </button>
        <button className="btn btn-ghost grow sm:grow-0" onClick={handleAdd} disabled={buying}>
          {added ? "Added ✓" : "Add to cart"}
        </button>
      </div>

      {added && (
        <p className="mt-3 text-sm text-goldlight">
          In the bag.{" "}
          <Link href="/cart" className="underline underline-offset-2 hover:text-gold">
            View cart
          </Link>{" "}
          or keep browsing.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}

      <p className="mt-5 text-xs leading-relaxed text-faded">
        {fmtPrice(product.priceCents)} + $7 flat rate shipping (US).{" "}
        {cardNow
          ? "Card, Apple Pay, and Google Pay checkout by Stripe — paid now, packed and shipped from Brunswick, Maine."
          : "No card needed up front — send the order and we reply with a secure payment link and a ship date."}
      </p>
    </div>
  );
}
