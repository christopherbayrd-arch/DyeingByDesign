import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Adds an email to the limited-drop announcement list.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 200);

    if (!email.includes("@") || email.length < 5) {
      return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    }

    const sql = getDb();
    if (!sql) {
      return NextResponse.json(
        { error: "The list isn't open yet — the database still needs connecting (see README)." },
        { status: 503 }
      );
    }

    await sql`insert into drop_signups (email) values (${email}) on conflict (email) do nothing`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("signup error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again in a minute." },
      { status: 500 }
    );
  }
}
