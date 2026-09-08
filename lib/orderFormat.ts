// The compact order metadata that travels with every order
// ("sumac|M|black|x2|3999; fern|L|daisy|x1|3999") and the helpers
// that read it back for emails, the admin, and the sales history.
import { getProduct } from "@/lib/catalog";
import { colorName } from "@/lib/products";

export type MetaLine = {
  slug: string;
  size: string;
  color: string;
  qty: number;
  priceCents: number | null; // unit price when the order was placed (v4 meta); null on older orders
};

// One line of metadata. Field order: slug | size | color | xQTY | unit price in cents.
export function metaLine(l: { slug: string; size: string; color: string; qty: number; priceCents: number }) {
  return `${l.slug}|${l.size}|${l.color}|x${l.qty}|${l.priceCents}`;
}

// Reads every version of the format we've ever written:
//   v1  slug|size|xN          v3  slug|size|color|xN          v4  slug|size|color|xN|price
// and ignores a trailing " | note: ..." from order requests.
export function parseItemsMeta(meta: string | null | undefined): MetaLine[] {
  if (!meta) return [];
  const [head] = String(meta).split(" | note: ");
  const out: MetaLine[] = [];
  for (const part of head.split(";")) {
    const bits = part.trim().split("|").map((b) => b.trim());
    const slug = bits[0];
    if (!slug) continue;
    const qi = bits.findIndex((b, i) => i > 0 && /^x\d+$/.test(b));
    const qty = qi >= 0 ? Number(bits[qi].slice(1)) : 1;
    const size = bits[1] ?? "";
    const color = qi >= 3 ? bits[2] : "";
    const priceRaw = qi >= 0 ? bits[qi + 1] : undefined;
    const priceCents = priceRaw && /^\d+$/.test(priceRaw) ? Number(priceRaw) : null;
    out.push({ slug, size, color, qty: qty >= 1 ? qty : 1, priceCents });
  }
  return out;
}

export function orderNote(meta: string | null | undefined): string {
  const [, ...rest] = String(meta ?? "").split(" | note: ");
  return rest.join(" | note: ");
}

export async function itemLinesFromMeta(meta: string | null | undefined): Promise<string[]> {
  const parsed = parseItemsMeta(meta);
  if (parsed.length === 0) return ["(items unavailable)"];
  const lines: string[] = [];
  for (const l of parsed) {
    let name = l.slug.charAt(0).toUpperCase() + l.slug.slice(1);
    try {
      const p = await getProduct(l.slug);
      if (p) name = p.name;
    } catch {
      // fall back to the slug — never block an email over a lookup
    }
    lines.push(`${l.qty} × ${name} — ${l.color ? `${colorName(l.color)}, ` : ""}size ${l.size || "?"}`);
  }
  return lines;
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
