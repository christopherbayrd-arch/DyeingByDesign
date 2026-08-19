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

export type Product = {
  id?: number;
  slug: string;
  name: string;
  species: string;
  blurb: string;
  story: string;
  image: string;        // big photo on the design page
  card: string;         // square photo in grids
  priceCents: number;
  sizes: string[];
  trackStock: boolean;  // false = always available (made to order)
  stock: Record<string, number>; // per-size counts when trackStock is true
  active: boolean;
  samplePhoto?: boolean;
  badge?: string | null;
  sort?: number;
};

// Flat shipping for the whole order, in cents ($5.00)
export const SHIPPING_CENTS = 500;

export const SIZES = ["S", "M", "L", "XL", "2XL"];
export const COLOR = "Black"; // single blank color for launch

// How many of a given size can be bought right now (Infinity = made to order)
export function availableQty(p: Product, size: string): number {
  if (!p.trackStock) return Infinity;
  return Math.max(0, Number(p.stock?.[size] ?? 0));
}

export function isSoldOut(p: Product): boolean {
  if (!p.trackStock) return false;
  return p.sizes.every((s) => availableQty(p, s) <= 0);
}

export function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const base = {
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
    blurb: "Five points everyone knows, printed the hard way.",
    story:
      "A single big maple leaf reads bold across the chest, with smaller ones drifting toward the shoulder. In the fall we pick leaves the day they drop, while they still lie flat and full, and every one prints a little different.",
    image: "/images/design-maple.jpg",
    card: "/images/design-maple.jpg",
    samplePhoto: true,
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
