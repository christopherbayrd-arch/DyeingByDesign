// ============================================================
//  Swaps — the shapes, words, and rules shared by the customer
//  form, the admin screen, and the server. No database in here.
//
//  The policy, in one line: nothing is returned for a refund
//  (every piece is made for one person), but each piece gets one
//  free swap for a different size or color. They pay to send
//  theirs back; the replacement ships free.
// ============================================================

// How long after the order a swap can be asked for
export const SWAP_DAYS = 14;

export type SwapStatus = "requested" | "approved" | "sent" | "done" | "declined";

export const SWAP_STATUSES: SwapStatus[] = ["requested", "approved", "sent", "done", "declined"];

// What Corey sees on the swaps board
export const SWAP_LABELS: Record<SwapStatus, string> = {
  requested: "Asked for",
  approved: "Approved",
  sent: "Replacement sent",
  done: "Done",
  declined: "Declined",
};

// What the customer is told
export const SWAP_CUSTOMER_LABELS: Record<SwapStatus, string> = {
  requested: "We got it — you'll hear back within a day.",
  approved: "Approved — send yours back and we'll make the new one.",
  sent: "Your replacement is on its way.",
  done: "All set.",
  declined: "We couldn't do this one.",
};

export const SWAP_REASONS: { key: string; label: string }[] = [
  { key: "too-small", label: "Too small" },
  { key: "too-big", label: "Too big" },
  { key: "color", label: "Wrong color / changed my mind on the color" },
  { key: "other", label: "Something else" },
];

export function reasonLabel(key: string): string {
  return SWAP_REASONS.find((r) => r.key === key)?.label ?? key;
}

export type Swap = {
  id: number;
  ref: string;
  orderId: number | null;
  lineId: number | null;
  email: string;
  name: string;
  slug: string;
  variant: string;
  color: string;
  size: string;
  wantColor: string;
  wantSize: string;
  reason: string;
  note: string;
  address: { line1?: string; line2?: string; city?: string; state?: string; postal?: string } | null;
  status: SwapStatus;
  ownerNote: string;
  fromStock: boolean;
  createdAt: string;
  decidedAt: string | null;
  sentAt: string | null;
  doneAt: string | null;
  // filled in by the server for the admin board
  orderRef?: string;
  orderAt?: string;
  designName?: string;
  alreadySwapped?: boolean;
};

export function isSwapStatus(v: string): v is SwapStatus {
  return (SWAP_STATUSES as string[]).includes(v);
}

// A swap is only worth asking for if something actually changes
export function changesSomething(
  have: { color: string; size: string },
  want: { color: string; size: string }
): boolean {
  return (want.color && want.color !== have.color) || (want.size && want.size !== have.size) ? true : false;
}

// Days since the order, for the "within 14 days" line
export function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

// The customer's reference, e.g. SW-4F2A
export function swapRefFrom(hex: string): string {
  return "SW-" + hex.toUpperCase().slice(0, 4);
}
