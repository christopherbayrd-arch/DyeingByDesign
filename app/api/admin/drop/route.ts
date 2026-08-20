import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { emailConfig, dropHtml, sendBatch, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/orderFormat";
import { fmtPrice } from "@/lib/products";

type Row = Record<string, unknown>;

// GET — who's on the list + what's been sent before
export async function GET() {
  const sql = getDb();
  const cfg = emailConfig();
  if (!sql) {
    return NextResponse.json({
      recipients: 0,
      unsubscribed: 0,
      history: [],
      canSend: false,
      reason: "No database connected yet (see README).",
    });
  }
  try {
    const counts = (await sql`
      select
        count(*) filter (where not unsubscribed) as active,
        count(*) filter (where unsubscribed) as gone
      from drop_signups
    `) as Row[];
    const history = (await sql`
      select * from drop_sends order by created_at desc limit 10
    `) as Row[];

    return NextResponse.json({
      recipients: Number(counts[0]?.active ?? 0),
      unsubscribed: Number(counts[0]?.gone ?? 0),
      history,
      canSend: cfg.canEmailCustomers,
      reason: cfg.canEmailCustomers
        ? ""
        : cfg.hasKey
          ? "Set EMAIL_FROM to an address on your verified domain before emailing the list (README step 6). You can still send yourself a test."
          : "Add RESEND_API_KEY in Vercel first (README step 6).",
    });
  } catch (err) {
    return NextResponse.json(
      {
        recipients: 0,
        unsubscribed: 0,
        history: [],
        canSend: false,
        reason: `Could not read the list — have you run the latest schema.sql in Neon? (${String(err).slice(0, 120)})`,
      },
      { status: 200 }
    );
  }
}

// POST — send a test to yourself, or the real thing to the whole list
export async function POST(req: Request) {
  const cfg = emailConfig();
  if (!cfg.hasKey) {
    return NextResponse.json(
      { error: "No Resend API key yet — add RESEND_API_KEY in Vercel (README step 6)." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const testOnly = Boolean(body?.testOnly);
  const subject = String(body?.subject ?? "").trim().slice(0, 160);
  const headline = String(body?.headline ?? "").trim().slice(0, 120);
  const message = String(body?.message ?? "").trim().slice(0, 6000);
  const ctaLabel = String(body?.ctaLabel ?? "").trim().slice(0, 40) || "Shop the drop";
  const ctaPath = String(body?.ctaUrl ?? "").trim().slice(0, 300) || "/shop";
  const featureSlug = String(body?.featureSlug ?? "").trim().slice(0, 60);

  if (!subject || !headline || !message) {
    return NextResponse.json(
      { error: "Subject, headline, and a message are all required." },
      { status: 400 }
    );
  }

  const site = siteUrl();
  const ctaUrl = ctaPath.startsWith("http") ? ctaPath : `${site}${ctaPath.startsWith("/") ? "" : "/"}${ctaPath}`;

  // optional featured design
  let feature = null;
  if (featureSlug) {
    const p = await getProduct(featureSlug);
    if (p) {
      feature = {
        name: p.name,
        price: fmtPrice(p.priceCents),
        image: p.card.startsWith("http") ? p.card : `${site}${p.card}`,
        url: `${site}/shop/${p.slug}`,
      };
    }
  }

  const paragraphs = message.split(/\n\s*\n/);

  // ---- test send: just to the shop's own address ----
  if (testOnly) {
    if (!cfg.notify) {
      return NextResponse.json(
        { error: "Set NOTIFY_EMAIL in Vercel so there's somewhere to send the test." },
        { status: 503 }
      );
    }
    const res = await sendEmail({
      to: cfg.notify,
      subject: `[TEST] ${subject}`,
      html: dropHtml({
        headline,
        bodyParagraphs: paragraphs,
        ctaLabel,
        ctaUrl,
        feature,
        siteUrl: site,
        unsubUrl: `${site}/unsubscribe?t=preview`,
      }),
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true, test: true, to: cfg.notify });
  }

  // ---- real send ----
  if (!cfg.canEmailCustomers) {
    return NextResponse.json(
      {
        error:
          "Emailing the list needs a verified sending domain. Verify dyeingbydesign.com in Resend and set EMAIL_FROM, then try again (README step 6).",
      },
      { status: 503 }
    );
  }

  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: "No database connected — nobody to send to." }, { status: 503 });
  }

  let people: { email: string; unsub_token: string }[] = [];
  try {
    people = (await sql`
      select email, unsub_token from drop_signups where not unsubscribed order by created_at
    `) as { email: string; unsub_token: string }[];
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read the list — run the latest schema.sql in Neon. (${String(err).slice(0, 120)})` },
      { status: 503 }
    );
  }

  if (people.length === 0) {
    return NextResponse.json({ error: "Nobody on the list yet." }, { status: 400 });
  }

  const items = people.map((p) => {
    const unsubUrl = `${site}/unsubscribe?t=${p.unsub_token}`;
    return {
      to: p.email,
      subject,
      html: dropHtml({
        headline,
        bodyParagraphs: paragraphs,
        ctaLabel,
        ctaUrl,
        feature,
        siteUrl: site,
        unsubUrl,
      }),
      // lets Gmail/Apple Mail show their own unsubscribe button — good for deliverability
      headers: {
        "List-Unsubscribe": `<${site}/api/unsubscribe?t=${p.unsub_token}>, <${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  const result = await sendBatch(items);

  try {
    await sql`
      insert into drop_sends (subject, headline, sent, failed)
      values (${subject}, ${headline}, ${result.sent}, ${result.failed})
    `;
  } catch (err) {
    console.error("could not log the drop send:", err);
  }

  return NextResponse.json({
    ok: result.sent > 0,
    sent: result.sent,
    failed: result.failed,
    error: result.error,
  });
}
