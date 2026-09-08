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

export const LINES: { key: ProductLine; name: string; tagline: string; short: string }[] = [
  {
    key: "botanical",
    name: "The Botanical Line",
    short: "Botanical",
    tagline: "Real leaves laid by hand — sumac, fern, and whatever the season drops.",
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
  blurb: string;
  story: string;
  image: string;        // big photo on the design page
  card: string;         // square photo in grids
  priceCents: number;
  sizes: string[];
  trackStock: boolean;  // false = always available (made to order)
  stock: Record<string, number>; // per "color:SIZE" counts when trackStock is true
  active: boolean;
  samplePhoto?: boolean;
  badge?: string | null;
  sort?: number;
};

// How people order.
//   "split"  → per shirt: designs with "Track stock" on (counted, ready to
//              ship) get a Buy now button that goes to Stripe Checkout;
//              made to order designs get "Order this one", which sends the
//              order to the shop by email and Corey replies with a payment
//              link. If the Stripe keys aren't set yet, everything falls back
//              to the email route automatically.
//   "email"  → no card on the site at all, every order goes by email.
//   "stripe" → everything goes to Stripe Checkout, made to order included.
export const ORDER_MODE: "split" | "email" | "stripe" = "split";

// Does this design check out by card? (stripeReady = STRIPE_SECRET_KEY is set,
// which only the server knows — see lib/orderMode.ts)
export function paysByCard(p: { trackStock: boolean }, stripeReady: boolean): boolean {
  if (!stripeReady) return false;
  if (ORDER_MODE === "email") return false;
  if (ORDER_MODE === "stripe") return true;
  return p.trackStock;
}

// Flat rate shipping for the whole order, in cents ($7.00)
export const SHIPPING_CENTS = 700;

export const SIZES = ["S", "M", "L", "XL", "2XL"];

// Blank colors. Every design comes in every color. `key` is what gets
// stored (cart, orders, stock); `name` is what people see; `hex` is the
// swatch. To add a color, add a line — that's it.
// (Names follow the blank maker's color names; the `cherry-red` key is kept
// from the old list so any stock counts already entered for it carry over.)
export const COLORS: { key: string; name: string; hex: string }[] = [
  { key: "black", name: "Black", hex: "#141414" },
  { key: "cherry-red", name: "Antique cherry red", hex: "#9a1c2e" },
  { key: "azalea", name: "Azalea", hex: "#f28cb1" },
  { key: "daisy", name: "Daisy", hex: "#f6c945" },
  { key: "electric-green", name: "Electric green", hex: "#3ddc3a" },
  { key: "forest-green", name: "Forest green", hex: "#1f4d2e" },
  { key: "sky-blue", name: "Sky blue", hex: "#7fb8e6" },
  { key: "royal-blue", name: "Royal blue", hex: "#1f4fa3" },
  { key: "purple", name: "Purple", hex: "#4a2d7e" },
];

export function colorName(key: string): string {
  return COLORS.find((c) => c.key === key)?.name ?? key;
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
    slug: "oak",
    name: "Oak",
    species: "Northern red oak · Quercus rubra",
    blurb: "Broad lobes, real presence. The sturdy one.",
    story:
      "Oak leaves hold their shape under the spray better than anything else we work with. The result is a heavy, grounded silhouette that wears in like a favorite flannel.",
    image: "/images/design-oak.jpg",
    card: "/images/design-oak.jpg",
    samplePhoto: true,
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
    samplePhoto: true,
    sort: 4,
  },
];
