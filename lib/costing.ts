// ============================================================
//  Costing — freezes what a shirt cost at the moment it sold.
//
//  The COGS page is a live calculator; this file is the memory.
//  When an order is paid, each line gets the blank price for its
//  exact color and size plus the materials for its design's shirt
//  type, saved on the line forever (order_lines.unit_cogs_cents).
//  Server only — it talks to the database.
// ============================================================
import { getDb } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { blankStats, materialPerShirt, normalizeDoc, num, type CogsDoc } from "@/lib/cogs";
import { stockKey } from "@/lib/products";
import { parseItemsMeta, type MetaLine } from "@/lib/orderFormat";

type Sql = NonNullable<ReturnType<typeof getDb>>;

export type CostBreakdown = {
  typeName: string;                       // "Bleach shirt (leaf)"
  blank: number;                          // cents
  blankSource: "exact" | "average" | "none";
  materials: { name: string; cents: number }[];
  materialsTotal: number;                 // cents
  estimated: boolean;                     // true when something was missing or costed after the fact
  reason?: string;
  sheetVersion: number | null;            // cogs_versions.id used, null = the live sheet
  sheetDate?: string;
};

export type UnitCost = { cents: number | null; breakdown: CostBreakdown };

// The whole calculation, with nothing hidden: blank for this exact
// color+size (falls back to the average blank), plus each material
// the design's shirt type uses.
export function unitCostFromDoc(
  doc: CogsDoc | null,
  slug: string,
  color: string,
  size: string,
  sheet: { id: number | null; date?: string } = { id: null }
): UnitCost {
  const base: CostBreakdown = {
    typeName: "",
    blank: 0,
    blankSource: "none",
    materials: [],
    materialsTotal: 0,
    estimated: true,
    sheetVersion: sheet.id,
    sheetDate: sheet.date,
  };
  if (!doc) return { cents: null, breakdown: { ...base, reason: "No COGS sheet saved yet." } };

  const typeId = doc.designs[slug];
  const type = typeId ? doc.types.find((t) => t.id === typeId) : undefined;
  if (!type) {
    return {
      cents: null,
      breakdown: { ...base, reason: `"${slug}" isn't linked to a shirt type on the COGS page (step 4).` },
    };
  }

  let blank = num(doc.blanks[stockKey(color, size)]);
  let blankSource: CostBreakdown["blankSource"] = "exact";
  let estimated = false;
  let reason: string | undefined;
  if (!(blank > 0)) {
    const stats = blankStats(doc.blanks);
    if (stats.avg > 0) {
      blank = stats.avg;
      blankSource = "average";
      estimated = true;
      reason = `No blank price for ${color || "?"} / ${size || "?"} on the COGS page — used the average blank.`;
    } else {
      blank = 0;
      blankSource = "none";
      estimated = true;
      reason = "No blank prices on the COGS page yet.";
    }
  }

  const materials = doc.materials
    .filter((m) => type.uses[m.id] !== undefined)
    .map((m) => ({
      name: m.name || "Untitled material",
      cents: Math.round(materialPerShirt(m) * num(type.uses[m.id]) * 100),
    }));
  const materialsTotal = materials.reduce((a, m) => a + m.cents, 0);
  const cents = Math.round(blank * 100) + materialsTotal;

  return {
    cents,
    breakdown: {
      ...base,
      typeName: type.name,
      blank: Math.round(blank * 100),
      blankSource,
      materials,
      materialsTotal,
      estimated,
      reason,
    },
  };
}

// The sheet that was true on a given date: the newest saved version
// from before then, or the live sheet when nothing older exists.
export async function loadCogsAt(sql: Sql, at: Date | null): Promise<{ doc: CogsDoc | null; sheet: { id: number | null; date?: string } }> {
  if (at) {
    try {
      const rows = (await sql`
        select id, data, created_at from cogs_versions
        where created_at <= ${at.toISOString()}
        order by created_at desc limit 1
      `) as { id: number; data: unknown; created_at: string }[];
      if (rows.length > 0) {
        return { doc: normalizeDoc(rows[0].data), sheet: { id: rows[0].id, date: String(rows[0].created_at) } };
      }
    } catch {
      // versions table missing (older schema) — fall through to the live sheet
    }
  }
  try {
    const rows = (await sql`select data, updated_at from cogs where id = 1`) as { data: unknown; updated_at: string }[];
    if (rows.length > 0) return { doc: normalizeDoc(rows[0].data), sheet: { id: null, date: String(rows[0].updated_at) } };
  } catch {
    // no cogs table yet
  }
  return { doc: null, sheet: { id: null } };
}

export type LineInput = {
  slug: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  unitPriceCents: number;
  priceSource: "order" | "catalog"; // catalog = price wasn't on the order, used today's price
};

