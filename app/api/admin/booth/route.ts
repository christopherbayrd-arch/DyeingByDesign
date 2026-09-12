import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { colorName, isColorKey } from "@/lib/products";
import { metaLine } from "@/lib/orderFormat";
import { costOrder, insertOrderLines, type LineInput } from "@/lib/costing";
import { BOOTH_REF_PREFIX, CUSTOM_SLUG, OTHER_SLUG, isPayMethod, payLabel } from "@/lib/booth";
import { reverseMoves, stockMapsSafe, takeById, takeStock } from "@/lib/inventory";

// Quick sale (/admin/sell): booth and cash sales, one tap at a time.
// Each sale is a normal order (so it lands in Sales history with its cost
// frozen), already handed over, and archived so it never clutters the desk.
// Shirts (and other items) on the Inventory shelf come off as they sell,
// and go back on if the sale is undone.
// Owner only — middleware guards /api/admin.

type Row = Record<string, unknown>;

const OLD_SCHEMA =
  "The database needs the latest schema.sql (Quick sale adds two columns). Run it in Neon, then try again. Your sale is still saved on this device.";

function when(v: string | null, fallback: Date): Date {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

// GET ?from=ISO&to=ISO[&event=ID] → booth sales in that window (the phone's
// own "today"), plus the running total for an event across all its days.
export async function GET(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ sales: [], event: null, error: "No database connected yet." });
  const q = new URL(req.url).searchParams;
  const now = new Date();
  const from = when(q.get("from"), new Date(now.getTime() - 86400000));
  const to = when(q.get("to"), new Date(now.getTime() + 86400000));
  const eventId = Number(q.get("event")) || 0;

  try {
    const orders = (await sql`
      select id, stripe_session_id, sold_at, amount_total, pay_method, event_id, email
      from orders
      where stripe_session_id like ${BOOTH_REF_PREFIX + "%"}
        and sold_at >= ${from.toISOString()}::timestamptz and sold_at < ${to.toISOString()}::timestamptz
      order by sold_at desc, id desc
      limit 400
    `) as Row[];
    const lines = (await sql`
      select l.order_id, l.slug, l.name, l.size, l.color, l.qty, l.unit_price_cents
      from order_lines l
      join orders o on o.id = l.order_id
      where o.stripe_session_id like ${BOOTH_REF_PREFIX + "%"}
        and o.sold_at >= ${from.toISOString()}::timestamptz and o.sold_at < ${to.toISOString()}::timestamptz
      order by l.id
    `) as Row[];

    const byOrder = new Map<number, Row[]>();
    for (const l of lines) {
      const k = Number(l.order_id);
      byOrder.set(k, [...(byOrder.get(k) ?? []), l]);
    }

    const sales = orders.map((o) => ({
      id: Number(o.id),
      clientId: String(o.stripe_session_id).slice(BOOTH_REF_PREFIX.length),
      at: new Date(String(o.sold_at instanceof Date ? o.sold_at.toISOString() : o.sold_at)).toISOString(),
      pay: String(o.pay_method ?? "cash"),
      total: Number(o.amount_total ?? 0),
      eventId: o.event_id === null || o.event_id === undefined ? null : Number(o.event_id),
      email: o.email ? String(o.email) : "",
      lines: (byOrder.get(Number(o.id)) ?? []).map((l) => ({
        slug: String(l.slug),
        name: String(l.name || l.slug),
        size: String(l.size ?? ""),
        color: String(l.color ?? ""),
        qty: Number(l.qty) || 1,
        unitCents: Number(l.unit_price_cents) || 0,
      })),
    }));

    let event = null;
    if (eventId) {
      const t = (await sql`
        select count(distinct o.id) as sales,
               coalesce(sum(l.qty), 0) as shirts,
               coalesce(sum(l.qty * l.unit_price_cents), 0) as revenue,
               coalesce(sum(l.qty * l.unit_price_cents) filter (where o.pay_method = 'cash'), 0) as cash
        from orders o
        join order_lines l on l.order_id = o.id
        where o.event_id = ${eventId}
      `) as Row[];
      event = {
        id: eventId,
        sales: Number(t[0]?.sales ?? 0),
        shirts: Number(t[0]?.shirts ?? 0),
        revenue: Number(t[0]?.revenue ?? 0),
        cash: Number(t[0]?.cash ?? 0),
      };
    }
    const shelf = await stockMapsSafe(sql);
    return NextResponse.json({ sales, event, stock: { shirts: shelf.shirts, others: shelf.others } });
  } catch (err) {
    console.error("booth list:", err);
    return NextResponse.json({ sales: [], event: null, error: OLD_SCHEMA });
  }
}

