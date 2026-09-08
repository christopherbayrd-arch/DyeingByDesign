// ============================================================
//  COGS (cost of goods sold) — types + the math, shared by the
//  /admin/cogs page. The whole sheet is one JSON document saved
//  in the `cogs` table (see schema.sql + app/api/admin/cogs).
//
//  Money is kept as the strings people type ("4.50") so the
//  inputs never fight the user; num() turns them into numbers.
// ============================================================

import { COLORS, SIZES, stockKey } from "@/lib/products";

export type CogsMaterial = {
  id: string;
  name: string;   // "Bleach"
  unit: string;   // what one purchase is: "1 gallon", "pack of 100"
  cost: string;   // dollars per unit purchased
  yield: string;  // how many shirts one unit covers
};

export type CogsType = {
  id: string;
  name: string;                 // "Bleach shirt (leaf)"
  price: string;                // sale price, dollars
  uses: Record<string, string>; // material id → qty of that material per shirt
};

export type CogsDoc = {
  blanks: Record<string, string>; // "color-key:SIZE" → dollars per blank tee
  materials: CogsMaterial[];
  types: CogsType[];
  designs: Record<string, string>; // product slug (from /admin/products) → type id
};

export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

// Cost of one shirt's worth of a material
export function materialPerShirt(m: CogsMaterial): number {
  const cost = num(m.cost);
  const y = num(m.yield);
  if (cost <= 0 || y <= 0) return 0;
  return cost / y;
}

// Cheapest / priciest / average blank across every cell that has a price
export function blankStats(blanks: Record<string, string>) {
  const vals: number[] = [];
  for (const c of COLORS) for (const s of SIZES) {
    const v = num(blanks[stockKey(c.key, s)]);
    if (v > 0) vals.push(v);
  }
  if (vals.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  return { min: Math.min(...vals), max: Math.max(...vals), avg: sum / vals.length, count: vals.length };
}

export type TypeCost = {
  lines: { name: string; qty: number; perShirt: number; total: number }[];
  materials: number;  // all materials, per shirt
  blank: ReturnType<typeof blankStats>;
  low: number;        // cheapest blank + materials
  high: number;       // priciest blank + materials
  typical: number;    // average blank + materials
  price: number;
  profit: number;     // at the typical COGS
  profitLow: number;  // with the priciest blank
  profitHigh: number; // with the cheapest blank
};

// `priceOverride` = work it out at a different sale price (a real design's
// price from the catalog) instead of the type's own price field.
export function typeCost(
  t: CogsType,
  materials: CogsMaterial[],
  blanks: Record<string, string>,
  priceOverride?: number
): TypeCost {
  const lines = materials
    .filter((m) => t.uses[m.id] !== undefined)
    .map((m) => {
      const qty = num(t.uses[m.id]);
      const perShirt = materialPerShirt(m);
      return { name: m.name || "Untitled material", qty, perShirt, total: perShirt * qty };
    });
  const mats = lines.reduce((a, l) => a + l.total, 0);
  const blank = blankStats(blanks);
  const price = priceOverride !== undefined ? priceOverride : num(t.price);
  const low = blank.min + mats;
  const high = blank.max + mats;
  const typical = blank.avg + mats;
  return {
    lines,
    materials: mats,
    blank,
    low,
    high,
    typical,
    price,
    profit: price - typical,
    profitLow: price - high,
    profitHigh: price - low,
  };
}

// What the page starts with the first time (before anything is saved):
// a few likely materials and the three shirt types, costs left blank.
export function starterDoc(): CogsDoc {
  const bleach = newId();
  const neutralizer = newId();
  const stencil = newId();
  const dye = newId();
  const mailer = newId();
  return {
    blanks: {},
    designs: {},
    materials: [
      { id: bleach, name: "Bleach", unit: "1 gallon", cost: "", yield: "" },
      { id: neutralizer, name: "Neutralizer (hydrogen peroxide)", unit: "1 quart", cost: "", yield: "" },
      { id: stencil, name: "Stencil material", unit: "1 roll", cost: "", yield: "" },
      { id: dye, name: "Tie dye kit", unit: "1 kit", cost: "", yield: "" },
      { id: mailer, name: "Poly mailer", unit: "pack of 100", cost: "", yield: "100" },
    ],
    types: [
      { id: newId(), name: "Bleach shirt (leaf)", price: "39.99", uses: { [bleach]: "1", [neutralizer]: "1", [mailer]: "1" } },
      { id: newId(), name: "Bleach shirt (stencil)", price: "39.99", uses: { [bleach]: "1", [neutralizer]: "1", [stencil]: "1", [mailer]: "1" } },
      { id: newId(), name: "Tie dye shirt", price: "", uses: { [dye]: "1", [mailer]: "1" } },
    ],
  };
}

// Make whatever came back from the database safe to render
export function normalizeDoc(raw: unknown): CogsDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CogsDoc>;
  const blanks: Record<string, string> = {};
  if (r.blanks && typeof r.blanks === "object") {
    for (const [k, v] of Object.entries(r.blanks)) blanks[k] = String(v ?? "");
  }
  const materials = Array.isArray(r.materials)
    ? r.materials.map((m) => ({
        id: String(m?.id ?? newId()),
        name: String(m?.name ?? ""),
        unit: String(m?.unit ?? ""),
        cost: String(m?.cost ?? ""),
        yield: String(m?.yield ?? ""),
      }))
    : [];
  const types = Array.isArray(r.types)
    ? r.types.map((t) => {
        const uses: Record<string, string> = {};
        if (t?.uses && typeof t.uses === "object") {
          for (const [k, v] of Object.entries(t.uses)) uses[k] = String(v ?? "1");
        }
        return { id: String(t?.id ?? newId()), name: String(t?.name ?? ""), price: String(t?.price ?? ""), uses };
      })
    : [];
  const designs: Record<string, string> = {};
  if (r.designs && typeof r.designs === "object") {
    for (const [k, v] of Object.entries(r.designs)) if (v) designs[k] = String(v);
  }
  if (materials.length === 0 && types.length === 0 && Object.keys(blanks).length === 0) return null;
  return { blanks, materials, types, designs };
}
