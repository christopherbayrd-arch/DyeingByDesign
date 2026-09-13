// ============================================================
//  Product TYPES + store-wide constants + built-in defaults.
//
//  Since the v2 update, live product data (prices, stock,
//  photos, new designs) is managed in the DATABASE from the
//  /admin/products page — not in this file.
//
//  The designs below are only used as:
//    1. the seed data in schema.sql, and
//    2. a fallback so the site still renders before the
//       database is connected.
// ============================================================

export type ProductLine = "botanical" | "stencil";

// What the thing is. Shirts have the five sizes; a bandana is one size and
// the customer picks which design goes on it.
export type ProductKind = "shirt" | "bandana";

export const LINES: { key: ProductLine; name: string; tagline: string; short: string }[] = [
  {
    key: "botanical",
    name: "The Botanical Line",
    short: "Botanical",
    tagline: "Real leaves laid by hand — sumac, cedar, fern, and whatever the season drops.",
  },
  {
    key: "stencil",
    name: "The Graphic & Stencil Line",
    short: "Graphic & Stencil",
    tagline: "Custom cut shapes, celestial icons, wildlife silhouettes, and bold geometric work.",
  },
];

export function lineInfo(key: string) {
  return LINES.find((l) => l.key === key) ?? LINES[0];
}

export type Product = {
  id?: number;
  slug: string;
  name: string;
  species: string;    // italic sub-line: a species for leaves, a style note for stencils
  line: ProductLine;  // which lineup the design belongs to
  kind: ProductKind;  // shirt | bandana
  blurb: string;
  story: string;
  image: string;        // big photo on the design page
  card: string;         // square photo in grids
  priceCents: number;
  sizes: string[];
  trackStock: boolean;  // false = always available (made to order)
  stock: Record<string, number>; // per "color:SIZE" counts when trackStock is true
  variantStock?: Record<string, number>; // bandanas: "design:color:SIZE" counts
  active: boolean;
  samplePhoto?: boolean;
  badge?: string | null;
  sort?: number;
};

// How people order (2026-09-13, Chris: "if there's inventory available for
// the product the customer is trying to buy, let it go through stripe and
// charge the customer at that point — but only allow stripe for that").
//   "split"  → the piece the customer picked (design + color + size, and the
//              design on a bandana) is ON THE INVENTORY SHELF right now, so
//              it can ship today: Buy now, paid by card, stock comes off when
//              the payment clears. Anything not on the shelf — made to order,
//              sold out, a bigger quantity than there is — goes in as an
//              order request and Corey replies with a payment link. The
//              "Track stock" setting doesn't decide this any more; what's
//              actually on the shelf does. No Stripe keys = everything is a
//              request, automatically.
//   "email"  → no card on the site at all, every order goes by email.
//   "stripe" → same as split for now; kept so there's a name for "card
//              checkout everywhere" if that's ever wanted.
export const ORDER_MODE: "split" | "email" | "stripe" = "split";

// Can this exact piece be paid for by card right now? (stripeReady =
// STRIPE_SECRET_KEY is set, which only the server knows — lib/orderMode.ts)
export function paysByCard(stripeReady: boolean, onHandQty: number, qty = 1): boolean {
  if (!stripeReady) return false;
  if (ORDER_MODE === "email") return false;
  return onHandQty >= Math.max(1, qty);
}

// Flat rate shipping for the whole order, in cents ($7.00)
export const SHIPPING_CENTS = 700;

export const SIZES = ["S", "M", "L", "XL", "2XL"];

// Bandanas come one size (a square that folds down to any neck, dog or person)
export const ONE_SIZE = "One size";
export const BANDANA_SIZES = [ONE_SIZE];

// A shirt and a bandana bought together: the pair costs this much, so the
// saving is whatever the two would have been minus this.
export const SET_PRICE_CENTS = 5500;

type PricedLine = { kind?: ProductKind; qty: number; unitPriceCents: number };

