import Link from "next/link";
import Image from "next/image";
import { fmtPrice, type Product } from "@/lib/products";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/shop/${product.slug}`}
      className="card group block overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-gold/40"
    >
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={product.card}
          alt={`${product.name} bleach design shirt`}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        {product.badge && (
          <span className="absolute left-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-inkdeep">
            {product.badge}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-xl font-semibold">{product.name}</h3>
          <span className="font-semibold text-goldlight">{fmtPrice(product.priceCents)}</span>
        </div>
        <p className="mt-0.5 text-xs italic text-faded">{product.species}</p>
        <p className="mt-2 text-sm leading-relaxed text-faded">{product.blurb}</p>
      </div>
    </Link>
  );
}
