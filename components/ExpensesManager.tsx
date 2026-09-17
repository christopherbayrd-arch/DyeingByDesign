"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  FREQS,
  MONTHS,
  actualKey,
  categoryInfo,
  ebitdaFor,
  amount,
  monthLines,
  monthlyAverage,
  newId,
  normalizeOpex,
  planPerMonth,
  profitPerShirt,
  shirtsPerMonth,
  starterOpex,
  yearMonths,
  yearTotals,
  ymKey,
  type Freq,
  type OneOff,
  type OpexDoc,
  type Recurring,
  type SalesMonth,
} from "@/lib/opex";

// Operating expenses: the standing costs, the one offs, what lands in each
// month, and what's left over once the shirts have paid for themselves.
// Everything is one document; Save writes the whole thing.

export default function ExpensesManager({ sales }: { sales: SalesMonth[] }) {
  const [doc, setDoc] = useState<OpexDoc | null>(null);
  const [fatal, setFatal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const now = useMemo(() => new Date(), []);
  const thisYear = now.getFullYear();
  const [year, setYear] = useState(thisYear);
  const [openMonth, setOpenMonth] = useState<number | null>(now.getMonth() + 1);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/opex");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFatal(data.error ?? "Could not load the expenses sheet.");
        return;
      }
      setDoc(normalizeOpex(data.data) ?? starterOpex());
      setFatal("");
    } catch {
      setFatal("Could not load the expenses sheet — check your connection and reload.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update(fn: (d: OpexDoc) => OpexDoc) {
    setDoc((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
    setSaveMsg("");
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/opex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
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

  // ---- editing ----
  function setRow(id: string, patch: Partial<Recurring>) {
    update((d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }
  function addRow(category: string) {
    update((d) => ({
      ...d,
      recurring: [
        ...d.recurring,
        { id: newId(), name: "", category, cost: "", freq: "monthly" as Freq, month: 1, active: true, note: "" },
      ],
    }));
  }
  function removeRow(id: string) {
    update((d) => ({
      ...d,
      recurring: d.recurring.filter((r) => r.id !== id),
      actuals: Object.fromEntries(Object.entries(d.actuals).filter(([k]) => !k.startsWith(`${id}:`))),
    }));
  }
  function setActual(id: string, ym: string, value: string) {
    update((d) => ({ ...d, actuals: { ...d.actuals, [actualKey(id, ym)]: value } }));
  }
  function clearActual(id: string, ym: string) {
    update((d) => {
      const actuals = { ...d.actuals };
      delete actuals[actualKey(id, ym)];
      return { ...d, actuals };
    });
  }
  function setOneOff(id: string, patch: Partial<OneOff>) {
    update((d) => ({ ...d, oneOffs: d.oneOffs.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }
  function addOneOff(date: string, category = "markets") {
    update((d) => ({
      ...d,
      oneOffs: [...d.oneOffs, { id: newId(), date, name: "", category, cost: "", note: "" }],
    }));
  }
  function removeOneOff(id: string) {
    update((d) => ({ ...d, oneOffs: d.oneOffs.filter((o) => o.id !== id) }));
  }

  if (fatal) {
    return <p className="card border-rust/50 bg-rust/10 p-5 text-sm leading-relaxed">{fatal}</p>;
  }
  if (!doc) {
    return <p className="text-sm text-faded">Loading…</p>;
  }

  // ---- the numbers ----
  const plan = planPerMonth(doc);
  const planOperating = planPerMonth(doc, { operatingOnly: true });
  const months = yearMonths(doc, year);
  const yTot = yearTotals(doc, year);
  const salesByMonth = new Map(sales.map((s) => [s.key, s]));
  const salesThisYear = sales.filter((s) => s.key.startsWith(`${year}-`));
  // The current year only counts up to this month — charges scheduled for
  // December shouldn't be weighed against sales that haven't happened yet.
  const through = year === thisYear ? now.getMonth() + 1 : 12;
  const partYear = through < 12;
  const ytd = months.slice(0, through).reduce(
    (a, m) => ({ total: a.total + m.total, operating: a.operating + m.operating, belowLine: a.belowLine + m.belowLine }),
    { total: 0, operating: 0, belowLine: 0 }
  );
  const salesToDate = salesThisYear.filter((s) => Number(s.key.slice(5)) <= through);
  const eb = ebitdaFor(salesToDate, ytd.operating);
  const throughLabel = partYear ? `${year} through ${MONTHS[through - 1]}` : `${year}`;
  const pps = profitPerShirt(doc, salesThisYear.length > 0 ? salesThisYear : sales);
  const spm = shirtsPerMonth(doc, salesThisYear.length > 0 ? salesThisYear : sales);
  const breakEven = pps.value > 0 ? planOperating / pps.value : null;
  const pace = Math.max(1, Math.round(spm.value));
  const overheadPerShirt = spm.value > 0 ? planOperating / pace : null;
  const years = [...new Set([...sales.map((s) => Number(s.key.slice(0, 4))), thisYear, thisYear - 1])]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  const label = (m: number) => MONTHS[m - 1];

  return (
    <div className="space-y-10 pb-28">
      {/* ---------- 1. THE MONTH ---------- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">1 · The month</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">What it costs to keep the lights on</h2>
          </div>
          <label className="text-sm text-faded">
            Year{" "}
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input ml-1 w-28 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-faded">Every month</p>
            <p className="mt-1 font-display text-3xl font-semibold text-goldlight">{amount(plan)}</p>
            <p className="mt-1 text-xs leading-relaxed text-faded">
              The standing costs, spread out. {amount(plan * 12)} a year.
              {plan !== planOperating && ` ${amount(planOperating)} of it counts against EBITDA.`}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-faded">
              {partYear ? `${year} so far` : `${year} total`}
            </p>
            <p className="mt-1 font-display text-3xl font-semibold">{amount(ytd.total)}</p>
            <p className="mt-1 text-xs leading-relaxed text-faded">
              What has actually landed {partYear ? `through ${MONTHS[through - 1]}` : `in ${year}`}, one
              offs included — {amount(ytd.total / through)} a month.
              {partYear && ` Full year as planned: ${amount(yTot.total)}.`}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-faded">Covers itself at</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {breakEven === null ? "—" : `${Math.ceil(breakEven)} shirts`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-faded">
              {breakEven === null ? (
                "Record a sale or two and this fills itself in."
              ) : (
                <>
                  a month, at {amount(pps.value)} left over per shirt
                  {pps.source === "sales" ? " (your real average)" : " (your estimate)"}.
                  {overheadPerShirt !== null &&
                    ` At ${pace} shirts a month, overhead runs ${amount(overheadPerShirt)} a shirt.`}
                </>
              )}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-faded">EBITDA {year}</p>
            <p
              className={
                "mt-1 font-display text-3xl font-semibold " +
                (eb.ebitda >= 0 ? "text-goldlight" : "text-rust")
              }
            >
              {salesToDate.length === 0 ? "—" : amount(eb.ebitda)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-faded">
              {salesToDate.length === 0
                ? `No sales recorded in ${year} yet.`
                : `${eb.margin === null ? "—" : `${eb.margin.toFixed(0)}%`} of ${amount(eb.revenue)} in sales${partYear ? `, through ${MONTHS[through - 1]}` : ""}. Before the owner takes anything out.`}
            </p>
          </div>
        </div>

        {/* the stack, spelled out */}
        {salesToDate.length > 0 && (
          <div className="card mt-4 p-5">
            <p className="kicker">How that works out</p>
            <dl className="mt-3 max-w-lg space-y-1.5 text-sm">
              <Line label="Shirt sales" value={amount(eb.revenue)} />
              <Line label="What those shirts cost to make" value={`− ${amount(eb.cogs)}`} />
              <Line label="Gross profit" value={amount(eb.gross)} strong />
              <Line label="Card fees and postage, less shipping charged" value={`− ${amount(eb.sellingCosts)}`} />
              <Line label={`Operating expenses (${throughLabel})`} value={`− ${amount(eb.opex)}`} />
              <Line label="EBITDA" value={amount(eb.ebitda)} strong gold />
            </dl>
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-faded">
              Earnings before interest, taxes, depreciation and amortization — what the business
              itself earns before financing and the tax bill. Anything filed under{" "}
              <em>Interest, taxes and depreciation</em> below is left out of it on purpose
              {ytd.belowLine > 0 ? ` (${amount(ytd.belowLine)} so far)` : ""}. Money the owner
              draws out isn&apos;t an expense, so it isn&apos;t in here either.
              {eb.uncosted > 0 &&
                ` Heads up: ${eb.uncosted} shirt${eb.uncosted === 1 ? "" : "s"} sold this year ${eb.uncosted === 1 ? "has" : "have"} no cost frozen yet, so COGS is light until the Sales history is costed.`}
            </p>
          </div>
        )}
      </section>

      {/* ---------- 2. MONTH BY MONTH ---------- */}
      <section>
        <p className="kicker">2 · Month by month</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">{year}, as it actually lands</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
          A yearly bill shows up in the month it&apos;s charged, not smeared across twelve.
          Open a month to type what really went out — a typed number wins over the plan, and{" "}
          <em>reset</em> puts the plan back.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faded">
                <th className="pb-2 pr-2 font-medium">Month</th>
                <th className="pb-2 pr-2 text-right font-medium">Expenses</th>
                <th className="pb-2 pr-2 text-right font-medium">Sales</th>
                <th className="pb-2 pr-2 text-right font-medium">Gross profit</th>
                <th className="pb-2 pr-2 text-right font-medium">EBITDA</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const s = salesByMonth.get(m.ym);
                const ebitda = s ? s.net - m.operating : -m.operating;
                const open = openMonth === m.month;
                const isNow = year === thisYear && m.month === now.getMonth() + 1;
                const lines = monthLines(doc, year, m.month);
                return (
                  <Fragment key={m.ym}>
                    <tr
                      className={
                        "border-t border-bone/10 align-middle " + (isNow ? "bg-gold/5" : "")
                      }
                    >
                      <td className="py-2 pr-2 font-medium">
                        {label(m.month)}
                        {isNow && <span className="ml-2 text-[0.65rem] uppercase tracking-wider text-gold">now</span>}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {m.total > 0 ? amount(m.total) : <span className="text-faded">—</span>}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {s ? amount(s.revenue) : <span className="text-faded">—</span>}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {s ? amount(s.gross) : <span className="text-faded">—</span>}
                      </td>
                      <td
                        className={
                          "py-2 pr-2 text-right font-semibold whitespace-nowrap " +
                          (!s && m.total === 0 ? "text-faded" : ebitda >= 0 ? "text-goldlight" : "text-rust")
                        }
                      >
                        {!s && m.total === 0 ? "—" : amount(ebitda)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setOpenMonth(open ? null : m.month)}
                          className="text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
                        >
                          {open ? "Close" : "Open"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-bone/10">
                        <td colSpan={6} className="p-0">
                          <div className="bg-black/20 p-4">
                            <p className="text-xs uppercase tracking-wider text-faded">
                              What hits in {label(m.month)} {year}
                            </p>
                            {lines.length === 0 && (
                              <p className="mt-2 text-sm text-faded">
                                Nothing scheduled. Add a cost below, or log a purchase here.
                              </p>
                            )}
                            <div className="mt-2 space-y-1.5">
                              {lines.map((l) => {
                                const oneOff = l.kind === "oneoff";
                                return (
                                  <div key={l.kind + l.id} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="min-w-[10rem] flex-1 truncate">
                                      {l.name}
                                      <span className="ml-2 text-xs text-faded">
                                        {categoryInfo(l.category).name}
                                        {oneOff ? " · one off" : ""}
                                      </span>
                                    </span>
                                    <input
                                      className="input w-24 py-1 text-sm"
                                      inputMode="decimal"
                                      value={
                                        oneOff
                                          ? (doc.oneOffs.find((o) => o.id === l.id)?.cost ?? "")
                                          : (doc.actuals[actualKey(l.id, m.ym)] ?? "")
                                      }
                                      placeholder={l.planned > 0 ? l.planned.toFixed(2) : "0.00"}
                                      onChange={(e) =>
                                        oneOff
                                          ? setOneOff(l.id, { cost: e.target.value })
                                          : setActual(l.id, m.ym, e.target.value)
                                      }
                                      aria-label={`${l.name} in ${label(m.month)} ${year}`}
                                    />
                                    {!oneOff && l.overridden && (
                                      <button
                                        type="button"
                                        onClick={() => clearActual(l.id, m.ym)}
                                        className="text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
                                        title={`Back to the plan: ${amount(l.planned)}`}
                                      >
                                        reset
                                      </button>
                                    )}
                                    {oneOff && (
                                      <button
                                        type="button"
                                        onClick={() => removeOneOff(l.id)}
                                        className="text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                                      >
                                        remove
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => addOneOff(`${m.ym}-15`)}
                                className="btn btn-ghost py-1.5 text-xs"
                              >
                                + Log a purchase in {label(m.month)}
                              </button>
                              <p className="text-sm">
                                <span className="text-faded">Month total </span>
                                <span className="font-semibold text-goldlight">{amount(m.total)}</span>
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="border-t border-bone/20 font-semibold">
                <td className="py-2 pr-2 whitespace-nowrap">{throughLabel}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{amount(ytd.total)}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {salesToDate.length > 0 ? amount(eb.revenue) : <span className="text-faded">—</span>}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {salesToDate.length > 0 ? amount(eb.gross) : <span className="text-faded">—</span>}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap text-goldlight">
                  {salesToDate.length > 0 ? amount(eb.ebitda) : <span className="text-faded">—</span>}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {partYear && (
          <p className="mt-2 text-xs text-faded">
            Totals stop at {MONTHS[through - 1]} so scheduled bills aren&apos;t weighed against sales that
            haven&apos;t happened. All twelve months as planned come to {amount(yTot.total)}.
          </p>
        )}
      </section>

      {/* ---------- 3. THE STANDING COSTS ---------- */}
      <section>
        <p className="kicker">3 · The standing costs</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">What the business pays for, and how often</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
          These came prefilled with what a shirt business usually pays. Put a number on the ones
          that apply, switch off or remove the ones that don&apos;t — a row with no number counts
          as nothing. Blanks, bleach, mailers and anything else a single shirt uses belong on the
          COGS page instead, or they get counted twice.
        </p>

        <div className="mt-5 space-y-5">
          {CATEGORIES.map((cat) => {
            const rows = doc.recurring.filter((r) => r.category === cat.key);
            const per = rows.reduce((a, r) => a + monthlyAverage(r), 0);
            return (
              <div key={cat.key} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      {cat.name}
                      {!cat.ebitda && (
                        <span className="ml-2 rounded-full border border-bone/20 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-faded">
                          below EBITDA
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-faded">{cat.blurb}</p>
                  </div>
                  <p className="text-sm whitespace-nowrap">
                    <span className="font-semibold text-goldlight">{amount(per)}</span>
                    <span className="text-faded"> /mo</span>
                  </p>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-faded">
                        <th className="pb-2 pr-2 font-medium">What it is</th>
                        <th className="pb-2 pr-2 font-medium">Cost ($)</th>
                        <th className="pb-2 pr-2 font-medium">How often</th>
                        <th className="pb-2 pr-2 font-medium">Billed</th>
                        <th className="pb-2 pr-2 text-center font-medium">On</th>
                        <th className="pb-2 pr-2 text-right font-medium">Per month</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-2 text-faded">Nothing here yet.</td>
                        </tr>
                      )}
                      {rows.map((r) => {
                        const avg = monthlyAverage(r);
                        return (
                          <tr key={r.id} className={"align-middle " + (r.active ? "" : "opacity-50")}>
                            <td className="py-1 pr-2">
                              <input
                                className="input py-1.5"
                                placeholder="What is it"
                                value={r.name}
                                onChange={(e) => setRow(r.id, { name: e.target.value })}
                              />
                              {r.note && <p className="mt-0.5 text-[0.7rem] leading-snug text-faded">{r.note}</p>}
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                className="input w-24 py-1.5"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={r.cost}
                                onChange={(e) => setRow(r.id, { cost: e.target.value })}
                                aria-label={`${r.name || "This cost"} in dollars`}
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <select
                                className="input w-44 py-1.5"
                                value={r.freq}
                                onChange={(e) => setRow(r.id, { freq: e.target.value as Freq })}
                                aria-label={`How often ${r.name || "this"} is billed`}
                              >
                                {FREQS.map((f) => (
                                  <option key={f.key} value={f.key}>{f.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1 pr-2">
                              {r.freq === "monthly" ? (
                                <span className="text-faded">every month</span>
                              ) : (
                                <select
                                  className="input w-24 py-1.5"
                                  value={r.month}
                                  onChange={(e) => setRow(r.id, { month: Number(e.target.value) })}
                                  aria-label={`Which month ${r.name || "this"} is billed`}
                                >
                                  {MONTHS.map((mo, i) => (
                                    <option key={mo} value={i + 1}>{mo}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-1 pr-2 text-center">
                              <input
                                type="checkbox"
                                checked={r.active}
                                onChange={(e) => setRow(r.id, { active: e.target.checked })}
                                className="h-4 w-4 accent-[#cf9440]"
                                aria-label={`${r.name || "This cost"} is active`}
                              />
                            </td>
                            <td className="py-1 pr-2 text-right font-semibold text-goldlight whitespace-nowrap">
                              {avg > 0 ? amount(avg) : <span className="font-normal text-faded">—</span>}
                            </td>
                            <td className="py-1 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(r.id)}
                                className="text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                                aria-label={`Remove ${r.name || "this cost"}`}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={() => addRow(cat.key)} className="btn btn-ghost mt-3 py-1.5 text-xs">
                  + Add a cost
                </button>
              </div>
            );
          })}
        </div>

        <div className="card mt-5 p-5">
          <p className="kicker">If there are no sales yet</p>
          <div className="mt-3 flex flex-wrap gap-5">
            <label className="text-sm text-faded">
              Left over per shirt ($)
              <input
                className="input mt-1 block w-32 py-1.5"
                inputMode="decimal"
                placeholder="35.00"
                value={doc.profitPerShirt}
                onChange={(e) => update((d) => ({ ...d, profitPerShirt: e.target.value }))}
              />
            </label>
            <label className="text-sm text-faded">
              Shirts a month
              <input
                className="input mt-1 block w-32 py-1.5"
                inputMode="decimal"
                placeholder="12"
                value={doc.shirtsPerMonth}
                onChange={(e) => update((d) => ({ ...d, shirtsPerMonth: e.target.value }))}
              />
            </label>
          </div>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-faded">
            Only used until there are real sales to read. Once shirts are going through the Sales
            history, the breakeven card uses what they actually cleared instead.
          </p>
        </div>
      </section>

      {/* ---------- 4. ONE OFFS ---------- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">4 · One off purchases</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Things you bought once</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
              A booth fee, a pop up tent, a trademark filing. Each one lands in the month it was
              paid, so it shows up in that month above without pretending it happens every year.
            </p>
          </div>
          <button type="button" onClick={() => addOneOff(`${ymKey(year, Math.min(12, now.getMonth() + 1))}-15`)} className="btn btn-ghost">
            + Log a purchase
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faded">
                <th className="pb-2 pr-2 font-medium">Date</th>
                <th className="pb-2 pr-2 font-medium">What it was</th>
                <th className="pb-2 pr-2 font-medium">Category</th>
                <th className="pb-2 pr-2 font-medium">Cost ($)</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {doc.oneOffs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-faded">
                    Nothing logged yet.
                  </td>
                </tr>
              )}
              {[...doc.oneOffs]
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((o) => (
                  <tr key={o.id} className="align-middle">
                    <td className="py-1 pr-2">
                      <input
                        type="date"
                        className="input w-40 py-1.5"
                        value={o.date}
                        onChange={(e) => setOneOff(o.id, { date: e.target.value })}
                        aria-label="Date paid"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="input py-1.5"
                        placeholder="Craft fair booth, Topsham"
                        value={o.name}
                        onChange={(e) => setOneOff(o.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className="input w-48 py-1.5"
                        value={o.category}
                        onChange={(e) => setOneOff(o.id, { category: e.target.value })}
                        aria-label="Category"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.key} value={c.key}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="input w-24 py-1.5"
                        inputMode="decimal"
                        placeholder="45.00"
                        value={o.cost}
                        onChange={(e) => setOneOff(o.id, { cost: e.target.value })}
                        aria-label="Cost in dollars"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeOneOff(o.id)}
                        className="text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- SAVE BAR ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-bone/10 bg-inkdeep/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-faded">{saveMsg || (dirty ? "Unsaved changes" : "Everything saved")}</p>
          <button type="button" onClick={save} disabled={saving || !dirty} className={"btn " + (dirty ? "btn-gold" : "btn-ghost")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  gold,
}: {
  label: string;
  value: string;
  strong?: boolean;
  gold?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-4 " +
        (strong ? "border-t border-bone/10 pt-1.5 font-semibold" : "")
      }
    >
      <dt className={strong ? "" : "text-faded"}>{label}</dt>
      <dd className={"whitespace-nowrap " + (gold ? "text-goldlight" : "")}>{value}</dd>
    </div>
  );
}
