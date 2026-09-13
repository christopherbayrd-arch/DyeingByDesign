import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getProduct } from "@/lib/catalog";
import { colorName, isColorKey, ONE_SIZE } from "@/lib/products";
import { emailConfig, sendEmail, swapAlertHtml, customerSwapHtml } from "@/lib/email";
import { sendPush } from "@/lib/notify";
import { siteUrl } from "@/lib/orderFormat";
import { createSwap, lineAlreadySwapped, openSwapFor } from "@/lib/swaps";
import { changesSomething, reasonLabel, swapRefFrom, SWAP_REASONS } from "@/lib/swapShared";

// ============================================================
//  "Ask for a swap" — the customer side of the exchange policy.
//
//  Nothing is returned for a refund (every piece is made for one
//  person), but each piece gets one swap for a different size or
//  color. This saves the request, emails Corey, and sends the
//  customer a copy. Nothing on the shelf moves until the swap is
//  marked done in /admin/swaps.
// ============================================================

type Row = Record<string, unknown>;

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// "Sumac · Royal blue · L" — how a piece reads in the emails
function pieceText(p: { name: string; variantName?: string; color: string; size: string }) {
  const what = p.variantName ? `${p.name} · ${p.variantName}` : p.name;
  return [what, p.color ? colorName(p.color) : "", p.size && p.size !== ONE_SIZE ? p.size : ""]
    .filter(Boolean)
    .join(" · ");
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json(
      { error: "Swaps aren't switched on yet — email us and we'll sort it out by hand." },
      { status: 503 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));

    // honeypot
    if (typeof body?.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ ok: true, ref: "" });
    }

    const me = await currentUser();
    const name = s(body.name, 120) || (me?.name ?? "");
    const email = (s(body.email, 200) || (me?.email ?? "")).toLowerCase();
    const note = s(body.note, 1500);
    const reasonRaw = s(body.reason, 40);
    const reason = SWAP_REASONS.some((r) => r.key === reasonRaw) ? reasonRaw : "other";
    const lineId = Number(body.lineId) || 0;

    if (!email.includes("@")) {
      return NextResponse.json({ error: "We need the email your order was under." }, { status: 400 });
    }

    // Where the replacement goes
    const address = {
      line1: s(body.line1, 200),
      line2: s(body.line2, 200),
      city: s(body.city, 120),
      state: s(body.state, 40),
      postal: s(body.postal, 20),
    };
    if (!address.line1 || !address.city || !address.state || !address.postal) {
      return NextResponse.json({ error: "Add the address the replacement should go to." }, { status: 400 });
    }

    // What they have. A picked order line is the truth; otherwise they described it.
    let slug = s(body.slug, 60).toLowerCase();
    let variant = s(body.variant, 60).toLowerCase();
    let color = s(body.color, 40);
    let size = s(body.size, 20);
    let orderId: number | null = null;
    let linkedLine: number | null = null;
    let orderRef = "";

    if (lineId) {
      // only the person the order belongs to can point at its lines
      const rows = (await sql`
        select l.id, l.slug, l.color, l.size, l.qty, l.name, l.swapped_at,
               o.id as order_id, o.email, o.user_id, o.stripe_session_id, o.status
        from order_lines l join orders o on o.id = l.order_id
        where l.id = ${lineId}
      `) as Row[];
      const r = rows[0];
      const mine =
        r &&
        (String(r.email ?? "").toLowerCase() === email ||
          (me && Number(r.user_id) === Number(me.id)));
      if (!r || !mine) {
        return NextResponse.json(
          { error: "We couldn't match that to an order under this email. Describe the piece instead and we'll find it." },
          { status: 400 }
        );
      }
      if (r.swapped_at) {
        return NextResponse.json(
          { error: "That one has already had its swap. Email us and we'll see what we can do." },
          { status: 409 }
        );
      }
      orderId = Number(r.order_id);
      linkedLine = Number(r.id);
      orderRef = String(r.stripe_session_id ?? "").replace("email_", "");
      slug = String(r.slug ?? "");
      color = String(r.color ?? "");
      size = String(r.size ?? "");
      try {
        const v = (await sql`select variant from order_lines where id = ${lineId}`) as Row[];
        variant = String(v[0]?.variant ?? "");
      } catch {
        variant = "";
      }
    }

    if (!slug) return NextResponse.json({ error: "Which piece is it?" }, { status: 400 });

    const wantColor = s(body.wantColor, 40);
    const wantSize = s(body.wantSize, 20);
    if (wantColor && !isColorKey(wantColor)) {
      return NextResponse.json({ error: "That's not one of the blank colors." }, { status: 400 });
    }
    if (!changesSomething({ color, size }, { color: wantColor, size: wantSize })) {
      return NextResponse.json(
        { error: "Pick a different size or color — otherwise there's nothing to swap." },
        { status: 400 }
      );
    }

    const product = await getProduct(slug).catch(() => null);
    if (product && wantSize && !product.sizes.includes(wantSize)) {
      return NextResponse.json({ error: `${product.name} doesn't come in ${wantSize}.` }, { status: 400 });
    }

    // Already asked? Hand back the swap they've got rather than making a second one.
    const open = await openSwapFor(sql, linkedLine, email, slug);
    if (open) {
      return NextResponse.json({ ok: true, ref: open.ref, already: true, status: open.status });
    }
    if (linkedLine && (await lineAlreadySwapped(sql, linkedLine))) {
      return NextResponse.json({ error: "That one has already had its swap." }, { status: 409 });
    }

    const ref = swapRefFrom(randomBytes(3).toString("hex"));
    await createSwap(sql, {
      ref,
      orderId,
      lineId: linkedLine,
      email,
      name,
      slug,
      variant,
      color,
      size,
      wantColor,
      wantSize,
      reason,
      note,
      address,
    });

    // ---- tell everyone ----
    const designName = product?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1);
    const variantName = variant
      ? (await getProduct(variant).catch(() => null))?.name ?? variant
      : "";
    const have = pieceText({ name: designName, variantName, color, size });
    const want = pieceText({
      name: designName,
      variantName,
      color: wantColor || color,
      size: wantSize || size,
    });

    const cfg = emailConfig();
    const site = siteUrl();
    if (cfg.canNotifyOwner) {
      sendEmail({
        to: cfg.notify,
        subject: `Swap ${ref} — ${name || email}`,
        replyTo: email,
        html: swapAlertHtml({
          ref,
          customerName: name,
          customerEmail: email,
          have,
          want,
          reason: reasonLabel(reason),
          note,
          orderRef,
          siteUrl: site,
        }),
      }).catch(() => null);
      sendEmail({
        to: email,
        subject: `We got your swap request (${ref})`,
        html: customerSwapHtml({
          firstName: name.split(" ")[0] ?? "",
          ref,
          have,
          want,
          status: "requested",
          message: "",
          returnTo: "",
          siteUrl: site,
        }),
      }).catch(() => null);
    }
    sendPush({
      title: "Swap asked for",
      message: `${have} → ${want}`,
      url: `${site}/admin/swaps`,
    }).catch(() => null);

    return NextResponse.json({ ok: true, ref, emailed: cfg.canNotifyOwner });
  } catch (err) {
    console.error("swap request:", err);
    const msg = String((err as Error)?.message ?? err);
    if (/swaps/.test(msg) && /does not exist/.test(msg)) {
      // the shop hasn't run the latest schema.sql yet — don't leave them stuck
      return NextResponse.json(
        {
          error:
            "Swaps aren't switched on here yet. Email us at the address in the footer and we'll sort your size out by hand.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "That didn't send. Try again in a minute, or email us and we'll sort it out." },
      { status: 500 }
    );
  }
}
