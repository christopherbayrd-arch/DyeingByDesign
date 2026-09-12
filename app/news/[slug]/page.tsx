import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import EventDetails from "@/components/EventDetails";
import NewsBody from "@/components/NewsBody";
import SignupForm from "@/components/SignupForm";
import ShareButton from "@/components/ShareButton";
import JsonLd from "@/components/JsonLd";
import { newsImageSrc } from "@/components/NewsCard";
import { getPublishedPost } from "@/lib/news";
import { eventPhase, postedLine, summaryOf } from "@/lib/newsFormat";
import { absoluteImage, articleJsonLd, eventJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// Re-checked every 60 seconds (and right away when you save in /admin/news)
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return {};
  const description = summaryOf(post);
  return {
    title: post.title,
    description,
    alternates: { canonical: `/news/${post.slug}` },
    openGraph: {
      type: "article",
      title: `${post.title} · Dyeing By Design (DBD)`,
      description,
      images: [absoluteImage(post.imageUrl || "/images/design-sumac.jpg")],
    },
  };
}

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const pageUrl = `${SITE_URL}/news/${post.slug}`;
  const isEvent = post.kind === "event" && Boolean(post.startsOn);
  const over = isEvent && eventPhase(post) === "over";
  const kicker = isEvent ? (over ? "Past event" : "Come see us in person") : `News · ${postedLine(post.publishedAt)}`;

  const photo = post.imageUrl ? (
    <div className="card relative mt-8 aspect-[4/3] overflow-hidden">
      <Image
        src={newsImageSrc(post.imageUrl)}
        alt={post.title}
        fill
        sizes="(max-width: 768px) 100vw, 60vw"
        className="object-cover"
        priority
      />
    </div>
  ) : null;

  const outro = (
    <>
      <div className="card mt-12 p-6 sm:p-8">
        <p className="kicker">{isEvent && !over ? "Can't make it?" : "In the meantime"}</p>
        <p className="mt-2 font-display text-2xl font-semibold leading-snug">
          Everything&apos;s on the site, made to order.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/shop" className="btn btn-gold">
            Shop the lineup
          </Link>
          <Link href="/custom" className="btn btn-ghost">
            Start a custom design
          </Link>
        </div>
      </div>
      <div className="mt-10 max-w-md">
        <p className="kicker">Hear about the next one first</p>
        <div className="@container mt-3">
          <SignupForm />
        </div>
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10">
      <JsonLd data={isEvent ? eventJsonLd(post) : articleJsonLd(post)} />
      <nav className="text-xs text-faded">
        <Link href="/news" className="transition hover:text-goldlight">
          ← News &amp; events
        </Link>
      </nav>

      {isEvent ? (
        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_320px] md:gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="min-w-0">
            <p className="kicker">{kicker}</p>
            <h1 className="mt-2 font-display text-4xl font-semibold leading-tight sm:text-5xl">{post.title}</h1>
            {post.summary && <p className="mt-4 text-lg leading-relaxed text-bone/85">{post.summary}</p>}
            {/* phones: the details right under the title */}
            <div className="mt-8 md:hidden">
              <EventDetails post={post} pageUrl={pageUrl} />
            </div>
            {photo}
            <div className="mt-8">
              <NewsBody body={post.body} />
            </div>
            {outro}
          </article>
          <aside className="hidden md:sticky md:top-24 md:block md:self-start">
            <EventDetails post={post} pageUrl={pageUrl} />
          </aside>
        </div>
      ) : (
        <article className="mx-auto mt-6 max-w-3xl">
          <p className="kicker">{kicker}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight sm:text-5xl">{post.title}</h1>
          {post.summary && <p className="mt-4 text-lg leading-relaxed text-bone/85">{post.summary}</p>}
          {photo}
          <div className="mt-8">
            <NewsBody body={post.body} />
          </div>
          <ShareButton
            url={pageUrl}
            title={post.title}
            label="Share this post"
            className="btn btn-ghost mt-8 px-5 py-2.5 text-sm"
          />
          {outro}
        </article>
      )}
    </div>
  );
}
