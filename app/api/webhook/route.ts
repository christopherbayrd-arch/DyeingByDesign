import Stripe from "stripe";
import { getDb } from "@/lib/db";
import { emailConfig, sendEmail, orderAlertHtml, customerOrderHtml } from "@/lib/email";
import { sendPush } from "@/lib/notify";
import { itemLinesFromMeta, shipToLine, money, siteUrl } from "@/lib/orderFormat";

// Stripe calls this after a successful checkout. We save the order into Neon,
// subtract sold stock, and send notification emails.
// Configure in Stripe as:  https://YOUR-SITE/api/webhook
// with the event:          checkout.session.completed
export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret) return new Response("Webhook not configured", { status: 503 });

  const stripe = new Stripe(key);
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // shipping details moved between Stripe API versions — check both spots
    const s = session as unknown as Record<string, unknown>;
    const collected = s["collected_information"] as { shipping_details?: unknown } | null | undefined;
    const shipping = s["shipping_details"] ?? collected?.shipping_details ?? null;
    const itemsMeta = session.metadata?.items ?? null;

    // isNew stays true when there's no database, so a first-run shop
    // still gets its notification email.
    let isNew = true;

    const sql = getDb();
    if (sql) {
      try {
        const inserted = (await sql`
          insert into orders (stripe_session_id, email, name, amount_total, items, shipping)
          values (
            ${session.id},
            ${session.customer_details?.email ?? null},
            ${session.customer_details?.name ?? null},
            ${session.amount_total ?? null},
            ${itemsMeta},
            ${JSON.stringify(shipping)}::jsonb
          )
          on conflict (stripe_session_id) do nothing
          returning id
        `) as { id: number }[];

        isNew = inserted.length > 0;

        // Subtract stock only when this order was newly recorded
        // (Stripe retries webhooks — this stops double-subtracting).
        if (isNew && itemsMeta) {
          for (const part of itemsMeta.split(";")) {
            const [slug, size, qtyPart] = part.trim().split("|");
            const qty = Number((qtyPart ?? "").replace("x", ""));
            if (!slug || !size || !(qty >= 1)) continue;
            await sql`
              update products set stock = jsonb_set(
                coalesce(stock, '{}'::jsonb),
                array[${size}],
                to_jsonb(greatest(coalesce((stock->>${size})::int, 0) - ${qty}, 0))
              )
              where slug = ${slug} and track_stock = true
            `;
          }
        }
      } catch (err) {
        console.error("order save failed:", err);
        // 500 makes Stripe retry the webhook, so the order isn't lost
        return new Response("Database error", { status: 500 });
      }
    }

    // ---- notifications (never allowed to fail the webhook) ----
    if (isNew) {
      try {
        const cfg = emailConfig();
        const customerEmail = session.customer_details?.email ?? "";
        const customerName = session.customer_details?.name ?? "";
        const itemLines = await itemLinesFromMeta(itemsMeta);
        const total = money(session.amount_total);
        const site = siteUrl();

        sendPush({
          title: `Paid order · ${total}`,
          message: `${customerName || customerEmail}\n${itemLines.join(", ")}`,
          url: `${site}/admin`,
          urlTitle: "Open the order desk",
          sound: "cashregister",
          priority: 1,
        }).catch(() => {});

        if (cfg.canNotifyOwner) {
          const res = await sendEmail({
            to: cfg.notify,
            subject: `New order — ${total}${customerName ? ` from ${customerName}` : ""}`,
            replyTo: customerEmail || undefined,
            html: orderAlertHtml({
              itemLines,
              customerName,
              customerEmail,
              total,
              shipTo: shipToLine(shipping),
              siteUrl: site,
            }),
          });
          if (!res.ok) console.error("owner order email failed:", res.error);
        }

        // Customers can only be emailed from a verified domain
        if (cfg.canEmailCustomers && customerEmail) {
          const res = await sendEmail({
            to: customerEmail,
            subject: "We got your order — Dyeing By Design",
            replyTo: cfg.notify || undefined,
            html: customerOrderHtml({
              firstName: customerName.split(" ")[0] ?? "",
              itemLines,
              total,
              siteUrl: site,
            }),
          });
          if (!res.ok) console.error("customer order email failed:", res.error);
        }
      } catch (err) {
        console.error("order notification error:", err);
      }
    }
  }

  return new Response("ok");
}
