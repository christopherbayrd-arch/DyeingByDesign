import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { loadAllPosts, loadPostById } from "@/lib/news";
import { isDay, isTime, leftoverPlaceholders, slugify } from "@/lib/newsFormat";

// News & events from /admin/news. Owner only — middleware guards /api/admin.

type Row = Record<string, unknown>;

const NO_TABLE =
  "The news table isn't in the database yet. Run the latest schema.sql in Neon (it's safe to re-run), then try again.";

// Shirts and money taken at each event through Quick sale
async function eventSales(sql: NonNullable<ReturnType<typeof getDb>>) {
  const out: Record<number, { shirts: number; revenue: number; cash: number }> = {};
  try {
    const rows = (await sql`
      select o.event_id,
             coalesce(sum(l.qty), 0) as shirts,
             coalesce(sum(l.qty * l.unit_price_cents), 0) as revenue,
             coalesce(sum(l.qty * l.unit_price_cents) filter (where o.pay_method = 'cash'), 0) as cash
      from orders o
      join order_lines l on l.order_id = o.id
      where o.event_id is not null
      group by o.event_id
    `) as Row[];
    for (const r of rows) {
      out[Number(r.event_id)] = { shirts: Number(r.shirts), revenue: Number(r.revenue), cash: Number(r.cash) };
    }
  } catch {
    // older schema — no sales to show yet
  }
  return out;
}

export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ posts: [], sales: {}, error: "No database connected yet (see README)." });
  try {
    const [posts, sales] = [await loadAllPosts(sql), await eventSales(sql)];
    return NextResponse.json({ posts, sales });
  } catch {
    return NextResponse.json({ posts: [], sales: {}, error: NO_TABLE });
  }
}

