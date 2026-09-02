// Server-side product catalog. Reads from Neon when connected;
// falls back to the built-in four designs so the site always renders.
import { getDb } from "@/lib/db";
import { DEFAULT_PRODUCTS, SIZES, type Product, type ProductLine } from "@/lib/products";

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

// Live products for the storefront (active only)
export async function getProducts(): Promise<Product[]> {
  const sql = getDb();
  if (!sql) return DEFAULT_PRODUCTS;
  try {
    const rows = (await sql`
      select * from products where active order by sort, id
    `) as Row[];
    if (rows.length === 0) return [];
    return rows.map(rowToProduct);
  } catch {
    // table probably doesn't exist yet — run schema.sql in Neon
    return DEFAULT_PRODUCTS;
  }
}

export async function getProduct(slug: string): Promise<Product | null> {
  const sql = getDb();
  if (!sql) return DEFAULT_PRODUCTS.find((p) => p.slug === slug) ?? null;
  try {
    const rows = (await sql`
      select * from products where slug = ${slug} and active limit 1
    `) as Row[];
    if (rows.length === 0) return null;
    return rowToProduct(rows[0]);
  } catch {
    return DEFAULT_PRODUCTS.find((p) => p.slug === slug) ?? null;
  }
}

// Everything, including hidden products — admin only
export async function getAllProducts(): Promise<Product[] | null> {
  const sql = getDb();
  if (!sql) return null; // no database connected
  const rows = (await sql`select * from products order by sort, id`) as Row[];
  return rows.map(rowToProduct);
}
