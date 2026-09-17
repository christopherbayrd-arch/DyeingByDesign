// ============================================================
//  Operating expenses — types + the math behind /admin/expenses.
//
//  Same idea as the COGS sheet: the whole thing is one JSON
//  document in the `opex` table, and money is kept as the strings
//  people type ("20.00") so the inputs never fight the user.
//
//  COGS is what a shirt eats when you make one. This is what the
//  business pays whether you sell 5 shirts or 500.
// ============================================================

import { money, newId, num } from "@/lib/cogs";

export { money, newId, num };

// Money for this page: thousands separated, and a minus sign that reads
// like one ("-$945.88", not "$-945.88").
export function amount(n: number): string {
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${v}`;
}

export type Freq = "monthly" | "quarterly" | "yearly";

export const FREQS: { key: Freq; label: string; short: string; perYear: number }[] = [
  { key: "monthly", label: "Every month", short: "monthly", perYear: 12 },
  { key: "quarterly", label: "Every 3 months", short: "quarterly", perYear: 4 },
  { key: "yearly", label: "Once a year", short: "yearly", perYear: 1 },
];

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// A category that isn't `ebitda` sits BELOW the EBITDA line — interest,
// taxes and depreciation are added back when EBITDA is worked out.
export type OpexCategory = { key: string; name: string; blurb: string; ebitda: boolean };

export const CATEGORIES: OpexCategory[] = [
  {
    key: "website",
    name: "Website and software",
    blurb: "Hosting, the database, email, anything with a login and a monthly bill.",
    ebitda: true,
  },
  {
    key: "selling",
    name: "Selling and fees",
    blurb:
      "Platform cuts and account fees. Card fees and postage on real orders are already taken off in Sales history — leave those out or they count twice.",
    ebitda: true,
  },
  {
    key: "markets",
    name: "Markets and events",
    blurb: "Booth fees, the tent, the drive, the day itself.",
    ebitda: true,
  },
  {
    key: "marketing",
    name: "Marketing",
    blurb: "Ads, print, giveaways — anything spent to get eyes on the shirts.",
    ebitda: true,
  },
  {
    key: "shipping",
    name: "Shipping and fulfillment",
    blurb:
      "What goes out that isn't billed to one shirt. Mailers and labels that ride along with an order belong on the COGS page instead.",
    ebitda: true,
  },
  {
    key: "studio",
    name: "Studio and supplies",
    blurb: "Gear and consumables that aren't part of a single shirt.",
    ebitda: true,
  },
  {
    key: "admin",
    name: "Business and admin",
    blurb: "Insurance, licenses, the accountant, the bank, the state.",
    ebitda: true,
  },
  {
    key: "people",
    name: "People",
    blurb: "Anyone you pay. Money the owner takes out is a draw, not an expense — it doesn't go here.",
    ebitda: true,
  },
  {
    key: "finance",
    name: "Interest, taxes and depreciation",
    blurb:
      "Real money out, but it sits below the EBITDA line — that's the whole point of EBITDA, so these get added back there.",
    ebitda: false,
  },
  { key: "other", name: "Other", blurb: "Everything that doesn't fit above.", ebitda: true },
];

export function categoryInfo(key: string): OpexCategory {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

export type Recurring = {
  id: string;
  name: string;
  category: string;
  cost: string;     // dollars per charge, "" until it's filled in
  freq: Freq;
  month: number;    // 1-12: which month a yearly bill lands, or the first of a quarterly cycle
  active: boolean;
  note: string;
};

export type OneOff = {
  id: string;
  date: string;     // YYYY-MM-DD
  name: string;
  category: string;
  cost: string;
  note: string;
};

export type OpexDoc = {
  recurring: Recurring[];
  oneOffs: OneOff[];
  // "<recurring id>:<YYYY-MM>" → what was really paid that month.
  // Absent or "" means use the plan; "0" means nothing went out.
  actuals: Record<string, string>;
  // Only used when there are no sales yet to work it out from
  profitPerShirt: string;
  shirtsPerMonth: string;
};

// What the sales history hands over, one entry per month, in dollars
export type SalesMonth = {
  key: string;      // YYYY-MM
  revenue: number;  // what customers paid for shirts
  cogs: number;     // frozen cost of those shirts
  gross: number;    // revenue − cogs
  net: number;      // gross + shipping charged − card fees − postage
  units: number;
  orders: number;
  uncosted: number; // units with no cost frozen yet (so cogs is light)
};

export function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function actualKey(id: string, ym: string): string {
  return `${id}:${ym}`;
}

export function perYear(freq: Freq): number {
  return FREQS.find((f) => f.key === freq)?.perYear ?? 12;
}

// What this line averages out to per month, however it's billed
export function monthlyAverage(r: Recurring): number {
  if (!r.active) return 0;
  return (num(r.cost) * perYear(r.freq)) / 12;
}

// Does this line get billed in this month (1-12)?
export function hitsMonth(r: Recurring, month: number): boolean {
  if (!r.active) return false;
  if (r.freq === "monthly") return true;
  const start = Math.min(12, Math.max(1, Math.round(r.month || 1)));
  if (r.freq === "yearly") return month === start;
  return (((month - start) % 3) + 3) % 3 === 0;
}

export type MonthLine = {
  id: string;
  name: string;
  category: string;
  amount: number;
  planned: number;
  overridden: boolean;
  kind: "recurring" | "oneoff";
};

// Every charge that lands in one month, with any hand typed amount winning
export function monthLines(doc: OpexDoc, year: number, month: number): MonthLine[] {
  const ym = ymKey(year, month);
  const lines: MonthLine[] = [];
  for (const r of doc.recurring) {
    const planned = hitsMonth(r, month) ? num(r.cost) : 0;
    const raw = doc.actuals[actualKey(r.id, ym)];
    const overridden = raw !== undefined && raw !== "";
    const amount = overridden ? num(raw) : planned;
    if (!overridden && !r.active) continue;
    if (!overridden && planned === 0) continue;
    lines.push({
      id: r.id,
      name: r.name || "Untitled",
      category: r.category,
      amount,
      planned,
      overridden,
      kind: "recurring",
    });
  }
  for (const o of doc.oneOffs) {
    if (o.date.slice(0, 7) !== ym) continue;
    lines.push({
      id: o.id,
      name: o.name || "Untitled",
      category: o.category,
      amount: num(o.cost),
      planned: num(o.cost),
      overridden: false,
      kind: "oneoff",
    });
  }
  return lines;
}

export type MonthTotals = { total: number; operating: number; belowLine: number };

export function monthTotals(doc: OpexDoc, year: number, month: number): MonthTotals {
  let total = 0;
  let operating = 0;
  for (const l of monthLines(doc, year, month)) {
    total += l.amount;
    if (categoryInfo(l.category).ebitda) operating += l.amount;
  }
  return { total, operating, belowLine: total - operating };
}

export function yearMonths(doc: OpexDoc, year: number): (MonthTotals & { month: number; ym: string })[] {
  return MONTHS.map((_, i) => ({ month: i + 1, ym: ymKey(year, i + 1), ...monthTotals(doc, year, i + 1) }));
}

export function yearTotals(doc: OpexDoc, year: number): MonthTotals {
  return yearMonths(doc, year).reduce(
    (a, m) => ({ total: a.total + m.total, operating: a.operating + m.operating, belowLine: a.belowLine + m.belowLine }),
    { total: 0, operating: 0, belowLine: 0 }
  );
}

// The steady state: every recurring line averaged to a month, by category
export function planByCategory(doc: OpexDoc): { category: OpexCategory; perMonth: number; lines: number }[] {
  return CATEGORIES.map((category) => {
    const rows = doc.recurring.filter((r) => r.category === category.key);
    return {
      category,
      perMonth: rows.reduce((a, r) => a + monthlyAverage(r), 0),
      lines: rows.filter((r) => r.active && num(r.cost) > 0).length,
    };
  }).filter((g) => g.lines > 0 || g.perMonth > 0);
}

export function planPerMonth(doc: OpexDoc, opts?: { operatingOnly?: boolean }): number {
  return doc.recurring.reduce((a, r) => {
    if (opts?.operatingOnly && !categoryInfo(r.category).ebitda) return a;
    return a + monthlyAverage(r);
  }, 0);
}

// Revenue − COGS − card fees and postage − operating expenses.
// (Interest, taxes and depreciation are left out on purpose.)
export type Ebitda = {
  revenue: number;
  cogs: number;
  gross: number;
  sellingCosts: number; // card fees + postage, net of shipping charged
  net: number;
  opex: number;
  ebitda: number;
  margin: number | null; // as a share of revenue
  units: number;
  uncosted: number;
};

export function ebitdaFor(sales: SalesMonth[], opex: number): Ebitda {
  const revenue = sales.reduce((a, s) => a + s.revenue, 0);
  const cogs = sales.reduce((a, s) => a + s.cogs, 0);
  const gross = sales.reduce((a, s) => a + s.gross, 0);
  const net = sales.reduce((a, s) => a + s.net, 0);
  const units = sales.reduce((a, s) => a + s.units, 0);
  const uncosted = sales.reduce((a, s) => a + s.uncosted, 0);
  const ebitda = net - opex;
  return {
    revenue,
    cogs,
    gross,
    sellingCosts: gross - net,
    net,
    opex,
    ebitda,
    margin: revenue > 0 ? (ebitda / revenue) * 100 : null,
    units,
    uncosted,
  };
}

// What one shirt clears before overhead: from real sales when there are
// any, otherwise whatever was typed on the page.
export function profitPerShirt(doc: OpexDoc, sales: SalesMonth[]): { value: number; source: "sales" | "typed" | "none" } {
  const units = sales.reduce((a, s) => a + s.units, 0);
  const net = sales.reduce((a, s) => a + s.net, 0);
  if (units > 0 && net > 0) return { value: net / units, source: "sales" };
  const typed = num(doc.profitPerShirt);
  if (typed > 0) return { value: typed, source: "typed" };
  return { value: 0, source: "none" };
}

export function shirtsPerMonth(doc: OpexDoc, sales: SalesMonth[]): { value: number; source: "sales" | "typed" | "none" } {
  const months = sales.filter((s) => s.units > 0).length;
  const units = sales.reduce((a, s) => a + s.units, 0);
  if (months > 0) return { value: units / months, source: "sales" };
  const typed = num(doc.shirtsPerMonth);
  if (typed > 0) return { value: typed, source: "typed" };
  return { value: 0, source: "none" };
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function row(
  name: string,
  category: string,
  freq: Freq,
  month: number,
  note: string,
  active = true
): Recurring {
  return { id: newId(), name, category, cost: "", freq, month, active, note };
}

// The first time the page opens: every cost a shirt business like this
// usually has, with the amounts left blank to fill in. Delete what
// doesn't apply — nothing counts until it has a number.
export function starterOpex(): OpexDoc {
  return {
    recurring: [
      row("Domain name", "website", "yearly", 8, "dyeingbydesign.com, renews each August"),
      row("Vercel hosting", "website", "monthly", 1, "Hobby is free but non commercial; Pro is about $20 a month"),
      row("Neon database", "website", "monthly", 1, "Free tier covers light traffic"),
      row("Vercel Blob storage", "website", "monthly", 1, "Photo and artwork uploads"),
      row("Resend email", "website", "monthly", 1, "Order alerts and drop emails; free up to 100 a day"),
      row("Pushover", "website", "yearly", 1, "One time app purchase for phone alerts", false),
      row("EasyPost", "website", "monthly", 1, "Label account; postage itself is charged per order"),
      row("Design software", "website", "monthly", 1, "Canva, Adobe, Cricut Design Space"),
      row("Marketplace fees", "selling", "monthly", 1, "Etsy or similar. Stripe card fees are already counted in Sales history", false),
      row("Booth and table fees", "markets", "monthly", 1, "Or log each fair as a one off below"),
      row("Market gear", "markets", "yearly", 1, "Tent, table, racks, signage, cash box", false),
      row("Mileage and gas", "markets", "monthly", 1, "Fairs and supply runs. Keep the miles — the standard rate usually beats receipts"),
      row("Ads", "marketing", "monthly", 1, "Instagram or Facebook boosts"),
      row("Print marketing", "marketing", "yearly", 1, "Brochures, cards, stickers"),
      row("Giveaway and sample shirts", "marketing", "monthly", 1, "Shirts given away instead of sold"),
      row("Shipping supplies", "shipping", "monthly", 1, "Anything not billed per shirt on the COGS page"),
      row("Swap reships", "shipping", "monthly", 1, "Postage on free size and color swaps"),
      row("Studio consumables", "studio", "monthly", 1, "Gloves, respirator filters, spray bottles, drop cloths"),
      row("Stencil supplies", "studio", "monthly", 1, "Vinyl, blades, cutting mats"),
      row("Utilities share", "studio", "monthly", 1, "Water, power, washer and dryer wear for the work space"),
      row("Storage and racks", "studio", "yearly", 1, "Bins, shelving, drying racks", false),
      row("Business insurance", "admin", "yearly", 1, "General and product liability. Craft fairs often want proof of it"),
      row("State annual report", "admin", "yearly", 6, "Maine LLC filing fee"),
      row("Business license", "admin", "yearly", 1, "Town or state, if yours needs one", false),
      row("Accounting software", "admin", "monthly", 1, "QuickBooks, Wave, whatever keeps the books"),
      row("Tax prep", "admin", "yearly", 3, "CPA or filing service"),
      row("Bank fees", "admin", "monthly", 1, "Business account charges"),
      row("Dues and memberships", "admin", "yearly", 1, "Maine Made, Chamber, craft guilds", false),
      row("Trademark and legal", "admin", "yearly", 1, "Name or logo filings", false),
      row("Booth help", "people", "monthly", 1, "Anyone paid to work a table. Owner draws are not an expense", false),
      row("Loan interest", "finance", "monthly", 1, "Below the EBITDA line", false),
      row("Income tax set aside", "finance", "quarterly", 1, "Estimated payments. Below the EBITDA line", false),
      row("Equipment depreciation", "finance", "yearly", 12, "Spread the cost of gear over its life. Below the EBITDA line", false),
    ],
    oneOffs: [],
    actuals: {},
    profitPerShirt: "",
    shirtsPerMonth: "",
  };
}

function normFreq(v: unknown): Freq {
  return v === "yearly" || v === "quarterly" ? v : "monthly";
}

export function normalizeOpex(raw: unknown): OpexDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<OpexDoc>;
  const recurring = Array.isArray(r.recurring)
    ? r.recurring.map((x) => ({
        id: String(x?.id ?? newId()),
        name: String(x?.name ?? ""),
        category: String(x?.category ?? "other"),
        cost: String(x?.cost ?? ""),
        freq: normFreq(x?.freq),
        month: Math.min(12, Math.max(1, Math.round(Number(x?.month) || 1))),
        active: x?.active !== false,
        note: String(x?.note ?? ""),
      }))
    : [];
  const oneOffs = Array.isArray(r.oneOffs)
    ? r.oneOffs.map((x) => ({
        id: String(x?.id ?? newId()),
        date: String(x?.date ?? "").slice(0, 10),
        name: String(x?.name ?? ""),
        category: String(x?.category ?? "other"),
        cost: String(x?.cost ?? ""),
        note: String(x?.note ?? ""),
      }))
    : [];
  const actuals: Record<string, string> = {};
  if (r.actuals && typeof r.actuals === "object") {
    for (const [k, v] of Object.entries(r.actuals)) actuals[k] = String(v ?? "");
  }
  if (recurring.length === 0 && oneOffs.length === 0) return null;
  return {
    recurring,
    oneOffs,
    actuals,
    profitPerShirt: String(r.profitPerShirt ?? ""),
    shirtsPerMonth: String(r.shirtsPerMonth ?? ""),
  };
}
