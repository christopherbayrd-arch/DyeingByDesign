import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Saves a custom shirt request from the /custom page into Neon.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // honeypot: real people never fill the hidden "website" field
    if (typeof body?.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const name = String(body?.name ?? "").trim().slice(0, 120);
    const email = String(body?.email ?? "").trim().slice(0, 200);
    const size = String(body?.size ?? "").trim().slice(0, 10);
    const idea = String(body?.idea ?? "").trim().slice(0, 4000);

    if (!name || !email.includes("@") || !idea) {
      return NextResponse.json(
        { error: "Name, email, and a few words about your idea are required." },
        { status: 400 }
      );
    }

    const sql = getDb();
    if (!sql) {
      return NextResponse.json(
        { error: "The request box isn't hooked up yet — the database still needs connecting (see README)." },
        { status: 503 }
      );
    }

    await sql`
      insert into special_requests (name, email, size, idea)
      values (${name}, ${email}, ${size || null}, ${idea})
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("special request error:", err);
    return NextResponse.json(
      { error: "Something went wrong on our end. Try again in a minute." },
      { status: 500 }
    );
  }
}
