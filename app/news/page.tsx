import type { Metadata } from "next";
import Link from "next/link";
import EventCard from "@/components/EventCard";
import NewsCard from "@/components/NewsCard";
import SignupForm from "@/components/SignupForm";
import InstagramLink from "@/components/InstagramLink";
import { getPublishedPosts, splitForNewsPage } from "@/lib/news";

export const metadata: Metadata = {
  title: "News & events",
  description:
    "Where to find DBD in person — craft fairs and markets around Maine — plus new designs and news from the shop in Brunswick.",
  alternates: { canonical: "/news" },
};

// Posts are written in /admin/news; this page re-checks every 60 seconds
export const revalidate = 60;

export default async function NewsPage() {
  const { upcoming, rest } = splitForNewsPage(await getPublishedPosts());

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">News &amp; events</p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Where to find us, and what&apos;s new.
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-faded">
        Craft fairs, markets, new designs, whatever just came off the line. Come see the shirts in
        person, or get on the list and hear first.
      </p>

      {upcoming.length > 0 && (
        <section className="mt-12" aria-labelledby="coming-up">
          <h2 id="coming-up" className="kicker">
            Come find us
          </h2>
          <div className="mt-5 space-y-5">
            {upcoming.map((p) => (
              <EventCard key={p.id} post={p} kicker="Craft fair · market" headingLevel="h3" />
            ))}
          </div>
        </section>
      )}

      <section className="mt-16" aria-labelledby="from-the-shop">
        <h2 id="from-the-shop" className="kicker">
          From the shop
        </h2>
        {rest.length === 0 ? (
          <div className="card mt-5 p-8 text-center">
            <p className="font-display text-2xl font-semibold">Nothing else posted yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-faded">
              The day to day lives on <InstagramLink className="text-goldlight underline underline-offset-2" />.
              In the meantime, the <Link href="/shop" className="text-goldlight underline underline-offset-2">lineup</Link> is
              always open.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <NewsCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </section>

      <section className="card mt-16 p-8 text-center sm:p-10">
        <p className="kicker">Hear it first</p>
        <h2 className="mx-auto mt-2 max-w-lg font-display text-3xl font-semibold">
          Next fair, next drop, next design.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-faded">
          A short email when there&apos;s something worth your time. Nothing else.
        </p>
        <div className="@container mx-auto mt-6 max-w-md">
          <SignupForm />
        </div>
      </section>
    </div>
  );
}
