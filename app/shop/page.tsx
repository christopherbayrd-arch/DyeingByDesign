import type { Metadata } from "next";
import ProductCard from "@/components/ProductCard";
import { PRODUCTS } from "@/lib/products";

export const metadata: Metadata = {
  title: "The designs",
  description:
    "Sumac, maple, oak, and fern — hand bleached leaf shirts made to order in Maine. $39.99 each, $5 flat shipping.",
};

export default function ShopPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">The designs</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
        Pick your leaf.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-faded sm:text-base">
        Every shirt is made after you order it — real leaves, real bleach, one at a time.
        Yours will not look exactly like the photo, and that&apos;s the point. $39.99
        each, flat $5 shipping in the US.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
      <p className="mt-8 text-xs text-faded">
        Want a leaf you don&apos;t see here? That&apos;s what{" "}
        <a href="/custom" className="underline underline-offset-2 hover:text-goldlight">
          custom requests
        </a>{" "}
        are for.
      </p>
    </div>
  );
}
