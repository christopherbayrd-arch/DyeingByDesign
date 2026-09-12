import { dateBlock, lastDay } from "@/lib/newsFormat";

// The gold calendar block on event cards: OCT / 17 / SAT
export default function EventDate({
  startsOn,
  endsOn = "",
  big = false,
  className = "",
}: {
  startsOn: string;
  endsOn?: string;
  big?: boolean;
  className?: string;
}) {
  const first = dateBlock(startsOn);
  const end = lastDay({ startsOn, endsOn });
  const last = end !== startsOn ? dateBlock(end) : null;
  const sameMonth = last && last.month === first.month;

  return (
    <div
      className={"flex flex-col items-center justify-center bg-gold px-2 py-4 text-center text-inkdeep " + className}
      aria-hidden="true"
    >
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.22em]">
        {first.month}
        {last && !sameMonth ? `–${last.month}` : ""}
      </span>
      <span
        className={
          "font-display font-semibold leading-none " +
          (last ? (big ? "text-4xl" : "text-3xl sm:text-4xl") : big ? "text-6xl" : "text-4xl sm:text-5xl")
        }
      >
        {first.day}
        {last ? `–${last.day}` : ""}
      </span>
      <span className="mt-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.2em]">
        {first.weekday}
        {last ? `–${last.weekday}` : ""}
      </span>
    </div>
  );
}
