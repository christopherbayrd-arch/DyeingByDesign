import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Every saved version of the COGS sheet, newest first, for the History
// panel on /admin/cogs. Owner only — middleware guards /api/admin.
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const rows = (await sql`
      select id, data, note, created_at from cogs_versions order by created_at desc, id desc limit 500
    `) as { id: number; data: unknown; note: string; created_at: string }[];
    return NextResponse.json({
      versions: rows.map((r) => ({ id: r.id, data: r.data, note: r.note ?? "", at: new Date(r.created_at).toISOString() })),
    });
  } catch (err) {
    console.error("cogs history:", err);
    return NextResponse.json(
      { error: "Could not read the sheet history — run the latest schema.sql in Neon (it adds cogs_versions)." },
      { status: 503 }
    );
  }
}
