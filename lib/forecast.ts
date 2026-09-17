// ============================================================
//  Forecast — what a month looks like at N shirts.
//
//  Pure math, no React and no database, so it can be checked on its
//  own (scripts/forecast-check.mjs). Every number it needs comes from
//  somewhere real: prices from Products & stock, cost per shirt from
//  the COGS sheet, overhead from the Expenses page, the rest from the
//  Sales history — and anything missing is an editable assumption.
// ============================================================

import { num } from "@/lib/cogs";

export type Dials = {
  shirts: number;      // shirts a month
  onlinePct: number;   // 0-100: how many of them ship (the rest sell in person)
  price: number;       // average shirt price
  bandanaPct: number;  // 0-100: bandanas sold per 100 shirts
};

export type Assumptions = {
  shirtCost: string;          // cost to make one shipped shirt (blank + materials + mailer)
  shirtCostInPerson: string;  // same shirt sold at a booth: no mailer, no label
  bandanaCost: string;
  bandanaPrice: string;       // $5 riding along with a shirt, $10 on its own
  shipping: string;           // charged to the customer, per shipped order
  postage: string;            // what the label actually costs, per shipped order
  shirtsPerOrder: string;     // shirts in an average online order
  onlineCardPct: string;      // Stripe online: percent
  onlineCardFixed: string;    // Stripe online: per transaction
  inPersonCardPct: string;    // Tap to Pay: percent
  inPersonCardFixed: string;  // Tap to Pay: per transaction
  cardShareInPerson: string;  // 0-100: how much of the booth take is card, not cash
  spoilPct: string;           // 0-100: shirts ruined in the making, blank and all
  swapPct: string;            // 0-100: shipped shirts that come back for a free swap
};

export type Periods = { month: number; year: number };

export type ForecastResult = {
  shirts: number;
  online: number;
  inPerson: number;
  orders: number;
  bandanas: number;
  shirtRevenue: Periods;
  bandanaRevenue: Periods;
  shippingRevenue: Periods;
  revenue: Periods;
  cogs: Periods;
  gross: Periods;
  grossMargin: number | null;
  fees: Periods;
  postage: Periods;
  contribution: Periods;
  opex: Periods;
  ebitda: Periods;
  ebitdaMargin: number | null;
  belowLine: Periods;
  net: Periods;
  perShirt: { revenue: number; cogs: number; contribution: number };
  breakEven: number | null;   // shirts a month where EBITDA hits zero
  breakEvenNet: number | null; // …and where net profit hits zero
};

const p = (n: number): Periods => ({ month: n, year: n * 12 });

export function defaultAssumptions(): Assumptions {
  return {
    shirtCost: "",
    shirtCostInPerson: "",
    bandanaCost: "",
    bandanaPrice: "5.00",
    shipping: "7.00",
    postage: "7.00",
    shirtsPerOrder: "1",
    onlineCardPct: "2.9",
    onlineCardFixed: "0.30",
    inPersonCardPct: "2.7",
    inPersonCardFixed: "0.05",
    cardShareInPerson: "50",
    spoilPct: "0",
    swapPct: "0",
  };
}

export function defaultDials(): Dials {
  return { shirts: 12, onlinePct: 70, price: 45, bandanaPct: 0 };
}

export type Overhead = { operating: number; belowLine: number };

