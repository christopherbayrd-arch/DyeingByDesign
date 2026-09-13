import Link from "next/link";
import Image from "next/image";
import { fmtPrice, SET_PRICE_CENTS, type Product } from "@/lib/products";
import { asset } from "@/lib/assets";

// The bandana isn't a line of its own — it takes any design from the lineup —
// so it gets this strip on the shop and home pages instead of a grid slot.
// Renders nothing at all until the bandana is switched on in /admin, which
// keeps the pages honest while Corey is still shooting the photo.
export default function BandanaBanner({
  product,
  className = "",
}: {
  product: Product | null | undefined;
  className?: string;
}) {
  if (!product) return null;

  return (
    <section id="bandanas" className={className}>
      <div className="card flex flex-col gap-6 overflow-hidden p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-6">
        <Link
          href={`/shop/${product.slug}`}
          className="relative aspect-square w-full shrink-0 overflow-hidden rounded-xl sm:h-44 sm:w-44"
        >
          {product.card ? (
            <Image
              src={asset(product.card)}
              alt={`${product.name} — hand bleached bandana by Dyeing By Design`}
              fill
              sizes="(max-width: 640px) 100vw, 176px"
              className="object-cover transition duration-500 hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black/30 text-xs text-faded">
              photo coming soon
            </div>
          )}
        </Link>
        <div className="min-w-0">
          <p className="kicker">New · for dogs and people</p>
          <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{product.name}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-faded">
            {product.blurb} One size, folded to fit a collar or a back pocket — pick any design
            from the lineup and it gets bleached the same way the shirts do.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={`/shop/${product.slug}`} className="btn btn-gold">
              Pick a design
            </Link>
            <p className="text-sm text-faded">
              {fmtPrice(product.priceCents)} on its own ·{" "}
              <span className="font-semibold text-goldlight">
                {fmtPrice(SET_PRICE_CENTS)} with a shirt
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
