import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/lib/db";
import { getProduct, getProducts } from "@/lib/catalog";
import { variantOnHand } from "@/lib/inventory";
import {
  ORDER_MODE,
  SHIPPING_CENTS,
  availableQty,
  colorName,
  isColorKey,
  setPricedLines,
  type ProductKind,
} from "@/lib/products";
import { metaLine } from "@/lib/orderFormat";

// Creates a Stripe Checkout session from the cart.
// Prices AND availability always come from the database on the server —
// never from the browser.
export async function POST(req: Request) {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Payments aren't switched on yet — the shop owner needs to add Stripe keys (see README)." },
        { status: 503 }
      );
    }
    if (ORDER_MODE === "email") {
      return NextResponse.json(
        { error: "Card checkout is switched off — send the order from your cart instead." },
        { status: 503 }
      );
    }
    const stripe = new Stripe(key);

    const body = await req.json().catch(() => ({}));
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];

    const site = process.env.NEXT_PUBLIC_SITE_URL;
    const canSendImages = typeof site === "string" && site.startsWith("https://");
    const absoluteImage = (path: string) =>
      path.startsWith("http") ? path : `${site}${path}`;

    // a bandana carries the design that goes on it — it has to be a real design
    const designs = (await getProducts()).filter((p) => p.kind !== "bandana");
    const priced: {
      slug: string; name: string; size: string; color: string; qty: number; unitPriceCents: number;
      kind: ProductKind; variant: string; variantName: string; species: string; card: string;
    }[] = [];

    for (const raw of items.slice(0, 20)) {
      const it = raw as { slug?: string; size?: string; color?: string; qty?: number; variant?: string };
      const qty = Math.floor(Number(it?.qty));
      const size = String(it?.size ?? "");
      const color = String(it?.color ?? "");
      if (!it?.slug || !(qty >= 1 && qty <= 10) || !isColorKey(color)) continue;

      const product = await getProduct(String(it.slug));
      if (!product || !product.sizes.includes(size)) continue;

      const combo = `${product.name} in ${colorName(color)} / ${size}`;

      // In split mode only counted stock checks out by card; made to order
      // shirts go in as an order request (the cart already routes them there,
      // this just makes sure nobody gets around it).
      if (ORDER_MODE === "split" && !product.trackStock) {
        return NextResponse.json(
          { error: `${product.name} is made to order — send it as an order request from your cart and we'll reply with a payment link.` },
          { status: 400 }
        );
      }

      // stock check (Infinity when the product is made to order)
      const avail = availableQty(product, size, color);
      if (avail <= 0) {
        return NextResponse.json(
          { error: `${combo} just sold out. Remove it from your cart to continue.` },
          { status: 409 }
        );
      }
      if (qty > avail) {
        return NextResponse.json(
          { error: `Only ${avail} left of ${combo} — lower the quantity to continue.` },
          { status: 409 }
        );
      }

      const wanted = String(it?.variant ?? "").trim();
      const design = product.kind === "bandana" ? designs.find((d) => d.slug === wanted) : undefined;
      if (product.kind === "bandana" && !design) {
        return NextResponse.json({ error: "Pick which design goes on the bandana." }, { status: 400 });
      }
      // the shelf count is per design, so check this exact one before charging
      if (design && product.trackStock) {
        const have = await variantOnHand(getDb(), {
          slug: product.slug,
          variant: design.slug,
          color,
          size,
        });
        if (have !== null && have < qty) {
          return NextResponse.json(
            {
              error:
                have === 0
                  ? `The ${design.name} bandana in ${colorName(color)} just sold out. Pick another design or color to continue.`
                  : `Only ${have} left of the ${design.name} bandana in ${colorName(color)} — lower the quantity to continue.`,
            },
            { status: 409 }
          );
        }
      }

      priced.push({
        slug: product.slug,
        name: product.name,
        size,
        color,
        qty,
        unitPriceCents: product.priceCents,
        kind: product.kind,
        variant: design?.slug ?? "",
        variantName: design?.name ?? "",
        species: product.species,
        card: product.card,
      });
    }

    // A shirt and a bandana together come to the set price. The saving comes
    // off the bandana, so what Stripe charges per line is what the sales
    // history records — no discount hiding at the order level.
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const metaParts: string[] = [];
    for (const part of setPricedLines(priced)) {
      const l = part.line;
      const bandana = l.kind === "bandana";
      line_items.push({
        quantity: part.qty,
        price_data: {
          currency: "usd",
          unit_amount: part.unitPriceCents,
          product_data: {
            name:
              (bandana ? `${l.name} — hand bleached` : `${l.name} — hand bleached tee`) +
              (part.setPriced ? " (set price)" : ""),
            description: bandana
              ? `${l.variantName} · ${colorName(l.color)} · one size${part.setPriced ? " · bought with a shirt" : ""}`
              : `${colorName(l.color)} · Size ${l.size}${l.species ? ` · ${l.species}` : ""}`,
            ...(canSendImages && l.card ? { images: [absoluteImage(l.card)] } : {}),
          },
        },
      });
      // slug|size|color|xQTY|unit price|design — the price rides along so the
      // sales history knows what was actually paid, even after a price change
      metaParts.push(
        metaLine({
          slug: l.slug,
          size: l.size,
          color: l.color,
          qty: part.qty,
          priceCents: part.unitPriceCents,
          variant: l.variant,
        })
      );
    }

    if (line_items.length === 0) {
      return NextResponse.json({ error: "Your cart looks empty." }, { status: 400 });
    }

    const origin =
      req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Flat rate shipping",
            type: "fixed_amount",
            fixed_amount: { amount: SHIPPING_CENTS, currency: "usd" },
          },
        },
      ],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
      metadata: { items: metaParts.join("; ").slice(0, 490) },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return NextResponse.json(
      { error: "Could not start checkout. Try again in a minute." },
      { status: 500 }
    );
  }
}