// Pairs up shirts and bandanas in a cart and works out the saving
export function setDiscount(lines: PricedLine[]): { pairs: number; off: number } {
  const shirts: number[] = [];
  const bandanas: number[] = [];
  for (const l of lines) {
    const n = Math.max(0, Math.floor(l.qty));
    for (let i = 0; i < n; i++) (l.kind === "bandana" ? bandanas : shirts).push(l.unitPriceCents);
  }
  shirts.sort((a, b) => b - a);
  bandanas.sort((a, b) => b - a);
  const pairs = Math.min(shirts.length, bandanas.length);
  let off = 0;
  for (let i = 0; i < pairs; i++) off += Math.max(0, shirts[i] + bandanas[i] - SET_PRICE_CENTS);
  return { pairs: off > 0 ? pairs : 0, off };
}

// The same pairing, but as prices to charge: the saving comes off the
// bandana, so a $40 shirt and a $20 bandana check out as $40 + $15. A line
// that's only half paired (two bandanas, one shirt) comes back split in two —
// the set priced one first, then the rest at the usual price. Every unit is
// still there, so stock and the sales history stay honest.
export function setPricedLines<T extends PricedLine>(
  lines: T[]
): { line: T; qty: number; unitPriceCents: number; setPriced: boolean }[] {
  type Unit = { at: number; price: number };
  const shirts: Unit[] = [];
  const bandanas: Unit[] = [];
  lines.forEach((l, at) => {
    const n = Math.max(0, Math.floor(l.qty));
    for (let i = 0; i < n; i++) (l.kind === "bandana" ? bandanas : shirts).push({ at, price: l.unitPriceCents });
  });
  shirts.sort((a, b) => b.price - a.price);
  bandanas.sort((a, b) => b.price - a.price);
  const pairs = Math.min(shirts.length, bandanas.length);

  // what each unit ends up costing, kept per line
  const priced = new Map<number, { cents: number; setPriced: boolean }[]>();
  const put = (at: number, cents: number, setPriced: boolean) =>
    priced.set(at, [...(priced.get(at) ?? []), { cents, setPriced }]);
  bandanas.forEach((b, i) => {
    const off = i < pairs ? Math.max(0, Math.min(b.price, shirts[i].price + b.price - SET_PRICE_CENTS)) : 0;
    put(b.at, b.price - off, off > 0);
  });
  for (const s of shirts) put(s.at, s.price, false);

  const out: { line: T; qty: number; unitPriceCents: number; setPriced: boolean }[] = [];
  lines.forEach((line, at) => {
    const units = (priced.get(at) ?? []).sort((a, b) => a.cents - b.cents);
    for (const u of units) {
      const last = out[out.length - 1];
      if (last && last.line === line && last.unitPriceCents === u.cents) last.qty += 1;
      else out.push({ line, qty: 1, unitPriceCents: u.cents, setPriced: u.setPriced });
    }
  });
  return out;
}

// Designs we no longer make (or have paused). The storefront and sitemap skip
// these even if a row for them still exists in the database, so retiring a
// design is a code change plus (when you get to it) hiding or deleting it in
// /admin. Oak is paused for now; Cedar took its spot in the lineup (Sept 2026).
export const RETIRED_SLUGS = ["maple", "oak"];

