import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { costOrder } from "@/lib/costing";

// Order edits from the admin. Owner only — middleware guards /api/admin.
//   POST  { id, status }                      change status; flipping a request to
//                                             Paid stamps paid_at and freezes the cost
//   PATCH { id, postage?, fee?, note?, archived?, priority?, queue? }
//         postage / fee   money you actually spent (dollars as typed, "" clears)
//         note            your own note on the order
//         archived        true/false — off the desk and back
//         priority        1 rush · 0 normal · -1 on hold   (the make queue)
//         queue           "top" | "bottom" — move it in line
const ORDER_STATUSES = ["requested", "paid", "made", "shipped"] as const;

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    const status = String(body?.status ?? "");
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Which order?" }, { status: 400 });
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
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
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
                         from orders where archived_at is null and status in ('requested', 'paid', 'made'))
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
