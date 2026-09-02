import type { Metadata } from "next";
import Lineup from "@/components/Lineup";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "The lineup",
  description:
    "Hand bleached shirts made to order in Maine — real botanicals and hand-cut stencils on heavyweight cotton. $5 flat shipping.",
};

// Fresh from the database every 60 seconds
export const revalidate = 60;

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">The lineup</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
        Botanicals &amp; stencils.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-faded sm:text-base">
        Every shirt is bleached by hand, one at a time — a real leaf or a hand-cut
        stencil laid on heavyweight cotton. Yours will not look exactly like the photo,
        and that&apos;s the point. Flat $5 shipping in the US.
      </p>
      {products.length === 0 ? (
        <p className="card mt-10 p-8 text-faded">
          The shop is being restocked — check back soon, or grab a spot on the drop list
          below.
        </p>
      ) : (
        <div className="mt-10">
          <Lineup products={products} columns={4} />
        </div>
      )}
      <p className="mt-8 text-xs text-faded">
        Want a leaf, logo, or shape you don&apos;t see here? That&apos;s what{" "}
        <a href="/custom" className="underline underline-offset-2 hover:text-goldlight">
          custom requests
        </a>{" "}
        are for.
      </p>
    </div>
  );
}