// The whole month, worked out at `shirts` shirts. Everything scales
// linearly, so the same function gives the per shirt numbers (shirts = 1)
// and the breakeven point (overhead ÷ contribution per shirt).
export function run(dials: Dials, a: Assumptions, overhead: Overhead): ForecastResult {
  const shirts = Math.max(0, dials.shirts);
  const onlineShare = clamp01(dials.onlinePct / 100);
  const bandanaShare = Math.max(0, dials.bandanaPct / 100);
  const price = Math.max(0, dials.price);

  const perOrder = Math.max(1, num(a.shirtsPerOrder) || 1);
  const online = shirts * onlineShare;
  const inPerson = shirts - online;
  const orders = online / perOrder;
  const bandanas = shirts * bandanaShare;

  const bandanaPrice = num(a.bandanaPrice);
  const shipping = num(a.shipping);
  const postagePer = num(a.postage);

  const shirtRevenue = shirts * price;
  const bandanaRevenue = bandanas * bandanaPrice;
  const shippingRevenue = orders * shipping;
  const revenue = shirtRevenue + bandanaRevenue + shippingRevenue;

  // Ruined shirts never sell, so the good ones carry their cost
  const spoil = clamp01(num(a.spoilPct) / 100);
  const spoilMult = spoil >= 0.9 ? 10 : 1 / (1 - spoil);
  // A free swap is a second shirt made and a second label bought
  const swapRate = clamp01(num(a.swapPct) / 100);
  const swapCost = online * swapRate * (num(a.shirtCost) + postagePer);

  const cogs =
    (online * num(a.shirtCost) + inPerson * num(a.shirtCostInPerson)) * spoilMult +
    bandanas * num(a.bandanaCost) +
    swapCost;

  const gross = revenue - cogs;

  // Card fees: online is every order, in person only the card share
  const onlineRevenue = online * price + bandanas * onlineShare * bandanaPrice + shippingRevenue;
  const onlineFees = onlineRevenue * (num(a.onlineCardPct) / 100) + orders * num(a.onlineCardFixed);
  const cardShare = clamp01(num(a.cardShareInPerson) / 100);
  const inPersonRevenue = inPerson * price + bandanas * (1 - onlineShare) * bandanaPrice;
  const inPersonFees =
    inPersonRevenue * cardShare * (num(a.inPersonCardPct) / 100) +
    inPerson * cardShare * num(a.inPersonCardFixed);
  const fees = onlineFees + inPersonFees;

  const postage = orders * postagePer;
  const contribution = gross - fees - postage;
  const ebitda = contribution - overhead.operating;
  const net = ebitda - overhead.belowLine;

  // Per shirt: the same month run at one shirt, same mix
  const unit =
    shirts > 0
      ? { revenue: revenue / shirts, cogs: cogs / shirts, contribution: contribution / shirts }
      : unitRun(dials, a);

  const breakEven = unit.contribution > 0 ? overhead.operating / unit.contribution : null;
  const breakEvenNet =
    unit.contribution > 0 ? (overhead.operating + overhead.belowLine) / unit.contribution : null;

  return {
    shirts,
    online,
    inPerson,
    orders,
    bandanas,
    shirtRevenue: p(shirtRevenue),
    bandanaRevenue: p(bandanaRevenue),
    shippingRevenue: p(shippingRevenue),
    revenue: p(revenue),
    cogs: p(cogs),
    gross: p(gross),
    grossMargin: revenue > 0 ? (gross / revenue) * 100 : null,
    fees: p(fees),
    postage: p(postage),
    contribution: p(contribution),
    opex: p(overhead.operating),
    ebitda: p(ebitda),
    ebitdaMargin: revenue > 0 ? (ebitda / revenue) * 100 : null,
    belowLine: p(overhead.belowLine),
    net: p(net),
    perShirt: unit,
    breakEven,
    breakEvenNet,
  };
}

