import { NextResponse } from "next/server";
import { emailConfig, sendEmail, testHtml } from "@/lib/email";
import { siteUrl } from "@/lib/orderFormat";

// "Send test email" button on the admin page (guarded by middleware).
export async function POST() {
  const cfg = emailConfig();

  if (!cfg.hasKey) {
    return NextResponse.json(
      { error: "No Resend API key yet. Add RESEND_API_KEY in Vercel, then redeploy (see README)." },
      { status: 503 }
    );
  }
  if (!cfg.notify) {
    return NextResponse.json(
      { error: "Set NOTIFY_EMAIL in Vercel to the address that should receive order alerts, then redeploy." },
      { status: 503 }
    );
  }

  const res = await sendEmail({
    to: cfg.notify,
    subject: "Test — order notifications are working",
    html: testHtml(siteUrl()),
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? "Send failed." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to: cfg.notify });
}
