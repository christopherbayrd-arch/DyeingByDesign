// ============================================================
//  Inventory in the database (server only). Every count change goes
//  through addStock / takeStock / setStock, which update the count and
//  write the log line in one statement, so the log always matches.
//  Counts never go below zero: selling a shirt that was never counted
//  just takes nothing off.
// ============================================================
import { getDb } from "@/lib/db";
import {
  blankKey,
  itemLabel,
  shirtKey,
  type InvItem,
  type InvKey,
  type InvKind,
  type InvMove,
} from "@/lib/inventoryShared";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

type Ctx = {
  orderId?: number | null;
  lineId?: number | null;
  note?: string | null;
  label?: string;
  priceCents?: number | null;
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const iso = (v: unknown) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

function asKind(v: unknown): InvKind {
  return v === "blank" ? "blank" : v === "other" ? "other" : "shirt";
}

export function rowToItem(r: Row): InvItem {
  return {
    id: Number(r.id),
    kind: asKind(r.kind),
    slug: str(r.slug),
    name: str(r.name),
    color: str(r.color),
    size: str(r.size),
    qty: Number(r.qty) || 0,
    priceCents: num(r.price_cents),
    updatedAt: iso(r.updated_at),
  };
}

export function rowToMove(r: Row): InvMove {
  return {
    id: Number(r.id),
    itemId: num(r.item_id),
    kind: asKind(r.kind),
    label: str(r.label),
    delta: Number(r.delta) || 0,
    qtyAfter: num(r.qty_after),
    reason: str(r.reason),
    orderId: num(r.order_id),
    lineId: num(r.line_id),
    note: str(r.note),
    reversed: Boolean(r.reversed_at),
    createdAt: iso(r.created_at),
  };
}

function norm(k: InvKey) {
  return {
    kind: k.kind,
    slug: (k.slug ?? "").trim(),
    name: (k.name ?? "").trim(),
    color: (k.color ?? "").trim(),
    size: (k.size ?? "").trim(),
  };
}

export async function loadItems(sql: Sql): Promise<InvItem[]> {
  const rows = (await sql`
    select * from inventory order by kind, slug, name, color, size
  `) as Row[];
  return rows.map(rowToItem);
}

export async function loadMoves(sql: Sql, limit = 150): Promise<InvMove[]> {
  const rows = (await sql`
    select * from inventory_moves order by created_at desc, id desc limit ${limit}
  `) as Row[];
  return rows.map(rowToMove);
}

// What's on hand, as quick lookups: shirts by "slug|color|size", blanks by "color|size"
export async function stockMaps(sql: Sql): Promise<{
  shirts: Record<string, number>;
  blanks: Record<string, number>;
  others: InvItem[];
}> {
  const items = await loadItems(sql);
  const shirts: Record<string, number> = {};
  const blanks: Record<string, number> = {};
  for (const it of items) {
    if (it.kind === "shirt") shirts[shirtKey(it.slug, it.color, it.size)] = it.qty;
    else if (it.kind === "blank") blanks[blankKey(it.color, it.size)] = it.qty;
  }
  return { shirts, blanks, others: items.filter((i) => i.kind === "other") };
}

// Put n on the shelf (creates the row the first time)
export async function addStock(sql: Sql, key: InvKey, n: number, reason: string, ctx: Ctx = {}) {
  const k = norm(key);
  const add = Math.floor(n);
  if (!(add > 0)) return { id: null as number | null, qty: 0, moved: 0 };
  const label = ctx.label ?? itemLabel(k);
  const rows = (await sql`
    with up as (
      insert into inventory (kind, slug, name, color, size, qty, price_cents)
      values (${k.kind}, ${k.slug}, ${k.name}, ${k.color}, ${k.size}, ${add}, ${ctx.priceCents ?? null})
      on conflict (kind, slug, name, color, size)
      do update set qty = inventory.qty + excluded.qty,
                    price_cents = coalesce(excluded.price_cents, inventory.price_cents),
                    updated_at = now()
      returning id, qty
    ), mv as (
      insert into inventory_moves (item_id, kind, label, delta, qty_after, reason, order_id, line_id, note)
      select id, ${k.kind}::text, ${label}::text, ${add}::int, qty, ${reason}::text,
             ${ctx.orderId ?? null}::int, ${ctx.lineId ?? null}::int, ${ctx.note ?? null}::text
      from up
      returning id
    )
    select id, qty from up
  `) as Row[];
  return { id: Number(rows[0]?.id ?? 0) || null, qty: Number(rows[0]?.qty ?? 0), moved: add };
}

// Take up to n off the shelf. Returns how many actually came off (never below zero).
export async function takeStock(sql: Sql, key: InvKey, n: number, reason: string, ctx: Ctx = {}) {
  const k = norm(key);
  const take = Math.floor(n);
  if (!(take > 0)) return { id: null as number | null, qty: 0, moved: 0 };
  const label = ctx.label ?? itemLabel(k);
  const rows = (await sql`
    with prev as (
      select id, qty from inventory
      where kind = ${k.kind} and slug = ${k.slug} and name = ${k.name} and color = ${k.color} and size = ${k.size}
      for update
    ), upd as (
      update inventory i set qty = greatest(i.qty - ${take}::int, 0), updated_at = now()
      from prev where i.id = prev.id and prev.qty > 0
      returning i.id, i.qty, prev.qty as before
    ), mv as (
      insert into inventory_moves (item_id, kind, label, delta, qty_after, reason, order_id, line_id, note)
      select id, ${k.kind}::text, ${label}::text, qty - before, qty, ${reason}::text,
             ${ctx.orderId ?? null}::int, ${ctx.lineId ?? null}::int, ${ctx.note ?? null}::text
      from upd where qty <> before
      returning id
    )
    select id, qty, before from upd
  `) as Row[];
  if (rows.length === 0) return { id: null, qty: 0, moved: 0 };
  return { id: Number(rows[0].id), qty: Number(rows[0].qty), moved: Number(rows[0].before) - Number(rows[0].qty) };
}

// Same, for a row you already know by id (the "other" items)
export async function takeById(sql: Sql, id: number, n: number, reason: string, ctx: Ctx = {}) {
  const rows = (await sql`select * from inventory where id = ${id}`) as Row[];
  if (!rows.length) return { id: null as number | null, qty: 0, moved: 0 };
  const it = rowToItem(rows[0]);
  return takeStock(sql, it, n, reason, { ...ctx, label: ctx.label ?? itemLabel(it) });
}

// Set an exact count (after counting the shelf)
export async function setStock(sql: Sql, key: InvKey, qty: number, ctx: Ctx = {}) {
  const k = norm(key);
  const q = Math.max(0, Math.min(99999, Math.floor(qty)));
  const label = ctx.label ?? itemLabel(k);
  const rows = (await sql`
    with prev as (
      -- the count before this change (every part of one statement sees the same
      -- starting point, so this is the old number even though "up" changes it)
      select id, qty from inventory
      where kind = ${k.kind} and slug = ${k.slug} and name = ${k.name} and color = ${k.color} and size = ${k.size}
    ), up as (
      insert into inventory (kind, slug, name, color, size, qty, price_cents)
      values (${k.kind}, ${k.slug}, ${k.name}, ${k.color}, ${k.size}, ${q}, ${ctx.priceCents ?? null})
      on conflict (kind, slug, name, color, size)
      do update set qty = excluded.qty,
                    price_cents = coalesce(excluded.price_cents, inventory.price_cents),
                    updated_at = now()
      returning id, qty
    ), mv as (
      insert into inventory_moves (item_id, kind, label, delta, qty_after, reason, order_id, line_id, note)
      select up.id, ${k.kind}::text, ${label}::text, up.qty - coalesce((select qty from prev), 0), up.qty,
             'counted', null, null, ${ctx.note ?? null}::text
      from up where up.qty <> coalesce((select qty from prev), 0)
      returning id
    )
    select id, qty, coalesce((select qty from prev), 0) as before from up
  `) as Row[];
  return { id: Number(rows[0]?.id ?? 0) || null, qty: Number(rows[0]?.qty ?? q), moved: Number(rows[0]?.qty ?? q) - Number(rows[0]?.before ?? 0) };
}

// Undo: put back everything a sale (or one order line) took off the shelf —
// and take back anything it added. Each move is only ever reversed once.
export async function reverseMoves(sql: Sql, where: { orderId?: number; lineId?: number }, note = "") {
  let claimed: Row[] = [];
  if (where.lineId) {
    claimed = (await sql`
      update inventory_moves set reversed_at = now()
      where line_id = ${where.lineId} and reversed_at is null and reason in ('sold', 'pulled', 'used')
      returning id, item_id, kind, label, delta, order_id, line_id
    `) as Row[];
  } else if (where.orderId) {
    claimed = (await sql`
      update inventory_moves set reversed_at = now()
      where order_id = ${where.orderId} and reversed_at is null and reason in ('sold', 'pulled', 'used')
      returning id, item_id, kind, label, delta, order_id, line_id
    `) as Row[];
  }
  let back = 0;
  for (const m of claimed) {
    const itemId = num(m.item_id);
    const n = -Number(m.delta); // they were negative (taken); put that many back
    if (!itemId || !(n > 0)) continue;
    await sql`
      with upd as (
        update inventory set qty = qty + ${n}::int, updated_at = now() where id = ${itemId}
        returning id, kind, qty
      )
      insert into inventory_moves (item_id, kind, label, delta, qty_after, reason, order_id, line_id, note)
      select id, kind, ${str(m.label)}::text, ${n}::int, qty, 'returned', ${num(m.order_id)}::int, ${num(m.line_id)}::int, ${note || null}::text
      from upd
    `;
    back += n;
  }
  return back;
}

// For the "on hand" numbers on the booth and the make queue. Never throws:
// before schema.sql adds the tables, it's just empty.
export async function stockMapsSafe(sql: Sql | null) {
  if (!sql) return { shirts: {}, blanks: {}, others: [] as InvItem[], ready: false };
  try {
    return { ...(await stockMaps(sql)), ready: true };
  } catch {
    return { shirts: {}, blanks: {}, others: [] as InvItem[], ready: false };
  }
}
