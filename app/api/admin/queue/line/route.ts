import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { insertOrderLines, linesFromMeta } from "@/lib/costing";
import { reverseMoves, takeStock } from "@/lib/inventory";
import { colorName } from "@/lib/products";

// Ticking shirts off in the make queue. Owner only — middleware guards /api/admin.
//   POST { lineId, made }              one line of an order is made (or un-made)
//   POST { lineId, made, fromStock }   filled with a shirt already on the shelf
//   POST { orderId, made }             every shirt in the order at once
//
// When every shirt in a Paid order is made, the order flips to Made on its
// own; unticking one on a Made order puts it back to Paid. An order that's
// still awaiting payment keeps that status — the queue shows it under
// "made, waiting on the customer" so you know to send the payment link.
//
// Inventory: making a shirt uses a blank of its color and size; filling it
// from stock takes the finished shirt instead. Unticking puts it all back.

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

const NOT_A_SHIRT = new Set(["other"]);

// A line just got made: take the finished shirt (fromStock) and/or blanks off the shelf
async function useShelf(sql: Sql, orderId: number, l: Row, fromStock: boolean) {
  try {
    const lineId = Number(l.id);
    const slug = String(l.slug ?? "");
    const color = String(l.color ?? "");
    const size = String(l.size ?? "");
    const qty = Number(l.qty) || 1;
    if (!color || !size || NOT_A_SHIRT.has(slug)) return;
    const label = `${String(l.name || slug)} · ${colorName(color)} · ${size}`;
    let pulled = 0;
    if (fromStock && slug !== "custom") {
      const r = await takeStock(sql, { kind: "shirt", slug, color, size }, qty, "pulled", { orderId, lineId, label });
      pulled = r.moved;
    }
    if (qty - pulled > 0) {
      await takeStock(sql, { kind: "blank", color, size }, qty - pulled, "used", { orderId, lineId, note: `made ${label}` });
    }
  } catch (err) {
    console.error("queue inventory:", err); // never blocks the tick
  }
}

async function putBack(sql: Sql, lineId: number) {
  try {
    await reverseMoves(sql, { lineId }, "back in line");
  } catch (err) {
    console.error("queue inventory undo:", err);
  }
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const made = Boolean(body?.made);
    const fromStock = Boolean(body?.fromStock);
    const lineId = Number(body?.lineId);
    let orderId = Number(body?.orderId);

    if (Number.isInteger(lineId) && lineId > 0) {
      const line = (await sql`select id, order_id from order_lines where id = ${lineId}`) as Row[];
      if (line.length === 0) return NextResponse.json({ error: "That shirt isn't on an order any more." }, { status: 404 });
      orderId = Number(line[0].order_id);
      if (made) {
        // only a line that wasn't made yet touches the shelf (a double tap does nothing)
        const changed = (await sql`
          update order_lines set made_at = now() where id = ${lineId} and made_at is null
          returning id, slug, name, color, size, qty
        `) as Row[];
        if (changed.length) await useShelf(sql, orderId, changed[0], fromStock);
      } else {
        const changed = (await sql`
          update order_lines set made_at = null where id = ${lineId} and made_at is not null returning id
        `) as Row[];
        if (changed.length) await putBack(sql, lineId);
      }
    } else if (Number.isInteger(orderId) && orderId > 0) {
      const order = (await sql`select id, items from orders where id = ${orderId}`) as Row[];
      if (order.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      // Older orders never got line rows — make them now so each shirt can be ticked
      const have = (await sql`select count(*)::int as n from order_lines where order_id = ${orderId}`) as { n: number }[];
      if (Number(have[0]?.n ?? 0) === 0) {
        await insertOrderLines(sql, orderId, await linesFromMeta(String(order[0].items ?? "")));
      }
      if (made) {
        const changed = (await sql`
          update order_lines set made_at = now() where order_id = ${orderId} and made_at is null
          returning id, slug, name, color, size, qty
        `) as Row[];
        for (const l of changed) await useShelf(sql, orderId, l, false);
      } else {
        const changed = (await sql`
          update order_lines set made_at = null where order_id = ${orderId} and made_at is not null returning id
        `) as Row[];
        for (const l of changed) await putBack(sql, Number(l.id));
      }
    } else {
      return NextResponse.json({ error: "Which shirt?" }, { status: 400 });
    }

    // Keep the order's status honest with its shirts
    const s = (await sql`
      select o.status, count(l.id)::int as lines, count(l.made_at)::int as done
      from orders o left join order_lines l on l.order_id = o.id
      where o.id = ${orderId}
      group by o.status
    `) as { status: string; lines: number; done: number }[];
    const status = String(s[0]?.status ?? "");
    const lines = Number(s[0]?.lines ?? 0);
    const done = Number(s[0]?.done ?? 0);
    const allMade = lines > 0 && done === lines;
    let next = status;
    if (allMade && status === "paid") next = "made";
    if (!allMade && status === "made") next = "paid";
    if (next !== status) await sql`update orders set status = ${next} where id = ${orderId}`;

    return NextResponse.json({ ok: true, orderId, status: next, made: done, of: lines, allMade });
  } catch (err) {
    console.error("queue line:", err);
    return NextResponse.json({ error: "Could not save that — is the latest schema.sql run in Neon?" }, { status: 500 });
  }
}
