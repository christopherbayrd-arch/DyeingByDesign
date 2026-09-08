import { getDb } from "@/lib/db";
import { addressFromForm, addressFromOrder, type Address } from "@/lib/shipping";
import { parseItemsMeta } from "@/lib/orderFormat";

type Sql = NonNullable<ReturnType<typeof getDb>>;

export type OrderRow = {
  id: number;
  email: string | null;
  name: string | null;
  items: string | null;
  shipping: unknown;
  status: string;
  shipment_id: string | null;
  tracking_number: string | null;
  label_url: string | null;
  postage_cents: number | null;
};

export async function loadOrder(sql: Sql, id: number): Promise<OrderRow | null> {
  const rows = (await sql`
    select id, email, name, items, shipping, status, shipment_id, tracking_number, label_url, postage_cents
    from orders where id = ${id}
  `) as OrderRow[];
  return rows[0] ?? null;
}

// Shirts in the order, for the package preset (order_lines first, the
// items text as a fallback for older orders)
export async function orderShirts(sql: Sql, order: OrderRow): Promise<{ size: string; qty: number }[]> {
  const lines = (await sql`select size, qty from order_lines where order_id = ${order.id}`) as { size: string; qty: number }[];
  if (lines.length > 0) return lines.map((l) => ({ size: l.size, qty: Number(l.qty) || 1 }));
  return parseItemsMeta(order.items).map((l) => ({ size: l.size, qty: l.qty }));
}

// The address to ship to: a hand-typed one from the admin wins, otherwise
// what the order stored. Returns the EasyPost shape plus what to save.
export function resolveAddress(order: OrderRow, body: Record<string, unknown>): { address: Address; stored: unknown | null } | null {
  if (body.address && typeof body.address === "object") {
    const typed = addressFromForm(body.address as Record<string, unknown>);
    if (typed) return { address: { ...typed.address, email: order.email ?? undefined }, stored: typed.stored };
    return null;
  }
  const fromOrder = addressFromOrder(order.shipping, order.name ?? "", order.email ?? "");
  return fromOrder ? { address: fromOrder, stored: null } : null;
}
