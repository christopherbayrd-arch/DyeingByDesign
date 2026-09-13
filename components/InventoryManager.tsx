"use client";

import { useEffect, useMemo, useState } from "react";
import { COLORS, ONE_SIZE, SIZES, colorName, supplierColor } from "@/lib/products";
import {
  LOW_BLANKS,
  REASON_LABELS,
  blankKey,
  shirtKey,
  type InvItem,
  type InvKind,
  type InvMove,
} from "@/lib/inventoryShared";

// ============================================================
//  /admin/inventory — everything on the shelf, three kinds:
//    Ready to sell  finished shirts, by design, color, size
//                   (+ bandanas, by design and color — they're one size)
//    Blanks         plain tees by color and size, plus blank bandanas
//    Other items    tie dye, hoodies, one offs
//  Type a number in any box and tap away to save it (that's a count).
//  "Just made some" and "Bought blanks" add on top of what's there.
// ============================================================

export type InvDesign = {
  slug: string;
  name: string;
  image: string;
  inLineup: boolean;
  kind?: "shirt" | "bandana";
};

type Tab = "shirts" | "blanks" | "other" | "history";

function dollars(c: number | null) {
  if (c === null) return "";
  return `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
}

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A count box: type a number, tap away (or hit return) to save it
function CountInput({
  value,
  onSave,
  label,
  flag = false,
}: {
  value: number;
  onSave: (n: number) => void;
  label: string;
  flag?: boolean;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 5))}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const n = v === "" ? 0 : Number(v);
        if (n !== value) onSave(n);
        else setV(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={
        "input w-10 px-0.5 py-1.5 text-center tabular-nums sm:w-12 " +
        (value === 0 ? "text-faded/60 " : "font-semibold ") +
        (flag ? "!border-rust !text-rust" : "")
      }
    />
  );
}

function Stepper({ value, set, min = 1 }: { value: number; set: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-full border border-bone/25">
      <button type="button" onClick={() => set(Math.max(min, value - 1))} className="h-11 w-11 text-xl text-bone" aria-label="One fewer">
        −
      </button>
      <span className="w-9 text-center text-lg font-bold tabular-nums">{value}</span>
      <button type="button" onClick={() => set(Math.min(999, value + 1))} className="h-11 w-11 text-xl text-bone" aria-label="One more">
        +
      </button>
    </div>
  );
}

function Swatches({ value, set }: { value: string; set: (k: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-x-2 gap-y-3 sm:grid-cols-9">
      {COLORS.map((c) => {
        const on = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            aria-label={c.name}
            onClick={() => set(c.key)}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <span
              className={
                "h-10 w-10 rounded-full border transition " +
                (on ? "border-gold ring-2 ring-gold ring-offset-2 ring-offset-bark" : "border-bone/30")
              }
              style={{ background: c.hex }}
            />
            <span className={"text-[0.65rem] leading-tight " + (on ? "text-goldlight" : "text-faded")}>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function Sizes({ value, set }: { value: string; set: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SIZES.map((s) => (
        <button
          key={s}
          type="button"
          data-active={value === s}
          aria-pressed={value === s}
          onClick={() => set(s)}
          className="size-pill min-h-11 min-w-12 text-base"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export default function InventoryManager({
  initialItems,
  initialMoves,
  designs,
  error,
}: {
  initialItems: InvItem[];
  initialMoves: InvMove[];
  designs: InvDesign[];
  error: string;
}) {
  const [items, setItems] = useState<InvItem[]>(initialItems);
  const [moves, setMoves] = useState<InvMove[]>(initialMoves);
  const [tab, setTab] = useState<Tab>("shirts");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [historyKind, setHistoryKind] = useState<"" | InvKind>("");

  // Bandanas take any design, so they're counted per design + color and
  // live in their own block; everything else is a shirt.
  const bandana = designs.find((d) => d.kind === "bandana") ?? null;
  const shirtDesigns = designs.filter((d) => d.kind !== "bandana");
  // "Just made some"
  const [madeWhat, setMadeWhat] = useState<"shirt" | "bandana">("shirt");
  const [madeSlug, setMadeSlug] = useState(shirtDesigns.find((d) => d.inLineup)?.slug ?? shirtDesigns[0]?.slug ?? "");
  const [madeColor, setMadeColor] = useState("black");
  const [madeSize, setMadeSize] = useState("M");
  const [madeQty, setMadeQty] = useState(1);
  const [useBlanks, setUseBlanks] = useState(true);
  // "Bought blanks"
  const [boughtWhat, setBoughtWhat] = useState<"shirt" | "bandana">("shirt");
  const [boughtColor, setBoughtColor] = useState("black");
  const [boughtSize, setBoughtSize] = useState("M");
  const [boughtQty, setBoughtQty] = useState(12);
  // "Other item"
  const [other, setOther] = useState({ name: "", size: "", color: "", price: "", qty: "1" });
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState({ name: "", size: "", color: "", price: "" });
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);

  async function send(label: string, body: Record<string, unknown>, method = "POST", url = "/api/admin/inventory") {
    setBusy(label);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.items)) {
        setItems(data.items);
        setMoves(data.moves ?? []);
        setBusy("");
        return true;
      }
      setNote({ text: data.error ?? "That didn't save.", good: false });
    } catch {
      setNote({ text: "That didn't save. Check your connection.", good: false });
    }
    setBusy("");
    return false;
  }

  // ---- lookups ----
  const shirts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) if (i.kind === "shirt") m[shirtKey(i.slug, i.color, i.size, i.name)] = i.qty;
    return m;
  }, [items]);
  const blanks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) if (i.kind === "blank") m[blankKey(i.color, i.size)] = i.qty;
    return m;
  }, [items]);
  const blankRows = useMemo(() => new Set(items.filter((i) => i.kind === "blank").map((i) => blankKey(i.color, i.size))), [items]);
  const others = items.filter((i) => i.kind === "other");

  const shirtTotal = items.filter((i) => i.kind === "shirt").reduce((n, i) => n + i.qty, 0);
  const blankTotal = items.filter((i) => i.kind === "blank").reduce((n, i) => n + i.qty, 0);
  const otherTotal = others.reduce((n, i) => n + i.qty, 0);
  // a color + size you've stocked before that's running low
  const lowBlanks = [...blankRows].filter((k) => (blanks[k] ?? 0) < LOW_BLANKS).length;

  const designTotal = (slug: string) => SIZES.reduce((n, s) => n + COLORS.reduce((m, c) => m + (shirts[shirtKey(slug, c.key, s)] ?? 0), 0), 0);
  const designName = (slug: string) => designs.find((d) => d.slug === slug)?.name ?? slug;
  // bandanas: one size, counted per design and color
  const bandanaQty = (design: string, color: string) =>
    bandana ? shirts[shirtKey(bandana.slug, color, ONE_SIZE, design)] ?? 0 : 0;
  const bandanaTotal = () =>
    bandana ? items.filter((i) => i.kind === "shirt" && i.slug === bandana.slug).reduce((n, i) => n + i.qty, 0) : 0;
  // what "Just made some" is about to add
  const madeIsBandana = madeWhat === "bandana" && Boolean(bandana);
  const madeKey = madeIsBandana
    ? { kind: "shirt", slug: bandana!.slug, name: madeSlug, color: madeColor, size: ONE_SIZE }
    : { kind: "shirt", slug: madeSlug, color: madeColor, size: madeSize };
  const madeBlankSize = madeIsBandana ? ONE_SIZE : madeSize;
  const boughtIsBandana = boughtWhat === "bandana" && Boolean(bandana);
  const boughtBlankSize = boughtIsBandana ? ONE_SIZE : boughtSize;
  const blankSizes = bandana ? [...SIZES, ONE_SIZE] : SIZES;
  const piece = bandana ? "piece" : "shirt";
  const pieces = bandana ? "pieces" : "shirts";
  const sizeHead = (sz: string) => (sz === ONE_SIZE ? "Band" : sz);

  if (error) return <p className="card mt-8 p-6 text-sm leading-relaxed text-rust">{error}</p>;

  // ---------- pieces ----------

  const tile = (label: string, value: number, sub: string, go: Tab, warn = false) => (
    <button
      type="button"
      onClick={() => setTab(go)}
      className={"card p-4 text-left transition hover:border-gold/60 " + (tab === go ? "!border-gold/70" : "")}
    >
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-faded">{label}</p>
      <p className={"mt-1 font-display text-3xl font-semibold tabular-nums " + (warn ? "text-rust" : "text-goldlight")}>{value}</p>
      <p className="text-xs text-faded">{sub}</p>
    </button>
  );

  const shirtsPanel = (
    <div className="space-y-5">
      {/* add what you just made */}
      <section className="card p-4 sm:p-6">
        <p className="kicker">Just made some?</p>
        <p className="mt-1 text-sm text-faded">
          Add finished {bandana ? "pieces" : "shirts"} to Ready to sell.
        </p>
        <div className="mt-4 space-y-4">
          {bandana && (
            <div className="flex flex-wrap gap-2">
              {(["shirt", "bandana"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  data-active={madeWhat === k}
                  aria-pressed={madeWhat === k}
                  onClick={() => setMadeWhat(k)}
                  className="size-pill min-h-11 px-5 text-base"
                >
                  {k === "shirt" ? "Shirts" : "Bandanas"}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {shirtDesigns.map((d) => (
              <button
                key={d.slug}
                type="button"
                data-active={madeSlug === d.slug}
                aria-pressed={madeSlug === d.slug}
                onClick={() => setMadeSlug(d.slug)}
                className="size-pill min-h-11 px-5 text-base"
              >
                {d.name}
              </button>
            ))}
          </div>
          <Swatches value={madeColor} set={setMadeColor} />
          {madeIsBandana ? (
            <p className="text-sm text-faded">One size — bandanas only come the one way.</p>
          ) : (
            <Sizes value={madeSize} set={setMadeSize} />
          )}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-faded">How many</span>
            <Stepper value={madeQty} set={setMadeQty} />
          </div>
          <label className="flex items-start gap-2 text-sm text-faded">
            <input type="checkbox" checked={useBlanks} onChange={(e) => setUseBlanks(e.target.checked)} className="mt-1 h-4 w-4 accent-[#cf9440]" />
            <span>
              Take the blanks out of Blanks
              <span className="block text-xs">
                {colorName(madeColor)} {madeIsBandana ? "bandana" : madeSize}:{" "}
                {blanks[blankKey(madeColor, madeBlankSize)] ?? 0} blank
                {madeIsBandana ? " bandanas" : "s"} on hand
              </span>
            </span>
          </label>
          <button
            type="button"
            className="btn btn-gold w-full sm:w-auto"
            disabled={busy !== "" || !madeSlug}
            onClick={async () => {
              const ok = await send("made", {
                op: "add",
                ...madeKey,
                qty: madeQty,
                reason: "made",
                useBlanks,
              });
              if (ok) {
                setNote({
                  text: madeIsBandana
                    ? `Added ${madeQty} ${designName(madeSlug)} bandana · ${colorName(madeColor)}.`
                    : `Added ${madeQty} ${designName(madeSlug)} · ${colorName(madeColor)} · ${madeSize}.`,
                  good: true,
                });
                setMadeQty(1);
              }
            }}
          >
            {busy === "made" ? "Adding…" : `Add ${madeQty} to Ready to sell`}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-faded">
          Tap a box, type the count, tap away. {showAll ? "Showing every color." : "Only colors you have are showing."}
        </p>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm text-goldlight underline underline-offset-2">
          {showAll ? "Only show what's on hand" : "Show every color (to type in a count)"}
        </button>
      </div>

      {shirtDesigns.map((d) => {
        const total = designTotal(d.slug);
        const rows = COLORS.filter((c) => showAll || SIZES.some((s) => (shirts[shirtKey(d.slug, c.key, s)] ?? 0) > 0));
        if (!showAll && total === 0) {
          return (
            <section key={d.slug} className="card flex flex-wrap items-center justify-between gap-2 p-4 sm:px-6">
              <p className="font-display text-lg font-semibold">
                {d.name} {!d.inLineup && <span className="text-xs font-normal text-faded">(not in the lineup)</span>}
              </p>
              <p className="text-sm text-faded">None on hand</p>
            </section>
          );
        }
        return (
          <section key={d.slug} className="card p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-xl font-semibold">
                {d.name} {!d.inLineup && <span className="text-xs font-normal text-faded">(not in the lineup)</span>}
              </p>
              <p className="text-sm text-faded">
                <strong className="text-goldlight">{total}</strong> on hand
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr className="text-[0.7rem] font-semibold uppercase tracking-wider text-faded">
                    <th className="pr-2 text-left font-semibold">Color</th>
                    {SIZES.map((s) => (
                      <th key={s} className="px-0.5 text-center font-semibold">{s}</th>
                    ))}
                    <th className="hidden pl-2 text-right font-semibold sm:table-cell">All</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const rowTotal = SIZES.reduce((n, s) => n + (shirts[shirtKey(d.slug, c.key, s)] ?? 0), 0);
                    return (
                      <tr key={c.key}>
                        <td className="max-w-[5.5rem] pr-1.5 sm:max-w-none sm:pr-2">
                          <span className="flex items-center gap-1.5">
                            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-bone/30" style={{ background: c.hex }} />
                            <span className="truncate text-xs text-bone sm:text-sm">{c.name}</span>
                          </span>
                        </td>
                        {SIZES.map((s) => (
                          <td key={s} className="px-0.5 text-center">
                            <CountInput
                              value={shirts[shirtKey(d.slug, c.key, s)] ?? 0}
                              label={`${d.name} ${c.name} ${s}`}
                              onSave={(n) => send(`c-${d.slug}-${c.key}-${s}`, { op: "set", kind: "shirt", slug: d.slug, color: c.key, size: s, qty: n })}
                            />
                          </td>
                        ))}
                        <td className="hidden pl-2 text-right font-semibold tabular-nums text-goldlight sm:table-cell">{rowTotal || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {bandana && (
        <section className="card p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-xl font-semibold">
              {bandana.name}{" "}
              {!bandana.inLineup && <span className="text-xs font-normal text-faded">(hidden on the site)</span>}
            </p>
            <p className="text-sm text-faded">
              <strong className="text-goldlight">{bandanaTotal()}</strong> on hand
            </p>
          </div>
          <p className="mt-1 text-xs text-faded">One size — counted by the design on it.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-[0.7rem] font-semibold uppercase tracking-wider text-faded">
                  <th className="pr-2 text-left font-semibold">Color</th>
                  {shirtDesigns.map((d) => (
                    <th key={d.slug} className="px-0.5 text-center font-semibold">{d.name}</th>
                  ))}
                  <th className="hidden pl-2 text-right font-semibold sm:table-cell">All</th>
                </tr>
              </thead>
              <tbody>
                {COLORS.filter((c) => showAll || shirtDesigns.some((d) => bandanaQty(d.slug, c.key) > 0)).map((c) => {
                  const rowTotal = shirtDesigns.reduce((n, d) => n + bandanaQty(d.slug, c.key), 0);
                  return (
                    <tr key={c.key}>
                      <td className="max-w-[5.5rem] pr-1.5 sm:max-w-none sm:pr-2">
                        <span className="flex items-center gap-1.5">
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-bone/30" style={{ background: c.hex }} />
                          <span className="truncate text-xs text-bone sm:text-sm">{c.name}</span>
                        </span>
                      </td>
                      {shirtDesigns.map((d) => (
                        <td key={d.slug} className="px-0.5 text-center">
                          <CountInput
                            value={bandanaQty(d.slug, c.key)}
                            label={`${d.name} bandana ${c.name}`}
                            onSave={(n) =>
                              send(`bd-${d.slug}-${c.key}`, {
                                op: "set",
                                kind: "shirt",
                                slug: bandana.slug,
                                name: d.slug,
                                color: c.key,
                                size: ONE_SIZE,
                                qty: n,
                              })
                            }
                          />
                        </td>
                      ))}
                      <td className="hidden pl-2 text-right font-semibold tabular-nums text-goldlight sm:table-cell">{rowTotal || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );

  const blanksPanel = (
    <div className="space-y-5">
      <section className="card p-4 sm:p-6">
        <p className="kicker">Bought blanks?</p>
        <p className="mt-1 text-sm text-faded">
          Add plain tees{bandana ? " or bandanas" : ""} to Blanks.
        </p>
        <div className="mt-4 space-y-4">
          {bandana && (
            <div className="flex flex-wrap gap-2">
              {(["shirt", "bandana"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  data-active={boughtWhat === k}
                  aria-pressed={boughtWhat === k}
                  onClick={() => setBoughtWhat(k)}
                  className="size-pill min-h-11 px-5 text-base"
                >
                  {k === "shirt" ? "Tees" : "Bandanas"}
                </button>
              ))}
            </div>
          )}
          <Swatches value={boughtColor} set={setBoughtColor} />
          {boughtIsBandana ? (
            <p className="text-sm text-faded">One size — bandanas only come the one way.</p>
          ) : (
            <Sizes value={boughtSize} set={setBoughtSize} />
          )}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-faded">How many</span>
            <Stepper value={boughtQty} set={setBoughtQty} />
          </div>
          <button
            type="button"
            className="btn btn-gold w-full sm:w-auto"
            disabled={busy !== ""}
            onClick={async () => {
              const ok = await send("bought", {
                op: "add",
                kind: "blank",
                color: boughtColor,
                size: boughtBlankSize,
                qty: boughtQty,
                reason: "bought",
              });
              if (ok)
                setNote({
                  text: boughtIsBandana
                    ? `Added ${boughtQty} ${colorName(boughtColor)} blank bandanas.`
                    : `Added ${boughtQty} ${colorName(boughtColor)} ${boughtSize} blanks.`,
                  good: true,
                });
            }}
          >
            {busy === "bought" ? "Adding…" : `Add ${boughtQty} blank${boughtIsBandana ? " bandanas" : "s"}`}
          </button>
        </div>
      </section>

      <section className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-xl font-semibold">Blanks on the shelf</p>
          <p className="text-sm text-faded">
            <strong className="text-goldlight">{blankTotal}</strong> in all
            {lowBlanks > 0 && <span className="text-rust"> · {lowBlanks} running low</span>}
          </p>
        </div>
        <p className="mt-1 text-xs text-faded">
          Tap a box to type a count. Making a shirt takes one off (ticking it in the Make queue, or Just made some).
          A red box is a blank you stock that&apos;s under {LOW_BLANKS}.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-[0.7rem] font-semibold uppercase tracking-wider text-faded">
                <th className="pr-2 text-left font-semibold">Color</th>
                {blankSizes.map((s) => (
                  <th key={s} className="px-0.5 text-center font-semibold" title={s === ONE_SIZE ? "Blank bandanas" : s}>
                    {sizeHead(s)}
                  </th>
                ))}
                <th className="hidden pl-2 text-right font-semibold sm:table-cell">All</th>
              </tr>
            </thead>
            <tbody>
              {COLORS.map((c) => {
                const rowTotal = blankSizes.reduce((n, s) => n + (blanks[blankKey(c.key, s)] ?? 0), 0);
                return (
                  <tr key={c.key}>
                    <td
                      className="max-w-[5.5rem] pr-1.5 sm:max-w-none sm:pr-2"
                      title={`${c.name} — order as "${supplierColor(c.key)}"`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-bone/30" style={{ background: c.hex }} />
                        <span className="truncate text-xs text-bone sm:text-sm">{c.name}</span>
                      </span>
                    </td>
                    {blankSizes.map((s) => {
                      const k = blankKey(c.key, s);
                      const q = blanks[k] ?? 0;
                      return (
                        <td key={s} className="px-0.5 text-center">
                          <CountInput
                            value={q}
                            label={s === ONE_SIZE ? `${c.name} blank bandanas` : `${c.name} ${s} blanks`}
                            flag={blankRows.has(k) && q < LOW_BLANKS}
                            onSave={(n) => send(`b-${k}`, { op: "set", kind: "blank", color: c.key, size: s, qty: n })}
                          />
                        </td>
                      );
                    })}
                    <td className="hidden pl-2 text-right font-semibold tabular-nums text-goldlight sm:table-cell">{rowTotal || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const otherPanel = (
    <div className="space-y-5">
      <section className="card p-4 sm:p-6">
        <p className="kicker">Add an item</p>
        <p className="mt-1 text-sm text-faded">Tie dye, hoodies, one offs — anything else you sell. They show up on Quick sale under Other.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1.5 block font-medium">What is it?</span>
            <input className="input" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Tie dye hoodie" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Size <span className="font-normal text-faded">(optional)</span>
            </span>
            <input className="input" value={other.size} onChange={(e) => setOther({ ...other, size: e.target.value })} placeholder="L" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Color <span className="font-normal text-faded">(optional)</span>
            </span>
            <input className="input" value={other.color} onChange={(e) => setOther({ ...other, color: e.target.value })} placeholder="Blue spiral" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">
              Price <span className="font-normal text-faded">(optional)</span>
            </span>
            <input className="input" inputMode="decimal" value={other.price} onChange={(e) => setOther({ ...other, price: e.target.value })} placeholder="$45" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="text-sm text-faded">How many</span>
          <Stepper value={Math.max(1, Number(other.qty) || 1)} set={(n) => setOther({ ...other, qty: String(n) })} />
          <button
            type="button"
            className="btn btn-gold"
            disabled={busy !== "" || !other.name.trim()}
            onClick={async () => {
              const cents = other.price.trim() ? Math.round(parseFloat(other.price.replace(/[$,\s]/g, "")) * 100) : "";
              const ok = await send("other", {
                op: "other",
                name: other.name,
                size: other.size,
                color: other.color,
                priceCents: Number.isFinite(cents as number) ? cents : "",
                qty: Math.max(1, Number(other.qty) || 1),
              });
              if (ok) {
                setNote({ text: `Added ${other.name.trim()}.`, good: true });
                setOther({ name: "", size: "", color: "", price: "", qty: "1" });
              }
            }}
          >
            {busy === "other" ? "Adding…" : "Add it"}
          </button>
        </div>
      </section>

      <section className="card p-4 sm:p-6">
        <p className="font-display text-xl font-semibold">Other items on the shelf</p>
        {others.length === 0 ? (
          <p className="mt-2 text-sm text-faded">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-bone/10">
            {others.map((it) => (
              <li key={it.id} className="py-3">
                {editing === it.id ? (
                  <div className="grid gap-2 sm:grid-cols-5">
                    <input className="input sm:col-span-2" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Name" />
                    <input className="input" value={edit.size} onChange={(e) => setEdit({ ...edit, size: e.target.value })} placeholder="Size" aria-label="Size" />
                    <input className="input" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} placeholder="Color" aria-label="Color" />
                    <input className="input" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} placeholder="Price" aria-label="Price" />
                    <div className="flex gap-3 sm:col-span-5">
                      <button
                        type="button"
                        className="btn btn-gold px-5 py-2 text-sm"
                        disabled={busy !== "" || !edit.name.trim()}
                        onClick={async () => {
                          const cents = edit.price.trim() ? Math.round(parseFloat(edit.price.replace(/[$,\s]/g, "")) * 100) : "";
                          const ok = await send(`e-${it.id}`, {
                            op: "other",
                            id: it.id,
                            name: edit.name,
                            size: edit.size,
                            color: edit.color,
                            priceCents: Number.isFinite(cents as number) ? cents : "",
                          });
                          if (ok) setEditing(null);
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="text-sm text-faded underline underline-offset-2" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-bone">{it.name}</p>
                      <p className="text-xs text-faded">
                        {[it.size, it.color, dollars(it.priceCents)].filter(Boolean).join(" · ") || "no size or price"}
                      </p>
                    </div>
                    <div className="flex items-center rounded-full border border-bone/25">
                      <button
                        type="button"
                        aria-label={`One fewer ${it.name}`}
                        disabled={busy !== "" || it.qty === 0}
                        onClick={() => send(`o-${it.id}`, { op: "take", kind: "other", name: it.name, size: it.size, color: it.color, qty: 1 })}
                        className="h-10 w-10 text-xl text-bone disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className={"w-9 text-center text-lg font-bold tabular-nums " + (it.qty === 0 ? "text-faded" : "")}>{it.qty}</span>
                      <button
                        type="button"
                        aria-label={`One more ${it.name}`}
                        disabled={busy !== ""}
                        onClick={() => send(`o-${it.id}`, { op: "add", kind: "other", name: it.name, size: it.size, color: it.color, qty: 1, reason: "adjusted" })}
                        className="h-10 w-10 text-xl text-bone"
                      >
                        +
                      </button>
                    </div>
                    <span className="flex gap-3 text-xs">
                      <button
                        type="button"
                        className="text-faded underline underline-offset-2 hover:text-goldlight"
                        onClick={() => {
                          setEditing(it.id);
                          setEdit({ name: it.name, size: it.size, color: it.color, price: it.priceCents === null ? "" : (it.priceCents / 100).toFixed(2) });
                        }}
                      >
                        Edit
                      </button>
                      {confirmRemove === it.id ? (
                        <button
                          type="button"
                          className="font-semibold text-rust underline underline-offset-2"
                          onClick={async () => {
                            await send(`d-${it.id}`, {}, "DELETE", `/api/admin/inventory?id=${it.id}`);
                            setConfirmRemove(null);
                          }}
                        >
                          Remove it?
                        </button>
                      ) : (
                        <button type="button" className="text-faded underline underline-offset-2 hover:text-rust" onClick={() => setConfirmRemove(it.id)}>
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const shownMoves = moves.filter((m) => !historyKind || m.kind === historyKind);
  const historyPanel = (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-xl font-semibold">Every change</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["", "All"],
            ["shirt", "Shirts"],
            ["blank", "Blanks"],
            ["other", "Other"],
          ] as const).map(([k, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setHistoryKind(k)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition " +
                (historyKind === k ? "bg-gold text-inkdeep" : "border border-bone/20 text-faded hover:text-goldlight")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {shownMoves.length === 0 ? (
        <p className="mt-3 text-sm text-faded">Nothing yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-bone/10">
          {shownMoves.map((m) => (
            <li key={m.id} className="flex items-start gap-3 py-2.5 text-sm">
              <span
                className={
                  "mt-0.5 w-12 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums " +
                  (m.delta > 0 ? "bg-gold/20 text-goldlight" : "bg-rust/20 text-rust")
                }
              >
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </span>
              <span className="min-w-0 flex-1">
                <span className={"block " + (m.reversed ? "text-faded line-through" : "text-bone")}>{m.label}</span>
                <span className="text-xs text-faded">
                  {REASON_LABELS[m.reason] ?? m.reason}
                  {m.note ? ` · ${m.note}` : ""}
                  {m.orderId ? ` · order ${m.orderId}` : ""}
                  {m.reversed ? " · undone" : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-faded">
                <span className="block">{when(m.createdAt)}</span>
                {m.qtyAfter !== null && <span>now {m.qtyAfter}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile("Ready to sell", shirtTotal, shirtTotal === 1 ? piece : pieces, "shirts")}
        {tile(
          "Blanks",
          blankTotal,
          lowBlanks > 0 ? `${lowBlanks} running low` : bandana ? "tees + bandanas" : "plain tees",
          "blanks",
          false
        )}
        {tile("Other items", otherTotal, `${others.length} kind${others.length === 1 ? "" : "s"}`, "other")}
        {tile("Changes", moves.length, "see History", "history")}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {([
          ["shirts", "Ready to sell"],
          ["blanks", "Blanks"],
          ["other", "Other items"],
          ["history", "History"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={
              "rounded-full px-4 py-2 text-sm font-medium transition " +
              (tab === k ? "bg-gold text-inkdeep" : "border border-bone/20 text-faded hover:text-goldlight")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "shirts" && shirtsPanel}
        {tab === "blanks" && blanksPanel}
        {tab === "other" && otherPanel}
        {tab === "history" && historyPanel}
      </div>

      {note && (
        <div
          role="status"
          className={
            "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 mx-auto max-w-md rounded-2xl border px-4 py-3 text-sm shadow-2xl md:inset-x-auto md:right-6 " +
            (note.good ? "border-gold/40 bg-panel text-bone" : "border-rust/60 bg-panel text-rust")
          }
        >
          {note.text}
        </div>
      )}
    </div>
  );
}
