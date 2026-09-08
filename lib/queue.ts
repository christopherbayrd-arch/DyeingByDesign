// ============================================================
//  The make queue: every open order in the order it should be worked.
//  Rush first, then first come first served (queued_at), holds last.
//  Server only.
// ============================================================
import { getDb } from "@/lib/db";
import { orderNote, parseItemsMeta } from "@/lib/orderFormat";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

export type QueueLine = {
  id: number | null;      // order_lines id (null for orders that predate lines)
  slug: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  madeAt: string | null;
};

export type QueueOrder = {
  id: number;
  position: number;       // 1 = next up (0 in the "made" list)
  status: string;         // requested | paid | made
  paid: boolean;          // status other than requested
  priority: number;       // 1 rush · 0 · -1 hold
  createdAt: string;
  queuedAt: string;
  customer: string;
  email: string;
  ref: string;            // DBD-XXXX, "card", "custom piece", "hand entered"
  channel: string;
  note: string;           // customer's note from the order form
  ownerNote: string;      // orders.note
  hasAddress: boolean;
  lines: QueueLine[];
  shirts: number;
  made: number;           // shirts ticked off
  allMade: boolean;       // every line ticked (needs line rows)
  daysWaiting: number;
};

export type QueueRequest = { id: number; name: string; kind: string; status: string; createdAt: string; daysWaiting: number };

export type QueueData = {
  toMake: QueueOrder[];   // still has shirts to make (requested + paid, not archived)
  made: QueueOrder[];     // every shirt made — waiting to be paid / shipped
  waitingQuote: QueueRequest[];   // custom requests that aren't orders yet
  totals: { orders: number; shirts: number; shirtsLeft: number; rush: number; hold: number };
  byDesign: { name: string; qty: number }[];
  byBlank: { color: string; size: string; qty: number }[];
  error: string;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const daysSince = (isoDate: string, now: number) => Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 86400000));

function refOf(sid: string) {
  if (sid.startsWith("email_")) return sid.replace("email_", "");
  if (sid.startsWith("custom_")) return "custom piece";
  if (sid.startsWith("manual_")) return "hand entered";
  return "card";
}

export function sortQueue<T extends { priority: number; queuedAt: string; id: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.queuedAt !== b.queuedAt) return a.queuedAt < b.queuedAt ? -1 : 1;
    return a.id - b.id;
  });
}

const EMPTY: QueueData = {
  toMake: [],
  made: [],
  waitingQuote: [],
  totals: { orders: 0, shirts: 0, shirtsLeft: 0, rush: 0, hold: 0 },
  byDesign: [],
  byBlank: [],
  error: "",
};

