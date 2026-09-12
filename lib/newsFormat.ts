// ============================================================
//  News & events — the shapes, dates, and links. No database in
//  here, so the admin editor (in the browser) and the pages use the
//  exact same helpers.
//
//  Every date is Maine time: an event on "2026-10-17" means that
//  day in Brunswick, wherever the server or the phone happens to be.
// ============================================================

export type NewsKind = "news" | "event";

export type NewsPost = {
  id: number;
  slug: string;
  kind: NewsKind;
  title: string;
  summary: string;
  body: string;
  imageUrl: string;
  published: boolean;
  publishedAt: string | null; // ISO, first time it went live
  startsOn: string; // event: "YYYY-MM-DD" ("" for news)
  endsOn: string; // event: last day, "" = one day
  startTime: string; // event: "09:00" or ""
  endTime: string; // event: "15:00" or ""
  venue: string;
  street: string;
  town: string;
  state: string;
  booth: string;
  eventUrl: string;
  showOnHome: boolean;
  createdAt: string;
  updatedAt: string;
};

export const SHOP_TZ = "America/New_York";

// ---------- days ----------

// Today's date in Maine as "YYYY-MM-DD"
export function todayInMaine(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// "YYYY-MM-DD" → UTC midnight of that calendar day (only used for day math)
function dayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const back = new Date(dayMs(s)).toISOString().slice(0, 10);
  return back === s; // rejects 2026-02-31
}

export function isTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / 86400000);
}

function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * 86400000).toISOString().slice(0, 10);
}

type Dated = Pick<NewsPost, "startsOn" | "endsOn">;

export function lastDay(p: Dated): string {
  return p.endsOn && p.endsOn > p.startsOn ? p.endsOn : p.startsOn;
}

export type Phase = "undated" | "upcoming" | "today" | "on" | "over";

export function eventPhase(p: Dated, today = todayInMaine()): Phase {
  if (!p.startsOn) return "undated";
  if (today < p.startsOn) return "upcoming";
  if (today > lastDay(p)) return "over";
  return today === p.startsOn ? "today" : "on";
}

function fmtDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(dayMs(day)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function weekday(day: string, style: "long" | "short" = "long"): string {
  return fmtDay(day, { weekday: style });
}

// The little chip on event cards: "In 36 days", "This Saturday", "Tomorrow", "Today"…
export function countdown(p: Dated, today = todayInMaine()): string {
  switch (eventPhase(p, today)) {
    case "undated":
      return "";
    case "over":
      return "Wrapped up";
    case "today":
      return lastDay(p) === p.startsOn ? "Today" : "Starts today";
    case "on":
      return "Happening now";
    default: {
      const n = daysBetween(today, p.startsOn);
      if (n === 1) return "Tomorrow";
      if (n <= 6) return `This ${weekday(p.startsOn)}`;
      return `In ${n} days`;
    }
  }
}

// "Saturday, October 17" · "Saturday–Sunday, October 17–18" · "Sat, Oct 31 – Sun, Nov 1"
// The year only shows when it isn't this year.
export function eventDateLine(p: Dated, today = todayInMaine()): string {
  if (!p.startsOn) return "";
  const end = lastDay(p);
  const year = p.startsOn.slice(0, 4) !== today.slice(0, 4) ? `, ${p.startsOn.slice(0, 4)}` : "";
  if (end === p.startsOn) {
    return fmtDay(p.startsOn, { weekday: "long", month: "long", day: "numeric" }) + year;
  }
  if (p.startsOn.slice(0, 7) === end.slice(0, 7)) {
    return (
      `${weekday(p.startsOn)}–${weekday(end)}, ${fmtDay(p.startsOn, { month: "long" })} ` +
      `${Number(p.startsOn.slice(8))}–${Number(end.slice(8))}${year}`
    );
  }
  const short: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  return `${fmtDay(p.startsOn, short)} – ${fmtDay(end, short)}${year}`;
}

// Parts for the big date block: { month: "Oct", day: "17", weekday: "Sat" }
export function dateBlock(day: string): { month: string; day: string; weekday: string } {
  return {
    month: fmtDay(day, { month: "short" }),
    day: String(Number(day.slice(8))),
    weekday: weekday(day, "short"),
  };
}

// "Sep 11, 2026" — the date a news post went up
export function postedLine(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone: SHOP_TZ, month: "short", day: "numeric", year: "numeric" });
}

