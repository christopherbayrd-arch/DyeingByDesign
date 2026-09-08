// ============================================================
//  Shipping labels through EasyPost. Server only.
//
//  Env (see README "Step 9 — Shipping labels"):
//    EASYPOST_API_KEY   test keys start with EZTK (fake labels, no charge),
//                       production keys with EZAK
//    SHIP_FROM_NAME, SHIP_FROM_STREET1, SHIP_FROM_STREET2 (opt),
//    SHIP_FROM_CITY, SHIP_FROM_STATE, SHIP_FROM_ZIP, SHIP_FROM_PHONE,
//    SHIP_FROM_EMAIL (opt, falls back to NOTIFY_EMAIL)
// ============================================================

export type Address = {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // "US"
  phone?: string;
  email?: string;
};

export type Parcel = {
  length: number; // inches
  width: number;
  height: number;
  weight: number; // ounces
  label: string;  // what it is, for the admin ("Poly mailer 10×13")
};

export type Rate = {
  id: string;
  carrier: string;
  service: string;
  cents: number;
  deliveryDays: number | null;
};

// ---- what a shirt weighs (ounces). Heavyweight cotton tees by size;
//      tune these once you've weighed a few real packages. ----
export const SHIRT_OZ: Record<string, number> = { S: 5.5, M: 6, L: 6.5, XL: 7, "2XL": 8 };
export const DEFAULT_SHIRT_OZ = 6.5;

// The packaging presets, picked by how many shirts are in the order.
export const PACKAGES: { maxShirts: number; length: number; width: number; height: number; tareOz: number; label: string }[] = [
  { maxShirts: 2, length: 10, width: 13, height: 1, tareOz: 1, label: "Poly mailer 10×13" },
  { maxShirts: 4, length: 12, width: 15.5, height: 2, tareOz: 1.5, label: "Poly mailer 12×15" },
  { maxShirts: 99, length: 12, width: 10, height: 4, tareOz: 6, label: "Small box 12×10×4" },
];

export function parcelFor(lines: { size: string; qty: number }[]): Parcel {
  const shirts = lines.reduce((n, l) => n + (l.qty || 1), 0);
  const shirtOz = lines.reduce((oz, l) => oz + (SHIRT_OZ[l.size] ?? DEFAULT_SHIRT_OZ) * (l.qty || 1), 0);
  const pkg = PACKAGES.find((p) => shirts <= p.maxShirts) ?? PACKAGES[PACKAGES.length - 1];
  return {
    length: pkg.length,
    width: pkg.width,
    height: pkg.height,
    weight: Math.max(1, Math.round((shirtOz + pkg.tareOz) * 10) / 10),
    label: pkg.label,
  };
}

// ---- config ----
export function shippingConfig() {
  const key = process.env.EASYPOST_API_KEY ?? "";
  const from = shipFromAddress();
  const missing: string[] = [];
  if (!key) missing.push("EASYPOST_API_KEY");
  for (const k of ["SHIP_FROM_NAME", "SHIP_FROM_STREET1", "SHIP_FROM_CITY", "SHIP_FROM_STATE", "SHIP_FROM_ZIP"]) {
    if (!process.env[k]) missing.push(k);
  }
  return {
    enabled: missing.length === 0,
    testMode: key.startsWith("EZTK"),
    missing,
    from,
  };
}

export function shipFromAddress(): Address {
  return {
    name: process.env.SHIP_FROM_NAME ?? "Dyeing By Design",
    company: "Dyeing By Design",
    street1: process.env.SHIP_FROM_STREET1 ?? "",
    street2: process.env.SHIP_FROM_STREET2 || undefined,
    city: process.env.SHIP_FROM_CITY ?? "",
    state: process.env.SHIP_FROM_STATE ?? "",
    zip: process.env.SHIP_FROM_ZIP ?? "",
    country: "US",
    phone: process.env.SHIP_FROM_PHONE || undefined,
    email: process.env.SHIP_FROM_EMAIL || process.env.NOTIFY_EMAIL || undefined,
  };
}

// The address an order stores (Stripe's shape, which the order request
// form copies) → EasyPost's shape.
export function addressFromOrder(shipping: unknown, fallbackName = "", email = ""): Address | null {
  const s = shipping as { name?: string; address?: Record<string, string | undefined> } | null | undefined;
  const a = s?.address;
  if (!a?.line1 || !a.city || !a.state || !a.postal_code) return null;
  return {
    name: s?.name || fallbackName || "Customer",
    street1: a.line1,
    street2: a.line2 || undefined,
    city: a.city,
    state: a.state,
    zip: a.postal_code,
    country: a.country || "US",
    email: email || undefined,
  };
}

// A hand-typed address from the admin → both shapes
export function addressFromForm(body: Record<string, unknown>): { address: Address; stored: unknown } | null {
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const name = s(body.name, 120);
  const line1 = s(body.line1, 200);
  const line2 = s(body.line2, 200);
  const city = s(body.city, 120);
  const state = s(body.state, 2).toUpperCase();
  const zip = s(body.postal ?? body.zip, 10);
  if (!name || !line1 || !city || !state || !zip) return null;
  return {
    address: { name, street1: line1, street2: line2 || undefined, city, state, zip, country: "US" },
    stored: { name, address: { line1, line2: line2 || undefined, city, state, postal_code: zip, country: "US" } },
  };
}

