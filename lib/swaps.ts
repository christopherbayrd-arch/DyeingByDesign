// ============================================================
//  Swaps in the database (server only).
//
//  A swap moves through: asked for → approved → replacement sent →
//  done. Marking it Done is what touches Inventory: the piece that
//  came back goes on the shelf as ready to sell. If the replacement
//  was pulled off the shelf (rather than made), ticking that box on
//  "sent" takes it off.
// ============================================================
import { getDb } from "@/lib/db";
import { addStock, takeStock } from "@/lib/inventory";
import { itemLabel } from "@/lib/inventoryShared";
import { isSwapStatus, type Swap, type SwapStatus } from "@/lib/swapShared";

type Sql = NonNullable<ReturnType<typeof getDb>>;
type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const iso = (v: unknown) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

export function rowToSwap(r: Row): Swap {
  const status = str(r.status);
  return {
    id: Number(r.id),
    ref: str(r.ref),
    orderId: numOrNull(r.order_id),
    lineId: numOrNull(r.line_id),
    email: str(r.email),
    name: str(r.name),
    slug: str(r.slug),
    variant: str(r.variant),
    color: str(r.color),
    size: str(r.size),
    wantColor: str(r.want_color),
    wantSize: str(r.want_size),
    reason: str(r.reason),
    note: str(r.note),
    address: (r.address as Swap["address"]) ?? null,
    status: (isSwapStatus(status) ? status : "requested") as SwapStatus,
    ownerNote: str(r.owner_note),
    fromStock: Boolean(r.from_stock),
    createdAt: iso(r.created_at),
    decidedAt: iso(r.decided_at) || null,
    sentAt: iso(r.sent_at) || null,
    doneAt: iso(r.done_at) || null,
    orderRef: str(r.order_ref),
    orderAt: iso(r.order_at) || "",
    alreadySwapped: Boolean(r.line_swapped_at),
  };
}

// Everything on the swaps board, newest first, with the order it came from
export async function loadSwaps(sql: Sql, limit = 200): Promise<Swap[]> {
  const rows = (await sql`
    select s.*,
           o.stripe_session_id as order_ref,
           coalesce(o.sold_at, o.paid_at, o.created_at) as order_at,
           l.swapped_at as line_swapped_at
    from swaps s
    left join orders o on o.id = s.order_id
    left join order_lines l on l.id = s.line_id
    order by
      case s.status when 'requested' then 0 when 'approved' then 1 when 'sent' then 2 else 3 end,
      s.created_at desc
    limit ${limit}
  `) as Row[];
  return rows.map(rowToSwap);
}

export async function loadSwap(sql: Sql, id: number): Promise<Swap | null> {
  const rows = (await sql`select * from swaps where id = ${id}`) as Row[];
  return rows.length ? rowToSwap(rows[0]) : null;
}

// Never throws — before schema.sql is re-run there's simply nothing here
export async function loadSwapsSafe(sql: Sql | null): Promise<{ swaps: Swap[]; error: string }> {
  if (!sql) return { swaps: [], error: "No database connected yet." };
  try {
    return { swaps: await loadSwaps(sql), error: "" };
  } catch {
    return {
      swaps: [],
      error:
        "The swaps table isn't in the database yet. Run the latest schema.sql in Neon (it's safe to re-run), then reload this page.",
    };
  }
}

export type NewSwap = {
  ref: string;
  orderId: number | null;
  lineId: number | null;
  email: string;
  name: string;
  slug: string;
  variant: string;
  color: string;
  size: string;
  wantColor: string;
  wantSize: string;
  reason: string;
  note: string;
  address: Record<string, string> | null;
};

export async function createSwap(sql: Sql, s: NewSwap): Promise<number> {
  const rows = (await sql`
    insert into swaps (ref, order_id, line_id, email, name, slug, variant, color, size,
                       want_color, want_size, reason, note, address)
    values (${s.ref}, ${s.orderId}, ${s.lineId}, ${s.email}, ${s.name}, ${s.slug}, ${s.variant},
            ${s.color}, ${s.size}, ${s.wantColor}, ${s.wantSize}, ${s.reason}, ${s.note},
            ${s.address ? JSON.stringify(s.address) : null}::jsonb)
    returning id
  `) as { id: number }[];
  return Number(rows[0]?.id ?? 0);
}