function clean(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function refresh(...slugs: string[]) {
  try {
    revalidatePath("/");
    revalidatePath("/news");
    for (const s of slugs) if (s) revalidatePath(`/news/${s}`);
  } catch {
    // pages still refresh on their own within a minute
  }
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id) || 0;
  const action = String(b.action ?? "save"); // save | publish | unpublish
  const kind = b.kind === "event" ? "event" : "news";
  const title = clean(b.title, 140);
  const summary = clean(b.summary, 400);
  const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 8000);
  const imageUrl = clean(b.imageUrl, 500);
  let startsOn = clean(b.startsOn, 10);
  let endsOn = clean(b.endsOn, 10);
  const startTime = clean(b.startTime, 5);
  const endTime = clean(b.endTime, 5);
  const venue = clean(b.venue, 120);
  const street = clean(b.street, 160);
  const town = clean(b.town, 80);
  const state = clean(b.state, 20) || "ME";
  const booth = clean(b.booth, 60);
  const eventUrl = clean(b.eventUrl, 500);
  const showOnHome = b.showOnHome === undefined ? true : Boolean(b.showOnHome);

  if (!title) return NextResponse.json({ error: "Give it a title." }, { status: 400 });
  if (imageUrl && !/^(https:\/\/|\/images\/)/.test(imageUrl)) {
    return NextResponse.json({ error: "That photo address doesn't look right." }, { status: 400 });
  }
  if (eventUrl && !/^https?:\/\//.test(eventUrl)) {
    return NextResponse.json({ error: "The fair's website should start with https://" }, { status: 400 });
  }

  if (kind === "event") {
    if (!isDay(startsOn)) return NextResponse.json({ error: "Pick the day of the event." }, { status: 400 });
    if (endsOn && !isDay(endsOn)) return NextResponse.json({ error: "The last day didn't make sense." }, { status: 400 });
    if (endsOn && endsOn < startsOn) {
      return NextResponse.json({ error: "The last day is before the first day." }, { status: 400 });
    }
    if (endsOn === startsOn) endsOn = "";
    if ((startTime && !isTime(startTime)) || (endTime && !isTime(endTime))) {
      return NextResponse.json({ error: "The times didn't make sense." }, { status: 400 });
    }
  } else {
    startsOn = "";
    endsOn = "";
  }

  if (action === "publish") {
    const left = leftoverPlaceholders(title, summary, body, venue, town, booth);
    if (left.length) {
      return NextResponse.json(
        { error: `Fill in the bracketed bits before it goes live: ${left.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const ev = kind === "event";
  const values = {
    kind,
    title,
    summary,
    body,
    image: imageUrl || null,
    startsOn: ev ? startsOn : null,
    endsOn: ev && endsOn ? endsOn : null,
    startTime: ev && startTime ? startTime : null,
    endTime: ev && endTime ? endTime : null,
    venue: ev ? venue || null : null,
    street: ev ? street || null : null,
    town: ev ? town || null : null,
    state,
    booth: ev ? booth || null : null,
    eventUrl: ev ? eventUrl || null : null,
    showOnHome,
  };

  try {
    if (!id) {
      // new post: take the address from the title (or what was typed), adding -2, -3… if it's taken
      const base = slugify(clean(b.slug, 80) || title);
      const taken = (await sql`select slug from news_posts where slug = ${base} or slug like ${base + "-%"}`) as Row[];
      const used = new Set(taken.map((r) => String(r.slug)));
      let slug = base;
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
      const publish = action === "publish";
      const rows = (await sql`
        insert into news_posts (slug, kind, title, summary, body, image_url, published, published_at,
                                starts_on, ends_on, start_time, end_time, venue, street, town, state,
                                booth, event_url, show_on_home)
        values (${slug}, ${values.kind}, ${values.title}, ${values.summary}, ${values.body}, ${values.image},
                ${publish}, ${publish ? new Date().toISOString() : null},
                ${values.startsOn}::date, ${values.endsOn}::date, ${values.startTime}, ${values.endTime},
                ${values.venue}, ${values.street}, ${values.town}, ${values.state},
                ${values.booth}, ${values.eventUrl}, ${values.showOnHome})
        returning id
      `) as Row[];
      const post = await loadPostById(sql, Number(rows[0].id));
      refresh(slug);
      return NextResponse.json({ ok: true, post });
    }

    const before = await loadPostById(sql, id);
    if (!before) return NextResponse.json({ error: "That post is gone." }, { status: 404 });
    const slug = slugify(clean(b.slug, 80) || before.slug || title);
    const clash = (await sql`select 1 from news_posts where slug = ${slug} and id <> ${id}`) as Row[];
    if (clash.length) {
      return NextResponse.json({ error: `Another post already uses /news/${slug}. Pick a different web address.` }, { status: 400 });
    }
    const published = action === "publish" ? true : action === "unpublish" ? false : before.published;
    await sql`
      update news_posts set
        slug = ${slug}, kind = ${values.kind}, title = ${values.title}, summary = ${values.summary},
        body = ${values.body}, image_url = ${values.image},
        published = ${published},
        published_at = case when ${published} then coalesce(published_at, now()) else published_at end,
        starts_on = ${values.startsOn}::date, ends_on = ${values.endsOn}::date,
        start_time = ${values.startTime}, end_time = ${values.endTime},
        venue = ${values.venue}, street = ${values.street}, town = ${values.town}, state = ${values.state},
        booth = ${values.booth}, event_url = ${values.eventUrl}, show_on_home = ${values.showOnHome},
        updated_at = now()
      where id = ${id}
    `;
    const post = await loadPostById(sql, id);
    refresh(slug, before.slug);
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    console.error("news save:", err);
    const msg = String((err as Error)?.message ?? err);
    if (/news_posts/.test(msg) && /does not exist/.test(msg)) {
      return NextResponse.json({ error: NO_TABLE }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not save the post. Try again in a minute." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Which post?" }, { status: 400 });
  try {
    const rows = (await sql`delete from news_posts where id = ${id} returning slug`) as Row[];
    refresh(rows[0] ? String(rows[0].slug) : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("news delete:", err);
    return NextResponse.json({ error: "Could not delete it." }, { status: 500 });
  }
}
