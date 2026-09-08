import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buyShipment, serviceName, shippingConfig } from "@/lib/shipping";
import { emailConfig, sendEmail, customerShippedHtml } from "@/lib/email";
import { itemLinesFromMeta, siteUrl } from "@/lib/orderFormat";
import { loadOrder, resolveAddress } from "../_shared";

// Step 2: buy the chosen rate. Saves the label + tracking on the order,
// writes the postage into the sales history, marks it Shipped, and emails
// the customer the tracking number. Owner only — middleware guards /api/admin.
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  if (!shippingConfig().enabled) return NextResponse.json({ error: "Shipping isn't set up yet." }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    const shipmentId = String(body.shipmentId ?? "");
    const rateId = String(body.rateId ?? "");
    if (!Number.isInteger(id) || id <= 0 || !shipmentId || !rateId) {
      return NextResponse.json({ error: "Get rates first, then pick one." }, { status: 400 });
    }
    const order = await loadOrder(sql, id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.label_url && order.tracking_number) {
      return NextResponse.json({ error: "This order already has a label. Void it first if you need a new one." }, { status: 409 });
    }

    const bought = await buyShipment(shipmentId, rateId);

    // keep a hand-typed address on the order so the history shows where it went
    const resolved = resolveAddress(order, body);
    if (resolved?.stored) {
      await sql`update orders set shipping = ${JSON.stringify(resolved.stored)}::jsonb where id = ${id}`;
    }
    await sql`
      update orders
      set shipment_id = ${shipmentId},
          tracking_number = ${bought.trackingNumber},
          tracking_url = ${bought.trackingUrl},
          label_url = ${bought.labelUrl},
          carrier = ${bought.carrier},
          service = ${bought.service},
          label_bought_at = now(),
          shipped_at = coalesce(shipped_at, now()),
          postage_cents = ${bought.cents},
          status = 'shipped',
          paid_at = coalesce(paid_at, now())
      where id = ${id}
    `;

    // Tell the customer (never allowed to fail the purchase)
    let emailed = false;
    try {
      const cfg = emailConfig();
      if (cfg.canEmailCustomers && order.email) {
        const res = await sendEmail({
          to: order.email,
          subject: "Your shirt is on its way — Dyeing By Design",
          replyTo: cfg.notify || undefined,
          html: customerShippedHtml({
            firstName: (order.name ?? "").split(" ")[0] ?? "",
            itemLines: await itemLinesFromMeta(order.items),
            service: serviceName(bought.carrier, bought.service),
            tracking: bought.trackingNumber,
            trackingUrl: bought.trackingUrl,
            siteUrl: siteUrl(),
          }),
        });
        emailed = res.ok;
        if (!res.ok) console.error("shipped email failed:", res.error);
      }
    } catch (err) {
      console.error("shipped email error:", err);
    }

    return NextResponse.json({ ok: true, ...bought, emailed });
  } catch (err) {
    console.error("label buy:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not buy the label." }, { status: 502 });
  }
}
