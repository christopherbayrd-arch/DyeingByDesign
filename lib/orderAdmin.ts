// ============================================================
//  Cancelling, deleting and restoring orders (server only).
//
//  Three different things, on purpose:
//
//    cancel   the order was real and isn't happening. Keeps its
//             number, stays on the desk, drops out of revenue and
//             the make queue. Shirts can go back on the shelf and
//             a refund amount can be written down.
//    delete   it was never a real order (a test, spam, a double
//             click). Hidden everywhere, but it sits in the bin
//             for 30 days first, so a misclick is recoverable.
//    purge    the bin emptying itself after 30 days, and the one
//             button that clears Stripe test orders. This is the
//             only place rows actually leave the database.
//
//  Deleting an order NEVER refunds anybody — Stripe still has the
//  money. That's why anything with money on it has to be
//  acknowledged before it can be deleted; see moneyOnIt().
// ============================================================
import { getDb } from "@/lib/db";
import { reverseMoves, takeStock } from "@/lib/inventory";
import { metaLine } from "@/lib/orderFormat";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

// The v12 columns only exist after schema.sql has been re-run in Neon.
// Everything that READS them uses the to_jsonb trick (a column that isn't
// there just reads as null); everything that WRITES them says this instead
// of throwing a wall of Postgres at you.
export const NEEDS_SCHEMA =
  "This needs the newest schema.sql run in Neon first (the orders table is missing the cancel and delete columns).";

function isMissingColumn(err: unknown): boolean {
  const s = String((err as { message?: string })?.message ?? err);
  return /column .* does not exist|undefined_column|42703/i.test(s);
}

export type OrderRow = {
  id: number;
  status: string;
  amountTotal: number | null;
  testMode: boolean;
  cancelledAt: string | null;
  deletedAt: string | null;
  restockedAt: string | null;
};

export async function getOrder(sql: Sql, id: number): Promise<OrderRow | null> {
  const rows = (await sql`
    select id, status, amount_total,
           coalesce((to_jsonb(orders) ->> 'test_mode')::boolean, false) as test_mode,
           to_jsonb(orders) ->> 'cancelled_at' as cancelled_at,
           to_jsonb(orders) ->> 'deleted_at'   as deleted_at,
           to_jsonb(orders) ->> 'restocked_at' as restocked_at
    from orders where id = ${id}
  `) as Row[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    status: String(r.status ?? ""),
    amountTotal: r.amount_total === null || r.amount_total === undefined ? null : Number(r.amount_total),
    testMode: Boolean(r.test_mode),
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
    deletedAt: r.deleted_at ? String(r.deleted_at) : null,
    restockedAt: r.restocked_at ? String(r.restocked_at) : null,
  };
}

// Has real money gone through this order? A test order never counts, and
// neither does a request nobody has paid yet.
export function moneyOnIt(o: OrderRow): boolean {
  if (o.testMode) return false;
  if (o.status === "requested") return false;
  return (o.amountTotal ?? 0) > 0;
}

// ---------- the shelf ----------

// Put back whatever this order took off the Inventory shelf. Safe to call
// twice: reverseMoves only claims moves that haven't been reversed yet.
async function putBack(sql: Sql, id: number, note: string): Promise<number> {
  try {
    return await reverseMoves(sql, { orderId: id }, note);
  } catch (err) {
    console.error("put stock back failed:", err);
    return 0;
  }
}

// Take it off again, for un-cancelling something that was restocked.
async function takeAgain(sql: Sql, id: number, note: string): Promise<number> {
  let off = 0;
  try {
    const lines = (await sql`
      select slug, size, color, qty,
             coalesce(to_jsonb(order_lines) ->> 'variant', '') as variant
      from order_lines where order_id = ${id}
    `) as Row[];
    for (const l of lines) {
      const qty = Math.max(0, Number(l.qty) || 0);
      if (!qty) continue;
      const moved = await takeStock(
        sql,
        { kind: "shirt", slug: String(l.slug), name: String(l.variant ?? ""), color: String(l.color), size: String(l.size) },
        qty,
        "sold",
        { orderId: id, note }
      );
      off += moved.moved;
    }
  } catch (err) {
    console.error("take stock again failed:", err);
  }
  return off;
}

// ---------- cancel ----------

export async function cancelOrder(
  sql: Sql,
  id: number,
  opts: { reason: string; restock: boolean; refundCents: number | null }
): Promise<{ restocked: number }> {
  let restocked = 0;
  if (opts.restock) restocked = await putBack(sql, id, "order cancelled");
  try {
    await sql`
      update orders
      set status        = 'cancelled',
          cancelled_at  = now(),
          cancel_reason = ${opts.reason || null},
          refund_cents  = ${opts.refundCents},
          restocked_at  = ${opts.restock ? new Date().toISOString() : null}::timestamptz
      where id = ${id}
    `;
  } catch (err) {
    if (isMissingColumn(err)) throw new Error(NEEDS_SCHEMA);
    throw err;
  }
  return { restocked };
}

// Back to a live order. Anything that went back on the shelf comes off again,
// so the shelf still matches what's actually promised to somebody.
export async function uncancelOrder(sql: Sql, id: number): Promise<{ status: string; tookBack: number }> {
  const o = await getOrder(sql, id);
  if (!o) throw new Error("Order not found.");
  let tookBack = 0;
  if (o.restockedAt) tookBack = await takeAgain(sql, id, "cancel undone");
  // never paid → back to awaiting payment, otherwise back to paid
  const rows = (await sql`
    update orders
    set status        = case when paid_at is null then 'requested' else 'paid' end,
        cancelled_at  = null,
        cancel_reason = null,
        refund_cents  = null,
        restocked_at  = null
    where id = ${id}
    returning status
  `) as Row[];
  return { status: String(rows[0]?.status ?? "paid"), tookBack };
}