// One shirt at the same mix, used when the dial is at zero
function unitRun(dials: Dials, a: Assumptions) {
  const one = run({ ...dials, shirts: 1 }, a, { operating: 0, belowLine: 0 });
  return { revenue: one.revenue.month, cogs: one.cogs.month, contribution: one.contribution.month };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// EBITDA at a spread of volumes, for the curve
export function curve(
  dials: Dials,
  a: Assumptions,
  overhead: Overhead,
  max: number,
  steps = 40
): { shirts: number; ebitda: number }[] {
  const top = Math.max(1, max);
  const out: { shirts: number; ebitda: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const shirts = Math.round((top * i) / steps);
    out.push({ shirts, ebitda: run({ ...dials, shirts }, a, overhead).ebitda.month });
  }
  return out;
}

export function normalizeDials(raw: unknown): Dials {
  const d = (raw ?? {}) as Partial<Dials>;
  const base = defaultDials();
  return {
    shirts: clampNum(d.shirts, base.shirts, 0, 1000),
    onlinePct: clampNum(d.onlinePct, base.onlinePct, 0, 100),
    price: clampNum(d.price, base.price, 0, 1000),
    bandanaPct: clampNum(d.bandanaPct, base.bandanaPct, 0, 200),
  };
}

export function normalizeAssumptions(raw: unknown): Assumptions {
  const r = (raw ?? {}) as Partial<Assumptions>;
  const base = defaultAssumptions();
  const out = { ...base };
  for (const k of Object.keys(base) as (keyof Assumptions)[]) {
    if (r[k] !== undefined && r[k] !== null) out[k] = String(r[k]);
  }
  return out;
}

function clampNum(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

// What the page hands the forecaster: every figure it could dig out of
// the site, plus where each one came from so the page can say so.
export type Seed = {
  price: number | null;            // average live shirt price
  bandanaPrice: number | null;     // what a bandana adds to a shirt order
  shipping: number;                // charged per shipped order (site setting)
  shirtCost: number | null;        // from the COGS sheet
  shirtCostInPerson: number | null;
  bandanaCost: number | null;
  costedDesigns: number;           // how many designs had a cost to read
  postagePerOrder: number | null;  // from labels actually bought
  shirtsPerOrder: number | null;   // from shipped orders
  onlineSharePct: number | null;   // from where the shirts sold
  cardShareInPersonPct: number | null; // from Quick sale pay methods
  shirtsPerMonth: number | null;   // recent pace
  avgPriceSold: number | null;     // what shirts actually went for
  units: number;                   // shirts in the history
};

export function emptySeed(): Seed {
  return {
    price: null, bandanaPrice: null, shipping: 7, shirtCost: null, shirtCostInPerson: null,
    bandanaCost: null, costedDesigns: 0, postagePerOrder: null, shirtsPerOrder: null,
    onlineSharePct: null, cardShareInPersonPct: null, shirtsPerMonth: null,
    avgPriceSold: null, units: 0,
  };
}

// Dials and assumptions, seeded from whatever the site knows
export function seededState(seed: Seed): { dials: Dials; assumptions: Assumptions } {
  const dials = defaultDials();
  const a = defaultAssumptions();
  if (seed.shirtsPerMonth && seed.shirtsPerMonth > 0) dials.shirts = Math.round(seed.shirtsPerMonth);
  if (seed.onlineSharePct !== null) dials.onlinePct = Math.round(seed.onlineSharePct);
  if (seed.price) dials.price = Math.round(seed.price);
  if (seed.shirtCost !== null) a.shirtCost = seed.shirtCost.toFixed(2);
  if (seed.shirtCostInPerson !== null) a.shirtCostInPerson = seed.shirtCostInPerson.toFixed(2);
  if (seed.bandanaCost !== null) a.bandanaCost = seed.bandanaCost.toFixed(2);
  if (seed.bandanaPrice !== null) a.bandanaPrice = seed.bandanaPrice.toFixed(2);
  a.shipping = seed.shipping.toFixed(2);
  if (seed.postagePerOrder !== null) a.postage = seed.postagePerOrder.toFixed(2);
  else a.postage = seed.shipping.toFixed(2);
  if (seed.shirtsPerOrder !== null) a.shirtsPerOrder = seed.shirtsPerOrder.toFixed(2);
  if (seed.cardShareInPersonPct !== null) a.cardShareInPerson = String(Math.round(seed.cardShareInPersonPct));
  return { dials, assumptions: a };
}
