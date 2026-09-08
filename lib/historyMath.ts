// ============================================================
//  Sales history — shapes + the math. No database code here, so the
//  admin page (server) and the history table (browser) share it.
//  Money is in cents throughout.
// ============================================================

export type HistoryLine = {
  id: number;
  slug: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  unitPriceCents: number;
  unitCogsCents: number | null;   // null = not costed yet
  estimated: boolean;              // cost is an estimate (see reason)
  manual: boolean;                 // cost was typed in by hand (recost leaves it alone)
  reason: string;                  // why it's an estimate, or ""
  typeName: string;
  blankCents: number | null;
  materialsCents: number | null;
  priceSource: "order" | "catalog";
};

export type HistoryOrder = {
  id: number;
  at: string;                      // ISO — when it sold (sold_at, else paid_at, else created_at)
  status: string;
  channel: string;                 // site | request | market | instagram | other
  customer: string;
  ref: string;                     // DBD-XXXX for requests, "card" for Stripe, "hand entered" for manual
  amountTotal: number | null;
  shippingCents: number | null;    // charged to the customer
  feeCents: number | null;
  postageCents: number | null;
  note: string;
  lines: HistoryLine[];
};

export const CHANNEL_LABELS: Record<string, string> = {
  site: "Site · card",
  request: "Site · request",
  custom: "Custom piece",
  market: "Market",
  instagram: "Instagram / DM",
  other: "Other",
};

export type Summary = {
  orders: number;
  units: number;
  revenue: number;          // shirts only, what customers paid
  cogs: number;             // frozen cost of the costed shirts
  costedUnits: number;
  uncostedUnits: number;
  estimatedUnits: number;
  shippingCharged: number;
  fees: number;
  postage: number;
  gross: number;            // revenue − cogs
  net: number;              // gross + shipping charged − fees − postage
};

export function emptySummary(): Summary {
  return {
    orders: 0, units: 0, revenue: 0, cogs: 0, costedUnits: 0, uncostedUnits: 0, estimatedUnits: 0,
    shippingCharged: 0, fees: 0, postage: 0, gross: 0, net: 0,
  };
}

export function summarize(orders: HistoryOrder[]): Summary {
  const s = emptySummary();
  for (const o of orders) {
    s.orders++;
    s.shippingCharged += o.shippingCents ?? 0;
    s.fees += o.feeCents ?? 0;
    s.postage += o.postageCents ?? 0;
    for (const l of o.lines) {
      s.units += l.qty;
      s.revenue += l.unitPriceCents * l.qty;
      if (l.unitCogsCents === null) {
        s.uncostedUnits += l.qty;
      } else {
        s.cogs += l.unitCogsCents * l.qty;
        s.costedUnits += l.qty;
        if (l.estimated) s.estimatedUnits += l.qty;
      }
    }
  }
  s.gross = s.revenue - s.cogs;
  s.net = s.gross + s.shippingCharged - s.fees - s.postage;
  return s;
}

// Margin as a share of shirt revenue, on the shirts that have a cost
export function marginPct(s: Summary): number | null {
  if (s.costedUnits === 0) return null;
  const costedRevenue = s.revenue * (s.costedUnits / Math.max(s.units, 1));
  if (costedRevenue <= 0) return null;
  return ((costedRevenue - s.cogs) / costedRevenue) * 100;
}

export function lineMarginPct(l: HistoryLine): number | null {
  if (l.unitCogsCents === null || l.unitPriceCents <= 0) return null;
  return ((l.unitPriceCents - l.unitCogsCents) / l.unitPriceCents) * 100;
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function byMonth(orders: HistoryOrder[]): { key: string; label: string; summary: Summary }[] {
  const groups = new Map<string, HistoryOrder[]>();
  for (const o of orders) {
    const k = monthKey(o.at);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, os]) => ({ key, label: monthLabel(key), summary: summarize(os) }));
}

// Per design: an order that has several designs counts toward each one,
// with only that design's lines.
export function byDesign(orders: HistoryOrder[]): { slug: string; name: string; summary: Summary; blanks: string[] }[] {
  const groups = new Map<string, { name: string; orders: HistoryOrder[]; blanks: Map<string, number> }>();
  for (const o of orders) {
    const slugs = new Set(o.lines.map((l) => l.slug));
    for (const slug of slugs) {
      const lines = o.lines.filter((l) => l.slug === slug);
      const g = groups.get(slug) ?? { name: lines[0].name, orders: [] as HistoryOrder[], blanks: new Map<string, number>() };
      // shipping/fees/postage belong to the order, not a design — zero them here
      g.orders.push({ ...o, shippingCents: 0, feeCents: 0, postageCents: 0, lines });
      for (const l of lines) {
        const k = `${l.color || "?"} ${l.size || "?"}`;
        g.blanks.set(k, (g.blanks.get(k) ?? 0) + l.qty);
      }
      groups.set(slug, g);
    }
  }
  return [...groups.entries()]
    .map(([slug, g]) => ({
      slug,
      name: g.name,
      summary: summarize(g.orders),
      blanks: [...g.blanks.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`),
    }))
    .sort((a, b) => b.summary.units - a.summary.units);
}

export function fmtMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function fmtPct(p: number | null): string {
  return p === null ? "—" : `${Math.round(p)}%`;
}