// ---------- times ----------

// "09:00" → "9 AM", "13:30" → "1:30 PM"
export function fmtTime(t: string): string {
  if (!isTime(t)) return "";
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return mm === "00" ? `${h12} ${suffix}` : `${h12}:${mm} ${suffix}`;
}

type Timed = Pick<NewsPost, "startTime" | "endTime">;

export function eventTimeLine(p: Timed): string {
  const a = fmtTime(p.startTime);
  const b = fmtTime(p.endTime);
  if (a && b) return `${a} – ${b}`;
  if (a) return `From ${a}`;
  if (b) return `Until ${b}`;
  return "";
}

// How far Maine is from UTC at a given instant, in minutes (−240 in summer, −300 in winter)
function shopOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

// A Maine wall clock time on a Maine day → the real instant
export function shopTimeToDate(day: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const wall = dayMs(day) + (h * 60 + m) * 60000;
  let utc = wall - shopOffsetMinutes(wall) * 60000;
  utc = wall - shopOffsetMinutes(utc) * 60000; // settle the daylight saving edge
  return new Date(utc);
}

function offsetText(mins: number): string {
  const sign = mins < 0 ? "-" : "+";
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

// For search engines: "2026-10-17T09:00:00-04:00", or just the day when there's no time
export function isoWithOffset(day: string, time: string): string {
  if (!isDay(day)) return "";
  if (!isTime(time)) return day;
  const at = shopTimeToDate(day, time);
  return `${day}T${time}:00${offsetText(shopOffsetMinutes(at.getTime()))}`;
}

// ---------- places ----------

type Placed = Pick<NewsPost, "venue" | "street" | "town" | "state">;

// "Brunswick Rec Center, Brunswick"
export function placeLine(p: Placed): string {
  if (p.venue && p.town && p.venue.toLowerCase().includes(p.town.toLowerCase())) return p.venue;
  return [p.venue, p.town].filter(Boolean).join(", ");
}

// "Brunswick Rec Center, 220 Neptune Dr, Brunswick, ME"
export function fullAddress(p: Placed): string {
  return [p.venue, p.street, p.town ? `${p.town}, ${p.state || "ME"}` : ""].filter(Boolean).join(", ");
}

export function directionsUrl(p: Placed): string {
  const q = fullAddress(p);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}

// ---------- calendars ----------

type CalTimes =
  | { allDay: true; start: string; endExclusive: string }
  | { allDay: false; start: Date; end: Date };

// One day with a start time → a timed event. Several days (or no time) →
// an all-day event across the days, with the hours in the notes.
function calendarTimes(p: Dated & Timed): CalTimes {
  const end = lastDay(p);
  if (!isTime(p.startTime) || end !== p.startsOn) {
    return { allDay: true, start: p.startsOn, endExclusive: addDays(end, 1) };
  }
  const s = shopTimeToDate(p.startsOn, p.startTime);
  const e =
    isTime(p.endTime) && p.endTime > p.startTime
      ? shopTimeToDate(p.startsOn, p.endTime)
      : new Date(s.getTime() + 3 * 3600000);
  return { allDay: false, start: s, end: e };
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261017T130000Z
}

function calendarNotes(p: NewsPost, pageUrl: string): string {
  const hours = eventTimeLine(p);
  return [
    p.summary,
    lastDay(p) !== p.startsOn && hours ? `Hours: ${hours}` : "",
    p.booth ? `Find us at ${p.booth}.` : "",
    pageUrl,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function googleCalendarUrl(p: NewsPost, pageUrl: string): string {
  if (!isDay(p.startsOn)) return "";
  const t = calendarTimes(p);
  const dates = t.allDay
    ? `${t.start.replace(/-/g, "")}/${t.endExclusive.replace(/-/g, "")}`
    : `${utcStamp(t.start)}/${utcStamp(t.end)}`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${p.title} · Dyeing By Design`,
    dates,
    details: calendarNotes(p, pageUrl),
    location: fullAddress(p),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Calendar lines max out at 75 bytes; longer ones continue on the next line after a space
function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// The .ics file behind "Apple / Outlook calendar"
export function icsFor(p: NewsPost, pageUrl: string, host: string): string {
  const t = calendarTimes(p);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dyeing By Design//News//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:news-${p.id}@${host}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    ...(t.allDay
      ? [`DTSTART;VALUE=DATE:${t.start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${t.endExclusive.replace(/-/g, "")}`]
      : [`DTSTART:${utcStamp(t.start)}`, `DTEND:${utcStamp(t.end)}`]),
    `SUMMARY:${icsText(`${p.title} · Dyeing By Design`)}`,
    `LOCATION:${icsText(fullAddress(p))}`,
    `DESCRIPTION:${icsText(calendarNotes(p, pageUrl))}`,
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ---------- words ----------

export function slugify(s: string): string {
  const out = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return out || "post";
}

// Post text → blocks. A blank line starts a new paragraph; lines that
// start with "- " (or "• ") become a bulleted list.
export type Block = { type: "p"; lines: string[] } | { type: "ul"; items: string[] };

const BULLET = /^[-•*]\s+/;

export function bodyBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    let para: string[] = [];
    let items: string[] = [];
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (BULLET.test(line)) {
        if (para.length) blocks.push({ type: "p", lines: para });
        para = [];
        items.push(line.replace(BULLET, ""));
      } else {
        if (items.length) blocks.push({ type: "ul", items });
        items = [];
        para.push(line);
      }
    }
    if (para.length) blocks.push({ type: "p", lines: para });
    if (items.length) blocks.push({ type: "ul", items });
  }
  return blocks;
}

// Splits text so web addresses can be rendered as links
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)'\]]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    out.push({ text: m[0], href: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

// First couple of sentences, for when a post has no summary
export function summaryOf(p: Pick<NewsPost, "summary" | "body">, max = 180): string {
  if (p.summary.trim()) return p.summary.trim();
  const first = bodyBlocks(p.body).find((b) => b.type === "p") as { type: "p"; lines: string[] } | undefined;
  const text = (first?.lines.join(" ") ?? "").trim();
  return text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : text;
}

// "[Fair name]" style bits left over from the starter text
export function leftoverPlaceholders(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\[[^\]\n]{1,40}\]/g)) found.add(m[0]);
  return [...found];
}

// A blank post for the editor
export function blankPost(kind: NewsKind): NewsPost {
  return {
    id: 0,
    slug: "",
    kind,
    title: "",
    summary: "",
    body: "",
    imageUrl: "",
    published: false,
    publishedAt: null,
    startsOn: "",
    endsOn: "",
    startTime: "",
    endTime: "",
    venue: "",
    street: "",
    town: "",
    state: "ME",
    booth: "",
    eventUrl: "",
    showOnHome: true,
    createdAt: "",
    updatedAt: "",
  };
}

// Starter text for "New event" — the [bracketed] bits are there to be replaced,
// and the editor won't publish until they are.
export function craftFairStarter(): NewsPost {
  return {
    ...blankPost("event"),
    title: "[Fair name]",
    summary:
      "Come see the whole lineup in person at [Fair name] in [Town]. Try them on, see the colors in real light, and take one home.",
    body: [
      "We're bringing the whole lineup to [Fair name]: sumac, cedar, and fern across all nine blank colors, plus a few one of a kind pieces that will never be on the site.",
      "- Try shirts on and see the colors in real light\n- Pay at the table and take it home the same day\n- Ask about a custom design: your leaves, your logo, your idea",
    ].join("\n\n"),
    startTime: "09:00",
    endTime: "15:00",
  };
}

// Plain text version for the drop list email
export function emailDraftFor(p: NewsPost): { subject: string; headline: string; message: string } {
  if (p.kind === "event" && p.startsOn) {
    const when = eventDateLine(p);
    const where = placeLine(p);
    const facts = [
      `When: ${when}${eventTimeLine(p) ? `, ${eventTimeLine(p)}` : ""}`,
      where ? `Where: ${fullAddress(p) || where}` : "",
      p.booth ? `Find us at ${p.booth}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      subject: `Come see us at ${p.title} · ${fmtDay(p.startsOn, { weekday: "short", month: "short", day: "numeric" })}`,
      headline: `${p.title}${where ? ` · ${p.town || where}` : ""}`,
      message: [summaryOf(p), facts, p.body.replace(/^[-•*]\s+/gm, "• ")].filter(Boolean).join("\n\n"),
    };
  }
  return {
    subject: p.title,
    headline: p.title,
    message: [summaryOf(p), p.body.replace(/^[-•*]\s+/gm, "• ")].filter(Boolean).join("\n\n"),
  };
}
