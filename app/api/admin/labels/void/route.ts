import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { refundShipment, shippingConfig } from "@/lib/shipping";
import { loadOrder } from "../_shared";

// Printed the wrong thing? Ask EasyPost/USPS for the postage back and
// clear the label off the order so a new one can be bought.
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  if (!shippingConfig().enabled) return NextResponse.json({ error: "Shipping isn't set up yet." }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which order?" }, { status: 400 });
    const order = await loadOrder(sql, id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (!order.shipment_id) return NextResponse.json({ error: "No label on this order." }, { status: 400 });

    let refund = "submitted";
    try {
      refund = await refundShipment(order.shipment_id);
    } catch (err) {
      // a label that's already been refunded or scanned can't be voided again — still clear it here
      console.error("refund request:", err);
      refund = err instanceof Error ? err.message : "not accepted";
    }
    await sql`
      update orders
      set shipment_id = null, tracking_number = null, tracking_url = null, label_url = null,
          carrier = null, service = null, label_bought_at = null, postage_cents = null,
          status = case when status = 'shipped' then 'paid' else status end,
          note = concat_ws(' · ', note, ${"label voided (" + refund + ")"}::text)
      where id = ${id}
    `;
    return NextResponse.json({ ok: true, refund });
  } catch (err) {
    console.error("label void:", err);
    return NextResponse.json({ error: "Could not void that label." }, { status: 500 });
  }
}
