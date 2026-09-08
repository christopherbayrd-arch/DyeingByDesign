import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// The COGS sheet is one JSON document (see lib/cogs.ts for the shape).
// GET reads it, PUT replaces it. Owner only — middleware guards /api/admin.

const NO_DB = {
  error:
    "No database connected yet. Add DATABASE_URL from Neon, run schema.sql in Neon's SQL editor, then reload.",
};

export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json(NO_DB, { status: 503 });
  try {
    const rows = (await sql`select data, updated_at from cogs where id = 1`) as {
      data: unknown;
      updated_at: string;
    }[];
    return NextResponse.json({ data: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null });
  } catch (err) {
    console.error("cogs read:", err);
    return NextResponse.json(
      { error: "Could not read the COGS table — re-run schema.sql in Neon (it adds it), then reload." },
      { status: 503 }
    );
  }
}

export async function PUT(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json(NO_DB, { status: 503 });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }
    const json = JSON.stringify(body);
    if (json.length > 200_000) {
      return NextResponse.json({ error: "That's a lot of materials — trim the list a little." }, { status: 413 });
    }
    await sql`
      insert into cogs (id, data, updated_at) values (1, ${json}::jsonb, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("cogs save:", err);
    return NextResponse.json(
      { error: "Could not save — have you run the latest schema.sql in Neon?" },
      { status: 500 }
    );
  }
}
