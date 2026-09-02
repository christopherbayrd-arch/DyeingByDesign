import { NextResponse } from "next/server";
import { pushConfig, sendPush } from "@/lib/notify";
import { siteUrl } from "@/lib/orderFormat";

// "Send test push" button on the admin page (guarded by middleware).
export async function POST() {
  if (!pushConfig().enabled) {
    return NextResponse.json(
      { error: "Pushover isn't set up. Add PUSHOVER_USER_KEY and PUSHOVER_APP_TOKEN in Vercel, then redeploy (lib/notify.ts has the steps)." },
      { status: 503 }
    );
  }
  const res = await sendPush({
    title: "Test — phone alerts are working",
    message: "This is what a new order will feel like. Nice.",
    url: `${siteUrl()}/admin`,
    urlTitle: "Open the order desk",
    sound: "cashregister",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
