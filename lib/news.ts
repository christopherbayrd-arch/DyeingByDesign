// News & events from the database (server only). Every public read is
// wrapped so a missing table (schema.sql not re-run yet) or a sleeping
// database just means "no news" instead of a broken home page.
import { getDb } from "@/lib/db";
import { eventPhase, lastDay, todayInMaine, type NewsPost } from "@/lib/newsFormat";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Dates are selected with to_char(...) so they always arrive as "YYYY-MM-DD"
// text, never as a Date that could slip a day in another time zone.
export function rowToPost(r: Row): NewsPost {
  return {
    id: Number(r.id),
    slug: str(r.slug),
    kind: r.kind === "event" ? "event" : "news",
    title: str(r.title),
    summary: str(r.summary),
    body: str(r.body),
    imageUrl: str(r.image_url),
    published: Boolean(r.published),
    publishedAt: iso(r.published_at),
    startsOn: str(r.starts_on_s),
    endsOn: str(r.ends_on_s),
    startTime: str(r.start_time),
    endTime: str(r.end_time),
    venue: str(r.venue),
    street: str(r.street),
    town: str(r.town),
    state: str(r.state) || "ME",
    booth: str(r.booth),
    eventUrl: str(r.event_url),
    showOnHome: r.show_on_home === undefined ? true : Boolean(r.show_on_home),
    createdAt: iso(r.created_at) ?? "",
    updatedAt: iso(r.updated_at) ?? "",
  };
}

export async function loadAllPosts(sql: Sql): Promise<NewsPost[]> {
  const rows = (await sql`
    select *, to_char(starts_on, 'YYYY-MM-DD') as starts_on_s, to_char(ends_on, 'YYYY-MM-DD') as ends_on_s
    from news_posts
    order by coalesce(starts_on, (published_at at time zone 'America/New_York')::date, created_at::date) desc, id desc
    limit 500
  `) as Row[];
  return rows.map(rowToPost);
}

export async function loadPostById(sql: Sql, id: number): Promise<NewsPost | null> {
  const rows = (await sql`
    select *, to_char(starts_on, 'YYYY-MM-DD') as starts_on_s, to_char(ends_on, 'YYYY-MM-DD') as ends_on_s
    from news_posts where id = ${id} limit 1
  `) as Row[];
  return rows.length ? rowToPost(rows[0]) : null;
}

// Everything that's live, newest first
export async function getPublishedPosts(): Promise<NewsPost[]> {
  const sql = getDb();
  if (!sql) return [];
  try {
    const rows = (await sql`
      select *, to_char(starts_on, 'YYYY-MM-DD') as starts_on_s, to_char(ends_on, 'YYYY-MM-DD') as ends_on_s
      from news_posts
      where published
      order by coalesce(published_at, created_at) desc, id desc
      limit 200
    `) as Row[];
    return rows.map(rowToPost);
  } catch {
    return []; // table not there yet — run schema.sql in Neon
  }
}

export async function getPublishedPost(slug: string): Promise<NewsPost | null> {
  const sql = getDb();
  if (!sql) return null;
  try {
    const rows = (await sql`
      select *, to_char(starts_on, 'YYYY-MM-DD') as starts_on_s, to_char(ends_on, 'YYYY-MM-DD') as ends_on_s
      from news_posts
      where published and slug = ${slug}
      limit 1
    `) as Row[];
    return rows.length ? rowToPost(rows[0]) : null;
  } catch {
    return null;
  }
}

// The next event that should get the countdown card on the home page.
// Once its last day is over (Maine time) it drops off by itself.
export async function getHomeEvent(): Promise<NewsPost | null> {
  const sql = getDb();
  if (!sql) return null;
  const today = todayInMaine();
  try {
    const rows = (await sql`
      select *, to_char(starts_on, 'YYYY-MM-DD') as starts_on_s, to_char(ends_on, 'YYYY-MM-DD') as ends_on_s
      from news_posts
      where published and kind = 'event' and show_on_home and starts_on is not null
        and coalesce(ends_on, starts_on) >= ${today}::date
      order by starts_on asc, id asc
      limit 1
    `) as Row[];
    return rows.length ? rowToPost(rows[0]) : null;
  } catch {
    return null;
  }
}

// Splits live posts for the /news page: events still to come (soonest
// first), then everything else — news and past events — newest first.
export function splitForNewsPage(posts: NewsPost[], today = todayInMaine()) {
  const upcoming = posts
    .filter((p) => p.kind === "event" && p.startsOn && eventPhase(p, today) !== "over")
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const upcomingIds = new Set(upcoming.map((p) => p.id));
  const dateKey = (p: NewsPost) =>
    p.kind === "event" && p.startsOn ? lastDay(p) : (p.publishedAt ?? p.createdAt).slice(0, 10);
  const rest = posts
    .filter((p) => !upcomingIds.has(p.id))
    .sort((a, b) => dateKey(b).localeCompare(dateKey(a)) || b.id - a.id);
  return { upcoming, rest };
}