type LineBody = {
  slug?: unknown;
  name?: unknown;
  size?: unknown;
  color?: unknown;
  qty?: unknown;
  unitCents?: unknown;
  itemId?: unknown; // an "other" item from the Inventory shelf
};

// POST — record one sale (one or more shirts, one payment)
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = String(b.clientId ?? "").toLowerCase();
  if (!/^[a-z0-9-]{8,64}$/.test(clientId)) {
    return NextResponse.json({ error: "That sale is missing its id. Reload the page and try again." }, { status: 400 });
  }
  const pay = String(b.pay ?? "cash");
  if (!isPayMethod(pay)) return NextResponse.json({ error: "How did they pay?" }, { status: 400 });

  const rawLines = Array.isArray(b.lines) ? (b.lines as LineBody[]) : [];
  if (rawLines.length === 0) return NextResponse.json({ error: "Pick a shirt first." }, { status: 400 });
  if (rawLines.length > 30) return NextResponse.json({ error: "That's a lot of shirts for one sale." }, { status: 400 });

  const lines: LineInput[] = [];
  const itemIds: number[] = [];
  for (const l of rawLines) {
    const slug = String(l.slug ?? "").trim().toLowerCase();
    const size = String(l.size ?? "").trim().slice(0, 8);
    const color = String(l.color ?? "").trim();
    const qty = Math.floor(Number(l.qty));
    const unit = Math.round(Number(l.unitCents));
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return NextResponse.json({ error: "Pick a design." }, { status: 400 });
    if (!(qty >= 1 && qty <= 50)) return NextResponse.json({ error: "How many shirts?" }, { status: 400 });
    if (!(unit >= 0 && unit <= 100000)) return NextResponse.json({ error: "What did they pay per shirt?" }, { status: 400 });
    if (color && !isColorKey(color)) return NextResponse.json({ error: "That's not one of the blank colors." }, { status: 400 });

    let name = String(l.name ?? "").trim().slice(0, 80);
    if (slug === CUSTOM_SLUG) name = name || "Custom piece";
    else if (slug === OTHER_SLUG) name = name || "Other";
    else {
      const p = await getProduct(slug).catch(() => null);
      name = p?.name ?? (name || slug.charAt(0).toUpperCase() + slug.slice(1));
    }
    lines.push({ slug, name, size, color, qty, unitPriceCents: unit, priceSource: "order" });
    itemIds.push(slug === OTHER_SLUG ? Number(l.itemId) || 0 : 0);
  }

  // When it happened: the phone's clock (a sale saved offline keeps its real
  // time), unless that's nonsense — then now.
  const now = new Date();
  let soldAt = when(String(b.soldAt ?? ""), now);
  if (soldAt.getTime() > now.getTime() + 10 * 60000 || soldAt.getTime() < now.getTime() - 45 * 86400000) soldAt = now;

  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 200);
  const validEmail = email.includes("@") && email.length >= 5 ? email : "";
  const extra = String(b.note ?? "").trim().slice(0, 300);
  const eventIdIn = Number(b.eventId) || 0;

  try {
    let eventId: number | null = null;
    let eventTitle = "";
    if (eventIdIn) {
      const ev = (await sql`select id, title from news_posts where id = ${eventIdIn}`) as Row[];
      if (ev.length) {
        eventId = Number(ev[0].id);
        eventTitle = String(ev[0].title ?? "");
      }
    }

    const ref = BOOTH_REF_PREFIX + clientId;
    const items = lines.map((l) => metaLine({ slug: l.slug, size: l.size, color: l.color, qty: l.qty, priceCents: l.unitPriceCents })).join("; ");
    const total = lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
    const note = [eventTitle, payLabel(pay), extra].filter(Boolean).join(" · ");
    const at = soldAt.toISOString();

    const inserted = (await sql`
      insert into orders (stripe_session_id, email, name, amount_total, items, shipping, status, channel,
                          shipping_cents, paid_at, sold_at, note, created_at, archived_at, pay_method, event_id)
      values (${ref}, ${validEmail || null}, null, ${total}, ${items}, null, 'shipped', 'market',
              0, ${at}, ${at}, ${note}, ${at}, now(), ${pay}, ${eventId})
      on conflict (stripe_session_id) do nothing
      returning id
    `) as { id: number }[];

    if (inserted.length === 0) {
      // already recorded (the phone sent it twice) — that's fine
      const existing = (await sql`select id from orders where stripe_session_id = ${ref}`) as { id: number }[];
      return NextResponse.json({ ok: true, id: existing[0]?.id ?? null, duplicate: true });
    }

    const id = Number(inserted[0].id);
    await insertOrderLines(sql, id, lines);
    const costed = await costOrder(sql, id).catch(() => ({ costed: 0 }));

    // Off the shelf: a design with its color and size, or a listed other item.
    // Never allowed to fail the sale (older database, nothing counted, etc).
    let fromShelf = 0;
    try {
      const lineRows = (await sql`select id from order_lines where order_id = ${id} order by id`) as { id: number }[];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const ctx = {
          orderId: id,
          lineId: Number(lineRows[i]?.id) || null,
          note: eventTitle || "Quick sale",
        };
        if (l.slug !== CUSTOM_SLUG && l.slug !== OTHER_SLUG && l.color && l.size) {
          const r = await takeStock(sql, { kind: "shirt", slug: l.slug, color: l.color, size: l.size }, l.qty, "sold", {
            ...ctx,
            label: `${l.name} · ${colorName(l.color)} · ${l.size}`,
          });
          fromShelf += r.moved;
        } else if (l.slug === OTHER_SLUG && itemIds[i]) {
          const r = await takeById(sql, itemIds[i], l.qty, "sold", ctx);
          fromShelf += r.moved;
        }
      }
    } catch (err) {
      console.error("booth inventory:", err);
    }
    if (validEmail) {
      try {
        await sql`insert into drop_signups (email) values (${validEmail}) on conflict (email) do nothing`;
      } catch {
        // the sale is what matters; the list can wait
      }
    }
    return NextResponse.json({ ok: true, id, total, costed: costed.costed, fromShelf });
  } catch (err) {
    console.error("booth sale:", err);
    const msg = String((err as Error)?.message ?? err);
    if (/pay_method|event_id|news_posts/.test(msg)) {
      return NextResponse.json({ error: OLD_SCHEMA }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not record that sale. It's still saved on this device." }, { status: 500 });
  }
}

// DELETE ?id=123 or ?client=<id> — undo a booth sale (only booth sales can be removed here)
export async function DELETE(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const id = Number(q.get("id")) || 0;
  const client = String(q.get("client") ?? "").toLowerCase();
  try {
    let found: Row[] = [];
    if (id) {
      found = (await sql`select id from orders where id = ${id} and stripe_session_id like ${BOOTH_REF_PREFIX + "%"}`) as Row[];
    } else if (/^[a-z0-9-]{8,64}$/.test(client)) {
      found = (await sql`select id from orders where stripe_session_id = ${BOOTH_REF_PREFIX + client}`) as Row[];
    } else {
      return NextResponse.json({ error: "Which sale?" }, { status: 400 });
    }
    if (found.length === 0) return NextResponse.json({ ok: true, removed: 0 });
    const orderId = Number(found[0].id);
    // whatever came off the shelf goes back on
    try {
      await reverseMoves(sql, { orderId }, "sale undone");
    } catch (err) {
      console.error("booth undo inventory:", err);
    }
    const rows = (await sql`delete from orders where id = ${orderId} returning id`) as Row[];
    return NextResponse.json({ ok: true, removed: rows.length });
  } catch (err) {
    console.error("booth undo:", err);
    return NextResponse.json({ error: "Could not undo that sale." }, { status: 500 });
  }
}
