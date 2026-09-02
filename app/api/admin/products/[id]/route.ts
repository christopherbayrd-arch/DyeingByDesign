import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rowToProduct } from "@/lib/catalog";
import { SIZES } from "@/lib/products";

const NO_DB = { error: "No database connected yet (see README)." };

// Update a product. Sends the full merged row back.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getDb();
  if (!sql) return NextResponse.json(NO_DB, { status: 503 });

  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) {
    return NextResponse.json({ error: "Bad product id." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const current = (await sql`select * from products where id = ${productId}`) as Record<
      string,
      unknown
    >[];
    if (current.length === 0) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const cur = rowToProduct(current[0]);

    // merge changes over the current values (only known fields)
    const str = (v: unknown, fallback: string, max = 8000) =>
      typeof v === "string" ? v.trim().slice(0, max) : fallback;

    const name = str(body.name, cur.name, 80) || cur.name;
    let slug = str(body.slug, cur.slug, 60)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) slug = cur.slug;
    const species = str(body.species, cur.species, 160);
    const line = body.line === "stencil" || body.line === "botanical" ? body.line : cur.line;
    const blurb = str(body.blurb, cur.blurb, 300);
    const story = str(body.story, cur.story, 8000);
    const image = str(body.image, cur.image, 600);
    const card = str(body.card, cur.card, 600);
    const badgeRaw = str(body.badge, cur.badge ?? "", 40);
    const badge = badgeRaw === "" ? null : badgeRaw;

    let priceCents = cur.priceCents;
    if (body.priceCents != null) {
      const n = Math.round(Number(body.priceCents));
      if (Number.isFinite(n) && n >= 100 && n <= 100000) priceCents = n;
    }

    const trackStock = typeof body.trackStock === "boolean" ? body.trackStock : cur.trackStock;
    const active = typeof body.active === "boolean" ? body.active : cur.active;
    const samplePhoto =
      typeof body.samplePhoto === "boolean" ? body.samplePhoto : Boolean(cur.samplePhoto);

    let stock = cur.stock;
    if (body.stock && typeof body.stock === "object") {
      stock = {};
      for (const size of SIZES) {
        const q = Math.floor(Number((body.stock as Record<string, unknown>)[size]));
        stock[size] = Number.isFinite(q) && q > 0 ? Math.min(q, 999) : 0;
      }
    }

    let sort = cur.sort ?? 0;
    if (body.sort != null && Number.isFinite(Number(body.sort))) {
      sort = Math.floor(Number(body.sort));
    }

    const rows = (await sql`
      update products set
        name = ${name},
        slug = ${slug},
        species = ${species},
        line = ${line},
        blurb = ${blurb},
        story = ${story},
        image = ${image},
        card = ${card},
        badge = ${badge},
        price_cents = ${priceCents},
        track_stock = ${trackStock},
        stock = ${JSON.stringify(stock)}::jsonb,
        active = ${active},
        sample_photo = ${samplePhoto},
        sort = ${sort}
      where id = ${productId}
      returning *
    `) as Record<string, unknown>[];

    return NextResponse.json({ product: rowToProduct(rows[0]) });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("products_slug_key") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { error: "That URL name (slug) is already used by another product." },
        { status: 400 }
      );
    }
    console.error("admin product update:", err);
    return NextResponse.json({ error: "Could not save the product." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getDb();
  if (!sql) return NextResponse.json(NO_DB, { status: 503 });

  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) {
    return NextResponse.json({ error: "Bad product id." }, { status: 400 });
  }

  try {
    await sql`delete from products where id = ${productId}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin product delete:", err);
    return NextResponse.json({ error: "Could not delete the product." }, { status: 500 });
  }
}
