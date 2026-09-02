// ============================================================
//  Product TYPES + store-wide constants + built-in defaults.
//
//  Since the v2 update, live product data (prices, stock,
//  photos, new designs) is managed in the DATABASE from the
//  /admin/products page — not in this file.
//
//  The four designs below are only used as:
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
    tagline: "Real leaves laid by hand — sumac, maple, oak, fern, and whatever the season drops.",
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
//   "email"  → no card on the site: the cart sends the order to the shop
//              by email and Corey replies with payment details.
//   "stripe" → Stripe Checkout (cards / Apple Pay). Needs the Stripe env
//              vars from the README. Flip this one line to switch.
export const ORDER_MODE: "email" | "stripe" = "email";

// Flat shipping for the whole order, in cents ($5.00)
export const SHIPPING_CENTS = 500;

export const SIZES = ["S", "M", "L", "XL", "2XL"];

// Blank colors. Every design comes in every color. `key` is what gets
// stored (cart, orders, stock); `name` is what people see; `hex` is the
// swatch. To add a color, add a line — that's it.
export const COLORS: { key: string; name: string; hex: string }[] = [
  { key: "cherry-red", name: "Cherry red", hex: "#b3222e" },
  { key: "electric-green", name: "Electric green", hex: "#3ddc3a" },
  { key: "forest-green", name: "Forest green", hex: "#1f4d2e" },
  { key: "sky-blue", name: "Sky blue", hex: "#7fb8e6" },
  { key: "safety-pink", name: "Safety pink", hex: "#ff5fa2" },
  { key: "safety-orange", name: "Safety orange", hex: "#ff6a13" },
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
    blurb: "Feathered fronds, deep amber burn. The original.",
    story:
      "The one that started it all. Staghorn sumac grows wild along every back road in Maine, and its feathered fronds leave the cleanest shadow we print. We lay fronds across the chest and shoulders, mist the bleach by hand, and let the fabric turn that deep amber gold before the leaf ever moves.",
    image: "/images/sumac-shirt.jpg",
    card: "/images/design-sumac.jpg",
    badge: "The original",
    sort: 1,
  },
  {
    ...base,
    slug: "maple",
    name: "Maple",
    species: "Sugar maple · Acer saccharum",
    blurb: "Leaves scattered like they just fell there. Deep gold burn.",
    story:
      "Maple leaves laid out across the whole shirt, front and back, the way they land on the ground in October. We pick them the day they drop, while they still lie flat and full, then spray until the cotton burns to gold and the leaves keep their dark. Every shirt catches the spray differently, so no two ever land the same.",
    image: "/images/maple-shirt.jpg",
    card: "/images/design-maple.jpg",
    sort: 2,
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
