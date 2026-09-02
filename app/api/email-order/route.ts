import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { SHIPPING_CENTS, availableQty, colorName, fmtPrice, isColorKey } from "@/lib/products";
import { emailConfig, sendEmail, orderRequestAlertHtml, customerOrderRequestHtml } from "@/lib/email";
import { sendPush } from "@/lib/notify";
import { siteUrl } from "@/lib/orderFormat";

// ============================================================
//  "Order by email" — the no-card ordering flow.
//
//  The cart posts the customer's details + cart lines here. We
//  re-price everything from the database, save the order with
//  status "requested", email the shop (reply-to = customer),
//  email the customer a copy when a sending domain is set up,
//  and ping the owner's phone. Chris replies with payment details
//  and marks it paid later.
//
//  If email isn't configured yet we hand back a mailto: link so
//  the customer can send the same order from their own mail app.
// ============================================================

type Line = { slug: string; size: string; color: string; qty: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // honeypot
    if (typeof body?.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const name = s(body.name, 120);
    const email = s(body.email, 200);
    const line1 = s(body.line1, 200);
    const line2 = s(body.line2, 200);
    const city = s(body.city, 120);
    const state = s(body.state, 40);
    const postal = s(body.postal, 20);
    const note = s(body.note, 2000);

    if (!name || !email.includes("@")) {
      return NextResponse.json({ error: "We need your name and an email to reply to." }, { status: 400 });
    }
    if (!line1 || !city || !state || !postal) {
      return NextResponse.json({ error: "Add a shipping address so we can quote shipping and get it to you." }, { status: 400 });
    }

    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
    const priced: { name: string; slug: string; size: string; color: string; qty: number; unit: number }[] = [];
    for (const raw of items.slice(0, 20)) {
      const it = raw as Partial<Line>;
      const qty = Math.floor(Number(it?.qty));
      const size = String(it?.size ?? "");
      const color = String(it?.color ?? "");
      if (!it?.slug || !(qty >= 1 && qty <= 10) || !isColorKey(color)) continue;
      const product = await getProduct(String(it.slug));
      if (!product || !product.sizes.includes(size)) continue;
      const avail = availableQty(product, size, color);
      const combo = `${product.name} in ${colorName(color)} / ${size}`;
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
      priced.push({ name: product.name, slug: product.slug, size, color, qty, unit: product.priceCents });
    }
    if (priced.length === 0) {
      return NextResponse.json({ error: "Your cart looks empty." }, { status: 400 });
    }

    const subtotal = priced.reduce((n, l) => n + l.unit * l.qty, 0);
    const total = subtotal + SHIPPING_CENTS;
    const itemLines = priced.map((l) => `${l.qty} × ${l.name} — ${colorName(l.color)}, size ${l.size} (${fmtPrice(l.unit)} each)`);
    const itemsMeta = priced.map((l) => `${l.slug}|${l.size}|${l.color}|x${l.qty}`).join("; ");
    const shipping = {
      name,
      address: { line1, line2: line2 || undefined, city, state, postal_code: postal, country: "US" },
    };
    const shipTo = [name, line1, line2, `${city}, ${state} ${postal}`].filter(Boolean).join(", ");
    const orderRef = "DBD-" + randomBytes(3).toString("hex").toUpperCase();

    // Save it (best effort — an unconnected DB shouldn't block an email order)
    const sql = getDb();
    if (sql) {
      try {
        await sql`
          insert into orders (stripe_session_id, email, name, amount_total, items, shipping, status)
          values (${"email_" + orderRef}, ${email}, ${name}, ${total}, ${itemsMeta + (note ? ` | note: ${note.slice(0, 300)}` : "")}, ${JSON.stringify(shipping)}::jsonb, 'requested')
        `;
      } catch (err) {
        console.error("email-order db insert failed:", err);
      }
    }

    const cfg = emailConfig();
    const site = siteUrl();

    // Plain-text version, used for the mailto fallback
    const plain = [
      `Order ${orderRef}`,
      "",
      ...itemLines,
      "",
      `Subtotal ${fmtPrice(subtotal)} + shipping ${fmtPrice(SHIPPING_CENTS)} = ${fmtPrice(total)}`,
      "",
      `Ship to: ${shipTo}`,
      note ? `Note: ${note}` : "",
    ]
      .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
      .join("\n");

    if (!cfg.canNotifyOwner) {
      // Email isn't wired up on the server yet — let them send it themselves.
      const to = cfg.notify || process.env.NEXT_PUBLIC_ORDER_EMAIL || "";
      if (!to) {
        return NextResponse.json(
          { error: "Ordering isn't switched on yet — the shop still needs to connect its email (see README)." },
          { status: 503 }
        );
      }
      const mailto = `mailto:${to}?subject=${encodeURIComponent(`Order ${orderRef} — ${name}`)}&body=${encodeURIComponent(plain + `\n\nFrom: ${name} <${email}>`)}`;
      return NextResponse.json({ ok: true, orderRef, mailto });
    }

    // 1. the shop
    const alert = await sendEmail({
      to: cfg.notify,
      subject: `Order ${orderRef} — ${name} · ${fmtPrice(total)}`,
      replyTo: email,
      html: orderRequestAlertHtml({
        orderRef,
        itemLines,
        customerName: name,
        customerEmail: email,
        subtotal: fmtPrice(subtotal),
        shipping: fmtPrice(SHIPPING_CENTS),
        total: fmtPrice(total),
        shipTo,
        note,
        siteUrl: site,
      }),
    });
    if (!alert.ok) {
      console.error("order alert failed:", alert.error);
      const mailto = `mailto:${cfg.notify}?subject=${encodeURIComponent(`Order ${orderRef} — ${name}`)}&body=${encodeURIComponent(plain + `\n\nFrom: ${name} <${email}>`)}`;
      return NextResponse.json({ ok: true, orderRef, mailto, emailFailed: true });
    }

    // 2. the customer (only once a sending domain is verified)
    let customerEmailed = false;
    if (cfg.canEmailCustomers) {
      const res = await sendEmail({
        to: email,
        subject: `We got your order ${orderRef} — Dyeing By Design`,
        replyTo: cfg.notify,
        html: customerOrderRequestHtml({
          firstName: name.split(" ")[0],
          orderRef,
          itemLines,
          total: fmtPrice(total),
          shipTo,
          siteUrl: site,
        }),
      });
      customerEmailed = res.ok;
      if (!res.ok) console.error("customer copy failed:", res.error);
    }

    // 3. the phone
    sendPush({
      title: `Order ${orderRef} · ${fmtPrice(total)}`,
      message: `${name}\n${priced.map((l) => `${l.qty}× ${l.name} ${colorName(l.color)} ${l.size}`).join(", ")}\n${city}, ${state}`,
      url: `${site}/admin`,
      urlTitle: "Open the order desk",
      sound: "cashregister",
      priority: 1,
    }).catch(() => {});

    return NextResponse.json({ ok: true, orderRef, customerEmailed });
  } catch (err) {
    console.error("email order error:", err);
    return NextResponse.json(
      { error: "Something went wrong on our end. Try again in a minute." },
      { status: 500 }
    );
  }
}
