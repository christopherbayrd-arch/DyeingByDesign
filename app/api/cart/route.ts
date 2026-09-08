import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isColorKey } from "@/lib/products";

// A signed in customer's cart, so it follows them between phone and
// laptop. Guests keep using the browser's own storage.
export const dynamic = "force-dynamic";

const NONE = NextResponse.json({ lines: null });

function clean(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l) => l && typeof l === "object")
    .map((l) => l as Record<string, unknown>)
    .filter((l) => l.slug && l.size && typeof l.color === "string" && isColorKey(l.color))
    .slice(0, 40)
    .map((l) => ({
      slug: String(l.slug).slice(0, 80),
      size: String(l.size).slice(0, 10),
      color: String(l.color),
      qty: Math.min(10, Math.max(1, Math.floor(Number(l.qty)) || 1)),
      name: String(l.name ?? "").slice(0, 120),
      priceCents: Math.max(0, Math.floor(Number(l.priceCents)) || 0),
      card: String(l.card ?? "").slice(0, 400),
    }));
}

export async function GET() {
  const sql = getDb();
  const user = await currentUser();
  if (!sql || !user?.id) return NONE;
  try {
    const rows = (await sql`select data from carts where user_id = ${Number(user.id)}`) as { data: unknown }[];
    return NextResponse.json({ lines: clean(rows[0]?.data ?? []) });
  } catch {
    return NONE;
  }
}

export async function PUT(req: Request) {
  const sql = getDb();
  const user = await currentUser();
  if (!sql || !user?.id) return NONE;
  try {
    const body = await req.json().catch(() => ({}));
    const lines = clean(body?.lines);
    await sql`
      insert into carts (user_id, data, updated_at) values (${Number(user.id)}, ${JSON.stringify(lines)}::jsonb, now())
      on conflict (user_id) do update set data = excluded.data, updated_at = now()
    `;
    return NextResponse.json({ ok: true, lines });
  } catch (err) {
    console.error("cart save:", err);
    return NextResponse.json({ error: "Could not save the cart." }, { status: 500 });
  }
}
