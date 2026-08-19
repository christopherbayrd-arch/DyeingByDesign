import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCart from "@/components/AddToCart";
import ProductCard from "@/components/ProductCard";
import { PRODUCTS, getProduct } from "@/lib/products";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: `${product.name} shirt`,
    description: product.blurb,
    openGraph: { images: [product.card] },
  };
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const others = PRODUCTS.filter((p) => p.slug !== product.slug);

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10">
      <nav className="text-xs text-faded">
        <Link href="/shop" className="transition hover:text-goldlight">
          ← All designs
        </Link>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="card relative aspect-[4/5] overflow-hidden lg:sticky lg:top-24">
          <Image
            src={product.image}
            alt={`${product.name} bleach design shirt`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          {product.samplePhoto && (
            <span className="absolute bottom-3 left-3 rounded-full bg-inkdeep/80 px-3 py-1.5 text-[0.7rem] font-medium text-bone/90 backdrop-blur">
              Photo shows the technique — your {product.name.toLowerCase()} print will be
              its own
            </span>
          )}
        </div>

        <div>
          <p className="kicker">{product.species}</p>
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

      <div className="mt-20">
        <h2 className="font-display text-2xl font-semibold">The other leaves</h2>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {others.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
