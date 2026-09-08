import { getDb } from "@/lib/db";
import { loadHistory } from "@/lib/history";
import { CHANNEL_LABELS, lineMarginPct } from "@/lib/historyMath";
import { colorName } from "@/lib/products";

// The sales history as a spreadsheet: one row per shirt sold.
// GET /api/admin/history/export?from=YYYY-MM-DD&to=YYYY-MM-DD
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function dollars(c: number | null | undefined) {
  return c === null || c === undefined ? "" : (c / 100).toFixed(2);
}

export async function GET(req: Request) {
  const sql = getDb();
  if (!sql) return new Response("No database connected.", { status: 503 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const { orders, error } = await loadHistory(sql);
  if (error) return new Response(error, { status: 503 });

  const rows: string[][] = [[
    "date", "order", "channel", "status", "customer", "design", "color", "size", "qty",
    "unit price", "unit cost", "cost estimated", "why", "line revenue", "line cost", "margin %",
    "shipping charged", "card fee", "postage", "order note",
  ]];
  for (const o of orders) {
    const day = o.at.slice(0, 10);
    if (from && day < from) continue;
    if (to && day > to) continue;
    for (const l of o.lines) {
      const m = lineMarginPct(l);
      rows.push([
        new Date(o.at).toLocaleDateString("en-US"),
        String(o.id),
        CHANNEL_LABELS[o.channel] ?? o.channel,
        o.status,
        o.customer,
        l.name,
        l.color ? colorName(l.color) : "",
        l.size,
        String(l.qty),
        dollars(l.unitPriceCents),
        dollars(l.unitCogsCents),
        l.unitCogsCents === null ? "not costed" : l.estimated ? "yes" : "no",
        l.reason,
        dollars(l.unitPriceCents * l.qty),
        l.unitCogsCents === null ? "" : dollars(l.unitCogsCents * l.qty),
        m === null ? "" : Math.round(m).toString(),
        dollars(o.shippingCents),
        dollars(o.feeCents),
        dollars(o.postageCents),
        o.note,
      ]);
    }
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const name = `dbd-sales${from ? "-" + from : ""}${to ? "-to-" + to : ""}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
