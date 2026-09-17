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
  shipped?: boolean;                      // false = sold in person, so "shipped only" materials were left out
};

export type UnitCost = { cents: number | null; breakdown: CostBreakdown };

// The whole calculation, with nothing hidden: blank for this exact
// color+size (falls back to the average blank), plus each material
// the design's shirt type uses. A shirt sold in person (booth, Quick
// sale) leaves out the materials marked "shipped only" (label, mailer).
export function unitCostFromDoc(
  doc: CogsDoc | null,
  slug: string,
  color: string,
  size: string,
  sheet: { id: number | null; date?: string } = { id: null },
  opts: { shipped?: boolean } = {}
): UnitCost {
  const shipped = opts.shipped !== false;
  const base: CostBreakdown = {
    typeName: "",
    blank: 0,
    blankSource: "none",
    materials: [],
    materialsTotal: 0,
    estimated: true,
    sheetVersion: sheet.id,
    sheetDate: sheet.date,
    shipped,
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
    .filter((m) => type.uses[m.id] !== undefined && (shipped || m.shippedOnly !== true))
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
  variant?: string;                 // which design goes on a bandana
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
      variant: l.variant,
    });
  }
  return out;
}

export async function insertOrderLines(sql: Sql, orderId: number, lines: LineInput[]) {
  for (const l of lines) {
    try {
      await sql`
        insert into order_lines (order_id, slug, name, size, color, qty, unit_price_cents, variant, cogs_breakdown)
        values (${orderId}, ${l.slug}, ${l.name}, ${l.size}, ${l.color}, ${l.qty}, ${l.unitPriceCents},
                ${l.variant ?? ""}, ${JSON.stringify({ priceSource: l.priceSource })}::jsonb)
      `;
    } catch {
      // a database that hasn't had the latest schema.sql run yet
      await sql`
        insert into order_lines (order_id, slug, name, size, color, qty, unit_price_cents, cogs_breakdown)
        values (${orderId}, ${l.slug}, ${l.name}, ${l.size}, ${l.color}, ${l.qty}, ${l.unitPriceCents},
                ${JSON.stringify({ priceSource: l.priceSource })}::jsonb)
      `;
    }
  }
}

// What an order row needs to say whether it gets posted.
export type OrderShipFacts = {
  channel?: unknown;
  shipping?: unknown;
  shipping_cents?: unknown;
  postage_cents?: unknown;
  label_bought_at?: unknown;
  tracking_number?: unknown;
};

// Does this order get posted? Card checkouts and order requests always do
// (the site has no pickup). Anything else ships once it has a label,
// postage, shipping charged, or an address. A sale at the table has none.
export function orderShips(o: OrderShipFacts): boolean {
  const channel = String(o.channel ?? "");
  if (channel === "site" || channel === "request") return true;
  if (o.label_bought_at || o.tracking_number) return true;
  if ((Number(o.postage_cents) || 0) > 0) return true;
  if ((Number(o.shipping_cents) || 0) > 0) return true;
  let s = o.shipping;
  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = null;
    }
  }
  const a = s && typeof s === "object" ? (s as { address?: Record<string, unknown> | null }).address : null;
  return Boolean(a && (String(a.line1 ?? "").trim() || String(a.postal_code ?? "").trim()));
}

// Read the whole row as JSON so a database without the label columns yet
// still answers. If it can't tell, the order counts as shipped, which is
// how every order was costed before "shipped only" materials existed.
async function orderShipsById(sql: Sql, orderId: number): Promise<boolean> {
  try {
    const rows = (await sql`select to_jsonb(orders) as o from orders where id = ${orderId}`) as { o: unknown }[];
    let o = rows[0]?.o;
    if (typeof o === "string") o = JSON.parse(o);
    return o && typeof o === "object" ? orderShips(o as OrderShipFacts) : true;
  } catch {
    return true;
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
  opts: { force?: boolean; afterTheFact?: boolean; shippingChanged?: boolean } = {}
): Promise<{ costed: number; skipped: number; uncosted: number }> {
  const orders = (await sql`
    select id, coalesce(sold_at, paid_at, created_at) as at from orders where id = ${orderId}
  `) as { id: number; at: string }[];
  if (orders.length === 0) return { costed: 0, skipped: 0, uncosted: 0 };
  const at = new Date(orders[0].at);
  const shipped = await orderShipsById(sql, orderId);
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
    const hasCost = l.unit_cogs_cents !== null && l.unit_cogs_cents !== undefined;
    if (opts.shippingChanged) {
      // Only a shirt already costed one way (shipped / in person) that now
      // needs the other. Shirts frozen before "shipped only" existed never
      // say which, and stay exactly as they were.
      const was = (l.cogs_breakdown as { shipped?: unknown } | null)?.shipped;
      if (!hasCost || typeof was !== "boolean" || was === shipped) {
        skipped++;
        continue;
      }
    } else if (!opts.force && hasCost) {
      skipped++;
      continue;
    }
    // A cost typed in by hand (custom pieces, odd blanks) is never overwritten by the sheet
    if (l.cogs_breakdown && (l.cogs_breakdown as { manual?: boolean }).manual) {
      skipped++;
      continue;
    }
    let { cents, breakdown } = unitCostFromDoc(dated.doc, l.slug, l.color, l.size, dated.sheet, { shipped });
    if (cents === null && dated.sheet.id !== null) {
      // the sheet from back then couldn't cost it — try today's
      if (!live) live = await loadCogsAt(sql, null);
      const retry = unitCostFromDoc(live.doc, l.slug, l.color, l.size, live.sheet, { shipped });
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
    if (opts.shippingChanged && cents === null) {
      // the sheet can't cost it any more — keep the cost it already has
      skipped++;
      continue;
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

// An order's shipping changed after its cost was frozen: a label bought
// for a desk sale, postage typed in or cleared, an address added. Moves the
// shipping supplies onto (or off) its shirts, same dated sheet as before.
// Never throws, because it rides along with whatever made the change.
export async function refreshShippingCost(sql: Sql, orderId: number) {
  try {
    return await costOrder(sql, orderId, { shippingChanged: true });
  } catch (err) {
    console.error("shipping recost failed:", err);
    return null;
  }
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

// Type a cost in by hand for one line — custom pieces, a blank bought at
// a different price, anything the sheet can't know. Sticks until you
// type over it; recost leaves it alone.
export async function setLineCost(sql: Sql, lineId: number, cents: number | null, note = ""): Promise<boolean> {
  const rows = (await sql`select id, cogs_breakdown from order_lines where id = ${lineId}`) as { id: number; cogs_breakdown: Record<string, unknown> | null }[];
  if (rows.length === 0) return false;
  const prev = rows[0].cogs_breakdown ?? {};
  const breakdown = cents === null
    ? { ...prev, manual: false, estimated: true, reason: "Cost cleared — recost it or type one in." }
    : {
        ...prev,
        typeName: (prev.typeName as string) || "Entered by hand",
        blank: cents,
        blankSource: "manual",
        materials: [],
        materialsTotal: 0,
        manual: true,
        estimated: false,
        reason: note ? `Entered by hand: ${note}` : "Entered by hand.",
        sheetVersion: null,
      };
  await sql`
    update order_lines
    set unit_cogs_cents = ${cents}, cogs_breakdown = ${JSON.stringify(breakdown)}::jsonb, costed_at = now()
    where id = ${lineId}
  `;
  return true;
}

export type { MetaLine };