// ---------- delete (the bin) ----------

export async function softDeleteOrder(
  sql: Sql,
  id: number,
  opts: { reason: string; restock: boolean }
): Promise<{ restocked: number }> {
  let restocked = 0;
  if (opts.restock) restocked = await putBack(sql, id, "order deleted");
  try {
    await sql`
      update orders
      set deleted_at    = now(),
          delete_reason = ${opts.reason || null},
          restocked_at  = ${opts.restock ? new Date().toISOString() : null}::timestamptz
      where id = ${id}
    `;
  } catch (err) {
    if (isMissingColumn(err)) throw new Error(NEEDS_SCHEMA);
    throw err;
  }
  return { restocked };
}

export async function restoreOrder(sql: Sql, id: number): Promise<{ tookBack: number }> {
  const o = await getOrder(sql, id);
  if (!o) throw new Error("Order not found.");
  let tookBack = 0;
  if (o.restockedAt && !o.cancelledAt) tookBack = await takeAgain(sql, id, "delete undone");
  await sql`
    update orders
    set deleted_at = null, delete_reason = null,
        restocked_at = case when cancelled_at is null then null else restocked_at end
    where id = ${id}
  `;
  return { tookBack };
}

// ---------- purge (rows really leaving) ----------

// Anything that's been in the bin longer than this is gone for good.
export const BIN_DAYS = 30;

async function hardDelete(sql: Sql, ids: number[], note: string): Promise<number> {
  let gone = 0;
  for (const id of ids) {
    await putBack(sql, id, note);            // never strand stock on a dead order
    // inventory_moves keeps its order_id: ids are never reused, so the shelf
    // log stays readable even after the order itself is gone.
    const rows = (await sql`delete from orders where id = ${id} returning id`) as Row[];
    gone += rows.length;
  }
  return gone;
}

// Empty the bin for one order right now, instead of waiting out the 30 days.
export async function purgeOrder(sql: Sql, id: number): Promise<number> {
  return hardDelete(sql, [id], "deleted order emptied");
}

// Called on every admin page load. Cheap, and it means the bin empties itself
// without anything scheduled.
export async function purgeOldDeleted(sql: Sql): Promise<number> {
  try {
    const rows = (await sql`
      select id from orders
      where (to_jsonb(orders) ->> 'deleted_at')::timestamptz < now() - make_interval(days => ${BIN_DAYS})
      limit 50
    `) as Row[];
    if (rows.length === 0) return 0;
    return await hardDelete(sql, rows.map((r) => Number(r.id)), "deleted order purged");
  } catch {
    // columns aren't there yet — nothing to purge
    return 0;
  }
}

// The "clear test orders" button. Test orders go straight out, no bin: they
// were never real, and leaving them around is the whole problem.
export async function clearTestOrders(sql: Sql): Promise<number> {
  try {
    const rows = (await sql`
      select id from orders
      where coalesce((to_jsonb(orders) ->> 'test_mode')::boolean, false) = true
      limit 500
    `) as Row[];
    if (rows.length === 0) return 0;
    return await hardDelete(sql, rows.map((r) => Number(r.id)), "test order cleared");
  } catch (err) {
    if (isMissingColumn(err)) throw new Error(NEEDS_SCHEMA);
    throw err;
  }
}

// ---------- editing ----------

// order_lines is the truth once an order exists; orders.items is the readable
// copy the desk, the queue and the emails all print from. After changing
// lines, this rewrites that copy so the two never drift apart.
export async function rewriteItems(sql: Sql, id: number): Promise<string> {
  const lines = (await sql`
    select slug, size, color, qty, unit_price_cents,
           coalesce(to_jsonb(order_lines) ->> 'variant', '') as variant
    from order_lines where order_id = ${id} order by id
  `) as Row[];
  const meta = lines
    .map((l) =>
      metaLine({
        slug: String(l.slug),
        size: String(l.size),
        color: String(l.color),
        qty: Number(l.qty) || 1,
        priceCents: Number(l.unit_price_cents) || 0,
        variant: String(l.variant ?? ""),
      })
    )
    .join("; ");
  // keep any "| note: ..." the customer left on the end
  const cur = (await sql`select items from orders where id = ${id}`) as Row[];
  const old = String(cur[0]?.items ?? "");
  const at = old.indexOf("| note:");
  const note = at >= 0 ? " " + old.slice(at) : "";
  const next = meta + note;
  await sql`update orders set items = ${next} where id = ${id}`;
  return next;
}

// What the order adds up to now: every line, plus whatever shipping was
// charged. Kept in sync so the desk total and Sales history agree.
export async function retotal(sql: Sql, id: number): Promise<number> {
  const rows = (await sql`
    select coalesce(sum(l.qty * l.unit_price_cents), 0)::int as items,
           coalesce(o.shipping_cents, 0) as ship
    from orders o left join order_lines l on l.order_id = o.id
    where o.id = ${id}
    group by o.shipping_cents
  `) as Row[];
  const total = Number(rows[0]?.items ?? 0) + Number(rows[0]?.ship ?? 0);
  await sql`update orders set amount_total = ${total} where id = ${id}`;
  return total;
}
