import Image from "next/image";
import Link from "next/link";
import EventDate from "@/components/EventDate";
import { asset } from "@/lib/assets";
import { eventDateLine, postedLine, summaryOf, type NewsPost } from "@/lib/newsFormat";

export function newsImageSrc(src: string): string {
  return /^https?:\/\//.test(src) ? src : asset(src);
}

// One post in the "From the shop" list on /news
export default function NewsCard({ post }: { post: NewsPost }) {
  const isEvent = post.kind === "event" && post.startsOn;
  const meta = isEvent ? `Event · ${eventDateLine(post)}` : `News · ${postedLine(post.publishedAt)}`;
  const summary = summaryOf(post, 160);

  return (
    <Link href={`/news/${post.slug}`} className="card group flex flex-col overflow-hidden transition hover:border-gold/60">
      <div className="relative aspect-[16/10] overflow-hidden bg-inkdeep">
        {post.imageUrl ? (
          <Image
            src={newsImageSrc(post.imageUrl)}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition duration-700 group-hover:scale-[1.03]"
          />
        ) : isEvent ? (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(207,148,64,0.18),transparent_60%)]">
            <EventDate startsOn={post.startsOn} endsOn={post.endsOn} className="w-28 rounded-2xl" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(207,148,64,0.18),transparent_60%)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("/images/fern-mark.svg")} alt="" width={500} height={760} className="h-3/4 w-auto rotate-12 opacity-25" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">{meta}</p>
        <h3 className="mt-2 font-display text-xl font-semibold leading-snug">{post.title}</h3>
        {summary && <p className="mt-2 flex-1 text-sm leading-relaxed text-faded">{summary}</p>}
        <span className="mt-4 text-sm font-semibold text-goldlight transition group-hover:translate-x-0.5">
          Read it →
        </span>
      </div>
    </Link>
  );
}
