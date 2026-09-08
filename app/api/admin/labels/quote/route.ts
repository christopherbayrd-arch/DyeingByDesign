import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parcelFor, quoteShipment, serviceName, shippingConfig } from "@/lib/shipping";
import { loadOrder, orderShirts, resolveAddress } from "../_shared";

// Step 1 of buying a label: work out the package from the shirts in the
// order, check the address with USPS, and get the rates. Nothing is
// bought yet. Owner only — middleware guards /api/admin.
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const cfg = shippingConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ error: `Shipping isn't set up yet — add ${cfg.missing.join(", ")} in Vercel (README step 9).` }, { status: 503 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which order?" }, { status: 400 });
    const order = await loadOrder(sql, id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const resolved = resolveAddress(order, body);
    if (!resolved) return NextResponse.json({ error: "needs-address" }, { status: 422 });

    const shirts = await orderShirts(sql, order);
    let parcel = parcelFor(shirts);
    const oz = Number(body.weightOz);
    if (Number.isFinite(oz) && oz > 0 && oz < 1120) parcel = { ...parcel, weight: Math.round(oz * 10) / 10 };

    const quote = await quoteShipment(resolved.address, parcel);
    return NextResponse.json({
      shipmentId: quote.shipmentId,
      to: quote.to,
      parcel: quote.parcel,
      shirts: shirts.reduce((n, s) => n + s.qty, 0),
      testMode: cfg.testMode,
      warnings: quote.warnings,
      rates: quote.rates.map((r) => ({ ...r, name: serviceName(r.carrier, r.service) })),
    });
  } catch (err) {
    console.error("label quote:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not get rates." }, { status: 502 });
  }
}
