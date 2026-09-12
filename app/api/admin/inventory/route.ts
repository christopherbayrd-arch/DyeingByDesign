import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isColorKey } from "@/lib/products";
import { addStock, loadItems, loadMoves, rowToItem, setStock, takeStock } from "@/lib/inventory";
import { itemLabel, type InvKey, type InvKind } from "@/lib/inventoryShared";

// The Inventory tab. Owner only — middleware guards /api/admin.
//   GET                                   everything on hand + the recent log
//   POST { op: "set",  kind, …, qty }     an exact count (after counting the shelf)
//   POST { op: "add",  kind, …, qty, reason, useBlanks }   made / bought / found some
//   POST { op: "take", kind, …, qty }     take some off by hand
//   POST { op: "other", id?, name, color, size, priceCents, qty }   add or edit an other item
//   DELETE ?id=                           remove an other item
// Every change answers with the fresh list, so the screen never drifts.

type Row = Record<string, unknown>;

const NO_TABLE = "The inventory tables aren't in the database yet. Run the latest schema.sql in Neon (safe to re-run), then try again.";

async function everything(sql: NonNullable<ReturnType<typeof getDb>>) {
  return { items: await loadItems(sql), moves: await loadMoves(sql) };
}

export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ items: [], moves: [], error: "No database connected yet." });
  try {
    return NextResponse.json(await everything(sql));
  } catch {
    return NextResponse.json({ items: [], moves: [], error: NO_TABLE });
  }
}

function clean(v: unknown, max: number) {
  return String(v ?? "").trim().slice(0, max);
}

// Turns the request into a shelf key, or an error message
function keyFrom(b: Record<string, unknown>): { key?: InvKey; error?: string } {
  const kind = String(b.kind ?? "") as InvKind;
  const size = clean(b.size, 12);
  if (kind === "shirt") {
    const slug = clean(b.slug, 60).toLowerCase();
    const color = clean(b.color, 40);
    if (!/^[a-z0-9-]+$/.test(slug)) return { error: "Pick a design." };
    if (!isColorKey(color)) return { error: "Pick a color." };
    if (!size) return { error: "Pick a size." };
    return { key: { kind, slug, color, size } };
  }
  if (kind === "blank") {
    const color = clean(b.color, 40);
    if (!isColorKey(color)) return { error: "Pick a color." };
    if (!size) return { error: "Pick a size." };
    return { key: { kind, color, size } };
  }
  if (kind === "other") {
    const name = clean(b.name, 80);
    if (!name) return { error: "What is it? Give it a name." };
    return { key: { kind, name, color: clean(b.color, 40), size } };
  }
  return { error: "Shirt, blank, or other?" };
}

function count(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 99999 ? n : null;
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(b.op ?? "");
  const note = clean(b.note, 200) || null;

  try {
    if (op === "other") {
      const id = Number(b.id) || 0;
      const priceRaw = String(b.priceCents ?? "").trim();
      const priceCents = priceRaw === "" ? null : Math.max(0, Math.min(100000, Math.round(Number(priceRaw))));
      const { key, error } = keyFrom({ ...b, kind: "other" });
      if (!key) return NextResponse.json({ error }, { status: 400 });
      const qty = count(b.qty);
      if (id) {
        // rename / reprice an item that's already on the shelf
        try {
          await sql`
            update inventory set name = ${key.name ?? ""}, color = ${key.color ?? ""}, size = ${key.size ?? ""},
                   price_cents = ${Number.isFinite(priceCents as number) ? priceCents : null}, updated_at = now()
            where id = ${id} and kind = 'other'
          `;
        } catch {
          return NextResponse.json({ error: "There's already an item with that name, size, and color." }, { status: 400 });
        }
        if (qty !== null) await setStock(sql, key, qty, { note });
      } else {
        await setStock(sql, key, qty ?? 0, { note, priceCents: Number.isFinite(priceCents as number) ? priceCents : null });
      }
      return NextResponse.json({ ok: true, ...(await everything(sql)) });
    }

    const { key, error } = keyFrom(b);
    if (!key) return NextResponse.json({ error }, { status: 400 });
    const qty = count(b.qty);
    if (qty === null) return NextResponse.json({ error: "How many?" }, { status: 400 });

    if (op === "set") {
      await setStock(sql, key, qty, { note });
    } else if (op === "add") {
      if (qty < 1) return NextResponse.json({ error: "How many?" }, { status: 400 });
      const reason = ["made", "bought", "adjusted"].includes(String(b.reason)) ? String(b.reason) : "adjusted";
      await addStock(sql, key, qty, reason, { note });
      // Making finished shirts uses up blanks of the same color and size
      if (key.kind === "shirt" && reason === "made" && b.useBlanks) {
        await takeStock(sql, { kind: "blank", color: key.color, size: key.size }, qty, "used", {
          note: `made ${itemLabel(key)}`,
        });
      }
    } else if (op === "take") {
      if (qty < 1) return NextResponse.json({ error: "How many?" }, { status: 400 });
      await takeStock(sql, key, qty, "adjusted", { note });
    } else {
      return NextResponse.json({ error: "Unknown change." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await everything(sql)) });
  } catch (err) {
    console.error("inventory:", err);
    const msg = String((err as Error)?.message ?? err);
    if (/inventory/.test(msg) && /does not exist/.test(msg)) return NextResponse.json({ error: NO_TABLE }, { status: 500 });
    return NextResponse.json({ error: "Couldn't save that. Try again in a minute." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const id = Number(new URL(req.url).searchParams.get("id")) || 0;
  if (!id) return NextResponse.json({ error: "Which item?" }, { status: 400 });
  try {
    const rows = (await sql`select * from inventory where id = ${id}`) as Row[];
    if (!rows.length) return NextResponse.json({ ok: true, ...(await everything(sql)) });
    const it = rowToItem(rows[0]);
    if (it.kind !== "other" && it.qty > 0) {
      return NextResponse.json({ error: "Set it to 0 first." }, { status: 400 });
    }
    if (it.qty > 0) {
      await sql`
        insert into inventory_moves (item_id, kind, label, delta, qty_after, reason)
        values (null, ${it.kind}, ${itemLabel(it)}, ${-it.qty}, 0, 'removed')
      `;
    }
    await sql`delete from inventory where id = ${id}`;
    return NextResponse.json({ ok: true, ...(await everything(sql)) });
  } catch (err) {
    console.error("inventory delete:", err);
    return NextResponse.json({ error: "Couldn't remove it." }, { status: 500 });
  }
}
