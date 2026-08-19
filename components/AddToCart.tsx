"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/CartContext";
import { COLOR, SIZES, fmtPrice, type Product } from "@/lib/products";

export default function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  function handleAdd() {
    if (!size) {
      setError("Pick a size first.");
      return;
    }
    setError("");
    add({ slug: product.slug, size, qty });
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

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-faded">Size — unisex, true to size</span>
        <span className="text-faded">Color: {COLOR}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className="size-pill"
            data-active={size === s}
            onClick={() => {
              setSize(s);
              setError("");
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-faded">
          Qty
          <select
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="input w-auto py-2"
            aria-label="Quantity"
          >
            {[1, 2, 3, 4, 5].map((n) => (
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
        {fmtPrice(product.priceCents)} + $5 flat shipping (US). Made for you after you
        order — allow 5 to 7 days before it ships.
      </p>
    </div>
  );
}
