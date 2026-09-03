import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import InstagramLink from "@/components/InstagramLink";
import { asset } from "@/lib/assets";
import { INSTAGRAM_HANDLE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Meet the artist",
  description:
    "Born and raised in Brunswick, Maine — the artist behind Dyeing By Design hand crafts every tie dye and bleach reverse piece with genuine heart and a bit of edge.",
};

export default function ArtistPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Meet the artist</p>
      <h1 className="mt-2 max-w-2xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
        The hands behind every shirt.
      </h1>

      <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 lg:grid-cols-[420px_1fr]">
        {/* photo */}
        <div>
          <div className="card relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden md:sticky md:top-24 md:max-w-none">
            <Image
              src={asset("/images/artist.jpg")}
              alt="The artist behind Dyeing By Design, out on the water in Maine"
              fill
              priority
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 420px"
              className="object-cover"
            />
            <span className="absolute bottom-3 left-3 rounded-full bg-inkdeep/80 px-3 py-1.5 text-[0.7rem] font-medium text-bone/90 backdrop-blur">
              Somewhere off the Maine coast
            </span>
          </div>
        </div>

        {/* bio */}
        <div className="max-w-2xl">
          <div className="space-y-5 text-base leading-relaxed text-faded">
            <p>
              Born and raised in Brunswick, Maine, I&apos;ve been working since I was ten
              years old — first as the neighborhood paper boy, then officially the day my
              worker&apos;s permit came through at fifteen. That same work ethic goes
              straight into the studio today, where I hand craft custom tie dye and
              bleach reverse apparel: bold colors, sharp contrast, one of a kind every
              single time.
            </p>
            <p>
              At my core, I have a deep love for animals, nature, and the local community
              around me. When I&apos;m not in the studio up to my elbows in dye and
              bleach, I&apos;m usually outdoors in the Maine woods and waters — fishing,
              cruising on my e-bike, or tinkering with a tech project.
            </p>
            <p>
              The focus, empathy, and drive I&apos;ve built over a lifetime — caring for
              animals, connecting with people, dialing in a build — goes into every shirt
              I make.
            </p>
          </div>

          <blockquote className="mt-8 border-l-2 border-gold pl-5">
            <p className="font-display text-2xl font-medium leading-snug text-bone">
              &ldquo;Original, handmade style with genuine heart and a bit of edge.&rdquo;
            </p>
            <cite className="mt-2 block text-sm not-italic text-faded">
              — Corey, Dyeing By Design
            </cite>
          </blockquote>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/shop" className="btn btn-gold">
              See the designs
            </Link>
            <Link href="/custom" className="btn btn-ghost">
              Request a custom
            </Link>
            <InstagramLink className="btn btn-ghost">
              Follow {INSTAGRAM_HANDLE} <span aria-hidden="true">↗</span>
            </InstagramLink>
          </div>

          <p className="mt-8 border-t border-bone/10 pt-6 text-sm leading-relaxed text-faded">
            Every order is laid out, sprayed, neutralized, washed, and packed by the guy
            in the photo. If you have a question about your shirt, you&apos;re talking to
            the person who made it.
          </p>
        </div>
      </div>
    </div>
  );
}
