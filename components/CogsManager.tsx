"use client";

import { useCallback, useEffect, useState } from "react";
import { COLORS, SIZES, fmtPrice, lineInfo, stockKey, type Product } from "@/lib/products";
import {
  blankStats,
  materialPerShirt,
  money,
  newId,
  normalizeDoc,
  num,
  pct,
  starterDoc,
  typeCost,
  type CogsDoc,
  type CogsMaterial,
  type CogsType,
} from "@/lib/cogs";

// The COGS sheet: blank tee prices → materials → product types.
// Everything is one document; "Save" writes the whole thing.

export default function CogsManager() {
  const [doc, setDoc] = useState<CogsDoc | null>(null);
  const [fatal, setFatal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [fill, setFill] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsNote, setProductsNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cogs");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFatal(data.error ?? "Could not load the COGS sheet.");
        return;
      }
      setDoc(normalizeDoc(data.data) ?? starterDoc());
      setFatal("");
    } catch {
      setFatal("Could not load the COGS sheet — check your connection and reload.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The real designs + today's prices, straight from Products & stock
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/products");
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.products)) {
          setProducts(data.products as Product[]);
        } else {
          setProductsNote(data.error ?? "Could not load your designs.");
        }
      } catch {
        setProductsNote("Could not load your designs — check your connection.");
      }
    })();
  }, []);

  function update(fn: (d: CogsDoc) => CogsDoc) {
    setDoc((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
    setSaveMsg("");
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/cogs", {
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

  // ---- blanks ----
  function setBlank(key: string, value: string) {
    update((d) => ({ ...d, blanks: { ...d.blanks, [key]: value } }));
  }
  function fillSize(size: string, value: string) {
    setFill((f) => ({ ...f, [size]: value }));
    update((d) => {
      const blanks = { ...d.blanks };
      for (const c of COLORS) blanks[stockKey(c.key, size)] = value;
      return { ...d, blanks };
    });
  }

  // ---- materials ----
  function setMaterial(id: string, patch: Partial<CogsMaterial>) {
    update((d) => ({ ...d, materials: d.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }
  function addMaterial() {
    update((d) => ({ ...d, materials: [...d.materials, { id: newId(), name: "", unit: "", cost: "", yield: "" }] }));
  }
  function removeMaterial(id: string) {
    update((d) => ({
      ...d,
      materials: d.materials.filter((m) => m.id !== id),
      types: d.types.map((t) => {
        const uses = { ...t.uses };
        delete uses[id];
        return { ...t, uses };
      }),
    }));
  }

  // ---- types ----
  function setType(id: string, patch: Partial<CogsType>) {
    update((d) => ({ ...d, types: d.types.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }
  function toggleUse(typeId: string, materialId: string, on: boolean) {
    update((d) => ({
      ...d,
      types: d.types.map((t) => {
        if (t.id !== typeId) return t;
        const uses = { ...t.uses };
        if (on) uses[materialId] = uses[materialId] ?? "1";
        else delete uses[materialId];
        return { ...t, uses };
      }),
    }));
  }
  function setUseQty(typeId: string, materialId: string, qty: string) {
    update((d) => ({
      ...d,
      types: d.types.map((t) => (t.id === typeId ? { ...t, uses: { ...t.uses, [materialId]: qty } } : t)),
    }));
  }
  function addType() {
    update((d) => ({ ...d, types: [...d.types, { id: newId(), name: "", price: "", uses: {} }] }));
  }
  function removeType(id: string) {
    update((d) => {
      const designs = { ...d.designs };
      for (const slug of Object.keys(designs)) if (designs[slug] === id) delete designs[slug];
      return { ...d, types: d.types.filter((t) => t.id !== id), designs };
    });
  }

  // ---- designs ----
  function assignDesign(slug: string, typeId: string) {
    update((d) => {
      const designs = { ...d.designs };
      if (typeId) designs[slug] = typeId;
      else delete designs[slug];
      return { ...d, designs };
    });
  }

  if (fatal) {
    return <p className="rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{fatal}</p>;
  }
  if (!doc) return <p className="text-faded">Loading…</p>;

  const blank = blankStats(doc.blanks);

  return (
    <div className="space-y-10 pb-24">
      {/* ---------- 1. BLANKS ---------- */}
      <section className="card p-5 sm:p-6">
        <p className="kicker">1 · Blank tees</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">What you pay per blank</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
          Dollars per shirt, before you touch it. Type a price in the <em>Fill column</em> row to
          set every color in that size at once, then change any color that costs different.
          Leave a cell empty if you don&apos;t stock it.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="pb-1 pr-3 text-left font-medium text-faded">Color</th>
                {SIZES.map((s) => (
                  <th key={s} className="px-1 pb-1 text-center font-semibold text-bone">{s}</th>
                ))}
              </tr>
              <tr>
                <td className="py-1 pr-3 whitespace-nowrap text-faded italic">Fill column →</td>
                {SIZES.map((s) => (
                  <td key={s} className="px-1 py-1">
                    <input
                      inputMode="decimal"
                      placeholder="4.50"
                      value={fill[s] ?? ""}
                      onChange={(e) => fillSize(s, e.target.value)}
                      className="input w-[4.5rem] border-gold/40 px-1.5 py-1 text-center"
                      aria-label={`Fill every color in size ${s}`}
                    />
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {COLORS.map((c) => (
                <tr key={c.key}>
                  <td className="py-1 pr-3 whitespace-nowrap text-faded">
                    <span className="mr-1.5 inline-block h-3 w-3 rounded-full border border-bone/30 align-middle" style={{ background: c.hex }} />
                    {c.name}
                  </td>
                  {SIZES.map((s) => {
                    const k = stockKey(c.key, s);
                    return (
                      <td key={k} className="px-1 py-1">
                        <input
                          inputMode="decimal"
                          value={doc.blanks[k] ?? ""}
                          onChange={(e) => setBlank(k, e.target.value)}
                          className="input w-[4.5rem] px-1.5 py-1 text-center"
                          aria-label={`${c.name} ${s} blank cost`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-faded">
          {blank.count === 0
            ? "No blank prices yet — every product type below will show materials only."
            : `Blanks run ${money(blank.min)} to ${money(blank.max)} (average ${money(blank.avg)} across ${blank.count} filled cells).`}
        </p>
      </section>

      {/* ---------- 2. MATERIALS ---------- */}
      <section className="card p-5 sm:p-6">
        <p className="kicker">2 · Materials</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">What you buy, and how far it goes</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
          One row per thing you buy. <em>Cost</em> is what one purchase costs; <em>Shirts per
          unit</em> is how many shirts that purchase covers. Bleach at $4.50 a gallon that does
          40 shirts is 11¢ a shirt. Packaging counts too — a pack of 100 mailers for $12 is
          12¢ a shirt.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faded">
                <th className="pb-2 pr-2 font-medium">Material</th>
                <th className="pb-2 pr-2 font-medium">What one purchase is</th>
                <th className="pb-2 pr-2 font-medium">Cost ($)</th>
                <th className="pb-2 pr-2 font-medium">Shirts per unit</th>
                <th className="pb-2 pr-2 text-right font-medium">Per shirt</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {doc.materials.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-faded">No materials yet.</td>
                </tr>
              )}
              {doc.materials.map((m) => {
                const per = materialPerShirt(m);
                return (
                  <tr key={m.id} className="align-middle">
                    <td className="py-1 pr-2">
                      <input className="input py-1.5" placeholder="Bleach" value={m.name} onChange={(e) => setMaterial(m.id, { name: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input py-1.5" placeholder="1 gallon" value={m.unit} onChange={(e) => setMaterial(m.id, { unit: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input w-24 py-1.5" inputMode="decimal" placeholder="4.50" value={m.cost} onChange={(e) => setMaterial(m.id, { cost: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="input w-24 py-1.5" inputMode="decimal" placeholder="40" value={m.yield} onChange={(e) => setMaterial(m.id, { yield: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2 text-right font-semibold text-goldlight whitespace-nowrap">
                      {per > 0 ? money(per) : <span className="font-normal text-faded">—</span>}
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeMaterial(m.id)}
                        className="text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                        aria-label={`Remove ${m.name || "material"}`}
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
        <button type="button" onClick={addMaterial} className="btn btn-ghost mt-4">
          + Add a material
        </button>
      </section>

      {/* ---------- 3. PRODUCT TYPES ---------- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">3 · Product types</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Cost per shirt, by kind</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
              A type is a recipe: tick the materials that kind of shirt uses and how much of each
              per shirt (a stencil shirt might use 2 sheets, most things are 1). The blank is always
              included, using the average price above, with the cheapest to priciest range next to
              it. The price field is only for things you sell that aren&apos;t a design on the site
              (tie dye, say) — your real designs get their margin in step 4 at their real price.
            </p>
          </div>
          <button type="button" onClick={addType} className="btn btn-ghost">
            + Add a product type
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {doc.types.length === 0 && <p className="card p-5 text-sm text-faded">No product types yet.</p>}
          {doc.types.map((t) => {
            const cost = typeCost(t, doc.materials, doc.blanks);
            const hasPrice = cost.price > 0;
            return (
              <div key={t.id} className="card p-5">
                <div className="flex gap-3">
                  <label className="flex-1 text-xs text-faded">
                    Type
                    <input className="input mt-1" placeholder="Bleach shirt (leaf)" value={t.name} onChange={(e) => setType(t.id, { name: e.target.value })} />
                  </label>
                  <label className="w-28 text-xs text-faded">
                    Price if sold as is ($)
                    <input className="input mt-1" inputMode="decimal" placeholder="39.99" value={t.price} onChange={(e) => setType(t.id, { price: e.target.value })} />
                  </label>
                </div>

                <p className="mt-4 text-xs uppercase tracking-wider text-faded">Uses</p>
                {doc.materials.length === 0 ? (
                  <p className="mt-1 text-sm text-faded">Add some materials above first.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {doc.materials.map((m) => {
                      const on = t.uses[m.id] !== undefined;
                      return (
                        <li key={m.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => toggleUse(t.id, m.id, e.target.checked)}
                            className="h-4 w-4 accent-[#cf9440]"
                            id={`${t.id}-${m.id}`}
                          />
                          <label htmlFor={`${t.id}-${m.id}`} className={"flex-1 " + (on ? "text-bone" : "text-faded")}>
                            {m.name || "Untitled material"}
                          </label>
                          {on && (
                            <>
                              <span className="text-xs text-faded">×</span>
                              <input
                                className="input w-16 px-1.5 py-1 text-center text-xs"
                                inputMode="decimal"
                                value={t.uses[m.id]}
                                onChange={(e) => setUseQty(t.id, m.id, e.target.value)}
                                aria-label={`${m.name} per shirt`}
                              />
                              <span className="w-16 text-right text-xs text-faded">
                                {money(materialPerShirt(m) * num(t.uses[m.id]))}
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <dl className="mt-4 space-y-1 border-t border-bone/10 pt-3 text-sm">
                  <div className="flex justify-between text-faded">
                    <dt>Blank (average)</dt>
                    <dd>
                      {cost.blank.count > 0 ? (
                        <>
                          {money(cost.blank.avg)}
                          {cost.blank.min !== cost.blank.max && (
                            <span className="text-xs"> ({money(cost.blank.min)}–{money(cost.blank.max)})</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between text-faded">
                    <dt>Materials</dt>
                    <dd>{money(cost.materials)}</dd>
                  </div>
                  <div className="flex justify-between font-semibold text-bone">
                    <dt>COGS per shirt</dt>
                    <dd>
                      {money(cost.typical)}
                      {cost.low !== cost.high && (
                        <span className="text-xs font-normal text-faded"> ({money(cost.low)}–{money(cost.high)})</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between font-semibold text-goldlight">
                    <dt>Profit at {hasPrice ? money(cost.price) : "sale price"}</dt>
                    <dd>
                      {hasPrice ? (
                        <>
                          {money(cost.profit)}{" "}
                          <span className="text-xs font-normal">({pct(cost.profit, cost.price)} margin)</span>
                        </>
                      ) : (
                        <span className="font-normal text-faded">enter a price</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => removeType(t.id)}
                  className="mt-4 text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                >
                  Remove this type
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- 4. YOUR DESIGNS ---------- */}
      <section className="card p-5 sm:p-6">
        <p className="kicker">4 · Your designs</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Margin on each design, at today&apos;s price</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
          Every design from Products &amp; stock, priced as it is on the site right now. Pick
          which product type each one is made like and the cost, profit, and margin fill in.
          Change a price over on Products &amp; stock and it shows here on reload.
        </p>
        {productsNote && <p className="mt-4 text-sm text-faded">{productsNote}</p>}
        {products && products.length === 0 && (
          <p className="mt-4 text-sm text-faded">No designs yet — add some on Products &amp; stock first.</p>
        )}
        {products && products.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-faded">
                  <th className="pb-2 pr-2 font-medium">Design</th>
                  <th className="pb-2 pr-2 font-medium">Price</th>
                  <th className="pb-2 pr-2 font-medium">Made like</th>
                  <th className="pb-2 pr-2 text-right font-medium">COGS</th>
                  <th className="pb-2 pr-2 text-right font-medium">Profit</th>
                  <th className="pb-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const typeId = doc.designs[p.slug] ?? "";
                  const t = doc.types.find((x) => x.id === typeId);
                  const price = p.priceCents / 100;
                  const c = t ? typeCost(t, doc.materials, doc.blanks, price) : null;
                  const thin = c ? c.profit / price < 0.5 : false;
                  return (
                    <tr key={p.slug} className="border-t border-bone/10 align-middle">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-bone">{p.name}</div>
                        <div className="text-xs text-faded">
                          {lineInfo(p.line).short}
                          {!p.active ? " · hidden" : ""}
                          {p.trackStock ? " · counted stock" : " · made to order"}
                        </div>
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtPrice(p.priceCents)}</td>
                      <td className="py-2 pr-2">
                        <select
                          className="input w-auto min-w-40 py-1.5 text-sm"
                          value={typeId}
                          onChange={(e) => assignDesign(p.slug, e.target.value)}
                          aria-label={`Product type for ${p.name}`}
                        >
                          <option value="">Pick a type…</option>
                          {doc.types.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name || "Untitled type"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap text-faded">
                        {c ? (
                          <>
                            <span className="text-bone">{money(c.typical)}</span>
                            {c.low !== c.high && (
                              <span className="block text-xs">{money(c.low)}–{money(c.high)}</span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold text-goldlight">
                        {c ? (
                          <>
                            {money(c.profit)}
                            {c.low !== c.high && (
                              <span className="block text-xs font-normal text-faded">{money(c.profitLow)}–{money(c.profitHigh)}</span>
                            )}
                          </>
                        ) : (
                          <span className="font-normal text-faded">—</span>
                        )}
                      </td>
                      <td className={"py-2 text-right whitespace-nowrap font-semibold " + (thin ? "text-rust" : "text-goldlight")}>
                        {c ? pct(c.profit, price) : <span className="font-normal text-faded">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-faded">
              Margin is profit as a share of the price. It goes rust below 50%. The small range under
              each number is the cheapest to priciest blank; the big number uses the average blank.
            </p>
          </div>
        )}
      </section>

      {/* ---------- SAVE BAR ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-bone/10 bg-inkdeep/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-sm text-faded">
            {saveMsg || (dirty ? "Unsaved changes" : "Everything saved")}
          </p>
          <button type="button" onClick={save} disabled={saving || !dirty} className={"btn " + (dirty ? "btn-gold" : "btn-ghost")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
