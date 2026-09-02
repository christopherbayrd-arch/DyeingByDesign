// Turns the compact order metadata Stripe hands back
// ("sumac|M|x2; maple|L|x1") into readable lines for emails.
import { getProduct } from "@/lib/catalog";
import { colorName } from "@/lib/products";

export async function itemLinesFromMeta(meta: string | null | undefined): Promise<string[]> {
  if (!meta) return ["(items unavailable)"];
  const lines: string[] = [];
  for (const part of meta.split(";")) {
    const bits = part.trim().split("|");
    const slug = bits[0];
    const size = bits[1];
    const color = bits.length >= 4 ? bits[2] : "";
    const qtyPart = bits[bits.length - 1];
    if (!slug) continue;
    const qty = Number(String(qtyPart ?? "").replace("x", "")) || 1;
    let name = slug.charAt(0).toUpperCase() + slug.slice(1);
    try {
      const p = await getProduct(slug);
      if (p) name = p.name;
    } catch {
      // fall back to the slug — never block an email over a lookup
    }
    lines.push(`${qty} × ${name} — ${color ? `${colorName(color)}, ` : ""}size ${size ?? "?"}`);
  }
  return lines.length ? lines : ["(items unavailable)"];
}

export function shipToLine(shipping: unknown): string {
  const s = shipping as { name?: string; address?: Record<string, string> } | null;
  if (!s?.address) return "";
  const a = s.address;
  return [
    s.name,
    a.line1,
    a.line2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

export function money(cents: number | null | undefined) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.dyeingbydesign.com").replace(/\/$/, "");
}
