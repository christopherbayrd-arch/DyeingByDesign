import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCart, { type DesignChoice } from "@/components/AddToCart";
import ProductCard from "@/components/ProductCard";
import { getProduct, getProducts } from "@/lib/catalog";
import { fmtPrice, lineInfo, SET_PRICE_CENTS } from "@/lib/products";
import { cardCheckout } from "@/lib/orderMode";
import { asset } from "@/lib/assets";
import { absoluteImage, productJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

// Re-checked against the database every 60 seconds, so admin edits
// (price, stock, new photos) go live within a minute.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const kind = product.line === "stencil" ? "stencil" : "leaf";
  const bandana = product.kind === "bandana";
  return {
    title: bandana ? product.name : `${product.name} shirt`,
    description: bandana
      ? `${product.blurb} Hand bleached bandana for dogs and people, made to order in Brunswick, Maine — any design from the lineup, one size.`
      : `${product.blurb} Hand bleached ${kind} shirt from DBD, made to order in Brunswick, Maine.`,
    alternates: { canonical: `/shop/${slug}` },
    openGraph: {
      type: "website",
      title: bandana
        ? `${product.name} · hand bleached · Dyeing By Design (DBD)`
        : `${product.name} bleach shirt · Dyeing By Design (DBD)`,
      description: product.blurb,
      images: product.card ? [absoluteImage(product.card)] : [],
    },
  };
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const isStencil = product.line === "stencil";
  const isBandana = product.kind === "bandana";
  const all = (await getProducts()).filter((p) => p.slug !== product.slug);
  const shirts = all.filter((p) => p.kind !== "bandana");
  // Show siblings from the same line first, then fill from the other line
  const others = (isBandana
    ? shirts
    : [
        ...shirts.filter((p) => p.line === product.line),
        ...shirts.filter((p) => p.line !== product.line),
      ]
  ).slice(0, 3);
  // The bandana takes any design from the lineup; a shirt page points at it
  const designs: DesignChoice[] = shirts.map((p) => ({
    slug: p.slug,
    name: p.name,
    card: p.card ? (/^https?:\/\//.test(p.card) ? p.card : asset(p.card)) : "",
  }));
  const bandana = isBandana ? null : all.find((p) => p.kind === "bandana") ?? null;
  const setSaving = bandana ? product.priceCents + bandana.priceCents - SET_PRICE_CENTS : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10">
      <JsonLd data={productJsonLd(product)} />
      <nav className="text-xs text-faded">
        <Link href="/shop" className="transition hover:text-goldlight">
          ← The lineup
        </Link>
      </nav>

      <div className="mt-6 grid gap-8 md:grid-cols-2 md:gap-10">
        <div className="card relative aspect-[4/5] overflow-hidden md:sticky md:top-24">
          {product.image ? (
            <Image
              src={asset(product.image)}
              alt={
                isBandana
                  ? `${product.name} — hand bleached bandana by Dyeing By Design`
                  : `${product.name} ${isStencil ? "stencil" : "leaf"} bleach shirt by Dyeing By Design`
              }
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-faded">
              photo coming soon
            </div>
          )}
          {product.samplePhoto && (
            <span className="absolute bottom-3 left-3 rounded-full bg-inkdeep/80 px-3 py-1.5 text-[0.7rem] font-medium text-bone/90 backdrop-blur">
              {isBandana
                ? "Photo shows the technique — yours gets the design you pick above"
                : `Photo shows the technique — your ${product.name.toLowerCase()} piece will be its own`}
            </span>
          )}
        </div>

        <div>
          <p className="kicker">
            {isBandana ? "Bandana" : lineInfo(product.line).short}
            {product.species ? ` · ${product.species}` : ""}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-faded">{product.story}</p>

          <div className="mt-8 border-t border-bone/10 pt-8">
            <AddToCart
              product={product}
              card={cardCheckout(product)}
              designs={isBandana ? designs : []}
            />
          </div>

          {bandana && setSaving > 0 && (
            <Link
              href={`/shop/${bandana.slug}?design=${product.slug}`}
              className="card mt-5 flex items-center gap-4 p-4 transition hover:border-gold/40"
            >
              {bandana.card ? (
                <Image
                  src={asset(bandana.card)}
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="h-16 w-16 shrink-0 rounded-lg border border-dashed border-bone/20" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-bone">
                  Add the matching bandana
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-faded">
                  Same {product.name.toLowerCase()} {isStencil ? "stencil" : "leaf"}, made for a dog
                  or a back pocket. {fmtPrice(bandana.priceCents)} on its own —{" "}
                  <span className="text-goldlight">
                    {fmtPrice(SET_PRICE_CENTS)} for the pair
                  </span>
                  .
                </span>
              </span>
            </Link>
          )}

          <ul className="mt-8 space-y-2.5 border-t border-bone/10 pt-6 text-sm text-faded">
            {isBandana ? (
              <>
                <li>· 100% cotton, about 22 inches square — pick your color above</li>
                <li>
                  · One size, folded to fit: a small dog&apos;s collar, a big dog&apos;s neck, your
                  hair, your back pocket
                </li>
                <li>· Any design from the lineup, bleached the same way as the shirts</li>
                <li>
                  · {fmtPrice(product.priceCents)} on its own, or {fmtPrice(SET_PRICE_CENTS)} with any
                  shirt — the cart takes it off automatically
                </li>
                <li>· Wash cold, hang dry. Bleach fully neutralized before it ships.</li>
              </>
            ) : (
              <>
                <li>· Heavyweight ring spun cotton, soft with a relaxed fit — seventeen blank colors, pick yours above</li>
                <li>· Bleach fully neutralized and washed before shipping</li>
                <li>· Wash cold, inside out. Hang dry or tumble low.</li>
                <li>
                  · One of one —{" "}
                  {isStencil
                    ? "even from the same stencil, the burn lands differently on every shirt"
                    : "leaf placement and burn vary shirt to shirt"}
                </li>
              </>
            )}
          </ul>

          <div className="mt-6 rounded-xl bg-black/20 p-5">
            <p className="kicker">Why bleach, not print</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-faded">
              <li>
                <strong className="text-bone">Zero feel.</strong> The design is burned into the
                fibers — no stiff plastic patch {isBandana ? "to scratch a neck" : "on your chest"}.
              </li>
              <li>
                <strong className="text-bone">Won&apos;t crack, peel, or wash out.</strong> There is
                nothing sitting on top of the fabric to come off.
              </li>
              <li>
                <strong className="text-bone">100% unique.</strong> Same {isStencil ? "stencil" : "leaf"},
                different {isBandana ? "square" : "shirt"} — the bleach reacts a little differently
                every time.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <div className="mt-20">
          <h2 className="font-display text-2xl font-semibold">
            {isBandana ? "The designs, on shirts" : "More from the lineup"}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
            {others.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
