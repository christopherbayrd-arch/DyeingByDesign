import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rowToProduct } from "@/lib/catalog";

const NO_DB = {
  error:
    "No database connected yet. Add DATABASE_URL from Neon, run schema.sql in Neon's SQL editor, then reload.",
};

// List every product, including hidden ones (owner only — middleware guards this)
export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json(NO_DB, { status: 503 });
  try {
    const rows = (await sql`select * from products order by sort, id`) as Record<
      string,
      unknown
    >[];
    return NextResponse.json({ products: rows.map(rowToProduct) });
  } catch (err) {
    console.error("admin products list:", err);
    return NextResponse.json(
      { error: "Could not read the products table — have you run schema.sql in Neon?" },
      { status: 503 }
    );
  }
}

// Create a new draft product
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json(NO_DB, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "New design").trim().slice(0, 80) || "New design";
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    if (!slug) slug = "design";

    // make the slug unique by appending a number if needed
    const existing = (await sql`select slug from products where slug like ${slug + "%"}`) as {
      slug: string;
    }[];
    const taken = new Set(existing.map((r) => r.slug));
    let unique = slug;
    let n = 2;
    while (taken.has(unique)) unique = `${slug}-${n++}`;

    const rows = (await sql`
      insert into products (slug, name, active, sort)
      values (${unique}, ${name}, false, 99)
      returning *
    `) as Record<string, unknown>[];

    return NextResponse.json({ product: rowToProduct(rows[0]) });
  } catch (err) {
    console.error("admin product create:", err);
    return NextResponse.json({ error: "Could not create the product." }, { status: 500 });
  }
}
