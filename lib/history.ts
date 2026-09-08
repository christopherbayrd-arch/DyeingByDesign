// Loads the sales history from the database (server only) and turns the
// raw rows into the shapes in lib/historyMath.ts.
import { getDb } from "@/lib/db";
import type { HistoryLine, HistoryOrder } from "@/lib/historyMath";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

export type HistoryData = {
  orders: HistoryOrder[];       // sold orders (anything past "requested"), newest first
  withoutLines: number;         // sold orders that predate the history and need a backfill
  hasSheet: boolean;            // a COGS sheet exists
  error: string;
};

function str(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}
// Timestamps come back as Date objects from the driver; keep them ISO so
// the browser can slice a day off them and sort them as strings.
function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? String(v ?? "") : d.toISOString();
}
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadHistory(sql: Sql): Promise<HistoryData> {
  try {
    const orderRows = (await sql`
      select id, created_at, paid_at, sold_at, status, channel, name, email, stripe_session_id,
             amount_total, shipping_cents, fee_cents, postage_cents, note
      from orders
      where status <> 'requested'
      order by coalesce(sold_at, paid_at, created_at) desc, id desc
      limit 2000
    `) as Row[];
    const lineRows = (await sql`
      select l.* from order_lines l
      join orders o on o.id = l.order_id
      where o.status <> 'requested'
      order by l.id
    `) as Row[];

    const linesByOrder = new Map<number, HistoryLine[]>();
    for (const r of lineRows) {
      const b = (r.cogs_breakdown ?? {}) as Record<string, unknown>;
      const line: HistoryLine = {
        id: Number(r.id),
        slug: str(r.slug),
        name: str(r.name) || str(r.slug),
        size: str(r.size),
        color: str(r.color),
        qty: Number(r.qty) || 1,
        unitPriceCents: Number(r.unit_price_cents) || 0,
        unitCogsCents: intOrNull(r.unit_cogs_cents),
        estimated: Boolean(b.estimated) || intOrNull(r.unit_cogs_cents) === null,
        reason: str(b.reason),
        typeName: str(b.typeName),
        blankCents: intOrNull(b.blank),
        materialsCents: intOrNull(b.materialsTotal),
        priceSource: b.priceSource === "catalog" ? "catalog" : "order",
      };
      const oid = Number(r.order_id);
      linesByOrder.set(oid, [...(linesByOrder.get(oid) ?? []), line]);
    }

    let withoutLines = 0;
    const orders: HistoryOrder[] = orderRows.map((r) => {
      const id = Number(r.id);
      const lines = linesByOrder.get(id) ?? [];
      if (lines.length === 0) withoutLines++;
      const sid = str(r.stripe_session_id);
      const ref = sid.startsWith("email_")
        ? sid.replace("email_", "")
        : sid.startsWith("manual_")
          ? "hand entered"
          : "card";
      return {
        id,
        at: iso(r.sold_at || r.paid_at || r.created_at),
        status: str(r.status) || "paid",
        channel: str(r.channel) || (sid.startsWith("email_") ? "request" : "site"),
        customer: str(r.name) || str(r.email) || "",
        ref,
        amountTotal: intOrNull(r.amount_total),
        shippingCents: intOrNull(r.shipping_cents),
        feeCents: intOrNull(r.fee_cents),
        postageCents: intOrNull(r.postage_cents),
        note: str(r.note),
        lines,
      };
    });

    let hasSheet = false;
    try {
      const c = (await sql`select 1 from cogs where id = 1`) as Row[];
      hasSheet = c.length > 0;
    } catch {
      hasSheet = false;
    }

    return { orders, withoutLines, hasSheet, error: "" };
  } catch (err) {
    return {
      orders: [],
      withoutLines: 0,
      hasSheet: false,
      error: `Could not read the sales history — run the latest schema.sql in Neon (it adds the order_lines table). (${String(err).slice(0, 140)})`,
    };
  }
}
