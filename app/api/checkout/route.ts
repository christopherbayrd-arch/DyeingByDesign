import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getProduct, getProducts } from "@/lib/catalog";
import {
  ORDER_MODE,
  SHIPPING_CENTS,
  colorName,
  isColorKey,
  onHand,
  setPricedLines,
  type ProductKind,
} from "@/lib/products";
import { metaLine } from "@/lib/orderFormat";

// Creates a Stripe Checkout session from the cart.
// Prices AND availability always come from the database on the server —
// never from the browser. Card checkout only ever covers pieces that are
// finished and on the Inventory shelf right now; everything else goes in as
// an order request (see the cart).
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

      const wanted = String(it?.variant ?? "").trim();
      const design = product.kind === "bandana" ? designs.find((d) => d.slug === wanted) : undefined;
      if (product.kind === "bandana" && !design) {
        return NextResponse.json({ error: "Pick which design goes on the bandana." }, { status: 400 });
      }
      const piece = design
        ? `The ${design.name} bandana in ${colorName(color)}`
        : `${product.name} in ${colorName(color)} / ${size}`;

      // The one rule for card checkout: this exact piece — design, color,
      // size, and on a bandana the design bleached onto it — is on the shelf
      // right now, so it can go out in a day or two. Made to order, sold out,
      // or more than there is: all of it goes in as an order request instead,
      // which the cart already does. This is what stops anyone getting round
      // it by posting straight at the API. (A bandana's count is per design,
      // which onHand() reads from the per design shelf counts.)
      const have = onHand(product, size, color, design?.slug ?? "");
      if (have <= 0) {
        return NextResponse.json(
          { error: `${piece} isn't on the shelf right now — send it as an order request from your cart and we'll reply with a payment link.` },
          { status: 409 }
        );
      }
      if (qty > have) {
        return NextResponse.json(
          { error: `${piece} — only ${have} ready to ship. Lower the quantity, or send it as an order request from your cart.` },
          { status: 409 }
        );
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