// ---- EasyPost calls (plain fetch — the API is small) ----
type Json = Record<string, unknown>;

// EASYPOST_BASE_URL is only for tests (points the calls at a stand-in server)
const BASE_URL = (process.env.EASYPOST_BASE_URL || "https://api.easypost.com/v2").replace(/\/$/, "");

async function easypost(path: string, body?: Json, method: "GET" | "POST" = "POST"): Promise<Json> {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new Error("EASYPOST_API_KEY is not set.");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const err = data.error as { message?: string; errors?: { field?: string; message?: string }[] } | undefined;
    const details = err?.errors?.map((e) => [e.field, e.message].filter(Boolean).join(": ")).join("; ");
    throw new Error(err?.message ? `${err.message}${details ? ` (${details})` : ""}` : `EasyPost said ${res.status}`);
  }
  return data;
}

function toEasypostAddress(a: Address, verify: boolean) {
  return {
    name: a.name,
    company: a.company,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country || "US",
    phone: a.phone,
    email: a.email,
    ...(verify ? { verify: ["delivery"] } : {}),
  };
}

export type Quote = {
  shipmentId: string;
  rates: Rate[];
  warnings: string[];
  to: Address;
  parcel: Parcel;
};

const SERVICE_NAMES: Record<string, string> = {
  GroundAdvantage: "USPS Ground Advantage",
  Priority: "USPS Priority Mail",
  Express: "USPS Priority Mail Express",
  First: "USPS First Class",
};

export function serviceName(carrier: string, service: string) {
  return SERVICE_NAMES[service] ?? `${carrier} ${service.replace(/([a-z])([A-Z])/g, "$1 $2")}`;
}

// Create the shipment and get every rate EasyPost can offer for it.
export async function quoteShipment(to: Address, parcel: Parcel): Promise<Quote> {
  const data = await easypost("/shipments", {
    shipment: {
      to_address: toEasypostAddress(to, true),
      from_address: toEasypostAddress(shipFromAddress(), false),
      parcel: { length: parcel.length, width: parcel.width, height: parcel.height, weight: parcel.weight },
      options: { label_format: "PDF", label_size: "4x6" },
    },
  });
  const warnings: string[] = [];
  const toAddr = data.to_address as { verifications?: { delivery?: { success?: boolean; errors?: { message?: string }[] } } } | undefined;
  const delivery = toAddr?.verifications?.delivery;
  if (delivery && delivery.success === false) {
    warnings.push(
      "USPS couldn't confirm this address" +
        (delivery.errors?.length ? `: ${delivery.errors.map((e) => e.message).filter(Boolean).join(", ")}` : "") +
        ". Double check it with the customer before buying."
    );
  }
  for (const m of (data.messages as { carrier?: string; message?: string }[] | undefined) ?? []) {
    if (m.message) warnings.push(`${m.carrier ?? "Carrier"}: ${m.message}`);
  }
  const rates: Rate[] = ((data.rates as Json[] | undefined) ?? [])
    .map((r) => ({
      id: String(r.id),
      carrier: String(r.carrier ?? ""),
      service: String(r.service ?? ""),
      cents: Math.round(parseFloat(String(r.rate ?? "0")) * 100),
      deliveryDays: typeof r.delivery_days === "number" ? r.delivery_days : typeof r.est_delivery_days === "number" ? r.est_delivery_days : null,
    }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => a.cents - b.cents);
  if (rates.length === 0 && warnings.length === 0) warnings.push("No rates came back for this address and package.");
  return { shipmentId: String(data.id), rates, warnings, to, parcel };
}

export type Bought = {
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  carrier: string;
  service: string;
  cents: number;
};

export async function buyShipment(shipmentId: string, rateId: string): Promise<Bought> {
  const data = await easypost(`/shipments/${encodeURIComponent(shipmentId)}/buy`, { rate: { id: rateId } });
  const label = data.postage_label as { label_url?: string; label_pdf_url?: string } | undefined;
  const rate = data.selected_rate as { carrier?: string; service?: string; rate?: string } | undefined;
  const tracker = data.tracker as { public_url?: string } | undefined;
  const tracking = String(data.tracking_code ?? "");
  return {
    trackingNumber: tracking,
    trackingUrl: tracker?.public_url || (tracking ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}` : ""),
    labelUrl: label?.label_pdf_url || label?.label_url || "",
    carrier: String(rate?.carrier ?? ""),
    service: String(rate?.service ?? ""),
    cents: Math.round(parseFloat(String(rate?.rate ?? "0")) * 100),
  };
}

// Ask for the postage back on an unused label (USPS refunds after a
// couple of weeks if the label was never scanned).
export async function refundShipment(shipmentId: string): Promise<string> {
  const data = await easypost(`/shipments/${encodeURIComponent(shipmentId)}/refund`);
  return String(data.refund_status ?? "submitted");
}
