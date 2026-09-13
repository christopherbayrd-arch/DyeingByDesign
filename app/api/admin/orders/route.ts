import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { costOrder } from "@/lib/costing";
import {
  cancelOrder,
  clearTestOrders,
  getOrder,
  moneyOnIt,
  purgeOrder,
  restoreOrder,
  retotal,
  rewriteItems,
  softDeleteOrder,
  uncancelOrder,
} from "@/lib/orderAdmin";
import {
  emailConfig,
  sendEmail,
  customerOrderHtml,
  customerOrderRequestHtml,
  customerShippedHtml,
} from "@/lib/email";
import { itemLinesFromMeta, money, shipToLine, siteUrl } from "@/lib/orderFormat";
import { BANDANA_SIZES, SIZES, isColorKey } from "@/lib/products";

// Order edits from the admin. Owner only — middleware guards /api/admin.
//   POST  { id, status }                      change status; flipping a request to
//                                             Paid stamps paid_at and freezes the cost
//   POST  { id, action }                      cancel · uncancel · delete · restore ·
//                                             resend, and { action: "clear-tests" }
//   PUT   { id, shipping?, lines? }           edit what's in the order and where it goes
//   PATCH { id, postage?, fee?, note?, archived?, priority?, queue? }
//         postage / fee   money you actually spent (dollars as typed, "" clears)
//         note            your own note on the order
//         archived        true/false — off the desk and back
//         priority        1 rush · 0 normal · -1 on hold   (the make queue)
//         queue           "top" | "bottom" — move it in line
const ORDER_STATUSES = ["requested", "paid", "made", "shipped"] as const;

// Statuses the dropdown can set. Cancelled is deliberately NOT one of them:
// cancelling asks about the shelf and any refund, so it has its own action.
function dollarsToCents(v: unknown): number | null {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Send the customer their copy again. Which email depends on where the order
// has got to, so "resend" always means the one that's true right now.
async function resendCopy(sql: NonNullable<ReturnType<typeof getDb>>, id: number) {
  const cfg = emailConfig();
  if (!cfg.canEmailCustomers) {
    return { ok: false as const, error: "Customer emails are off until a sending domain is verified in Resend (README step 7)." };
  }
  const rows = (await sql`
    select email, name, status, items, amount_total, shipping, stripe_session_id,
           tracking_number, tracking_url, service
    from orders where id = ${id}
  `) as Record<string, unknown>[];
  if (rows.length === 0) return { ok: false as const, error: "Order not found." };
  const o = rows[0];
  const to = String(o.email ?? "");
  if (!to) return { ok: false as const, error: "That order has no email address on it." };

  const site = siteUrl();
  const firstName = String(o.name ?? "").split(" ")[0];
  const itemLines = await itemLinesFromMeta(String(o.items ?? ""));
  const total = money(typeof o.amount_total === "number" ? o.amount_total : 0);
  const status = String(o.status ?? "paid");
  const sid = String(o.stripe_session_id ?? "");
  const orderRef = sid.startsWith("email_") ? sid.replace("email_", "") : `#${id}`;

  let subject: string;
  let html: string;
  if (status === "shipped" && o.tracking_number) {
    subject = "Your order is on its way — Dyeing By Design";
    html = customerShippedHtml({
      firstName,
      itemLines,
      service: String(o.service ?? ""),
      tracking: String(o.tracking_number ?? ""),
      trackingUrl: String(o.tracking_url ?? ""),
      siteUrl: site,
    });
  } else if (status === "requested") {
    subject = `We got your order ${orderRef} — Dyeing By Design`;
    html = customerOrderRequestHtml({
      firstName,
      orderRef,
      itemLines,
      total,
      shipTo: shipToLine(o.shipping),
      siteUrl: site,
    });
  } else {
    // "made" means it's finished and waiting to go out — same news the card
    // confirmation gives. "paid" means it's still being bleached.
    const ready = status === "made";
    subject = ready ? "Your order is ready to ship — Dyeing By Design" : "We got your order — Dyeing By Design";
    html = customerOrderHtml({ firstName, itemLines, total, siteUrl: site, ready });
  }

  const res = await sendEmail({ to, subject, html, replyTo: cfg.notify });
  return res.ok ? { ok: true as const, to } : { ok: false as const, error: res.error ?? "The email didn't send." };
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    const action = String(body?.action ?? "");
    const status = String(body?.status ?? "");

    // Clear every Stripe test order in one go — the only action with no id
    if (action === "clear-tests") {
      const gone = await clearTestOrders(sql);
      return NextResponse.json({ ok: true, cleared: gone });
    }

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Which order?" }, { status: 400 });
    }

    if (action) {
      const order = await getOrder(sql, id);
      if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      const reason = String(body?.reason ?? "").slice(0, 300);
      const restock = Boolean(body?.restock);

      if (action === "cancel") {
        const out = await cancelOrder(sql, id, { reason, restock, refundCents: dollarsToCents(body?.refund) });
        return NextResponse.json({ ok: true, ...out });
      }
      if (action === "uncancel") {
        return NextResponse.json({ ok: true, ...(await uncancelOrder(sql, id)) });
      }
      if (action === "delete") {
        // Deleting doesn't refund anyone — Stripe still has the money. So an
        // order with money on it can't go until you've said you know that.
        if (moneyOnIt(order) && body?.confirmMoney !== true) {
          return NextResponse.json(
            {
              error:
                "This order has money on it. Deleting it here does not refund the customer — refund it in Stripe first, or cancel it instead so the record stays.",
              needsMoneyConfirm: true,
            },
            { status: 409 }
          );
        }
        const out = await softDeleteOrder(sql, id, { reason, restock });
        return NextResponse.json({ ok: true, ...out });
      }
      if (action === "restore") {
        return NextResponse.json({ ok: true, ...(await restoreOrder(sql, id)) });
      }
      if (action === "purge") {
        if (!order.deletedAt) {
          return NextResponse.json({ error: "Only something already in the bin can be emptied." }, { status: 400 });
        }
        return NextResponse.json({ ok: true, purged: await purgeOrder(sql, id) });
      }
      if (action === "resend") {
        const out = await resendCopy(sql, id);
        return out.ok
          ? NextResponse.json({ ok: true, sent: out.to })
          : NextResponse.json({ error: out.error }, { status: 400 });
      }
      return NextResponse.json({ error: "That's not something an order can do." }, { status: 400 });
    }
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "That's not a status this shop uses." }, { status: 400 });
    }
    const rows = (await sql`
      update orders
      set status = ${status},
          paid_at = case when ${status} <> 'requested' then coalesce(paid_at, now()) else paid_at end
      where id = ${id}
      returning id, status
    `) as { id: number; status: string }[];
    if (rows.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    // The moment it's paid is the moment the cost gets frozen
    let costed = 0;
    if (status !== "requested") {
      try {
        costed = (await costOrder(sql, id)).costed;
      } catch (err) {
        console.error("costing on status change failed:", err);
      }
    }
    return NextResponse.json({ ok: true, status: rows[0].status, costed });
  } catch (err) {
    console.error("admin order status:", err);
    const msg = String((err as { message?: string })?.message ?? "");
    return NextResponse.json(
      { error: msg.startsWith("This needs the newest schema.sql") ? msg : "Could not update the order." },
      { status: 500 }
    );
  }
}

