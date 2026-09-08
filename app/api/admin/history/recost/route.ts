import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { costOrder } from "@/lib/costing";

// Freeze (or re-freeze) an order's cost with the sheet that was current
// when it was paid. force (default) overwrites what's there; force:false
// only fills in shirts that have no cost yet — after adding a missing
// blank price or linking a design to a type on the COGS page.
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which order?" }, { status: 400 });
    const result = await costOrder(sql, id, {
      force: body?.force !== false,
      afterTheFact: Boolean(body?.afterTheFact),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("recost:", err);
    return NextResponse.json({ error: "Could not recost that order." }, { status: 500 });
  }
}
