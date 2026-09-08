"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================
//  "Buy label" on the /admin orders table. Two steps so you always see
//  the price before money moves: get rates (address check + package
//  preset), pick one, buy. The label opens in a new tab to print; the
//  tracking number, postage cost, and Shipped status land on the order
//  and the customer gets the tracking email.
// ============================================================

type Rate = { id: string; carrier: string; service: string; cents: number; deliveryDays: number | null; name: string };
type Quote = {
  shipmentId: string;
  to: { name: string; street1: string; street2?: string; city: string; state: string; zip: string };
  parcel: { length: number; width: number; height: number; weight: number; label: string };
  shirts: number;
  testMode: boolean;
  warnings: string[];
  rates: Rate[];
};

type Props = {
  orderId: number;
  status: string;
  hasAddress: boolean;
  labelUrl: string | null;
  tracking: string | null;
  trackingUrl: string | null;
  service: string | null;
  postageCents: number | null;
  enabled: boolean;      // EasyPost + ship-from address are configured
  missing: string[];     // env vars still needed
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function ShipLabel(p: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [rateId, setRateId] = useState("");
  const [needAddress, setNeedAddress] = useState(!p.hasAddress);
  const [addr, setAddr] = useState({ name: "", line1: "", line2: "", city: "", state: "", postal: "" });
  const [weightOz, setWeightOz] = useState("");
  const [done, setDone] = useState<{ labelUrl: string; tracking: string; trackingUrl: string; emailed: boolean } | null>(null);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "That didn't work.");
    return data;
  }

  async function getRates() {
    setBusy("quote");
    setError("");
    setQuote(null);
    try {
      const body: Record<string, unknown> = { id: p.orderId };
      if (needAddress) body.address = addr;
      if (weightOz.trim()) body.weightOz = Number(weightOz);
      const q = (await post("/api/admin/labels/quote", body)) as Quote;
      setQuote(q);
      setRateId(q.rates[0]?.id ?? "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't get rates.";
      if (msg === "needs-address") {
        setNeedAddress(true);
        setError("This order has no address. Type one in and try again.");
      } else {
        setError(msg);
      }
    }
    setBusy("");
  }

  async function buy() {
    if (!quote || !rateId) return;
    setBusy("buy");
    setError("");
    try {
      const body: Record<string, unknown> = { id: p.orderId, shipmentId: quote.shipmentId, rateId };
      if (needAddress) body.address = addr;
      const d = await post("/api/admin/labels/buy", body);
      setDone({ labelUrl: d.labelUrl, tracking: d.trackingNumber, trackingUrl: d.trackingUrl, emailed: Boolean(d.emailed) });
      if (d.labelUrl) window.open(d.labelUrl, "_blank", "noopener");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't buy the label.");
    }
    setBusy("");
  }

  async function voidLabel() {
    if (!window.confirm("Void this label and ask for the postage back?")) return;
    setBusy("void");
    setError("");
    try {
      await post("/api/admin/labels/void", { id: p.orderId });
      setDone(null);
      setQuote(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't void it.");
    }
    setBusy("");
  }

  // ---- already shipped with a label ----
  const label = done?.labelUrl ?? p.labelUrl;
  const tracking = done?.tracking ?? p.tracking;
  const trackingUrl = done?.trackingUrl ?? p.trackingUrl;
  if (label && tracking) {
    return (
      <div className="text-xs">
        <a href={label} target="_blank" rel="noreferrer" className="font-semibold text-goldlight underline underline-offset-2">
          Label ↗
        </a>
        <div className="mt-1 text-faded">
          {trackingUrl ? (
            <a href={trackingUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-goldlight">{tracking}</a>
          ) : (
            tracking
          )}
        </div>
        {(p.service || p.postageCents !== null) && (
          <div className="mt-0.5 text-faded">
            {p.service ? p.service.replace(/([a-z])([A-Z])/g, "$1 $2") : ""}
            {p.postageCents !== null ? ` · ${money(p.postageCents)}` : ""}
          </div>
        )}
        {done && (
          <div className="mt-1 text-goldlight">{done.emailed ? "Customer emailed the tracking." : "Bought. (No tracking email — customer emails need the verified domain.)"}</div>
        )}
        <button type="button" onClick={voidLabel} disabled={busy !== ""} className="mt-1 text-[0.65rem] text-faded underline underline-offset-2 hover:text-rust">
          {busy === "void" ? "voiding…" : "void label"}
        </button>
        {error && <p className="mt-1 text-rust">{error}</p>}
      </div>
    );
  }

  // ---- not configured yet ----
  if (!p.enabled) {
    return (
      <span className="text-[0.65rem] text-faded" title={`Add ${p.missing.join(", ")} in Vercel — README step 9`}>
        labels off
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={"rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider transition " + (p.status === "requested" ? "border-bone/15 text-faded hover:text-goldlight" : "border-gold/60 text-goldlight hover:bg-gold/10")}
        title={p.status === "requested" ? "Not paid yet — you can still buy a label" : "Buy a shipping label"}
      >
        Buy label
      </button>
    );
  }

  return (
    <div className="w-[19rem] rounded-xl border border-bone/10 bg-black/30 p-3 text-xs">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold text-bone">Shipping label</p>
        <button type="button" onClick={() => setOpen(false)} className="text-faded hover:text-goldlight">close</button>
      </div>

      {needAddress && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <input value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} placeholder="Name" className="input col-span-2 py-1 text-xs" />
          <input value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} placeholder="Street" className="input col-span-2 py-1 text-xs" />
          <input value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} placeholder="Apt / unit" className="input col-span-2 py-1 text-xs" />
          <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} placeholder="City" className="input py-1 text-xs" />
          <div className="flex gap-1.5">
            <input value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} placeholder="ME" maxLength={2} className="input w-14 py-1 text-center text-xs uppercase" />
            <input value={addr.postal} onChange={(e) => setAddr({ ...addr, postal: e.target.value })} placeholder="ZIP" className="input py-1 text-xs" />
          </div>
        </div>
      )}

      <div className="mt-2 flex items-end gap-2">
        <label className="text-[0.65rem] text-faded">
          Weight (oz, optional)
          <input value={weightOz} onChange={(e) => setWeightOz(e.target.value)} inputMode="decimal" placeholder="auto" className="input mt-0.5 block w-20 py-1 text-xs" />
        </label>
        <button type="button" onClick={getRates} disabled={busy !== ""} className="btn btn-ghost min-h-0 px-3 py-1.5 text-xs">
          {busy === "quote" ? "Checking…" : quote ? "Get rates again" : "Get rates"}
        </button>
      </div>

      {error && <p className="mt-2 text-rust">{error}</p>}

      {quote && (
        <div className="mt-3 space-y-2">
          <p className="text-faded">
            To <span className="text-bone">{quote.to.name}</span>, {quote.to.street1}{quote.to.street2 ? ` ${quote.to.street2}` : ""}, {quote.to.city} {quote.to.state} {quote.to.zip}
          </p>
          <p className="text-faded">
            {quote.shirts} shirt{quote.shirts === 1 ? "" : "s"} · {quote.parcel.label} · {quote.parcel.weight} oz
            {quote.testMode && <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-goldlight">test mode</span>}
          </p>
          {quote.warnings.map((w, i) => (
            <p key={i} className="rounded-lg border border-gold/40 bg-gold/10 p-2 text-bone">{w}</p>
          ))}
          {quote.rates.length > 0 && (
            <div className="space-y-1">
              {quote.rates.slice(0, 5).map((r) => (
                <label key={r.id} className={"flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 " + (rateId === r.id ? "border-gold/60 bg-gold/10" : "border-bone/10")}>
                  <input type="radio" name={`rate-${p.orderId}`} checked={rateId === r.id} onChange={() => setRateId(r.id)} className="accent-[#cf9440]" />
                  <span className="flex-1 text-bone">{r.name}</span>
                  <span className="text-faded">{r.deliveryDays ? `${r.deliveryDays}d` : ""}</span>
                  <span className="font-semibold text-goldlight tabular-nums">{money(r.cents)}</span>
                </label>
              ))}
            </div>
          )}
          {quote.rates.length > 0 && (
            <button type="button" onClick={buy} disabled={busy !== "" || !rateId} className="btn btn-gold min-h-0 w-full px-3 py-2 text-xs">
              {busy === "buy" ? "Buying…" : `Buy label for ${money(quote.rates.find((r) => r.id === rateId)?.cents ?? 0)}`}
            </button>
          )}
          <p className="text-[0.65rem] text-faded">The label opens in a new tab. It marks the order Shipped, saves the postage to Sales history, and emails the customer the tracking number.</p>
        </div>
      )}
    </div>
  );
}
