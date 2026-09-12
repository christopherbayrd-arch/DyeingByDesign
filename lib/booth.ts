// ============================================================
//  Quick sale (/admin/sell) — the booth and cash sale screen.
//  Change the price buttons or payment options here.
// ============================================================

// The price buttons, in cents. The first one is picked by default.
// Anything else (a deal, a custom piece) goes in "Other amount".
export const BOOTH_PRICES: { cents: number; label: string; note: string }[] = [
  { cents: 4000, label: "$40", note: "Regular tee" },
  { cents: 4500, label: "$45", note: "Comfort Colors" },
];

export const PAY_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "venmo", label: "Venmo" },
  { key: "other", label: "Other" },
] as const;

export type PayMethod = (typeof PAY_METHODS)[number]["key"];

export function isPayMethod(v: string): v is PayMethod {
  return PAY_METHODS.some((p) => p.key === v);
}

export function payLabel(key: string): string {
  return PAY_METHODS.find((p) => p.key === key)?.label ?? key;
}

// Special tiles next to the designs
export const CUSTOM_SLUG = "custom";
export const OTHER_SLUG = "other";

// Booth sales are stored as orders with this prefix on their reference,
// plus the id the phone made up — so a sale sent twice (bad signal, a
// retry) is only ever recorded once.
export const BOOTH_REF_PREFIX = "manual_booth_";
