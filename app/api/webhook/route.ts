import Stripe from "stripe";
import { getDb } from "@/lib/db";
import { emailConfig, sendEmail, orderAlertHtml, customerOrderHtml } from "@/lib/email";
import { sendPush } from "@/lib/notify";
import { SHIPPING_CENTS, stockKey } from "@/lib/products";
import { itemLinesFromMeta, parseItemsMeta, shipToLine, money, siteUrl } from "@/lib/orderFormat";
import { costOrder, insertOrderLines, linesFromMeta } from "@/lib/costing";
import { takeStock } from "@/lib/inventory";

type Row = Record<string, unknown>;

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

    // Card processing fee, straight from Stripe (best effort — the history
    // page shows a blank fee if this lookup fails, nothing else breaks).
    let feeCents: number | null = null;
    try {
      if (typeof session.payment_intent === "string") {
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ["latest_charge.balance_transaction"],
        });
        const charge = pi.latest_charge as Stripe.Charge | null;
        const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
        if (bt && typeof bt.fee === "number") feeCents = bt.fee;
      }
    } catch (err) {
      console.error("stripe fee lookup failed:", err);
    }
    const shippingCents = session.total_details?.amount_shipping ?? SHIPPING_CENTS;

    const sql = getDb();
    if (sql) {
      try {
        const inserted = (await sql`
          insert into orders (stripe_session_id, email, name, amount_total, items, shipping, channel, shipping_cents, fee_cents, paid_at, status)
          values (
            ${session.id},
            ${session.customer_details?.email ?? null},
            ${session.customer_details?.name ?? null},
            ${session.amount_total ?? null},
            ${itemsMeta},
            ${JSON.stringify(shipping)}::jsonb,
            'site',
            ${shippingCents},
            ${feeCents},
            now(),
            -- A card only goes through for something that's on the shelf, so
            -- by the time this runs the piece is already bleached, washed and
            -- finished. It lands on the desk as Made, not Paid, and never
            -- shows up in the make queue as something to bleach.
            'made'
          )
          on conflict (stripe_session_id) do nothing
          returning id
        `) as { id: number }[];

        isNew = inserted.length > 0;

        // Stripe says whether this payment was real money or a test. Test
        // orders get stamped so the desk can tag them and Sales history, COGS
        // and the make queue can leave them out. Best effort on purpose: on a
        // database without the column yet a test order just looks ordinary.
        if (isNew && !event.livemode) {
          try {
            await sql`update orders set test_mode = true where id = ${inserted[0].id}`;
          } catch {
            // no test_mode column yet — run the newest schema.sql in Neon
          }
        }

        // One row per shirt with the cost frozen right now, for the sales
        // history. Never allowed to fail the order itself.
        if (isNew && itemsMeta) {
          try {
            await insertOrderLines(sql, inserted[0].id, await linesFromMeta(itemsMeta));
            await costOrder(sql, inserted[0].id);
            // and every line is already made, so the per shirt ticks on the
            // make queue match the order's status
            await sql`update order_lines set made_at = now() where order_id = ${inserted[0].id}`;
          } catch (err) {
            console.error("order lines / costing failed:", err);
          }
        }

        // Subtract stock only when this order was newly recorded
        // (Stripe retries webhooks — this stops double-subtracting).
        // Designs sold from what's on hand come off the Inventory shelf.
        if (isNew && itemsMeta) {
          for (const l of parseItemsMeta(itemsMeta)) {
            const { slug, size, color, qty, variant } = l;
            if (!slug || !size || !color || !(qty >= 1)) continue;
            try {
              // a bandana's count is per design, so the design rides along
              await takeStock(sql, { kind: "shirt", slug, name: variant ?? "", color, size }, qty, "sold", {
                orderId: inserted[0].id,
                note: "Card order",
              });
            } catch {
              // database without the inventory table yet: the old per product counts
              const key = stockKey(color, size);
              await sql`
                update products set stock = jsonb_set(
                  coalesce(stock, '{}'::jsonb),
                  array[${key}],
                  to_jsonb(greatest(coalesce((stock->>${key})::int, 0) - ${qty}, 0))
                )
                where slug = ${slug}
              `;
            }
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
          title: `Ready to ship · ${total}`,
          message: `Off the shelf — pack and send.\n${customerName || customerEmail}\n${itemLines.join(", ")}`,
          url: `${site}/admin`,
          urlTitle: "Open the order desk",
          sound: "cashregister",
          priority: 1,
        }).catch(() => {});

        if (cfg.canNotifyOwner) {
          const res = await sendEmail({
            to: cfg.notify,
            subject: `Ready to ship — ${total}${customerName ? ` for ${customerName}` : ""}`,
            replyTo: customerEmail || undefined,
            html: orderAlertHtml({
              itemLines,
              customerName,
              customerEmail,
              total,
              shipTo: shipToLine(shipping),
              siteUrl: site,
              ready: true,
            }),
          });
          if (!res.ok) console.error("owner order email failed:", res.error);
        }

        // Customers can only be emailed from a verified domain
        if (cfg.canEmailCustomers && customerEmail) {
          const res = await sendEmail({
            to: customerEmail,
            subject: "Your order is ready to ship — Dyeing By Design",
            replyTo: cfg.notify || undefined,
            html: customerOrderHtml({
              firstName: customerName.split(" ")[0] ?? "",
              itemLines,
              total,
              siteUrl: site,
              ready: true,
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
