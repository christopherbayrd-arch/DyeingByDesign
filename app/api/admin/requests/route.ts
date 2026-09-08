import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { SHIPPING_CENTS, isColorKey } from "@/lib/products";
import { kindLabel } from "@/lib/requests";
import { metaLine } from "@/lib/orderFormat";
import { addressFromForm } from "@/lib/shipping";
import { insertOrderLines, setLineCost } from "@/lib/costing";

// Everything you do to a custom request from /admin. Owner only —
// middleware guards /api/admin.
//   { id, action: "status", status }          new → quoted → accepted → done
//   { id, action: "note", note }              your own note (never shown to the customer)
//   { id, action: "archive" | "unarchive" }   out of the desk / back on it
//   { id, action: "convert", price, shipping?, size?, color?, cost?, address? }
//        makes a real order out of it — same statuses, shipping labels, and
//        sales history as a lineup order. Price and cost in dollars as typed.
const STATUSES = ["new", "quoted", "accepted", "done"] as const;

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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    const action = String(body.action ?? "");
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which request?" }, { status: 400 });

    const rows = (await sql`select * from special_requests where id = ${id}`) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return NextResponse.json({ error: "Request not found." }, { status: 404 });

    if (action === "status") {
      const status = String(body.status ?? "");
      if (!(STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: "That's not a status this shop uses." }, { status: 400 });
      await sql`update special_requests set status = ${status}, updated_at = now() where id = ${id}`;
      return NextResponse.json({ ok: true, status });
    }
    if (action === "note") {
      const note = String(body.note ?? "").slice(0, 2000);
      await sql`update special_requests set note = ${note || null}, updated_at = now() where id = ${id}`;
      return NextResponse.json({ ok: true });
    }
    if (action === "archive" || action === "unarchive") {
      if (action === "archive") await sql`update special_requests set archived_at = now(), updated_at = now() where id = ${id}`;
      else await sql`update special_requests set archived_at = null, updated_at = now() where id = ${id}`;
      return NextResponse.json({ ok: true, archived: action === "archive" });
    }
    if (action === "convert") {
      if (r.order_id) return NextResponse.json({ error: `This request is already order #${String(r.order_id)}.` }, { status: 409 });
      const price = cents(body.price);
      if (price === null || price === 0) return NextResponse.json({ error: "What's the price for this piece?" }, { status: 400 });
      const shipping = cents(body.shipping) ?? SHIPPING_CENTS;
      const size = String(body.size ?? r.size ?? "").trim().slice(0, 10);
      const color = String(body.color ?? r.color ?? "").trim();
      if (color && !isColorKey(color)) return NextResponse.json({ error: "That's not one of the blank colors." }, { status: 400 });
      const cost = cents(body.cost);

      let shippingJson: unknown = null;
      if (body.address && typeof body.address === "object") {
        const a = body.address as Record<string, unknown>;
        const filled = ["line1", "city", "state", "postal"].some((k) => String(a[k] ?? "").trim());
        if (filled) {
          const parsed = addressFromForm({ ...a, name: a.name || r.name });
          if (!parsed) return NextResponse.json({ error: "The address needs a street, city, state, and ZIP (or leave it all blank for now)." }, { status: 400 });
          shippingJson = parsed.stored;
        }
      }

      const idea = String(r.idea ?? "").replace(/\s+/g, " ").trim();
      const items = metaLine({ slug: "custom", size, color, qty: 1, priceCents: price }) + (idea ? ` | note: ${idea.slice(0, 300)}` : "");
      const ref = "custom_" + randomBytes(4).toString("hex");
      const kind = kindLabel(String(r.kind ?? "other"));
      const inserted = (await sql`
        insert into orders (stripe_session_id, email, name, amount_total, items, shipping, status, channel, shipping_cents, user_id, note)
        values (${ref}, ${String(r.email ?? "") || null}, ${String(r.name ?? "") || null}, ${price + shipping}, ${items},
                ${shippingJson ? JSON.stringify(shippingJson) : null}::jsonb, 'requested', 'custom', ${shipping},
                ${r.user_id ? Number(r.user_id) : null}, ${`Custom request #${id} · ${kind}` + (r.note ? ` · ${String(r.note).slice(0, 200)}` : "")})
        returning id
      `) as { id: number }[];
      const orderId = inserted[0].id;
      await insertOrderLines(sql, orderId, [
        { slug: "custom", name: `Custom · ${kind}`, size, color, qty: 1, unitPriceCents: price, priceSource: "order" },
      ]);
      if (cost !== null) {
        const line = (await sql`select id from order_lines where order_id = ${orderId} order by id limit 1`) as { id: number }[];
        if (line[0]) await setLineCost(sql, line[0].id, cost, "custom piece");
      }
      await sql`
        update special_requests
        set order_id = ${orderId}, quote_cents = ${price}, status = case when status = 'new' then 'accepted' else status end, updated_at = now()
        where id = ${id}
      `;
      return NextResponse.json({ ok: true, orderId });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("admin request:", err);
    return NextResponse.json({ error: "Could not update the request — have you run the latest schema.sql in Neon?" }, { status: 500 });
  }
}
