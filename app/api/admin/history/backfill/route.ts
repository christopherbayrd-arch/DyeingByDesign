import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { backfillOrders } from "@/lib/costing";

// Older orders have no line rows. Build them from the order's items text
// and cost them with today's sheet, marked as estimates.
export async function POST() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  try {
    const result = await backfillOrders(sql);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("backfill:", err);
    return NextResponse.json(
      { error: "Could not backfill — have you run the latest schema.sql in Neon?" },
      { status: 500 }
    );
  }
}
