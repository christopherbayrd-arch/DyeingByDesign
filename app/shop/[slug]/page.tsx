import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCart from "@/components/AddToCart";
import ProductCard from "@/components/ProductCard";
import { getProduct, getProducts } from "@/lib/catalog";

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
  return {
    title: `${product.name} shirt`,
    description: product.blurb,
    openGraph: { images: product.card ? [product.card] : [] },
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

  const others = (await getProducts()).filter((p) => p.slug !== product.slug).slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10">
      <nav className="text-xs text-faded">
        <Link href="/shop" className="transition hover:text-goldlight">
          ← All designs
        </Link>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="card relative aspect-[4/5] overflow-hidden lg:sticky lg:top-24">
          {product.image ? (
            <Image
              src={product.image}
              alt={`${product.name} bleach design shirt`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-faded">
              photo coming soon
            </div>
          )}
          {product.samplePhoto && (
            <span className="absolute bottom-3 left-3 rounded-full bg-inkdeep/80 px-3 py-1.5 text-[0.7rem] font-medium text-bone/90 backdrop-blur">
              Photo shows the technique — your {product.name.toLowerCase()} print will be
              its own
            </span>
          )}
        </div>

        <div>
          {product.species && <p className="kicker">{product.species}</p>}
          <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-faded">{product.story}</p>

          <div className="mt-8 border-t border-bone/10 pt-8">
            <AddToCart product={product} />
          </div>

          <ul className="mt-8 space-y-2.5 border-t border-bone/10 pt-6 text-sm text-faded">
            <li>· Heavyweight 100% cotton tee, unisex fit</li>
            <li>· Bleach fully neutralized and washed before shipping</li>
            <li>· Wash cold, inside out. Hang dry or tumble low.</li>
            <li>· One of one — leaf placement and burn vary shirt to shirt</li>
          </ul>
        </div>
      </div>

      {others.length > 0 && (
        <div className="mt-20">
          <h2 className="font-display text-2xl font-semibold">The other leaves</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {others.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
