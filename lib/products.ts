// ============================================================
//  YOUR DESIGNS LIVE HERE.
//  Edit names, prices, stories, and photos in this one file —
//  every page on the site reads from it.
//
//  To change a photo: drop a new image in /public/images and
//  update the `image` (big product shot) and `card` (square
//  grid photo) paths below.
// ============================================================

export type Product = {
  slug: string;        // used in the URL, keep lowercase, no spaces
  name: string;
  species: string;     // shown under the name for craft cred
  blurb: string;       // one-liner on cards
  story: string;       // longer text on the design's own page
  image: string;       // big photo on the design page
  card: string;        // square photo in grids
  priceCents: number;  // 3999 = $39.99
  samplePhoto?: boolean; // true = photo is a technique sample, not this exact leaf yet
  badge?: string;
};

// Flat shipping for the whole order, in cents ($5.00)
export const SHIPPING_CENTS = 500;

export const SIZES = ["S", "M", "L", "XL", "2XL"];
export const COLOR = "Black"; // single blank color for launch — ask and we'll wire up more

export const PRODUCTS: Product[] = [
  {
    slug: "sumac",
    name: "Sumac",
    species: "Staghorn sumac · Rhus typhina",
    blurb: "Feathered fronds, deep amber burn. The original.",
    story:
      "The one that started it all. Staghorn sumac grows wild along every back road in Maine, and its feathered fronds leave the cleanest shadow we print. We lay fronds across the chest and shoulders, mist the bleach by hand, and let the fabric turn that deep amber gold before the leaf ever moves.",
    image: "/images/sumac-shirt.jpg",
    card: "/images/design-sumac.jpg",
    priceCents: 3999,
    badge: "The original",
  },
  {
    slug: "maple",
    name: "Maple",
    species: "Sugar maple · Acer saccharum",
    blurb: "Five points everyone knows, printed the hard way.",
    story:
      "A single big maple leaf reads bold across the chest, with smaller ones drifting toward the shoulder. In the fall we pick leaves the day they drop, while they still lie flat and full, and every one prints a little different.",
    image: "/images/design-maple.jpg",
    card: "/images/design-maple.jpg",
    priceCents: 3999,
    samplePhoto: true,
  },
  {
    slug: "oak",
    name: "Oak",
    species: "Northern red oak · Quercus rubra",
    blurb: "Broad lobes, real presence. The sturdy one.",
    story:
      "Oak leaves hold their shape under the spray better than anything else we work with. The result is a heavy, grounded silhouette that wears in like a favorite flannel.",
    image: "/images/design-oak.jpg",
    card: "/images/design-oak.jpg",
    priceCents: 3999,
    samplePhoto: true,
  },
  {
    slug: "fern",
    name: "Fern",
    species: "Ostrich fern · Matteuccia struthiopteris",
    blurb: "Lacy, layered, almost too fine to believe it's bleach.",
    story:
      "The same fern Mainers hunt for fiddleheads in May. Its fronds leave a shadow so detailed people assume it's screen printed. It isn't. It's a leaf, a steady hand, and one pass of spray.",
    image: "/images/design-fern.jpg",
    card: "/images/design-fern.jpg",
    priceCents: 3999,
    samplePhoto: true,
  },
];

export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