// Turns metadata into line inputs, filling in names (and, for old
// orders that never carried a price, today's catalog price).
export async function linesFromMeta(meta: string | null | undefined): Promise<LineInput[]> {
  const out: LineInput[] = [];
  for (const l of parseItemsMeta(meta)) {
    let name = l.slug.charAt(0).toUpperCase() + l.slug.slice(1);
    let catalogPrice = 0;
    try {
      const p = await getProduct(l.slug);
      if (p) {
        name = p.name;
        catalogPrice = p.priceCents;
      }
    } catch {
      // keep the fallbacks
    }
    out.push({
      slug: l.slug,
      name,
      size: l.size,
      color: l.color,
      qty: l.qty,
      unitPriceCents: l.priceCents ?? catalogPrice,
      priceSource: l.priceCents !== null ? "order" : "catalog",
    });
  }
  return out;
}

export async function insertOrderLines(sql: Sql, orderId: number, lines: LineInput[]) {
  for (const l of lines) {
    await sql`
      insert into order_lines (order_id, slug, name, size, color, qty, unit_price_cents, cogs_breakdown)
      values (${orderId}, ${l.slug}, ${l.name}, ${l.size}, ${l.color}, ${l.qty}, ${l.unitPriceCents},
              ${JSON.stringify({ priceSource: l.priceSource })}::jsonb)
    `;
  }
}

// Freeze the cost on every line of an order that hasn't been costed yet
// (or on all of them with force). Uses the sheet that was current when
// the order was paid; if that sheet can't cost a line (a design that
// wasn't linked yet, say) today's sheet is tried and the result marked
// as an estimate. `afterTheFact` marks everything as an estimate.
// Returns how many lines got a number, how many were left alone, and
// how many still have no cost.
export async function costOrder(
  sql: Sql,
  orderId: number,
  opts: { force?: boolean; afterTheFact?: boolean } = {}
): Promise<{ costed: number; skipped: number; uncosted: number }> {
  const orders = (await sql`
    select id, coalesce(sold_at, paid_at, created_at) as at from orders where id = ${orderId}
  `) as { id: number; at: string }[];
  if (orders.length === 0) return { costed: 0, skipped: 0, uncosted: 0 };
  const at = new Date(orders[0].at);
  const dated = await loadCogsAt(sql, at);
  let live: Awaited<ReturnType<typeof loadCogsAt>> | null = null;

  const lines = (await sql`
    select id, slug, size, color, unit_cogs_cents, cogs_breakdown
    from order_lines where order_id = ${orderId} order by id
  `) as {
    id: number;
    slug: string;
    size: string;
    color: string;
    unit_cogs_cents: number | null;
    cogs_breakdown: Record<string, unknown> | null;
  }[];

  let costed = 0;
  let skipped = 0;
  let uncosted = 0;
  for (const l of lines) {
    if (!opts.force && l.unit_cogs_cents !== null && l.unit_cogs_cents !== undefined) {
      skipped++;
      continue;
    }
    let { cents, breakdown } = unitCostFromDoc(dated.doc, l.slug, l.color, l.size, dated.sheet);
    if (cents === null && dated.sheet.id !== null) {
      // the sheet from back then couldn't cost it — try today's
      if (!live) live = await loadCogsAt(sql, null);
      const retry = unitCostFromDoc(live.doc, l.slug, l.color, l.size, live.sheet);
      if (retry.cents !== null) {
        cents = retry.cents;
        breakdown = {
          ...retry.breakdown,
          estimated: true,
          reason: [
            `The sheet from ${dated.sheet.date ? new Date(dated.sheet.date).toLocaleDateString("en-US") : "back then"} couldn't cost this, so today's sheet was used.`,
            retry.breakdown.reason,
          ].filter(Boolean).join(" "),
        };
      }
    }
    if (opts.afterTheFact) {
      breakdown.estimated = true;
      breakdown.reason = [
        "Costed after the fact with the sheet from " +
          (breakdown.sheetDate ? new Date(breakdown.sheetDate).toLocaleDateString("en-US") : "today") + ".",
        breakdown.reason,
      ].filter(Boolean).join(" ");
    }
    const merged = { ...(l.cogs_breakdown ?? {}), ...breakdown };
    await sql`
      update order_lines
      set unit_cogs_cents = ${cents}, cogs_breakdown = ${JSON.stringify(merged)}::jsonb, costed_at = now()
      where id = ${l.id}
    `;
    if (cents === null) uncosted++;
    else costed++;
  }
  return { costed, skipped, uncosted };
}

// Older orders (before v4) have no line rows yet. Build them from the
// items text and cost them with today's sheet, marked as estimates.
export async function backfillOrders(sql: Sql): Promise<{ orders: number; lines: number }> {
  const rows = (await sql`
    select o.id, o.items from orders o
    where not exists (select 1 from order_lines l where l.order_id = o.id)
      and o.items is not null and o.items <> ''
    order by o.id
  `) as { id: number; items: string }[];
  let lines = 0;
  for (const o of rows) {
    const inputs = await linesFromMeta(o.items);
    if (inputs.length === 0) continue;
    await insertOrderLines(sql, o.id, inputs);
    lines += inputs.length;
    await sql`update orders set paid_at = coalesce(paid_at, created_at) where id = ${o.id} and status <> 'requested'`;
    await costOrder(sql, o.id, { afterTheFact: true });
  }
  return { orders: rows.length, lines };
}

export type { MetaLine };
