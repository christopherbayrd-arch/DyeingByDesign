import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Handles both:
//  - the "Confirm unsubscribe" button on /unsubscribe (JSON body)
//  - Gmail/Apple Mail's built-in unsubscribe button (List-Unsubscribe-Post,
//    which sends a form POST to this URL with ?t=token)
async function unsubscribe(token: string) {
  if (!token || token === "preview") return false;
  const sql = getDb();
  if (!sql) return false;
  try {
    const rows = (await sql`
      update drop_signups
      set unsubscribed = true, unsubscribed_at = now()
      where unsub_token = ${token}::uuid
      returning id
    `) as { id: number }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") ?? "";

  if (!token) {
    const body = await req.json().catch(() => ({}));
    token = String((body as { token?: string })?.token ?? "");
  }

  const ok = await unsubscribe(token);
  return NextResponse.json({ ok });
}

// Some clients probe with GET — never unsubscribe on a plain GET, since
// link scanners would fire it. Send people to the confirmation page.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(token)}`, req.url));
}
