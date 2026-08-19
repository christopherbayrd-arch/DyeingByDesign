import type { Metadata } from "next";
import ProductCard from "@/components/ProductCard";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "The designs",
  description:
    "Hand bleached leaf shirts made to order in Maine. $39.99 each, $5 flat shipping.",
};

// Fresh from the database every 60 seconds
export const revalidate = 60;

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">The designs</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
        Pick your leaf.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-faded sm:text-base">
        Every shirt is printed with real leaves and real bleach, one at a time. Yours
        will not look exactly like the photo, and that&apos;s the point. Flat $5
        shipping in the US.
      </p>
      {products.length === 0 ? (
        <p className="card mt-10 p-8 text-faded">
          The shop is being restocked — check back soon, or grab a spot on the drop list
          below.
        </p>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      )}
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
