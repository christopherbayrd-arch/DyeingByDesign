import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setLineCost } from "@/lib/costing";

// Type a shirt's cost in by hand on the Sales history page (custom
// pieces, or a blank you bought at an odd price). "" clears it.
export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const lineId = Number(body.lineId);
    if (!Number.isInteger(lineId) || lineId <= 0) return NextResponse.json({ error: "Which shirt?" }, { status: 400 });
    const s = String(body.cost ?? "").replace(/[$,\s]/g, "");
    let cents: number | null = null;
    if (s !== "") {
      cents = Math.round(parseFloat(s) * 100);
      if (!Number.isFinite(cents) || cents < 0) return NextResponse.json({ error: "That cost didn't make sense." }, { status: 400 });
    }
    const ok = await setLineCost(sql, lineId, cents, String(body.note ?? "").slice(0, 120));
    if (!ok) return NextResponse.json({ error: "Line not found." }, { status: 404 });
    return NextResponse.json({ ok: true, cents });
  } catch (err) {
    console.error("line cost:", err);
    return NextResponse.json({ error: "Could not save that cost." }, { status: 500 });
  }
}