// Has this exact piece already had its one swap?
export async function lineAlreadySwapped(sql: Sql, lineId: number): Promise<boolean> {
  try {
    const rows = (await sql`select swapped_at from order_lines where id = ${lineId}`) as Row[];
    return Boolean(rows[0]?.swapped_at);
  } catch {
    return false;
  }
}

// Is there already an open swap for this line, or this email + piece?
export async function openSwapFor(sql: Sql, lineId: number | null, email: string, slug: string): Promise<Swap | null> {
  const rows = (
    lineId
      ? await sql`
          select * from swaps
          where line_id = ${lineId} and status in ('requested', 'approved', 'sent')
          order by id desc limit 1
        `
      : await sql`
          select * from swaps
          where lower(email) = lower(${email}) and slug = ${slug}
            and status in ('requested', 'approved', 'sent')
          order by id desc limit 1
        `
  ) as Row[];
  return rows.length ? rowToSwap(rows[0]) : null;
}

// ---- moving one along ----------------------------------------------------
// approved: nothing on the shelf moves yet — they still have the piece.
// sent:     if the replacement came off the shelf, take it off.
// done:     the piece they sent back goes on the shelf, and that line's
//           one swap is used up.
export async function setSwapStatus(
  sql: Sql,
  id: number,
  status: SwapStatus,
  opts: { ownerNote?: string; fromStock?: boolean } = {}
): Promise<{ swap: Swap | null; shelf: string }> {
  const before = await loadSwap(sql, id);
  if (!before) return { swap: null, shelf: "" };
  const note = opts.ownerNote ?? before.ownerNote;
  let shelf = "";

  if (status === "sent" && opts.fromStock && before.status !== "sent" && before.status !== "done") {
    // the replacement was already made and sitting on the shelf
    const key = {
      kind: "shirt" as const,
      slug: before.slug,
      name: before.variant,
      color: before.wantColor || before.color,
      size: before.wantSize || before.size,
    };
    const r = await takeStock(sql, key, 1, "pulled", {
      orderId: before.orderId,
      note: `swap ${before.ref}`,
      label: itemLabel(key),
    });
    if (r.moved > 0) shelf = `Took 1 ${itemLabel(key)} off the shelf.`;
  }

  if (status === "done" && before.status !== "done") {
    // what they sent back is sellable again
    const key = {
      kind: "shirt" as const,
      slug: before.slug,
      name: before.variant,
      color: before.color,
      size: before.size,
    };
    const r = await addStock(sql, key, 1, "returned", {
      orderId: before.orderId,
      note: `swap ${before.ref}`,
      label: itemLabel(key),
    });
    if (r.moved > 0) shelf = `Put 1 ${itemLabel(key)} back on the shelf (${r.qty} now).`;
    if (before.lineId) {
      try {
        await sql`update order_lines set swapped_at = now() where id = ${before.lineId} and swapped_at is null`;
      } catch {
        // database without the column yet — the swap still closes
      }
    }
  }

  await sql`
    update swaps
    set status = ${status},
        owner_note = ${note},
        from_stock = ${opts.fromStock ?? before.fromStock},
        decided_at = case when ${status} in ('approved', 'declined') then coalesce(decided_at, now()) else decided_at end,
        sent_at    = case when ${status} = 'sent' then coalesce(sent_at, now()) else sent_at end,
        done_at    = case when ${status} = 'done' then coalesce(done_at, now()) else done_at end
    where id = ${id}
  `;
  return { swap: await loadSwap(sql, id), shelf };
}

// Count of swaps that still need Corey (for the badge on the order desk)
export async function openSwapCount(sql: Sql | null): Promise<number> {
  if (!sql) return 0;
  try {
    const rows = (await sql`select count(*)::int as n from swaps where status = 'requested'`) as { n: number }[];
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
