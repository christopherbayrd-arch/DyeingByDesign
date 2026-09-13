// ============================================================
//  Taking something out of Sales history, and putting it back.
//
//  A whole sale goes to the v12 bin (orders.deleted_at) — already
//  filtered out of the history, the queue and the desk, and already
//  restorable for 30 days.
//
//  A single line is different. order_lines is read from about thirty
//  places, and a row that's still sitting there is a row one of them
//  will eventually count. So the line really leaves the table, and the
//  whole row is copied into removed_lines first: nothing reads that
//  except the Removed panel, so a removed line can't be counted as a
//  sale by accident, and it can still be put back exactly as it was.
// ============================================================
import { getDb } from "@/lib/db";
import { reverseMoves } from "@/lib/inventory";
import { rewriteItems, retotal } from "@/lib/orderAdmin";
import { ONE_SIZE, colorName } from "@/lib/products";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

export const NEEDS_SCHEMA_V13 =
  "This needs the newest schema.sql run in Neon first (the removed_lines table isn't there yet).";

function isMissing(err: unknown): boolean {
  const s = String((err as { message?: string })?.message ?? err);
  return /relation .* does not exist|undefined_table|42P01|column .* does not exist|42703/i.test(s);
}

// "2 × Sumac · Black Spruce · L"
export function lineLabel(l: {
  name?: unknown; slug?: unknown; variant?: unknown; color?: unknown; size?: unknown; qty?: unknown;
}): string {
  const name = String(l.name ?? "") || String(l.slug ?? "");
  const variant = String(l.variant ?? "");
  const color = String(l.color ?? "");
  const size = String(l.size ?? "");
  const qty = Number(l.qty) || 1;
  return [
    `${qty} × ${name}`,
    variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : "",
    color ? colorName(color) : "",
    size === ONE_SIZE ? "one size" : size,
  ].filter(Boolean).join(" · ");
}

export type Removal = {
  id: number;
  orderId: number | null;
  label: string;
  amountCents: number;
  cogsCents: number | null;
  reason: string;
  restocked: boolean;
  removedAt: string;
};

// What's currently out of the history and could be put back.
export async function loadRemovals(sql: Sql, limit = 100): Promise<Removal[]> {
  try {
    const rows = (await sql`
      select id, order_id, label, amount_cents, cogs_cents, reason, restocked, removed_at
      from removed_lines where restored_at is null
      order by removed_at desc limit ${limit}
    `) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      orderId: r.order_id === null || r.order_id === undefined ? null : Number(r.order_id),
      label: String(r.label ?? ""),
      amountCents: Number(r.amount_cents) || 0,
      cogsCents: r.cogs_cents === null || r.cogs_cents === undefined ? null : Number(r.cogs_cents),
      reason: String(r.reason ?? ""),
      restocked: Boolean(r.restocked),
      removedAt: r.removed_at instanceof Date ? r.removed_at.toISOString() : String(r.removed_at ?? ""),
    }));
  } catch {
    // table isn't there yet — nothing has ever been removed
    return [];
  }
}

// Take one line out. The order itself stays; its item list and total are
// rebuilt from what's left, so the desk, the queue and the history agree.
export async function removeLine(
  sql: Sql,
  lineId: number,
  opts: { reason: string; restock: boolean }
): Promise<{ orderId: number; label: string; amountCents: number }> {
  const rows = (await sql`select * from order_lines where id = ${lineId}`) as Row[];
  if (rows.length === 0) throw new Error("That line is already gone.");
  const l = rows[0];
  const orderId = Number(l.order_id);

  // An order with nothing in it isn't a sale — that's a whole-sale removal.
  const count = (await sql`select count(*)::int as n from order_lines where order_id = ${orderId}`) as { n: number }[];
  if (Number(count[0]?.n ?? 0) <= 1) {
    throw new Error(
      "That's the only thing in this sale. Remove the whole sale instead, so it goes to the bin in one piece and can come back the same way."
    );
  }

  const qty = Number(l.qty) || 1;
  const amountCents = qty * (Number(l.unit_price_cents) || 0);
  const cogs = l.unit_cogs_cents === null || l.unit_cogs_cents === undefined ? null : qty * Number(l.unit_cogs_cents);
  const label = lineLabel(l);

  // the shelf first, so a failure here doesn't leave an orphaned snapshot
  let restocked = false;
  if (opts.restock) {
    try {
      restocked = (await reverseMoves(sql, { lineId }, "taken out of sales history")) > 0;
    } catch (err) {
      console.error("restock on line removal failed:", err);
    }
  }

  try {
    await sql`
      insert into removed_lines (order_id, line_id, snapshot, label, amount_cents, cogs_cents, reason, restocked)
      values (${orderId}, ${lineId}, ${JSON.stringify(l)}::jsonb, ${label}, ${amountCents},
              ${cogs}, ${opts.reason || ""}, ${restocked})
    `;
  } catch (err) {
    if (isMissing(err)) throw new Error(NEEDS_SCHEMA_V13);
    throw err;
  }

  await sql`delete from order_lines where id = ${lineId}`;
  await rewriteItems(sql, orderId);
  await retotal(sql, orderId);
  return { orderId, label, amountCents };
}

// Put it back exactly as it was, same id and all, so anything that pointed at
// it (a swap, an inventory move) still points at the right line.
export async function restoreLine(sql: Sql, removalId: number): Promise<{ orderId: number; label: string }> {
  const rows = (await sql`
    select * from removed_lines where id = ${removalId} and restored_at is null
  `) as Row[];
  if (rows.length === 0) throw new Error("That one has already been put back.");
  const r = rows[0];
  const snap = (r.snapshot ?? {}) as Row;
  const orderId = Number(r.order_id);

  if (!snap.slug) throw new Error("There's nothing saved for that one.");

  // The columns every version of this table has go in directly; anything
  // newer (the design on a bandana) is set afterwards, so a database that
  // hasn't had the later schema run still takes the line back.
  await sql`
    insert into order_lines (order_id, slug, name, size, color, qty, unit_price_cents, unit_cogs_cents, cogs_breakdown, costed_at)
    values (
      ${orderId},
      ${String(snap.slug ?? "")},
      ${String(snap.name ?? "")},
      ${String(snap.size ?? "")},
      ${String(snap.color ?? "")},
      ${Number(snap.qty) || 1},
      ${Number(snap.unit_price_cents) || 0},
      ${snap.unit_cogs_cents === null || snap.unit_cogs_cents === undefined ? null : Number(snap.unit_cogs_cents)},
      ${snap.cogs_breakdown ? JSON.stringify(snap.cogs_breakdown) : null}::jsonb,
      ${snap.costed_at ? String(snap.costed_at) : null}::timestamptz
    )
  `;
  // the design on a bandana only exists on a database that's had v10 run
  if (snap.variant) {
    try {
      await sql`
        update order_lines set variant = ${String(snap.variant)}
        where id = (select max(id) from order_lines where order_id = ${orderId})
      `;
    } catch {
      // no variant column here
    }
  }

  await sql`update removed_lines set restored_at = now() where id = ${removalId}`;
  await rewriteItems(sql, orderId);
  await retotal(sql, orderId);
  return { orderId, label: String(r.label ?? "") };
}
