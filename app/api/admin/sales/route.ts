import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { isColorKey } from "@/lib/products";
import { metaLine } from "@/lib/orderFormat";
import { costOrder, insertOrderLines } from "@/lib/costing";

// Records a sale that never touched the site — a market table, an
// Instagram DM, Tap to Pay — so the sales history is complete.
// Owner only — middleware guards /api/admin.
const CHANNELS = ["market", "instagram", "other"] as const;

function cents(v: unknown): number | null {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? "").trim();
    const size = String(body?.size ?? "").trim();
    const color = String(body?.color ?? "").trim();
    const qty = Math.floor(Number(body?.qty));
    const unit = cents(body?.unitPrice);
    const channel = String(body?.channel ?? "market");
    const shipping = cents(body?.shipping) ?? 0;
    const fee = cents(body?.fee);
    const postage = cents(body?.postage);
    const buyer = String(body?.buyer ?? "").trim().slice(0, 120);
    const note = String(body?.note ?? "").trim().slice(0, 500);
    const soldAtRaw = String(body?.soldAt ?? "").trim();

    if (!slug) return NextResponse.json({ error: "Pick a design." }, { status: 400 });
    if (!(qty >= 1 && qty <= 50)) return NextResponse.json({ error: "How many shirts?" }, { status: 400 });
    if (unit === null) return NextResponse.json({ error: "What did they pay per shirt?" }, { status: 400 });
    if (!(CHANNELS as readonly string[]).includes(channel)) {
      return NextResponse.json({ error: "Pick where it was sold." }, { status: 400 });
    }
    if (color && !isColorKey(color)) return NextResponse.json({ error: "That's not one of the blank colors." }, { status: 400 });

    // The date matters: the cost is frozen with the sheet from that day.
    let soldAt = new Date();
    if (soldAtRaw) {
      const d = new Date(soldAtRaw + (soldAtRaw.length === 10 ? "T12:00:00" : ""));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });
      soldAt = d;
    }

    const product = await getProduct(slug);
    const name = product?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1);
    const items = metaLine({ slug, size, color, qty, priceCents: unit }) + (note ? ` | note: ${note}` : "");
    const total = unit * qty + shipping;
    const ref = "manual_" + randomBytes(4).toString("hex");

    const inserted = (await sql`
      insert into orders (stripe_session_id, email, name, amount_total, items, shipping, status, channel,
                          shipping_cents, fee_cents, postage_cents, paid_at, sold_at, note, created_at)
      values (${ref}, null, ${buyer || null}, ${total}, ${items}, null, 'shipped', ${channel},
              ${shipping}, ${fee}, ${postage}, ${soldAt.toISOString()}, ${soldAt.toISOString()}, ${note || null}, ${soldAt.toISOString()})
      returning id
    `) as { id: number }[];
    const id = inserted[0].id;
    await insertOrderLines(sql, id, [{ slug, name, size, color, qty, unitPriceCents: unit, priceSource: "order" }]);
    const result = await costOrder(sql, id);
    return NextResponse.json({ ok: true, id, costed: result.costed });
  } catch (err) {
    console.error("record sale:", err);
    return NextResponse.json(
      { error: "Could not record the sale — have you run the latest schema.sql in Neon?" },
      { status: 500 }
    );
  }
}
