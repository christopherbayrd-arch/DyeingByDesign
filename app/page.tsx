import Image from "next/image";
import Link from "next/link";
import Lineup from "@/components/Lineup";
import SignupForm from "@/components/SignupForm";
import { getProducts } from "@/lib/catalog";

// Product grid refreshes from the database every 60 seconds
export const revalidate = 60;

export default async function HomePage() {
  const products = await getProducts();
  return (
    <>
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden">
        <Image
          src="/images/hero-texture.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-inkdeep/80 via-ink/70 to-ink" />
        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-24 sm:pb-32 sm:pt-32">
          <p className="kicker rise">Hand bleached reverse art · Made in Maine</p>
          <h1 className="rise rise-1 mt-4 max-w-2xl font-display text-5xl font-semibold leading-[1.05] sm:text-7xl">
            One of a kind.
            <br />
            <span className="text-goldlight">By design.</span>
          </h1>
          <p className="rise rise-2 mt-6 max-w-xl text-lg leading-relaxed text-bone/90">
            Real botanicals, custom stencils, and hand-cut graphics on heavyweight cotton.
            Bleached by hand — never printed, never duplicated.
          </p>
          <div className="rise rise-3 mt-9 flex flex-wrap gap-3">
            <Link href="/shop" className="btn btn-gold">
              Shop the lineup
            </Link>
            <Link href="/custom" className="btn btn-ghost">
              Start a custom design
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- LINEUP ---------- */}
      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker">The lineup</p>
            <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
              Botanicals &amp; stencils. One-of-a-kind art on heavyweight cotton.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-faded">
            Flat $5 shipping anywhere in the US. Made to order, one shirt at a time.
          </p>
        </div>
        <div className="mt-10">
          <Lineup products={products} columns={4} compact />
        </div>
      </section>

      {/* ---------- PROCESS ---------- */}
      <section className="mx-auto max-w-6xl px-5 pt-24">
        <div className="card overflow-hidden md:grid md:grid-cols-2">
          <div className="relative aspect-[4/3] md:aspect-auto">
            <Image
              src="/images/detail.jpg"
              alt="Close up of a bleached sumac shirt"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="p-8 sm:p-10">
            <p className="kicker">How it&apos;s made</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">
              A leaf or a blade. Then the bleach.
            </h2>
            <ol className="mt-6 space-y-5 text-sm leading-relaxed text-faded">
              <li className="flex gap-4">
                <span className="font-display text-2xl font-semibold text-goldlight">1</span>
                <span>
                  <strong className="text-bone">Draft and gather.</strong> We pick real
                  leaves from the Maine woods — sumac, maple, oak, fern — or cut a custom
                  stencil by hand from a clean vector design.
                </span>
              </li>
              <li className="flex gap-4">
                <span className="font-display text-2xl font-semibold text-goldlight">2</span>
                <span>
                  <strong className="text-bone">Lay, seal, and spray.</strong> Everything is
                  arranged on a heavyweight cotton tee — stencils heat-sealed for crisp
                  edges, leaves laid flat for soft organic shadows — then carefully misted
                  with bleach. The fabric burns to amber; the design keeps its ground.
                </span>
              </li>
              <li className="flex gap-4">
                <span className="font-display text-2xl font-semibold text-goldlight">3</span>
                <span>
                  <strong className="text-bone">Fix, wash, and wear.</strong> The bleach is
                  neutralized, the shirt washed and dried. What&apos;s left is burned into
                  the fibers — permanent, soft, and yours alone. It will never crack,
                  peel, or fade.
                </span>
              </li>
            </ol>
            <Link href="/about" className="btn btn-ghost mt-8">
              The full story + care
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- CUSTOM CALLOUT ---------- */}
      <section className="mx-auto max-w-6xl px-5 pt-24">
        <div className="card relative overflow-hidden p-8 text-center sm:p-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/fern.svg"
            alt=""
            width={340}
            height={340}
            className="pointer-events-none absolute -right-16 -top-16 opacity-[0.1]"
          />
          <p className="kicker">1-of-1 custom orders</p>
          <h2 className="mx-auto mt-2 max-w-xl font-display text-3xl font-semibold sm:text-4xl">
            Have a concept, logo, or local leaf in mind?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-faded sm:text-base">
            A stencil of your business logo. A favorite graphic. The maple at the family
            camp, or leaves from the yard you grew up in. Send us your leaves, logos, or
            design ideas and we&apos;ll build the stencil or lay the flora for a piece
            that&apos;s strictly yours.
          </p>
          <Link href="/custom" className="btn btn-gold mt-7">
            Start a custom design
          </Link>
        </div>
      </section>

      {/* ---------- THE MAKER ---------- */}
      <section className="mx-auto max-w-6xl px-5 pt-24">
        <div className="card flex flex-col items-center gap-7 p-8 sm:flex-row sm:p-10">
          <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-full border-2 border-gold/50 sm:h-44 sm:w-44">
            <Image
              src="/images/artist-square.jpg"
              alt="The artist behind Dyeing By Design"
              fill
              sizes="176px"
              className="object-cover"
            />
          </div>
          <div className="text-center sm:text-left">
            <p className="kicker">The maker</p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
              One artist. Two hands. Every shirt.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-faded sm:mx-0">
              Born and raised in Brunswick, Maine — working since the paper route days,
              now turning bleach, blades, and a lifetime of drive into wearable one of ones.
            </p>
            <Link href="/artist" className="btn btn-ghost mt-5">
              Meet the artist
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- DROPS ---------- */}
      <section className="mx-auto max-w-3xl px-5 pt-24 text-center">
        <p className="kicker">Limited drops</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">
          Small batches. Numbered. Gone.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-faded">
          A few times a year we run a numbered batch — different blanks, seasonal leaves,
          new stencil cuts, new colorways. They don&apos;t last. Get on the list and you&apos;ll hear
          first.
        </p>
        <div className="mx-auto mt-6 max-w-md">
          <SignupForm />
        </div>
      </section>
    </>
  );
}
