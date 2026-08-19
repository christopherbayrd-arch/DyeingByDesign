import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getProduct } from "@/lib/catalog";
import { SHIPPING_CENTS, COLOR, availableQty } from "@/lib/products";

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
    const stripe = new Stripe(key);

    const body = await req.json().catch(() => ({}));
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];

    const site = process.env.NEXT_PUBLIC_SITE_URL;
    const canSendImages = typeof site === "string" && site.startsWith("https://");
    const absoluteImage = (path: string) =>
      path.startsWith("http") ? path : `${site}${path}`;

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const metaParts: string[] = [];

    for (const raw of items.slice(0, 20)) {
      const it = raw as { slug?: string; size?: string; qty?: number };
      const qty = Math.floor(Number(it?.qty));
      const size = String(it?.size ?? "");
      if (!it?.slug || !(qty >= 1 && qty <= 10)) continue;

      const product = await getProduct(String(it.slug));
      if (!product || !product.sizes.includes(size)) continue;

      // stock check (Infinity when the product is made to order)
      const avail = availableQty(product, size);
      if (avail <= 0) {
        return NextResponse.json(
          { error: `${product.name} in size ${size} just sold out. Remove it from your cart to continue.` },
          { status: 409 }
        );
      }
      if (qty > avail) {
        return NextResponse.json(
          { error: `Only ${avail} left of ${product.name} in size ${size} — lower the quantity to continue.` },
          { status: 409 }
        );
      }

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: product.priceCents,
          product_data: {
            name: `${product.name} — hand bleached tee`,
            description: `Size ${size} · ${COLOR}${product.species ? ` · ${product.species}` : ""}`,
            ...(canSendImages && product.card
              ? { images: [absoluteImage(product.card)] }
              : {}),
          },
        },
      });
      metaParts.push(`${product.slug}|${size}|x${qty}`);
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
