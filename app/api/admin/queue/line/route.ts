import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { insertOrderLines, linesFromMeta } from "@/lib/costing";

// Ticking shirts off in the make queue. Owner only — middleware guards /api/admin.
//   POST { lineId, made }     one line of an order is made (or un-made)
//   POST { orderId, made }    every shirt in the order at once
//
// When every shirt in a Paid order is made, the order flips to Made on its
// own; unticking one on a Made order puts it back to Paid. An order that's
// still awaiting payment keeps that status — the queue shows it under
// "made, waiting on the customer" so you know to send the payment link.

type Row = Record<string, unknown>;

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const made = Boolean(body?.made);
    const lineId = Number(body?.lineId);
    let orderId = Number(body?.orderId);

    if (Number.isInteger(lineId) && lineId > 0) {
      const rows = (made
        ? await sql`update order_lines set made_at = coalesce(made_at, now()) where id = ${lineId} returning order_id`
        : await sql`update order_lines set made_at = null where id = ${lineId} returning order_id`) as Row[];
      if (rows.length === 0) return NextResponse.json({ error: "That shirt isn't on an order any more." }, { status: 404 });
      orderId = Number(rows[0].order_id);
    } else if (Number.isInteger(orderId) && orderId > 0) {
      const order = (await sql`select id, items from orders where id = ${orderId}`) as Row[];
      if (order.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      // Older orders never got line rows — make them now so each shirt can be ticked
      const have = (await sql`select count(*)::int as n from order_lines where order_id = ${orderId}`) as { n: number }[];
      if (Number(have[0]?.n ?? 0) === 0) {
        await insertOrderLines(sql, orderId, await linesFromMeta(String(order[0].items ?? "")));
      }
      if (made) await sql`update order_lines set made_at = coalesce(made_at, now()) where order_id = ${orderId}`;
      else await sql`update order_lines set made_at = null where order_id = ${orderId}`;
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
