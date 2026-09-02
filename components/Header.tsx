"use client";

import Link from "next/link";
import { useCart } from "@/components/CartContext";

export default function Header() {
  const { count, ready } = useCart();

  return (
    <header className="sticky top-0 z-50 border-b border-bone/10 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mark.png" alt="" width={40} height={40} className="rounded-full" />
          <span className="font-display text-lg font-semibold tracking-wide">
            Dyeing By Design
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-5 text-sm font-medium text-faded">
          <Link href="/shop" className="transition hover:text-goldlight">
            The lineup
          </Link>
          <Link href="/custom" className="transition hover:text-goldlight">
            Custom
          </Link>
          <Link href="/about" className="transition hover:text-goldlight">
            Process
          </Link>
          <Link href="/artist" className="transition hover:text-goldlight">
            Artist
          </Link>
          <Link
            href="/cart"
            className="relative flex items-center gap-1.5 rounded-full border border-bone/25 px-3.5 py-1.5 text-bone transition hover:border-gold hover:text-goldlight"
          >
            Cart
            {ready && count > 0 && (
              <span className="rounded-full bg-gold px-1.5 py-0.5 text-[0.7rem] font-bold leading-none text-inkdeep">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
