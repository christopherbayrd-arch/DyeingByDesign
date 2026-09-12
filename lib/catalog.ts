// Server-side product catalog. Reads from Neon when connected;
// falls back to the built-in four designs so the site always renders.
import { getDb } from "@/lib/db";
import {
  DEFAULT_PRODUCTS,
  RETIRED_SLUGS,
  SIZES,
  stockKey,
  type Product,
  type ProductLine,
} from "@/lib/products";

const notRetired = (p: Product) => !RETIRED_SLUGS.includes(p.slug);

type Row = Record<string, unknown>;

export function rowToProduct(r: Row): Product {
  const sizes = Array.isArray(r.sizes) ? (r.sizes as string[]) : SIZES;
  const stock =
    r.stock && typeof r.stock === "object" ? (r.stock as Record<string, number>) : {};
  return {
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name ?? ""),
    species: String(r.species ?? ""),
    line: (r.line === "stencil" ? "stencil" : "botanical") as ProductLine,
    blurb: String(r.blurb ?? ""),
    story: String(r.story ?? ""),
    image: String(r.image ?? ""),
    card: String(r.card ?? ""),
    priceCents: Number(r.price_cents ?? 0),
    sizes,
    trackStock: Boolean(r.track_stock),
    stock,
    active: Boolean(r.active),
    samplePhoto: Boolean(r.sample_photo),
    badge: (r.badge as string | null) ?? null,
    sort: Number(r.sort ?? 0),
  };
}

// What's on the shelf comes from the Inventory tab (the inventory table),
// not the old per product counts. A design set to "only sell what's on
// hand" sells from these numbers; made to order designs ignore them.
// Until schema.sql adds the table, the old counts are left as they were.
type Sql = NonNullable<ReturnType<typeof getDb>>;
export async function withShelfCounts(sql: Sql, products: Product[], slug?: string): Promise<Product[]> {
  try {
    const rows = (slug
      ? await sql`select slug, color, size, qty from inventory where kind = 'shirt' and slug = ${slug}`
      : await sql`select slug, color, size, qty from inventory where kind = 'shirt'`) as Row[];
    const bySlug = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const m = bySlug.get(String(r.slug)) ?? {};
      m[stockKey(String(r.color), String(r.size))] = Math.max(0, Number(r.qty) || 0);
      bySlug.set(String(r.slug), m);
    }
    return products.map((p) => ({ ...p, stock: bySlug.get(p.slug) ?? {} }));
  } catch {
    return products;
  }
}

// Live products for the storefront (active only, retired designs skipped)
export async function getProducts(): Promise<Product[]> {
  const sql = getDb();
  if (!sql) return DEFAULT_PRODUCTS.filter(notRetired);
  try {
    const rows = (await sql`
      select * from products where active order by sort, id
    `) as Row[];
    if (rows.length === 0) return [];
    return withShelfCounts(sql, rows.map(rowToProduct).filter(notRetired));
  } catch {
    // table probably doesn't exist yet — run schema.sql in Neon
    return DEFAULT_PRODUCTS.filter(notRetired);
  }
}

export async function getProduct(slug: string): Promise<Product | null> {
  if (!notRetired({ slug } as Product)) return null;
  const sql = getDb();
  if (!sql) return DEFAULT_PRODUCTS.find((p) => p.slug === slug) ?? null;
  try {
    const rows = (await sql`
      select * from products where slug = ${slug} and active limit 1
    `) as Row[];
    if (rows.length === 0) return null;
    return (await withShelfCounts(sql, [rowToProduct(rows[0])], slug))[0];
  } catch {
    return DEFAULT_PRODUCTS.find((p) => p.slug === slug) ?? null;
  }
}

// Everything, including hidden products — admin only
export async function getAllProducts(): Promise<Product[] | null> {
  const sql = getDb();
  if (!sql) return null; // no database connected
  const rows = (await sql`select * from products order by sort, id`) as Row[];
  return withShelfCounts(sql, rows.map(rowToProduct));
}
