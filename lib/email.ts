// ============================================================
//  Email notifications (powered by Resend).
//
//  Everything here is optional and fail-safe: if the keys
//  aren't set, or Resend has a hiccup, nothing throws and the
//  order still saves. Email is a nice-to-have on top, never a
//  thing that can break a sale.
//
//  Environment variables:
//    RESEND_API_KEY  — from resend.com (required to send anything)
//    NOTIFY_EMAIL    — where the shop's own alerts go (Corey/Chris)
//    EMAIL_FROM      — e.g. "Dyeing By Design <hello@dyeingbydesign.com>"
//                      Only needed to email CUSTOMERS; requires a
//                      verified domain in Resend. Without it we still
//                      send shop alerts from Resend's test address.
// ============================================================
import { Resend } from "resend";

const TEST_FROM = "Dyeing By Design <onboarding@resend.dev>";

export function emailConfig() {
  const hasKey = Boolean(process.env.RESEND_API_KEY);
  const notify = process.env.NOTIFY_EMAIL ?? "";
  const from = process.env.EMAIL_FROM ?? "";
  return {
    hasKey,
    notify,
    from,
    // shop alerts work as soon as there's a key + destination
    canNotifyOwner: hasKey && Boolean(notify),
    // emailing customers needs a verified sending domain
    canEmailCustomers: hasKey && Boolean(from),
  };
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export async function sendEmail({ to, subject, html, replyTo }: SendArgs) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };
  if (!to) return { ok: false, error: "No destination address." };

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || TEST_FROM,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------- shared shell so every email looks like the brand ----------
function shell(title: string, bodyHtml: string, footNote?: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"></head><body style="margin:0;padding:0;background:#191408;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#191408;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#241d0e;border:1px solid rgba(240,231,209,.12);border-radius:16px;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font:600 11px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#cf9440;">Dyeing By Design</p>
          <h1 style="margin:10px 0 0;font:600 26px/1.25 Georgia,'Times New Roman',serif;color:#f0e7d1;">${title}</h1>
        </td></tr>
        <tr><td style="padding:14px 28px 26px;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:#b3a689;">
          ${bodyHtml}
        </td></tr>
      </table>
      ${footNote ? `<p style="margin:16px 0 0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#7d735c;max-width:560px;">${footNote}</p>` : ""}
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:7px 0;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#7d735c;vertical-align:top;width:112px;">${label}</td>
    <td style="padding:7px 0;font:400 15px/1.5 Helvetica,Arial,sans-serif;color:#f0e7d1;vertical-align:top;">${value}</td>
  </tr>`;
}

export function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- 1. NEW ORDER → the shop ----------
export function orderAlertHtml(o: {
  itemLines: string[];
  customerName: string;
  customerEmail: string;
  total: string;
  shipTo: string;
  siteUrl: string;
}) {
  const items = o.itemLines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join("");
  const body = `
    <p style="margin:0 0 18px;color:#f0e7d1;">Someone just bought a shirt. Time to pick some leaves — or cut a stencil.</p>
    <div style="background:rgba(0,0,0,.25);border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <p style="margin:0 0 8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cf9440;">To make</p>
      <ul style="margin:0;padding-left:18px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#f0e7d1;">${items}</ul>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Customer", escapeHtml(o.customerName || "—"))}
      ${row("Email", escapeHtml(o.customerEmail || "—"))}
      ${row("Ship to", escapeHtml(o.shipTo || "—").replace(/, /g, ",<br>"))}
      ${row("Total paid", `<strong style="color:#e3b96e;">${escapeHtml(o.total)}</strong>`)}
    </table>
    <p style="margin:22px 0 0;">
      <a href="${o.siteUrl}/admin" style="display:inline-block;background:#cf9440;color:#110d05;text-decoration:none;font:700 14px/1 Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:999px;">Open the order desk</a>
    </p>`;
  return shell("New order", body, "Sent automatically by your website when a payment clears.");
}

// ---------- 1b. ORDER REQUEST (email ordering, no card) → the shop ----------
export function orderRequestAlertHtml(o: {
  orderRef: string;
  itemLines: string[];
  customerName: string;
  customerEmail: string;
  subtotal: string;
  shipping: string;
  total: string;
  shipTo: string;
  note: string;
  siteUrl: string;
}) {
  const items = o.itemLines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join("");
  const body = `
    <p style="margin:0 0 18px;color:#f0e7d1;">New order request <strong style="color:#e3b96e;">${escapeHtml(o.orderRef)}</strong>. Nothing's been paid yet — hit reply, send payment details, and it's a sale.</p>
    <div style="background:rgba(0,0,0,.25);border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <p style="margin:0 0 8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cf9440;">To make</p>
      <ul style="margin:0;padding-left:18px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#f0e7d1;">${items}</ul>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Customer", escapeHtml(o.customerName || "—"))}
      ${row("Email", escapeHtml(o.customerEmail || "—"))}
      ${row("Ship to", escapeHtml(o.shipTo || "—").replace(/, /g, ",<br>"))}
      ${row("Subtotal", escapeHtml(o.subtotal))}
      ${row("Shipping", escapeHtml(o.shipping))}
      ${row("Total due", `<strong style="color:#e3b96e;">${escapeHtml(o.total)}</strong>`)}
      ${o.note ? row("Note", escapeHtml(o.note).replace(/\n/g, "<br>")) : ""}
    </table>
    <p style="margin:22px 0 0;">
      <a href="mailto:${escapeHtml(o.customerEmail)}?subject=${encodeURIComponent(`Re: Order ${o.orderRef}`)}" style="display:inline-block;background:#cf9440;color:#110d05;text-decoration:none;font:700 14px/1 Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:999px;">Reply with payment details</a>
      &nbsp;&nbsp;
      <a href="${o.siteUrl}/admin" style="display:inline-block;border:1px solid rgba(240,231,209,.3);color:#f0e7d1;text-decoration:none;font:600 14px/1 Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:999px;">Order desk</a>
    </p>`;
  return shell("New order request", body, "Replying to this email goes straight to the customer.");
}

// ---------- 1c. ORDER REQUEST → the customer ----------
export function customerOrderRequestHtml(o: {
  firstName: string;
  orderRef: string;
  itemLines: string[];
  total: string;
  shipTo: string;
  siteUrl: string;
}) {
  const items = o.itemLines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join("");
  const hi = o.firstName ? `${escapeHtml(o.firstName)}, thank you.` : "Thank you.";
  const body = `
    <p style="margin:0 0 18px;color:#f0e7d1;">${hi} Your order request is in. Nothing has been charged — we'll reply within a day with how to pay and when it'll ship.</p>
    <div style="background:rgba(0,0,0,.25);border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <p style="margin:0 0 8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cf9440;">Order ${escapeHtml(o.orderRef)}</p>
      <ul style="margin:0;padding-left:18px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#f0e7d1;">${items}</ul>
      <p style="margin:12px 0 0;color:#e3b96e;font-weight:700;">Total ${escapeHtml(o.total)} (includes $5 shipping)</p>
      <p style="margin:8px 0 0;color:#f0e7d1;font-size:14px;">Ship to: ${escapeHtml(o.shipTo)}</p>
    </div>
    <p style="margin:0 0 8px;">Once it's paid, allow about 5 to 7 days of making time. Every piece is bleached by hand, one at a time.</p>
    <p style="margin:0;">Need to change anything? Just reply to this email.</p>`;
  return shell("We got your order request", body, "Reply to this email and it reaches the person who makes your shirt.");
}

// ---------- 2. NEW CUSTOM REQUEST → the shop ----------
export function requestAlertHtml(r: {
  name: string;
  email: string;
  size: string;
  color?: string;
  idea: string;
  kind?: string;
  artworkUrl?: string | null;
  artworkNote?: string;
  siteUrl: string;
}) {
  const artwork = r.artworkUrl
    ? `<a href="${escapeHtml(r.artworkUrl)}" style="color:#e3b96e;">Open the file</a>`
    : escapeHtml(r.artworkNote || "none attached");
  const body = `
    <p style="margin:0 0 18px;color:#f0e7d1;">Someone wants a one of one. These are worth answering fast.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("From", escapeHtml(r.name))}
      ${row("Email", escapeHtml(r.email))}
      ${row("Type", escapeHtml(r.kind || "Leaves / botanical"))}
      ${row("Size", escapeHtml(r.size || "not sure yet"))}
      ${row("Color", escapeHtml(r.color || "not sure yet"))}
      ${row("Artwork", artwork)}
    </table>
    <div style="background:rgba(0,0,0,.25);border-radius:12px;padding:16px 18px;margin-top:16px;">
      <p style="margin:0 0 8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cf9440;">Their idea</p>
      <p style="margin:0;white-space:pre-wrap;color:#f0e7d1;">${escapeHtml(r.idea)}</p>
    </div>
    <p style="margin:22px 0 0;">
      <a href="mailto:${escapeHtml(r.email)}" style="display:inline-block;background:#cf9440;color:#110d05;text-decoration:none;font:700 14px/1 Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:999px;">Reply with a quote</a>
    </p>`;
  return shell("New custom request", body, "Hit reply to this email and it goes straight to them.");
}

// ---------- 3. ORDER CONFIRMATION → the customer ----------
export function customerOrderHtml(o: {
  firstName: string;
  itemLines: string[];
  total: string;
  siteUrl: string;
}) {
  const items = o.itemLines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join("");
  const hi = o.firstName ? `${escapeHtml(o.firstName)}, thank you.` : "Thank you.";
  const body = `
    <p style="margin:0 0 18px;color:#f0e7d1;">${hi} Your order is in the queue, and it gets made by hand — real leaves or a hand-cut stencil, real bleach, no two alike.</p>
    <div style="background:rgba(0,0,0,.25);border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <p style="margin:0 0 8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cf9440;">Your order</p>
      <ul style="margin:0;padding-left:18px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#f0e7d1;">${items}</ul>
      <p style="margin:12px 0 0;color:#e3b96e;font-weight:700;">Total ${escapeHtml(o.total)}</p>
    </div>
    <p style="margin:0 0 8px;">Allow about 5 to 7 days of making time. We'll email tracking the moment it ships.</p>
    <p style="margin:0;">Wash it cold and inside out, hang dry or tumble low, and it'll keep that burn for years.</p>
    <p style="margin:22px 0 0;">
      <a href="${o.siteUrl}" style="display:inline-block;border:1px solid rgba(240,231,209,.3);color:#f0e7d1;text-decoration:none;font:600 14px/1 Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:999px;">Back to the shop</a>
    </p>`;
  return shell("We got your order", body, "Questions? Just reply to this email — it reaches the person who makes your shirt.");
}

// ---------- 4. TEST ----------
export function testHtml(siteUrl: string) {
  const body = `
    <p style="margin:0 0 16px;color:#f0e7d1;">If you're reading this, order notifications are working.</p>
    <p style="margin:0;">From now on you'll get an email the moment a payment clears or a custom request comes in — no need to keep checking the order desk.</p>
    <p style="margin:22px 0 0;">
      <a href="${siteUrl}/admin" style="display:inline-block;background:#cf9440;color:#110d05;text-decoration:none;font:700 14px/1 Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:999px;">Open the order desk</a>
    </p>`;
  return shell("Test email", body, "Sent from your admin page.");
}

// ---------- 5. DROP ANNOUNCEMENT → the list ----------
export type DropContent = {
  headline: string;
  bodyParagraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  feature?: { name: string; price: string; image: string; url: string } | null;
  siteUrl: string;
  unsubUrl: string;
};

export function dropHtml(d: DropContent) {
  const paras = d.bodyParagraphs
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 14px;color:#f0e7d1;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  const feature = d.feature
    ? `<a href="${d.feature.url}" style="display:block;text-decoration:none;background:rgba(0,0,0,.25);border-radius:12px;padding:14px;margin:20px 0;">
         <img src="${d.feature.image}" alt="${escapeHtml(d.feature.name)}" width="240" style="display:block;width:100%;max-width:240px;border-radius:8px;margin:0 auto 12px;">
         <p style="margin:0;text-align:center;font:600 18px/1.3 Georgia,'Times New Roman',serif;color:#f0e7d1;">${escapeHtml(d.feature.name)}</p>
         <p style="margin:4px 0 0;text-align:center;font:700 15px/1.3 Helvetica,Arial,sans-serif;color:#e3b96e;">${escapeHtml(d.feature.price)}</p>
       </a>`
    : "";

  const body = `
    ${paras}
    ${feature}
    <p style="margin:24px 0 0;">
      <a href="${d.ctaUrl}" style="display:inline-block;background:#cf9440;color:#110d05;text-decoration:none;font:700 15px/1 Helvetica,Arial,sans-serif;padding:15px 26px;border-radius:999px;">${escapeHtml(d.ctaLabel)}</a>
    </p>`;

  const foot = `You're getting this because you asked to hear about drops from Dyeing By Design, hand bleached botanical and stencil shirts made in Maine.<br>
    <a href="${d.unsubUrl}" style="color:#7d735c;">Unsubscribe</a>`;

  return shell(d.headline, body, foot);
}

// ---------- batch send (used for drop announcements) ----------
type BatchItem = {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
};

export async function sendBatch(items: BatchItem[]) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, failed: items.length, error: "RESEND_API_KEY is not set." };

  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM || TEST_FROM;
  let sent = 0;
  let failed = 0;
  let firstError = "";

  // Resend takes up to 100 emails per batch call
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(
        chunk.map((it) => ({
          from,
          to: it.to,
          subject: it.subject,
          html: it.html,
          ...(it.headers ? { headers: it.headers } : {}),
        }))
      );
      if (error) {
        failed += chunk.length;
        if (!firstError) firstError = error.message ?? String(error);
      } else {
        sent += chunk.length;
      }
    } catch (err) {
      failed += chunk.length;
      if (!firstError) firstError = String(err);
    }
    // stay under Resend's rate limit between batches
    if (i + 100 < items.length) await new Promise((r) => setTimeout(r, 600));
  }

  return { sent, failed, error: firstError || undefined };
}