// Blank colors (2026-09-12: the seventeen Hanes Beefy-T colors Corey orders).
//   key      what gets stored forever — cart lines, orders, stock counts, COGS.
//            Never rename a key; add or retire instead.
//   name     the DBD name customers see.
//   hex      the swatch. These are read off the supplier's photos, so nudge
//            them once you have the real shirts in hand.
//   supplier the Hanes color to reorder — shown as a tooltip on the Blanks
//            grid and the COGS blanks grid so you order the right one.
// Keys kept from the old nine (black, sky-blue, royal-blue, purple) so any
// counts or blank prices already typed in carry straight over.
export const COLORS: { key: string; name: string; hex: string; supplier: string }[] = [
  { key: "black",       name: "Black Spruce", hex: "#131313", supplier: "Black" },
  { key: "smoke-grey",  name: "Granite",      hex: "#6e6e73", supplier: "Smoke Grey" },
  { key: "navy",        name: "Deep Harbor",  hex: "#1e2a44", supplier: "Navy" },
  { key: "royal-blue",  name: "Blueberry",    hex: "#2340b8", supplier: "Deep Royal" },
  { key: "sky-blue",    name: "Sea Smoke",    hex: "#a9c4e0", supplier: "Light Blue" },
  { key: "teal",        name: "Tide Pool",    hex: "#0e7fa3", supplier: "Teal" },
  { key: "mint",        name: "Sea Glass",    hex: "#a5d9c6", supplier: "Clean Mint" },
  { key: "kelly-green", name: "Balsam",       hex: "#17a44c", supplier: "Kelly Green" },
  { key: "lime",        name: "Sapling",      hex: "#a9d95f", supplier: "Lime" },
  { key: "green-clay",  name: "Lichen",       hex: "#7ea69b", supplier: "Green Clay" },
  { key: "gold",        name: "Goldenrod",    hex: "#d99a1c", supplier: "Gold" },
  { key: "yellow",      name: "Sunflower",    hex: "#f0e64a", supplier: "Yellow" },
  { key: "orange",      name: "Ember",        hex: "#e2551d", supplier: "Orange" },
  { key: "pink",        name: "Rosehip",      hex: "#de3d79", supplier: "Wow Pink" },
  { key: "deep-red",    name: "Cranberry",    hex: "#a81b28", supplier: "Deep Red" },
  { key: "maroon",      name: "Chokecherry",  hex: "#6a1f2c", supplier: "Maroon" },
  { key: "purple",      name: "Lupine",       hex: "#4b2d70", supplier: "Grape Smash" },
];

// Colors that were on the site before the Beefy-T switch. Nothing new can be
// ordered in them, but an old order or stock row still reads properly.
export const RETIRED_COLORS: Record<string, string> = {
  "cherry-red": "Antique cherry red",
  azalea: "Azalea",
  daisy: "Daisy",
  "electric-green": "Electric green",
  "forest-green": "Forest green",
};

export function colorName(key: string): string {
  return COLORS.find((c) => c.key === key)?.name ?? RETIRED_COLORS[key] ?? key;
}

// The Hanes color to reorder, for the blanks screens
export function supplierColor(key: string): string {
  return COLORS.find((c) => c.key === key)?.supplier ?? "";
}
export function isColorKey(v: string): boolean {
  return COLORS.some((c) => c.key === v);
}

// Stock is kept per color AND size, keyed "color-key:SIZE" (e.g. "cherry-red:M")
export function stockKey(color: string, size: string) {
  return `${color}:${size}`;
}

// How many of a color + size can be bought right now (Infinity = made to order)
export function availableQty(p: Product, size: string, color?: string): number {
  if (!p.trackStock) return Infinity;
  if (color) return Math.max(0, Number(p.stock?.[stockKey(color, size)] ?? 0));
  // no color given: total across colors for that size
  return COLORS.reduce((n, c) => n + Math.max(0, Number(p.stock?.[stockKey(c.key, size)] ?? 0)), 0);
}

// What's physically on the shelf for this exact piece, whatever the product's
// "Track stock" setting says. availableQty() answers "may this be ordered"
// (made to order is unlimited); this answers "can it ship today", which is
// what decides whether the customer pays by card now or sends a request.
export function onHand(p: Product, size: string, color: string, variant = ""): number {
  if (!size || !color) return 0;
  if (p.kind === "bandana") {
    // bandanas are counted per design, so an unpicked design is zero
    if (!variant) return 0;
    return Math.max(0, Number(p.variantStock?.[`${variant}:${stockKey(color, size)}`] ?? 0));
  }
  return Math.max(0, Number(p.stock?.[stockKey(color, size)] ?? 0));
}

// One name for one exact piece — design, the design bleached onto it (blank
// for shirts), color, size. The cart, the shelf map and the order all use
// this shape, so a line can be matched to the shelf without another lookup.
export function pieceKey(slug: string, color: string, size: string, variant = ""): string {
  return `${slug}|${variant}|${color}|${size}`;
}

