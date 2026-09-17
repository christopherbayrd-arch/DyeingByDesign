"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { amount, normalizeOpex, planPerMonth, starterOpex, type OpexDoc } from "@/lib/opex";
import {
  curve as buildCurve,
  normalizeAssumptions,
  normalizeDials,
  run,
  seededState,
  type Assumptions,
  type Dials,
  type Seed,
} from "@/lib/forecast";

// The forecaster: four dials, a month and a year of numbers, the EBITDA
// curve, and every assumption behind it in the open. Dials and
// assumptions are saved in the same document as the Expenses page.

export default function Forecaster({ seed }: { seed: Seed }) {
  const [doc, setDoc] = useState<OpexDoc | null>(null);
  const [dials, setDials] = useState<Dials | null>(null);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [fatal, setFatal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/opex");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFatal(data.error ?? "Could not load the expenses sheet, which the forecast runs off.");
        return;
      }
      const d = normalizeOpex(data.data) ?? starterOpex();
      setDoc(d);
      const saved = (d.forecast ?? null) as { dials?: unknown; assumptions?: unknown } | null;
      if (saved && (saved.dials || saved.assumptions)) {
        setDials(normalizeDials(saved.dials));
        setAssumptions(normalizeAssumptions(saved.assumptions));
      } else {
        const s = seededState(seed);
        setDials(s.dials);
        setAssumptions(s.assumptions);
      }
      setFatal("");
    } catch {
      setFatal("Could not load the numbers — check your connection and reload.");
    }
  }, [seed]);

  useEffect(() => {
    load();
  }, [load]);

  function setDial(patch: Partial<Dials>) {
    setDials((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
    setSaveMsg("");
  }
  function setAssumption(patch: Partial<Assumptions>) {
    setAssumptions((a) => (a ? { ...a, ...patch } : a));
    setDirty(true);
    setSaveMsg("");
  }
  function reseed() {
    const s = seededState(seed);
    setDials(s.dials);
    setAssumptions(s.assumptions);
    setDirty(true);
    setSaveMsg("");
  }

  async function save() {
    if (!doc || !dials || !assumptions) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/opex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...doc, forecast: { dials, assumptions } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDirty(false);
        setSaveMsg("Saved ✓");
      } else {
        setSaveMsg(data.error ?? "Didn't save.");
      }
    } catch {
      setSaveMsg("Didn't save — check your connection.");
    }
    setSaving(false);
  }

  if (fatal) return <p className="card border-rust/50 bg-rust/10 p-5 text-sm leading-relaxed">{fatal}</p>;
  if (!doc || !dials || !assumptions) return <p className="text-sm text-faded">Loading…</p>;

  const operating = planPerMonth(doc, { operatingOnly: true });
  const belowLine = planPerMonth(doc) - operating;
  const overhead = { operating, belowLine };
  const r = run(dials, assumptions, overhead);
  const noCost = !assumptions.shirtCost || Number(assumptions.shirtCost) <= 0;

  return (
    <div className="space-y-10 pb-28">
      {/* ---------- 1. THE DIALS ---------- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">1 · The dials</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">What are you expecting to sell?</h2>
          </div>
          <button type="button" onClick={reseed} className="btn btn-ghost py-1.5 text-xs">
            Reset to what the site knows
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Dial
            label="Shirts a month"
            value={`${Math.round(dials.shirts)}`}
            hint={
              seed.shirtsPerMonth
                ? `Lately you've averaged ${seed.shirtsPerMonth.toFixed(1)} a month`
                : "No sales on record yet, so this one is a guess"
            }
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.min(100, dials.shirts)}
                onChange={(e) => setDial({ shirts: Number(e.target.value) })}
                className="h-2 w-full accent-[#cf9440]"
                aria-label="Shirts a month"
              />
              <input
                className="input w-20 py-1.5 text-sm"
                inputMode="numeric"
                value={String(Math.round(dials.shirts))}
                onChange={(e) => setDial({ shirts: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })}
                aria-label="Shirts a month, typed"
              />
            </div>
          </Dial>

          <Dial
            label="Shipped vs sold in person"
            value={`${Math.round(dials.onlinePct)}% shipped`}
            hint={`${r.online.toFixed(0)} shipped · ${r.inPerson.toFixed(0)} at a booth${
              seed.onlineSharePct !== null ? ` · so far it's run ${seed.onlineSharePct.toFixed(0)}% shipped` : ""
            }`}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={dials.onlinePct}
              onChange={(e) => setDial({ onlinePct: Number(e.target.value) })}
              className="h-2 w-full accent-[#cf9440]"
              aria-label="Share shipped"
            />
          </Dial>

          <Dial
            label="Average shirt price"
            value={amount(dials.price)}
            hint={
              seed.price
                ? `Your live price is ${amount(seed.price)}${
                    seed.avgPriceSold ? ` · shirts have actually gone for ${amount(seed.avgPriceSold)}` : ""
                  }`
                : "No products loaded"
            }
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={20}
                max={80}
                step={1}
                value={Math.min(80, Math.max(20, dials.price))}
                onChange={(e) => setDial({ price: Number(e.target.value) })}
                className="h-2 w-full accent-[#cf9440]"
                aria-label="Average shirt price"
              />
              <input
                className="input w-20 py-1.5 text-sm"
                inputMode="decimal"
                value={String(dials.price)}
                onChange={(e) => setDial({ price: Math.max(0, Number(e.target.value) || 0) })}
                aria-label="Average shirt price, typed"
              />
            </div>
          </Dial>

          <Dial
            label="Bandanas attached"
            value={`${Math.round(dials.bandanaPct)} per 100 shirts`}
            hint={`${r.bandanas.toFixed(1)} bandanas a month at ${amount(Number(assumptions.bandanaPrice) || 0)} each`}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={dials.bandanaPct}
              onChange={(e) => setDial({ bandanaPct: Number(e.target.value) })}
              className="h-2 w-full accent-[#cf9440]"
              aria-label="Bandanas per 100 shirts"
            />
          </Dial>
        </div>

        {noCost && (
          <p className="mt-4 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm leading-relaxed">
            No cost per shirt yet, so every margin below reads as pure profit. Fill in the COGS page
            (blanks, materials, and a type on each design) or type a cost into the assumptions at the
            bottom.
          </p>
        )}
      </section>

      {/* ---------- 2. THE NUMBERS ---------- */}
      <section>
        <p className="kicker">2 · At {Math.round(dials.shirts)} shirts a month</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Where the money lands</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Gross margin"
            value={r.grossMargin === null ? "—" : `${r.grossMargin.toFixed(0)}%`}
            note={`${amount(r.gross.month)} a month on ${amount(r.revenue.month)} of sales`}
            tone={r.grossMargin !== null && r.grossMargin >= 50 ? "gold" : "plain"}
          />
          <Stat
            label="EBITDA"
            value={amount(r.ebitda.month)}
            note={`${amount(r.ebitda.year)} a year${r.ebitdaMargin === null ? "" : ` · ${r.ebitdaMargin.toFixed(0)}% of sales`}`}
            tone={r.ebitda.month >= 0 ? "gold" : "rust"}
          />
          <Stat
            label="Covers itself at"
            value={r.breakEven === null ? "—" : `${Math.ceil(r.breakEven)} shirts`}
            note={
              r.breakEven === null
                ? "Each shirt loses money at these numbers"
                : `a month. You're ${
                    dials.shirts >= r.breakEven
                      ? `${Math.max(0, Math.round(dials.shirts - r.breakEven))} above it`
                      : `${Math.ceil(r.breakEven - dials.shirts)} short`
                  }`
            }
            tone={r.breakEven !== null && dials.shirts >= r.breakEven ? "gold" : "plain"}
          />
        </div>

        <div className="card mt-4 overflow-x-auto p-5">
          <table className="w-full text-sm sm:min-w-[520px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-faded">
                <th className="pb-2 text-left font-medium">Per month</th>
                <th className="pb-2 text-right font-medium">Month</th>
                <th className="hidden pb-2 text-right font-medium sm:table-cell">Year</th>
              </tr>
            </thead>
            <tbody>
              <Row label={`Shirts (${Math.round(dials.shirts)} × ${amount(dials.price)})`} v={r.shirtRevenue} />
              {r.bandanas > 0 && <Row label="Bandanas" v={r.bandanaRevenue} />}
              <Row label={`Shipping charged (${r.orders.toFixed(1)} orders)`} v={r.shippingRevenue} />
              <Row label="Revenue" v={r.revenue} strong />
              <Row label="Cost of goods" v={r.cogs} negative />
              <Row
                label="Gross profit"
                v={r.gross}
                strong
                gold
                suffix={r.grossMargin === null ? "" : `${r.grossMargin.toFixed(0)}%`}
              />
              <Row label="Card fees" v={r.fees} negative />
              <Row label="Postage" v={r.postage} negative />
              <Row label="Operating expenses" v={r.opex} negative />
              <Row
                label="EBITDA"
                v={r.ebitda}
                strong
                gold
                suffix={r.ebitdaMargin === null ? "" : `${r.ebitdaMargin.toFixed(0)}%`}
              />
              {belowLine > 0 && (
                <>
                  <Row label="Interest, taxes and depreciation" v={r.belowLine} negative />
                  <Row label="Profit after those" v={r.net} strong />
                </>
              )}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-faded">
            Per shirt: {amount(r.perShirt.revenue)} in, {amount(r.perShirt.cogs)} of that is cost,{" "}
            {amount(r.perShirt.contribution)} left over to put against the{" "}
            {amount(operating)} of overhead a month. Nothing here pays anyone for their time —
            owner labour isn&apos;t a cost on this page or the COGS one.
          </p>
        </div>
      </section>

      {/* ---------- 3. THE CURVE ---------- */}
      <Curve dials={dials} assumptions={assumptions} overhead={overhead} onPick={(n) => setDial({ shirts: n })} />

      {/* ---------- 4. ASSUMPTIONS ---------- */}
      <section>
        <p className="kicker">4 · The assumptions</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Every number behind those figures</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
          Each one starts from whatever the site knows. Type over anything — it only changes the
          forecast, never the store.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-display text-lg font-semibold">Making and shipping</h3>
            <div className="mt-3 space-y-3">
              <Field
                label="Cost to make a shipped shirt"
                value={assumptions.shirtCost}
                onChange={(v) => setAssumption({ shirtCost: v })}
                source={seed.shirtCost !== null ? `COGS sheet · ${seed.costedDesigns} design${seed.costedDesigns === 1 ? "" : "s"} averaged` : "Nothing on the COGS page yet"}
              />
              <Field
                label="Same shirt sold at a booth"
                value={assumptions.shirtCostInPerson}
                onChange={(v) => setAssumption({ shirtCostInPerson: v })}
                source={seed.shirtCostInPerson !== null ? "COGS sheet, minus the mailer and label" : "Nothing on the COGS page yet"}
              />
              <Field
                label="Cost to make a bandana"
                value={assumptions.bandanaCost}
                onChange={(v) => setAssumption({ bandanaCost: v })}
                source={seed.bandanaCost !== null ? "COGS sheet" : "Not costed yet"}
              />
              <Field
                label="Shirts in an average order"
                value={assumptions.shirtsPerOrder}
                onChange={(v) => setAssumption({ shirtsPerOrder: v })}
                source={seed.shirtsPerOrder !== null ? "Your shipped orders" : "No shipped orders yet — assumed 1"}
              />
              <Field
                label="Postage per shipped order"
                value={assumptions.postage}
                onChange={(v) => setAssumption({ postage: v })}
                source={seed.postagePerOrder !== null ? "Labels you've actually bought" : "No labels bought yet — assumed the same $7 you charge"}
              />
              <Field
                label="Shipping charged per order"
                value={assumptions.shipping}
                onChange={(v) => setAssumption({ shipping: v })}
                source="Site setting (SHIPPING_CENTS)"
              />
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-display text-lg font-semibold">Fees, breakage and the rest</h3>
            <div className="mt-3 space-y-3">
              <Field
                label="Bandana price with a shirt"
                value={assumptions.bandanaPrice}
                onChange={(v) => setAssumption({ bandanaPrice: v })}
                source="The pair price less the shirt. On its own a bandana is more"
              />
              <Field
                label="Card fee online (%)"
                value={assumptions.onlineCardPct}
                onChange={(v) => setAssumption({ onlineCardPct: v })}
                source="Stripe standard: 2.9% + 30¢"
              />
              <Field
                label="Card fee online (fixed $)"
                value={assumptions.onlineCardFixed}
                onChange={(v) => setAssumption({ onlineCardFixed: v })}
                source="Per paid order. Invoices add 0.4%"
              />
              <Field
                label="Card fee in person (%)"
                value={assumptions.inPersonCardPct}
                onChange={(v) => setAssumption({ inPersonCardPct: v })}
                source="Tap to Pay: 2.7% + 5¢"
              />
              <Field
                label="Card fee in person (fixed $)"
                value={assumptions.inPersonCardFixed}
                onChange={(v) => setAssumption({ inPersonCardFixed: v })}
                source="Per tap"
              />
              <Field
                label="Booth sales paid by card (%)"
                value={assumptions.cardShareInPerson}
                onChange={(v) => setAssumption({ cardShareInPerson: v })}
                source={seed.cardShareInPersonPct !== null ? "How Quick sale says people have paid" : "No booth sales recorded yet"}
              />
              <Field
                label="Shirts ruined in the making (%)"
                value={assumptions.spoilPct}
                onChange={(v) => setAssumption({ spoilPct: v })}
                source="Nothing tracks this — the blank still costs you"
              />
              <Field
                label="Shipped shirts that come back for a swap (%)"
                value={assumptions.swapPct}
                onChange={(v) => setAssumption({ swapPct: v })}
                source="A swap is a second shirt made and a second label bought"
              />
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-faded">
          What this doesn&apos;t model: sales tax (the site doesn&apos;t collect any, and if it did
          it would be a pass through, not revenue), giveaway shirts, custom pieces priced by quote,
          and anyone&apos;s labour. Overhead comes from the Expenses page as a flat monthly number,
          so it doesn&apos;t grow with volume — if selling twice as many means a second booth fee or
          a bigger Vercel plan, add that there first.
        </p>
      </section>

      {/* ---------- SAVE BAR ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-bone/10 bg-inkdeep/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-faded">
            {saveMsg || (dirty ? "Unsaved changes" : "Dials and assumptions saved")}
          </p>
          <button type="button" onClick={save} disabled={saving || !dirty} className={"btn " + (dirty ? "btn-gold" : "btn-ghost")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- little pieces ----------

function Dial({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-faded">{label}</p>
        <p className="font-display text-xl font-semibold text-goldlight">{value}</p>
      </div>
      <div className="mt-3">{children}</div>
      <p className="mt-2 text-xs leading-relaxed text-faded">{hint}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "gold" | "rust" | "plain";
}) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wider text-faded">{label}</p>
      <p
        className={
          "mt-1 font-display text-3xl font-semibold " +
          (tone === "gold" ? "text-goldlight" : tone === "rust" ? "text-rust" : "")
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-faded">{note}</p>
    </div>
  );
}

function Row({
  label,
  v,
  strong,
  gold,
  negative,
  suffix,
}: {
  label: string;
  v: { month: number; year: number };
  strong?: boolean;
  gold?: boolean;
  negative?: boolean;
  suffix?: string;
}) {
  const cell = "py-1.5 text-right whitespace-nowrap " + (gold ? "text-goldlight " : "");
  // On a phone the year column would push the numbers off the screen, so it
  // hides and the cards above carry the yearly figure instead.
  const yearCell = "hidden sm:table-cell " + cell;
  return (
    <tr className={strong ? "border-t border-bone/10 font-semibold" : ""}>
      <td className={"py-1.5 pr-3 " + (strong ? "" : "text-faded")}>
        {label}
        {suffix && <span className="ml-2 text-xs font-normal text-faded">{suffix}</span>}
      </td>
      <td className={cell}>{negative ? `− ${amount(v.month)}` : amount(v.month)}</td>
      <td className={yearCell}>{negative ? `− ${amount(v.year)}` : amount(v.year)}</td>
    </tr>
  );
}

function Field({
  label,
  value,
  onChange,
  source,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm">{label}</p>
        <p className="text-[0.7rem] leading-snug text-faded">{source}</p>
      </div>
      <input
        className="input w-24 py-1.5 text-sm"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}

// The EBITDA curve: one line, a zero line, and a dot where the dial sits.
// Hovering reads a point off it; clicking moves the dial there.
function Curve({
  dials,
  assumptions,
  overhead,
  onPick,
}: {
  dials: Dials;
  assumptions: Assumptions;
  overhead: { operating: number; belowLine: number };
  onPick: (shirts: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 220;
  const L = 60;
  const R = 18;
  const T = 16;
  const B = 34;

  const here = run(dials, assumptions, overhead);
  const top = Math.max(
    10,
    Math.ceil(Math.max(dials.shirts * 2, (here.breakEven ?? 0) * 1.6, 10) / 5) * 5
  );
  const pts = buildCurve(dials, assumptions, overhead, top, 48);
  const values = pts.map((p) => p.ebitda);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = (hi - lo) * 0.12 || 10;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const x = (n: number) => L + (n / top) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yLo) / (yHi - yLo)) * (H - T - B);

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.shirts).toFixed(1)},${y(p.ebitda).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const atShirts = hover ?? dials.shirts;
  const atValue = run({ ...dials, shirts: atShirts }, assumptions, overhead).ebitda.month;
  const markX = x(Math.min(atShirts, top));
  const markY = y(atValue);
  const beX = here.breakEven !== null && here.breakEven <= top ? x(here.breakEven) : null;

  function shirtsAt(clientX: number): number {
    const el = svgRef.current;
    if (!el) return dials.shirts;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const n = ((px - L) / (W - L - R)) * top;
    return Math.max(0, Math.min(top, Math.round(n)));
  }

  const ticks = [0, Math.round(top / 2), top];
  // Round money ticks to something a person would say out loud, and
  // always label zero — it's the line that matters here.
  const step = niceStep((yHi - yLo) / 2);
  const yTicks = [...new Set([roundTo(yHi - pad / 2, step), 0, roundTo(yLo + pad / 2, step)])].filter(
    (v) => v <= yHi && v >= yLo
  );

  return (
    <section>
      <p className="kicker">3 · The curve</p>
      <h2 className="mt-1 font-display text-2xl font-semibold">EBITDA as the shirts add up</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
        Same mix, same costs, just more of them. Where the line crosses zero is the month paying for
        itself. Hover to read a point, click to move the dial there.
      </p>
      <div className="card mt-4 p-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair select-none"
          style={{ maxHeight: 260 }}
          role="img"
          aria-label={`EBITDA from 0 to ${top} shirts a month. Break even at ${
            here.breakEven === null ? "never, at these costs" : `${Math.ceil(here.breakEven)} shirts`
          }.`}
          onMouseMove={(e) => setHover(shirtsAt(e.clientX))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => onPick(shirtsAt(e.clientX))}
        >
          {/* y grid, kept quiet */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                strokeWidth={1}
                className="text-faded"
                opacity={0.14}
              />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-current text-faded" fontSize={11} opacity={0.8}>
                {shortMoney(v)}
              </text>
            </g>
          ))}

          {/* zero */}
          <line
            x1={L}
            x2={W - R}
            y1={zeroY}
            y2={zeroY}
            stroke="currentColor"
            className="text-faded"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={0.55}
          />

          {/* break even */}
          {beX !== null && (
            <>
              <line x1={beX} x2={beX} y1={T} y2={H - B} stroke="currentColor" className="text-faded" strokeWidth={1} strokeDasharray="3 4" opacity={0.5} />
              <text x={beX + 5} y={T + 12} className="fill-current text-faded" fontSize={11}>
                covers itself
              </text>
            </>
          )}

          {/* the line */}
          <path d={path} fill="none" stroke="var(--color-gold)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* x ticks */}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="fill-current text-faded" fontSize={11} opacity={0.85}>
              {t}
            </text>
          ))}
          <text x={(L + W - R) / 2} y={H - 1} textAnchor="middle" className="fill-current text-faded" fontSize={10} opacity={0.7}>
            shirts a month
          </text>

          {/* where you are */}
          <line x1={markX} x2={markX} y1={T} y2={H - B} stroke="currentColor" className="text-faded" strokeWidth={1} opacity={hover === null ? 0 : 0.35} />
          <circle
            cx={markX}
            cy={markY}
            r={5.5}
            fill={atValue >= 0 ? "var(--color-gold)" : "var(--color-rust)"}
            stroke="var(--color-panel)"
            strokeWidth={2}
          />
          <text
            x={Math.min(markX + 10, W - R - 92)}
            y={Math.max(T + 12, markY - 10)}
            className="fill-current"
            fontSize={12}
            fontWeight={600}
          >
            {Math.round(atShirts)} shirts · {amount(atValue)}
          </text>
        </svg>
      </div>
    </section>
  );
}

// 1, 2 or 5 × a power of ten — the steps people actually read
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const rest = rough / mag;
  const pick = rest >= 5 ? 5 : rest >= 2 ? 2 : 1;
  return pick * mag;
}

function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function shortMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(abs)}`;
}
