"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/CartContext";
import { COLOR, availableQty, fmtPrice, isSoldOut, type Product } from "@/lib/products";

export default function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const soldOut = isSoldOut(product);
  const maxForSize = size ? Math.min(5, availableQty(product, size)) : 5;

  function pickSize(s: string) {
    setSize(s);
    setError("");
    const cap = Math.min(5, availableQty(product, s));
    if (qty > cap) setQty(Math.max(1, cap));
  }

  function handleAdd() {
    if (!size) {
      setError("Pick a size first.");
      return;
    }
    setError("");
    add({
      slug: product.slug,
      size,
      qty,
      name: product.name,
      priceCents: product.priceCents,
      card: product.card,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2600);
  }

  async function handleBuyNow() {
    if (!size) {
      setError("Pick a size first.");
      return;
    }
    setError("");
    setBuying(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ slug: product.slug, size, qty }] }),
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
        <span className="font-medium text-faded">Size — unisex, true to size</span>
        <span className="text-faded">Color: {COLOR}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {product.sizes.map((s) => {
          const avail = availableQty(product, s);
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
        <button className="btn btn-gold" onClick={handleBuyNow} disabled={buying}>
          {buying ? "Heading to checkout…" : `Buy now · ${fmtPrice(product.priceCents * qty)}`}
        </button>
        <button className="btn btn-ghost" onClick={handleAdd} disabled={buying}>
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