// Everything that can ship today, keyed by pieceKey. Built on the server from
// the Inventory shelf and handed to the browser, so the cart can tell a ready
// line from a made to order one without asking the server line by line.
export function shelfMap(products: Product[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of products) {
    const entries = p.kind === "bandana" ? p.variantStock ?? {} : p.stock ?? {};
    for (const [k, raw] of Object.entries(entries)) {
      // shirts: "color:SIZE" · bandanas: "design:color:SIZE"
      const parts = k.split(":");
      const [variant, color, size] =
        p.kind === "bandana" ? parts : ["", parts[0], parts[1]];
      const n = Math.max(0, Math.floor(Number(raw) || 0));
      if (color && size && n > 0) out[pieceKey(p.slug, color, size, variant)] = n;
    }
  }
  return out;
}

export function isSoldOut(p: Product): boolean {
  if (!p.trackStock) return false;
  return p.sizes.every((s) => availableQty(p, s) <= 0);
}

export function totalStock(p: Product): number {
  if (!p.trackStock) return Infinity;
  return p.sizes.reduce((n, s) => n + availableQty(p, s), 0);
}

export function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const base = {
  line: "botanical" as ProductLine,
  kind: "shirt" as ProductKind,
  priceCents: 3999,
  sizes: SIZES,
  trackStock: false,
  stock: {},
  active: true,
};

export const DEFAULT_PRODUCTS: Product[] = [
  {
    ...base,
    slug: "sumac",
    name: "Sumac",
    species: "Staghorn sumac · Rhus typhina",
    blurb: "Feathered fronds, deep burn. The original.",
    story:
      "The one that started it all. Staghorn sumac grows wild along every back road in Maine, and its feathered fronds leave the cleanest shadow we print. We lay fronds across the chest and shoulders, mist the bleach by hand, and let the fabric burn to its lighter tone before the leaf ever moves.",
    image: "/images/sumac-shirt.jpg",
    card: "/images/design-sumac.jpg",
    badge: "The original",
    sort: 1,
  },
  {
    ...base,
    slug: "cedar",
    name: "Cedar",
    species: "Northern white cedar · Thuja occidentalis",
    blurb: "Fanned sprays that branch like frost. The North Woods one.",
    story:
      "Northern white cedar grows thick along Maine's lake shores and swamp edges. Its flat, fanned sprays lie tight to the cotton, so every branch and tiny scale comes through. We scatter sprigs across the front and sleeves, mist the bleach by hand, and the shirt keeps its color everywhere the cedar sat.",
    image: "/images/cedar-shirt.jpg",
    card: "/images/design-cedar.jpg",
    badge: "New",
    sort: 3,
  },
  {
    ...base,
    slug: "fern",
    name: "Fern",
    species: "Ostrich fern · Matteuccia struthiopteris",
    blurb: "Lacy, layered, almost too fine to believe it's bleach.",
    story:
      "The same fern Mainers hunt for fiddleheads in May. Its fronds leave a shadow so detailed people assume it's screen printed. It isn't. It's a leaf, a steady hand, and one pass of spray.",
    image: "/images/design-fern.jpg",
    card: "/images/design-fern.jpg",
    sort: 4,
  },
  {
    ...base,
    slug: "bandana",
    name: "The Bandana",
    kind: "bandana",
    species: "One size · for dogs and people",
    blurb: "The same leaves, sized for a good dog. Or your back pocket.",
    story:
      "Same blanks, same bleach, same leaves off the same back roads — cut square instead of sewn into a tee. It ties on a dog, folds into a pocket, and comes in every color the shirts do. Pick the design you want on it; it's made the same way, one at a time.",
    image: "/images/bandana.jpg",
    card: "/images/design-bandana.jpg",
    priceCents: 2000,
    sizes: BANDANA_SIZES,
    active: true,
    samplePhoto: true, // the photos show maple; the design on yours is the one you pick
    sort: 10,
  },
];