// ---- PUT: edit what's in an order and where it goes ----
// { id, shipping?: {name, line1, line2, city, state, postal}, lines?: [
//     { id, size?, color?, qty?, price?, remove? } ] }
// Changing a paid order does NOT move the Inventory shelf — the shirts that
// came off when it sold stay off. Adjust the shelf yourself if you need to.
export async function PUT(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Which order?" }, { status: 400 });
    }
    const exists = (await sql`select id from orders where id = ${id}`) as { id: number }[];
    if (exists.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    // --- where it goes ---
    const ship = body?.shipping as Record<string, unknown> | undefined;
    if (ship && typeof ship === "object") {
      const clean = {
        name: String(ship.name ?? "").slice(0, 120),
        address: {
          line1: String(ship.line1 ?? "").slice(0, 200),
          line2: String(ship.line2 ?? "").slice(0, 200),
          city: String(ship.city ?? "").slice(0, 120),
          state: String(ship.state ?? "").slice(0, 2).toUpperCase(),
          postal_code: String(ship.postal ?? "").slice(0, 10),
          country: "US",
        },
      };
      await sql`update orders set shipping = ${JSON.stringify(clean)}::jsonb where id = ${id}`;
    }
    if (body?.name !== undefined) {
      await sql`update orders set name = ${String(body.name).slice(0, 120) || null} where id = ${id}`;
    }
    if (body?.email !== undefined) {
      await sql`update orders set email = ${String(body.email).slice(0, 200) || null} where id = ${id}`;
    }

    // --- what's in it ---
    const allSizes = [...SIZES, ...BANDANA_SIZES];
    const lines = Array.isArray(body?.lines) ? body.lines : [];
    let changed = 0;
    for (const raw of lines.slice(0, 50)) {
      const l = raw as Record<string, unknown>;
      const lineId = Number(l?.id);
      if (!Number.isInteger(lineId) || lineId <= 0) continue;
      // a line can only be touched if it really belongs to this order
      const owned = (await sql`select id from order_lines where id = ${lineId} and order_id = ${id}`) as { id: number }[];
      if (owned.length === 0) continue;

      if (l.remove === true) {
        await sql`delete from order_lines where id = ${lineId}`;
        changed++;
        continue;
      }
      if (l.size !== undefined) {
        const size = String(l.size);
        if (!allSizes.includes(size)) {
          return NextResponse.json({ error: `${size} isn't a size this shop makes.` }, { status: 400 });
        }
        await sql`update order_lines set size = ${size} where id = ${lineId}`;
      }
      if (l.color !== undefined) {
        const color = String(l.color);
        if (!isColorKey(color)) {
          return NextResponse.json({ error: "That's not a color this shop stocks." }, { status: 400 });
        }
        await sql`update order_lines set color = ${color} where id = ${lineId}`;
      }
      if (l.qty !== undefined) {
        const qty = Math.floor(Number(l.qty));
        if (!(qty >= 1 && qty <= 50)) {
          return NextResponse.json({ error: "Quantity has to be between 1 and 50." }, { status: 400 });
        }
        await sql`update order_lines set qty = ${qty} where id = ${lineId}`;
      }
      if (l.price !== undefined) {
        const cents = dollarsToCents(l.price);
        if (cents === null) {
          return NextResponse.json({ error: "That price didn't look like a number." }, { status: 400 });
        }
        await sql`update order_lines set unit_price_cents = ${cents} where id = ${lineId}`;
      }
      changed++;
    }

    // keep the readable copy and the total in step with the lines
    if (changed > 0) {
      await rewriteItems(sql, id);
      await retotal(sql, id);
    }
    const rows = (await sql`select id, items, amount_total from orders where id = ${id}`) as Record<string, unknown>[];
    return NextResponse.json({ ok: true, changed, order: rows[0] });
  } catch (err) {
    console.error("admin order edit:", err);
    return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
  }
}

function centsOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;           // not in the request → leave alone
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;                        // cleared
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function PATCH(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Which order?" }, { status: 400 });
    }
    const postage = centsOrNull(body?.postage);
    const fee = centsOrNull(body?.fee);
    const note = body?.note === undefined ? undefined : String(body.note).slice(0, 500);
    const archived = body?.archived === undefined ? undefined : Boolean(body.archived);
    const priority = body?.priority === undefined ? undefined : Number(body.priority);
    const queue = body?.queue === undefined ? undefined : String(body.queue);
    if (priority !== undefined && ![1, 0, -1].includes(priority)) {
      return NextResponse.json({ error: "Priority is rush (1), normal (0), or on hold (-1)." }, { status: 400 });
    }
    if (queue !== undefined && queue !== "top" && queue !== "bottom") {
      return NextResponse.json({ error: "Queue moves are \"top\" or \"bottom\"." }, { status: 400 });
    }

    if (archived === true) await sql`update orders set archived_at = now() where id = ${id}`;
    if (archived === false) await sql`update orders set archived_at = null where id = ${id}`;
    if (postage !== undefined) await sql`update orders set postage_cents = ${postage} where id = ${id}`;
    if (fee !== undefined) await sql`update orders set fee_cents = ${fee} where id = ${id}`;
    if (note !== undefined) await sql`update orders set note = ${note || null} where id = ${id}`;
    if (priority !== undefined) await sql`update orders set priority = ${priority} where id = ${id}`;
    // Place in line is queued_at: earlier = sooner. Top = a minute before whoever is first now.
    if (queue === "top") {
      await sql`
        update orders
        set queued_at = (select coalesce(min(queued_at), now()) - interval '1 minute'
                         from orders where archived_at is null and status in ('requested', 'paid', 'made')
                           and (to_jsonb(orders) ->> 'deleted_at') is null)
        where id = ${id}
      `;
    }
    if (queue === "bottom") await sql`update orders set queued_at = now() where id = ${id}`;

    const rows = (await sql`
      select id, postage_cents, fee_cents, note, priority, queued_at from orders where id = ${id}
    `) as { id: number; postage_cents: number | null; fee_cents: number | null; note: string | null; priority: number; queued_at: unknown }[];
    if (rows.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ ok: true, order: rows[0] });
  } catch (err) {
    console.error("admin order patch:", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
