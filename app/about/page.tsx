import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it's made + care",
  description:
    "The bleach printing process behind Dyeing By Design, plus how to care for your one of a kind leaf shirt.",
};

const FAQ = [
  {
    q: "Will mine look exactly like the photo?",
    a: "No, and that's the point. Leaf placement, spray density, and the amber tone vary from shirt to shirt. Yours is the only one like it.",
  },
  {
    q: "How do I wash it?",
    a: "Cold water, inside out, gentle cycle. Hang dry or tumble low. The bleach is fully neutralized and rinsed before your shirt ships, so the design is permanent and won't spread.",
  },
  {
    q: "What shirts do you print on?",
    a: "Heavyweight 100% cotton tees with a true to size unisex fit. If you're between sizes, most people size up.",
  },
  {
    q: "How long until it ships?",
    a: "Each shirt is made after you order. Allow 5 to 7 days of making time, then US shipping with tracking. Flat $5 per order.",
  },
  {
    q: "Returns?",
    a: "Every shirt is one of a kind, so instead of returns we do size exchanges — reach out within 14 days of delivery and we'll sort it out.",
  },
  {
    q: "Do you ship outside the US?",
    a: "Not yet. If you're international and really want one, send a custom request and we'll figure something out.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 pt-14">
      <p className="kicker">The process</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
        Nature does the design. We just hold the sprayer.
      </h1>

      <div className="mt-8 space-y-5 text-base leading-relaxed text-faded">
        <p>
          Every Dyeing By Design shirt starts with a walk in the Maine woods. We gather
          real leaves — staghorn sumac, sugar maple, red oak, ostrich fern — and carry
          them back to the shop while they still lie flat.
        </p>
        <p>
          Each leaf gets arranged by hand on a heavyweight cotton tee. Then comes the
          part you can&apos;t fake: a slow, even mist of bleach over the whole layout.
          The exposed fabric burns from black to that deep amber gold. Underneath the
          leaf, the cotton keeps its color. When the leaf lifts away, its shadow stays
          behind — every vein of pressure, every curl of the edge, every stray fleck of
          spray.
        </p>
        <p>
          We neutralize the bleach, wash and dry the shirt, and check the print. What
          ships to you is permanent, soft, and impossible to repeat. We could not make
          two identical shirts if we tried. We&apos;ve tried.
        </p>
      </div>

      <div className="card relative mt-10 aspect-[16/9] overflow-hidden">
        <Image
          src="/images/hero-texture.jpg"
          alt="Bleached sumac fronds on black cotton"
          fill
          sizes="(max-width: 896px) 100vw, 896px"
          className="object-cover"
        />
      </div>

      <h2 className="mt-16 font-display text-3xl font-semibold">Good to know</h2>
      <div className="mt-6 space-y-4">
        {FAQ.map((item) => (
          <div key={item.q} className="card p-5">
            <p className="font-semibold text-bone">{item.q}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-faded">{item.a}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 text-center">
        <Link href="/shop" className="btn btn-gold">
          Find your leaf
        </Link>
      </div>
    </div>
  );
}