export async function loadQueue(sql: Sql): Promise<QueueData> {
  try {
    const orders = (await sql`
      select id, status, priority, created_at, queued_at, name, email, stripe_session_id, channel, items, note, shipping
      from orders
      where archived_at is null and status in ('requested', 'paid', 'made')
      order by priority desc, queued_at asc, id asc
    `) as Row[];
    const lineRows = (await sql`
      select l.id, l.order_id, l.slug, l.name, l.size, l.color, l.qty, l.made_at
      from order_lines l join orders o on o.id = l.order_id
      where o.archived_at is null and o.status in ('requested', 'paid', 'made')
      order by l.id
    `) as Row[];
    const linesByOrder = new Map<number, QueueLine[]>();
    for (const r of lineRows) {
      const oid = Number(r.order_id);
      const l: QueueLine = {
        id: Number(r.id),
        slug: str(r.slug),
        name: str(r.name) || str(r.slug),
        size: str(r.size),
        color: str(r.color),
        qty: Number(r.qty) || 1,
        madeAt: r.made_at ? iso(r.made_at) : null,
      };
      linesByOrder.set(oid, [...(linesByOrder.get(oid) ?? []), l]);
    }
    const now = Date.now();
    const all: QueueOrder[] = orders.map((o) => {
      const id = Number(o.id);
      const hasLineRows = linesByOrder.has(id);
      let lines = linesByOrder.get(id) ?? [];
      if (lines.length === 0) {
        // older order with no line rows yet — still show what to make
        lines = parseItemsMeta(str(o.items)).map((l) => ({
          id: null,
          slug: l.slug,
          name: l.slug.charAt(0).toUpperCase() + l.slug.slice(1),
          size: l.size,
          color: l.color,
          qty: l.qty,
          madeAt: null,
        }));
      }
      const shirts = lines.reduce((n, l) => n + l.qty, 0);
      const made = lines.reduce((n, l) => n + (l.madeAt ? l.qty : 0), 0);
      const status = str(o.status) || "paid";
      const s = o.shipping as { address?: Record<string, string> } | null;
      const createdAt = iso(o.created_at);
      return {
        id,
        position: 0,
        status,
        paid: status !== "requested",
        priority: Number(o.priority) || 0,
        createdAt,
        queuedAt: iso(o.queued_at) || createdAt,
        customer: str(o.name) || str(o.email) || "—",
        email: str(o.email),
        ref: refOf(str(o.stripe_session_id)),
        channel: str(o.channel),
        note: orderNote(str(o.items)),
        ownerNote: str(o.note),
        hasAddress: Boolean(s?.address?.line1),
        lines,
        shirts,
        made,
        allMade: hasLineRows && lines.every((l) => l.madeAt !== null),
        daysWaiting: daysSince(createdAt, now),
      };
    });
    const sorted = sortQueue(all);
    const toMake = sorted
      .filter((o) => o.status !== "made" && !o.allMade)
      .map((o, i) => ({ ...o, position: i + 1 }));
    const madeList = sorted.filter((o) => o.status === "made" || o.allMade);

    const byDesign = new Map<string, number>();
    const byBlank = new Map<string, number>();
    let shirtsLeft = 0;
    for (const o of toMake) {
      if (o.priority < 0) continue;              // on hold — not in the pick list
      for (const l of o.lines) {
        if (l.madeAt) continue;
        shirtsLeft += l.qty;
        byDesign.set(l.name, (byDesign.get(l.name) ?? 0) + l.qty);
        const k = `${l.color}|${l.size}`;
        byBlank.set(k, (byBlank.get(k) ?? 0) + l.qty);
      }
    }

    let waitingQuote: QueueRequest[] = [];
    try {
      const reqs = (await sql`
        select id, name, kind, status, created_at from special_requests
        where archived_at is null and order_id is null and status in ('new', 'quoted', 'accepted')
        order by created_at asc
      `) as Row[];
      waitingQuote = reqs.map((r) => {
        const createdAt = iso(r.created_at);
        return { id: Number(r.id), name: str(r.name), kind: str(r.kind), status: str(r.status), createdAt, daysWaiting: daysSince(createdAt, now) };
      });
    } catch {
      // older schema — fine
    }

    return {
      toMake,
      made: madeList,
      waitingQuote,
      totals: {
        orders: toMake.length,
        shirts: toMake.filter((o) => o.priority >= 0).reduce((n, o) => n + o.shirts, 0),
        shirtsLeft,
        rush: toMake.filter((o) => o.priority > 0).length,
        hold: toMake.filter((o) => o.priority < 0).length,
      },
      byDesign: [...byDesign.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
      byBlank: [...byBlank.entries()]
        .map(([k, qty]) => { const [color, size] = k.split("|"); return { color, size, qty }; })
        .sort((a, b) => a.color.localeCompare(b.color) || b.qty - a.qty),
      error: "",
    };
  } catch (err) {
    return { ...EMPTY, error: `Could not read the queue — run the latest schema.sql in Neon. (${String(err).slice(0, 140)})` };
  }
}

// Where each open order sits in line, by order id (for the desk and the
// customer's account page). Orders that are made or shipped aren't in it.
export async function queuePositions(sql: Sql): Promise<Map<number, { position: number; of: number }>> {
  const q = await loadQueue(sql);
  const m = new Map<number, { position: number; of: number }>();
  for (const o of q.toMake) if (o.priority >= 0) m.set(o.id, { position: o.position, of: q.toMake.length });
  return m;
}

export async function queuePosition(sql: Sql, orderId: number): Promise<{ position: number; of: number } | null> {
  return (await queuePositions(sql)).get(orderId) ?? null;
}
