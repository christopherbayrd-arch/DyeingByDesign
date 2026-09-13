"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { COLORS, ONE_SIZE, SIZES, colorName } from "@/lib/products";
import { SWAP_DAYS, SWAP_REASONS, changesSomething, daysSince } from "@/lib/swapShared";

// One piece from a past order, ready to swap
export type SwapLine = {
  id: number;
  orderId: number;
  orderRef: string;
  orderAt: string;
  slug: string;
  name: string;
  variant: string;
  variantName: string;
  color: string;
  size: string;
  qty: number;
  swapped: boolean;
  openSwap: string; // the ref of a swap already going for this one
};

export type SwapProduct = { slug: string; name: string; sizes: string[]; kind: "shirt" | "bandana" };

function pieceText(l: { name: string; variantName?: string; color: string; size: string }) {
  const what = l.variantName ? `${l.name} · ${l.variantName}` : l.name;
  return [what, l.color ? colorName(l.color) : "", l.size && l.size !== ONE_SIZE ? l.size : ""]
    .filter(Boolean)
    .join(" · ");
}

export default function SwapForm({
  lines,
  products,
  signedIn,
  defaultName,
  defaultEmail,
  preselect,
}: {
  lines: SwapLine[];
  products: SwapProduct[];
  signedIn: boolean;
  defaultName: string;
  defaultEmail: string;
  preselect: number;
}) {
  const swappable = lines.filter((l) => !l.swapped && !l.openSwap);
  const [lineId, setLineId] = useState(
    preselect && swappable.some((l) => l.id === preselect) ? preselect : swappable[0]?.id ?? 0
  );
  // people who ordered before they had an account describe the piece instead
  const [manual, setManual] = useState(swappable.length === 0);
  const [slug, setSlug] = useState(products[0]?.slug ?? "");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [variant, setVariant] = useState("");

  const [wantColor, setWantColor] = useState("");
  const [wantSize, setWantSize] = useState("");
  const [reason, setReason] = useState(SWAP_REASONS[0].key);
  const [note, setNote] = useState("");
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [addr, setAddr] = useState({ line1: "", line2: "", city: "", state: "", postal: "" });
  const [website, setWebsite] = useState(""); // honeypot

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ref: string; already: boolean } | null>(null);

  const picked = manual ? null : swappable.find((l) => l.id === lineId) ?? null;
  const have = picked
    ? { slug: picked.slug, color: picked.color, size: picked.size, variant: picked.variant }
    : { slug, color, size, variant };
  const product = products.find((p) => p.slug === have.slug) ?? null;
  const sizes = product?.sizes ?? SIZES;
  const oneSize = sizes.length === 1;
  const designName = picked ? picked.name : product?.name ?? have.slug;
  const variantName = picked
    ? picked.variantName
    : have.variant
      ? products.find((p) => p.slug === have.variant)?.name ?? have.variant
      : "";
  const bandana = product?.kind === "bandana" || Boolean(picked?.variant);

  const late = useMemo(() => {
    const at = picked?.orderAt ?? "";
    return at ? daysSince(at) > SWAP_DAYS : false;
  }, [picked]);

  const ready =
    email.includes("@") &&
    have.slug &&
    addr.line1 &&
    addr.city &&
    addr.state &&
    addr.postal &&
    changesSomething({ color: have.color, size: have.size }, { color: wantColor, size: wantSize });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website,
          lineId: picked?.id ?? 0,
          slug: have.slug,
          variant: have.variant,
          color: have.color,
          size: have.size,
          wantColor,
          wantSize,
          reason,
          note,
          name,
          email,
          ...addr,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDone({ ref: String(data.ref ?? ""), already: Boolean(data.already) });
      } else {
        setError(data.error ?? "That didn't send. Try again in a minute.");
      }
    } catch {
      setError("That didn't send. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="card mt-8 p-6 sm:p-8">
        <p className="kicker">{done.already ? "Already going" : "Swap asked for"}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">
          {done.ref ? done.ref : "Thank you"}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-faded">
          {done.already
            ? "You've already got a swap going for this one — we're on it. Check your email for where to send it back."
            : "We'll write back within a day with where to send yours. Once it's on its way, the new one gets made and ships to you free."}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-faded">
          Nothing has been charged, and nothing else is needed from you right now.
        </p>
        <Link href="/shop" className="btn btn-ghost mt-6">
          Back to the lineup
        </Link>
      </div>
    );
  }

  const field = "block text-sm";
  const labelText = "mb-1.5 block font-medium text-bone";

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {/* ---- which piece ---- */}
      <section className="card p-5 sm:p-6">
        <p className="kicker">1 · Which piece</p>
        {swappable.length > 0 && (
          <div className="mt-3 space-y-2">
            {swappable.map((l) => (
              <label
                key={l.id}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition " +
                  (!manual && lineId === l.id ? "border-gold/70 bg-gold/10" : "border-bone/15 hover:border-bone/35")
                }
              >
                <input
                  type="radio"
                  name="piece"
                  checked={!manual && lineId === l.id}
                  onChange={() => {
                    setManual(false);
                    setLineId(l.id);
                    setWantSize("");
                    setWantColor("");
                  }}
                  className="mt-1 h-4 w-4 accent-[#cf9440]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-bone">{pieceText(l)}</span>
                  <span className="block text-xs text-faded">
                    {l.orderRef ? `${l.orderRef} · ` : ""}
                    {l.orderAt ? new Date(l.orderAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {lines.some((l) => l.swapped || l.openSwap) && (
          <p className="mt-3 text-xs leading-relaxed text-faded">
            {lines
              .filter((l) => l.swapped || l.openSwap)
              .map((l) => `${pieceText(l)} — ${l.swapped ? "already swapped" : `swap ${l.openSwap} in progress`}`)
              .join(" · ")}
          </p>
        )}

        <label className="mt-4 flex items-start gap-2 text-sm text-faded">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => setManual(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#cf9440]"
          />
          <span>
            {swappable.length > 0 ? "It's not one of these" : "Tell us what you have"}
            <span className="block text-xs">
              {signedIn
                ? "Ordered at a market or before you had an account? Describe it and we'll match it up."
                : "Sign in above and we'll fill this in from your order, or just describe it here."}
            </span>
          </span>
        </label>

        {manual && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className={field}>
              <span className={labelText}>Design</span>
              <select value={slug} onChange={(e) => setSlug(e.target.value)} className="input py-2">
                {products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {bandana && (
              <label className={field}>
                <span className={labelText}>Design on it</span>
                <select value={variant} onChange={(e) => setVariant(e.target.value)} className="input py-2">
                  <option value="">Pick one</option>
                  {products
                    .filter((p) => p.kind !== "bandana")
                    .map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className={field}>
              <span className={labelText}>Color you have</span>
              <select value={color} onChange={(e) => setColor(e.target.value)} className="input py-2">
                <option value="">Pick one</option>
                {COLORS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!oneSize && (
              <label className={field}>
                <span className={labelText}>Size you have</span>
                <select value={size} onChange={(e) => setSize(e.target.value)} className="input py-2">
                  <option value="">Pick one</option>
                  {sizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {late && (
          <p className="mt-4 rounded-xl bg-gold/10 px-3 py-2 text-xs leading-relaxed text-bone">
            That order is more than {SWAP_DAYS} days old, so it&apos;s outside the swap window — send it
            anyway and we&apos;ll see what we can do.
          </p>
        )}
      </section>

      {/* ---- what instead ---- */}
      <section className="card p-5 sm:p-6">
        <p className="kicker">2 · What instead</p>
        <p className="mt-1 text-sm text-faded">
          Same design — a different size, a different color, or both. {designName}
          {variantName ? ` · ${variantName}` : ""} it is.
        </p>

        {!oneSize && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-bone">Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-active={wantSize === s}
                  aria-pressed={wantSize === s}
                  onClick={() => setWantSize(wantSize === s ? "" : s)}
                  className="size-pill min-h-11 min-w-14"
                >
                  {s}
                  {s === have.size && <span className="ml-1 text-xs opacity-70">(yours)</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-bone">Color</p>
          <div className="flex flex-wrap gap-2.5">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={c.name + (c.key === have.color ? " (the one you have)" : "")}
                title={c.name}
                onClick={() => setWantColor(wantColor === c.key ? "" : c.key)}
                className={
                  "relative h-10 w-10 rounded-full border-2 transition " +
                  (wantColor === c.key ? "border-goldlight scale-110" : "border-bone/20 hover:border-bone/60")
                }
                style={{ background: c.hex }}
              >
                {c.key === have.color && wantColor !== c.key && (
                  <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-bone/60" />
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-faded">
            {wantColor ? colorName(wantColor) : "Leave the color alone and just change the size, if you like."}
          </p>
        </div>

        <label className={field + " mt-5"}>
          <span className={labelText}>Why the swap?</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="input py-2">
            {SWAP_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* ---- where it goes ---- */}
      <section className="card p-5 sm:p-6">
        <p className="kicker">3 · Where the new one goes</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={field}>
            <span className={labelText}>Your name</span>
            <input className="input py-2" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className={field}>
            <span className={labelText}>Email your order was under</span>
            <input
              className="input py-2"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className={field + " sm:col-span-2"}>
            <span className={labelText}>Street address</span>
            <input className="input py-2" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} autoComplete="address-line1" required />
          </label>
          <label className={field + " sm:col-span-2"}>
            <span className={labelText}>
              Apartment, unit <span className="font-normal text-faded">(optional)</span>
            </span>
            <input className="input py-2" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} autoComplete="address-line2" />
          </label>
          <label className={field}>
            <span className={labelText}>Town</span>
            <input className="input py-2" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} autoComplete="address-level2" required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={field}>
              <span className={labelText}>State</span>
              <input className="input py-2" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} autoComplete="address-level1" required />
            </label>
            <label className={field}>
              <span className={labelText}>ZIP</span>
              <input className="input py-2" inputMode="numeric" value={addr.postal} onChange={(e) => setAddr({ ...addr, postal: e.target.value })} autoComplete="postal-code" required />
            </label>
          </div>
          <label className={field + " sm:col-span-2"}>
            <span className={labelText}>
              Anything else <span className="font-normal text-faded">(optional)</span>
            </span>
            <textarea
              className="input min-h-20 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Runs big on me, the L would be perfect…"
            />
          </label>
        </div>

        {/* honeypot — hidden from people, catches bots */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
          aria-hidden="true"
        />

        {error && <p className="mt-4 text-sm text-rust">{error}</p>}
        <button type="submit" className="btn btn-gold mt-5 w-full sm:w-auto" disabled={!ready || busy}>
          {busy ? "Sending…" : "Ask for the swap"}
        </button>
        {!ready && !busy && (
          <p className="mt-2 text-xs text-faded">
            {changesSomething({ color: have.color, size: have.size }, { color: wantColor, size: wantSize })
              ? "Fill in your email and where the new one should go."
              : "Pick the size or color you'd rather have."}
          </p>
        )}
      </section>
    </form>
  );
}
