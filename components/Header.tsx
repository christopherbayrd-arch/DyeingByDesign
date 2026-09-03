"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/CartContext";
import InstagramLink from "@/components/InstagramLink";
import { asset } from "@/lib/assets";
import { INSTAGRAM_HANDLE } from "@/lib/site";

const NAV = [
  { href: "/shop", label: "The lineup" },
  { href: "/custom", label: "Custom" },
  { href: "/about", label: "Process" },
  { href: "/artist", label: "Artist" },
];

export default function Header() {
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the phone menu whenever the page changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const cart = (
    <Link
      href="/cart"
      className="relative flex min-h-10 items-center gap-1.5 rounded-full border border-bone/25 px-3.5 py-1.5 text-sm font-medium text-bone transition hover:border-gold hover:text-goldlight"
    >
      Cart
      {ready && count > 0 && (
        <span className="rounded-full bg-gold px-1.5 py-0.5 text-[0.7rem] font-bold leading-none text-inkdeep">
          {count}
        </span>
      )}
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-bone/10 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2.5 sm:gap-6 sm:py-3.5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset("/images/logo-mark.png")}
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 rounded-full sm:h-10 sm:w-10"
          />
          <span className="truncate font-display text-base font-semibold tracking-wide sm:text-lg">
            Dyeing By Design
          </span>
        </Link>

        {/* iPad + desktop: everything inline */}
        <nav className="ml-auto hidden items-center gap-5 text-sm font-medium text-faded md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition hover:text-goldlight">
              {n.label}
            </Link>
          ))}
          <InstagramLink className="transition hover:text-goldlight" />
          {cart}
        </nav>

        {/* phone: cart stays visible, the rest folds into a menu */}
        <div className="ml-auto flex items-center gap-1.5 md:hidden">
          {cart}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-bone transition hover:text-goldlight"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      <div id="mobile-nav" hidden={!open} className="border-t border-bone/10 bg-ink/95 md:hidden">
        <nav className="mx-auto flex max-w-6xl flex-col px-5 py-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="border-b border-bone/10 py-3.5 text-base font-medium text-bone transition hover:text-goldlight"
            >
              {n.label}
            </Link>
          ))}
          <InstagramLink
            className="flex items-baseline gap-2 py-3.5 text-base font-medium text-bone transition hover:text-goldlight"
            onClick={() => setOpen(false)}
          >
            Instagram
            <span className="text-sm text-faded">{INSTAGRAM_HANDLE}</span>
          </InstagramLink>
        </nav>
      </div>
    </header>
  );
}
