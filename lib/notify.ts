// ============================================================
//  Phone push alerts via Pushover (pushover.net).
//
//  Setup (5 minutes):
//    1. Install the Pushover app on your phone ($5 one-time after
//       the 30-day trial) and log in.
//    2. pushover.net → your User Key is on the dashboard.
//    3. pushover.net/apps/build → create an application called
//       "Dyeing By Design" → copy its API Token.
//    4. In Vercel add PUSHOVER_USER_KEY and PUSHOVER_APP_TOKEN,
//       then redeploy. Hit "Send test push" on /admin.
//
//  Every call is best-effort: a Pushover hiccup never fails an
//  order or a request — it just logs.
// ============================================================

export function pushConfig() {
  const user = process.env.PUSHOVER_USER_KEY ?? "";
  const token = process.env.PUSHOVER_APP_TOKEN ?? "";
  return { user, token, enabled: Boolean(user && token) };
}

type PushArgs = {
  title: string;
  message: string;
  url?: string;
  urlTitle?: string;
  // -1 quiet · 0 normal · 1 high (bypasses quiet hours)
  priority?: -1 | 0 | 1;
  sound?: string; // e.g. "cashregister", "magic", "bike"
};

export async function sendPush(args: PushArgs): Promise<{ ok: boolean; error?: string }> {
  const { user, token, enabled } = pushConfig();
  if (!enabled) return { ok: false, error: "Pushover keys aren't set (PUSHOVER_USER_KEY / PUSHOVER_APP_TOKEN)." };
  try {
    const body = new URLSearchParams({
      token,
      user,
      title: args.title.slice(0, 250),
      message: args.message.slice(0, 1024),
      priority: String(args.priority ?? 0),
    });
    if (args.url) body.set("url", args.url);
    if (args.urlTitle) body.set("url_title", args.urlTitle);
    if (args.sound) body.set("sound", args.sound);

    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("pushover error:", res.status, text);
      return { ok: false, error: `Pushover said ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("pushover error:", err);
    return { ok: false, error: String(err).slice(0, 200) };
  }
}
