import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Change an order's status from /admin — used mostly to mark an order
// request "paid" once the customer has paid your Stripe link or invoice.
// (Card orders arrive as "paid" on their own through the webhook.)
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
      update orders set status = ${status} where id = ${id} returning id, status
    `) as { id: number; status: string }[];
    if (rows.length === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ ok: true, status: rows[0].status });
  } catch (err) {
    console.error("admin order status:", err);
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  }
}
