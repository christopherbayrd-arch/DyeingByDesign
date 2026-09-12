import EventDate from "@/components/EventDate";
import ShareButton from "@/components/ShareButton";
import {
  countdown,
  directionsUrl,
  eventDateLine,
  eventPhase,
  eventTimeLine,
  fullAddress,
  googleCalendarUrl,
  type NewsPost,
} from "@/lib/newsFormat";

// The "when / where / booth" card on an event page, with the buttons
// people actually need: add it to a calendar, get directions, share it.
export default function EventDetails({ post, pageUrl }: { post: NewsPost; pageUrl: string }) {
  const phase = eventPhase(post);
  const over = phase === "over";
  const chip = countdown(post);
  const hours = eventTimeLine(post);
  const address = fullAddress(post);
  const directions = directionsUrl(post);
  const gcal = googleCalendarUrl(post, pageUrl);
  const link =
    "flex min-h-11 items-center justify-between gap-3 border-t border-bone/10 px-5 py-3 text-sm font-medium text-bone transition hover:text-goldlight";

  return (
    <div className="card overflow-hidden">
      <div className="flex">
        <EventDate startsOn={post.startsOn} endsOn={post.endsOn} className="w-24 shrink-0" />
        <div className="min-w-0 flex-1 p-5">
          {chip && (
            <span
              className={
                "inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold " +
                (over ? "border border-bone/25 text-faded" : "bg-gold text-inkdeep")
              }
            >
              {chip}
            </span>
          )}
          <p className="mt-2 font-display text-lg font-semibold leading-snug">{eventDateLine(post)}</p>
          {hours && <p className="text-sm text-faded">{hours}</p>}
        </div>
      </div>

      <dl className="space-y-3 border-t border-bone/10 px-5 py-4 text-sm">
        {address && (
          <div>
            <dt className="kicker text-[0.65rem]">Where</dt>
            <dd className="mt-0.5 leading-relaxed text-bone">{address}</dd>
          </div>
        )}
        {post.booth && (
          <div>
            <dt className="kicker text-[0.65rem]">Find us at</dt>
            <dd className="mt-0.5 font-display text-xl font-semibold text-goldlight">{post.booth}</dd>
          </div>
        )}
      </dl>

      {over ? (
        <p className="border-t border-bone/10 px-5 py-4 text-sm leading-relaxed text-faded">
          This one&apos;s wrapped up. Thanks to everyone who came by.
        </p>
      ) : (
        <div>
          {gcal && (
            <a href={gcal} target="_blank" rel="noopener noreferrer" className={link}>
              Add to Google Calendar <span aria-hidden="true">↗</span>
            </a>
          )}
          <a href={`/news/${post.slug}/calendar.ics`} className={link}>
            Add to Apple or Outlook calendar <span aria-hidden="true">+</span>
          </a>
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer" className={link}>
              Directions <span aria-hidden="true">↗</span>
            </a>
          )}
          {post.eventUrl && (
            <a href={post.eventUrl} target="_blank" rel="noopener noreferrer" className={link}>
              The fair&apos;s website <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
      <ShareButton
        url={pageUrl}
        title={post.title}
        label="Share this with a friend"
        className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-bone/10 px-5 py-3 text-left text-sm font-medium text-bone transition hover:text-goldlight"
      />
    </div>
  );
}
