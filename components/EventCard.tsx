import Link from "next/link";
import EventDate from "@/components/EventDate";
import {
  countdown,
  eventDateLine,
  eventTimeLine,
  placeLine,
  summaryOf,
  type NewsPost,
} from "@/lib/newsFormat";

const SOON = new Set(["Today", "Starts today", "Happening now", "Tomorrow"]);

// A wide event card: date block, countdown, what/when/where. Used on the
// home page (the "come see us" card) and at the top of /news.
export default function EventCard({
  post,
  kicker = "Come see us in person",
  headingLevel = "h2",
}: {
  post: NewsPost;
  kicker?: string;
  headingLevel?: "h2" | "h3";
}) {
  const chip = countdown(post);
  // the hours and booth never break in the middle ("9 AM – 3 / PM"); the rest can wrap
  const facts = [
    { text: eventDateLine(post), keep: false },
    { text: eventTimeLine(post), keep: true },
    { text: placeLine(post), keep: false },
    { text: post.booth, keep: true },
  ].filter((f) => f.text);
  const summary = summaryOf(post);
  const Heading = headingLevel;

  return (
    <Link
      href={`/news/${post.slug}`}
      className="card group flex overflow-hidden transition hover:border-gold/60"
    >
      <EventDate startsOn={post.startsOn} endsOn={post.endsOn} className="w-24 shrink-0 sm:w-32" />
      <div className="min-w-0 flex-1 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="kicker">{kicker}</p>
          {chip && (
            <span
              className={
                "rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold " +
                (SOON.has(chip) ? "bg-gold text-inkdeep" : "border border-gold/50 text-goldlight")
              }
            >
              {chip}
            </span>
          )}
        </div>
        <Heading className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">
          {post.title}
        </Heading>
        <p className="mt-1.5 text-sm leading-relaxed text-faded">
          {facts.map((f, i) => (
            <span key={i}>
              {i > 0 && " · "}
              <span className={f.keep ? "whitespace-nowrap" : ""}>{f.text}</span>
            </span>
          ))}
        </p>
        {summary && (
          <p className="mt-3 hidden max-w-2xl text-sm leading-relaxed text-bone/85 sm:block">{summary}</p>
        )}
        <span className="mt-3 inline-block text-sm font-semibold text-goldlight transition group-hover:translate-x-0.5 md:hidden">
          Details →
        </span>
      </div>
      <span className="hidden shrink-0 items-center pr-7 text-sm font-semibold text-goldlight transition group-hover:translate-x-0.5 md:flex">
        Details →
      </span>
    </Link>
  );
}
