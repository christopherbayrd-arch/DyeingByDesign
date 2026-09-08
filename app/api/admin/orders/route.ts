import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { costOrder } from "@/lib/costing";

// Order edits from the admin. Owner only — middleware guards /api/admin.
//   POST  { id, status }                      change status; flipping a request to
//                                             Paid stamps paid_at and freezes the cost
//   PATCH { id, postage?, fee?, note? }       money you actually spent on the order
//                                             (dollars as typed, "" clears)
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

    if (postage !== undefined) await sql`update orders set postage_cents = ${postage} where id = ${id}`;
    if (fee !== undefined) await sql`update orders set fee_cents = ${fee} where id = ${id}`;
    if (note !== undefined) await sql`update orders set note = ${note || null} where id = ${id}`;

    const rows = (await sql`
      select id, postage_cents, fee_cents, note from orders where id = ${id}
    `) as { id: number; postage_cents: number | null; fee_cents: number | null; note: string | null }[];
    if (rows.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ ok: true, order: rows[0] });
  } catch (err) {
    console.error("admin order patch:", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
