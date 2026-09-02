import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it's made + care",
  description:
    "The reverse-bleach process behind Dyeing By Design — real leaves and hand-cut stencils — plus how to care for your one of a kind shirt.",
};

const FAQ = [
  {
    q: "Will mine look exactly like the photo?",
    a: "No, and that's the point. Leaf placement, spray density, and the amber tone vary from shirt to shirt — even two shirts cut from the same stencil come out with their own contrast and burn. Yours is the only one like it.",
  },
  {
    q: "Why bleach instead of screen printing?",
    a: "Zero feel — the design is burned into the fibers, so there's no stiff plastic layer on your chest. It's indestructible — nothing sits on top of the fabric to crack, peel, or wash out. And it's 100% unique — even with the same stencil, the bleach reacts a little differently every time.",
  },
  {
    q: "Can you do my logo?",
    a: "Yes. Send us a clean, high-contrast version (vector — SVG or PDF — is ideal) through the custom request page. We cut the stencil by hand, heat-seal it for sharp edges, and quote each piece individually.",
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
        A leaf or a blade does the design. We hold the sprayer.
      </h1>

      <div className="mt-8 space-y-5 text-base leading-relaxed text-faded">
        <p>
          Every Dyeing By Design shirt is reverse-bleach art: instead of adding ink to
          the fabric, we take color away from everything around the design. It starts
          one of two ways. For the botanical line, a walk in the Maine woods — we gather
          real leaves, staghorn sumac, sugar maple, red oak, ostrich fern, and carry them
          back while they still lie flat. For the graphic and stencil line, a clean
          vector design, cut into a stencil by hand.
        </p>
        <p>
          Everything gets arranged on a heavyweight cotton tee. Stencils are heat-sealed
          so the edges stay sharp; leaves are laid flat so their shadows come out soft
          and organic. Then comes the part you can&apos;t fake: a slow, even mist of
          bleach over the whole layout. The exposed fabric burns from black to that deep
          amber gold. Underneath the leaf or the stencil, the cotton keeps its color.
          When it lifts away, its shadow stays behind — every vein of pressure, every
          crisp cut edge, every stray fleck of spray.
        </p>
        <p>
          We neutralize the bleach, wash and dry the shirt, and check the print. What
          ships to you is burned into the fibers — permanent, soft, and impossible to
          repeat. It will never crack, peel, or fade, because there is nothing on top of
          the fabric to come off. We could not make two identical shirts if we tried.
          We&apos;ve tried.
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
          Shop the lineup
        </Link>
      </div>
    </div>
  );
}
