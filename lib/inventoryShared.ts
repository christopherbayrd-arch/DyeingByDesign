// ============================================================
//  Inventory — shapes and labels shared by the pages, the admin
//  screens (in the browser), and the server. No database in here.
//
//  Three kinds of things live on the shelf:
//    shirt  finished shirts ready to sell     design + color + size
//    blank  plain tees waiting to be bleached  color + size
//    other  tie dye, hoodies, one offs         name (+ size / color text)
// ============================================================
import { colorName } from "@/lib/products";

export type InvKind = "shirt" | "blank" | "other";

export type InvItem = {
  id: number;
  kind: InvKind;
  slug: string; // shirt: design
  name: string; // other: what it is
  color: string; // shirt + blank: color key; other: free text
  size: string;
  qty: number;
  priceCents: number | null; // other: what it sells for
  updatedAt: string;
};

export type InvMove = {
  id: number;
  itemId: number | null;
  kind: InvKind;
  label: string;
  delta: number;
  qtyAfter: number | null;
  reason: string;
  orderId: number | null;
  lineId: number | null;
  note: string;
  reversed: boolean;
  createdAt: string;
};

export type InvKey = { kind: InvKind; slug?: string; name?: string; color?: string; size?: string };

export const REASON_LABELS: Record<string, string> = {
  made: "made",
  bought: "bought",
  sold: "sold",
  pulled: "sent on an order",
  used: "used to make a shirt",
  counted: "counted",
  adjusted: "adjusted",
  returned: "put back",
  removed: "removed",
};

// Lookup keys for maps of what's on hand
export function shirtKey(slug: string, color: string, size: string) {
  return `${slug}|${color}|${size}`;
}
export function blankKey(color: string, size: string) {
  return `${color}|${size}`;
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// "Sumac · Royal blue · L" · "Blank · Black · M" · "Tie dye hoodie · L"
export function itemLabel(
  it: { kind: InvKind; slug?: string; name?: string; color?: string; size?: string },
  designName?: string
): string {
  if (it.kind === "shirt") {
    return [designName || cap(it.slug ?? ""), it.color ? colorName(it.color) : "", it.size ?? ""].filter(Boolean).join(" · ");
  }
  if (it.kind === "blank") {
    return ["Blank", it.color ? colorName(it.color) : "", it.size ?? ""].filter(Boolean).join(" · ");
  }
  return [it.name || "Item", it.color ?? "", it.size ?? ""].filter(Boolean).join(" · ");
}

// Fewer than this many blanks of a color + size gets flagged
export const LOW_BLANKS = 3;
