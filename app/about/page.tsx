import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { asset } from "@/lib/assets";
import { faqJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "How it's made + care",
  description:
    "The reverse-bleach process behind Dyeing By Design (DBD) — real leaves and hand-cut stencils — plus how to care for your one of a kind shirt.",
  alternates: { canonical: "/about" },
};

const FAQ = [
  {
    q: "What's DBD?",
    a: "Us. DBD is short for Dyeing By Design — it's the mark on the shirts and how most people around Brunswick, Maine say it. If you're searching, \"DBD shirts Maine\" or \"Dyeing By Design\" both land here: dyeingbydesign.com, or @dyeingbydesign on Instagram.",
  },
  {
    q: "Will mine look exactly like the photo?",
    a: "No, and that's the point. Leaf placement, spray density, and how far the burn goes vary from shirt to shirt — even two shirts cut from the same stencil come out with their own contrast and tone. Yours is the only one like it.",
  },
  {
    q: "Why bleach instead of screen printing?",
    a: "Zero feel — the design is burned into the fibers, so there's no stiff plastic layer on your chest. It's indestructible — nothing sits on top of the fabric to crack, peel, or wash out. And it's 100% unique — even with the same stencil, the bleach reacts a little differently every time.",
  },
  {
    q: "Can you do my logo?",
    a: "Yes. Send us a clean, high-contrast version (vector — SVG or PDF — is ideal) through the custom request page. We cut the stencil by hand and quote each piece individually.",
  },
  {
    q: "How do I wash it?",
    a: "Cold water, inside out, gentle cycle. Hang dry or tumble low. The bleach is fully neutralized and rinsed before your shirt ships, so the design is permanent and won't spread.",
  },
  {
    q: "What shirts do you print on?",
    a: "Heavyweight 100% cotton tees with a true to size unisex fit, in nine blank colors: black, antique cherry red, azalea, daisy, electric green, forest green, sky blue, royal blue, and purple. The bleach burns each color differently — black goes gold, reds go peach, greens go tan, blues go pale, and the lighter blanks go softer still — so the same design reads differently on every shirt. If you're between sizes, most people size up.",
  },
  {
    q: "How do I pay?",
    a: "Add what you want to your cart. Shirts we have counted and ready go straight to a secure card checkout (card, Apple Pay, Google Pay). Made to order shirts and custom pieces go in as an order request — send it with your shipping address and we reply within a day with a secure payment link and a ship date. Nothing is charged until you pay.",
  },
  {
    q: "How long until it ships?",
    a: "Each shirt is made after your order is paid. Allow 1 to 2 weeks of making time depending on how many orders are ahead of you, then US shipping with tracking. $7 flat rate per order.",
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
      <JsonLd data={faqJsonLd(FAQ)} />
      <p className="kicker">The process</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
        A leaf or a blade does the design. We hold the sprayer.
      </h1>

      <div className="mt-8 space-y-5 text-base leading-relaxed text-faded">
        <p>
          Every Dyeing By Design shirt is reverse-bleach art: instead of adding ink to
          the fabric, we take color away from everything around the design. It starts
          one of two ways. For the botanical line, a walk in the Maine woods — we gather
          real leaves, staghorn sumac, northern white cedar, ostrich fern, whatever the season drops, and carry
          them back while they still lie flat. For the graphic and stencil line, a clean
          vector design, cut into a stencil by hand.
        </p>
        <p>
          Everything gets arranged on a heavyweight cotton tee. Stencils are held flat
          so the edges stay sharp; leaves are laid flat so their shadows come out soft
          and organic. Then comes the part you can&apos;t fake: a slow, even mist of
          bleach over the whole layout. The exposed fabric lightens — every blank burns
          to its own tone, black to gold, red to peach, blue to pale. Underneath the leaf
          or the stencil, the cotton keeps its color.
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
          src={asset("/images/hero-texture.jpg")}
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
