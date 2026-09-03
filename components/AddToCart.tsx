"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import ShirtPreview from "@/components/ShirtPreview";
import { COLORS, ORDER_MODE, availableQty, fmtPrice, isSoldOut, type Product } from "@/lib/products";

export default function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  const router = useRouter();
  const [size, setSize] = useState<string | null>(null);
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
  const ready = Boolean(size && color);
  const missing = !color && !size ? "Pick a color and a size first." : !color ? "Pick a color first." : "Pick a size first.";

  function handleAdd() {
    if (!ready) {
      setError(missing);
      return;
    }
    setError("");
    add({
      slug: product.slug,
      size: size!,
      color: color!,
      qty,
      name: product.name,
      priceCents: product.priceCents,
      card: product.card,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2600);
  }

  async function handleBuyNow() {
    if (!ready) {
      setError(missing);
      return;
    }
    setError("");
    if (ORDER_MODE === "email") {
      // No card checkout — put it in the cart and go straight to the order form
      add({
        slug: product.slug,
        size: size!,
        color: color!,
        qty,
        name: product.name,
        priceCents: product.priceCents,
        card: product.card,
      });
      router.push("/cart");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ slug: product.slug, size, color, qty }] }),
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
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-faded">Shirt color</span>
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
      <div className="shrink-0 rounded-xl bg-black/20 p-2 text-center">
        <ShirtPreview color={color} size={92} />
        <p className="mt-0.5 text-[0.6rem] uppercase tracking-wider text-faded">the blank</p>
      </div>
      </div>

      <div className="mb-1.5 mt-6 flex items-center justify-between text-sm">
        <span className="font-medium text-faded">Size — unisex, true to size</span>
      </div>
      <div className="flex flex-wrap gap-2">
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
      {product.trackStock && size && availableQty(product, size) <= 3 && (
        <p className="mt-2 text-xs font-medium text-goldlight">
          Only {availableQty(product, size)} left in {size}.
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
          {buying ? "Heading to checkout…" : `${ORDER_MODE === "email" ? "Order this one" : "Buy now"} · ${fmtPrice(product.priceCents * qty)}`}
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
        {fmtPrice(product.priceCents)} + $5 flat shipping (US).{" "}
        {product.trackStock
          ? "In stock and ready to ship in 1 to 2 days."
          : "Made for you after you order — allow 5 to 7 days before it ships."}
      </p>
    </div>
  );
}
