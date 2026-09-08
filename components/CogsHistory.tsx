"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeDoc, money, type CogsDoc } from "@/lib/cogs";
import { changesOnly, diffDocs, fingerprint, itemHistory, itemOptions, type Change } from "@/lib/cogsDiff";

// ============================================================
//  History panel for the COGS page: every saved version of the sheet,
//  what changed in each one, and how any single blank, material, or
//  shirt type moved over time. "Load into editor" puts an old sheet
//  back in the editor as unsaved changes — Save makes it current again.
// ============================================================

type Version = { id: number | null; at: string; note: string; doc: CogsDoc };

type Props = {
  current: CogsDoc;
  refreshKey: number;                 // bump after a save so the list reloads
  onRestore: (doc: CogsDoc, from: string) => void;
};

const KIND_LABEL: Record<Change["kind"], string> = {
  blank: "Blank tees",
  material: "Materials",
  type: "Shirt types",
  design: "Designs",
};
const KIND_ONE: Record<Change["kind"], string> = {
  blank: "blank tee",
  material: "material",
  type: "shirt type",
  design: "design",
};

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function fmtDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
function deltaText(c: Change) {
  if (c.delta === undefined || Math.abs(c.delta) < 0.005) return null;
  const up = c.delta > 0;
  const costLike = c.kind === "blank" || c.kind === "material";
  return (
    <span className={"ml-2 text-xs " + (costLike ? (up ? "text-rust" : "text-goldlight") : "text-faded")}>
      {up ? "+" : "−"}{money(Math.abs(c.delta))}
    </span>
  );
}

export default function CogsHistory({ current, refreshKey, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"changes" | "item">("changes");
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [item, setItem] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/cogs/history", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load the history.");
          setVersions([]);
          return;
        }
        const list: Version[] = [];
        for (const v of (data.versions ?? []) as { id: number; data: unknown; note: string; at: string }[]) {
          const doc = normalizeDoc(v.data);
          if (doc) list.push({ id: v.id, at: v.at, note: v.note ?? "", doc });
        }
        setError("");
        setVersions(list); // newest first
      } catch {
        if (!cancelled) {
          setError("Could not load the history — check your connection.");
          setVersions([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, refreshKey]);

  // Newest first for the timeline; the live sheet goes on top when it
  // differs from the newest saved version (unsaved edits, or saves from
  // before versions were kept).
  const timeline = useMemo(() => {
    if (!versions) return [];
    const list = [...versions];
    const newest = list[0];
    if (!newest || fingerprint(newest.doc) !== fingerprint(current)) {
      list.unshift({ id: null, at: new Date().toISOString(), note: "", doc: current });
    }
    return list;
  }, [versions, current]);

  const oldestFirst = useMemo(() => [...timeline].reverse(), [timeline]);
  const options = useMemo(() => itemOptions(oldestFirst.map((v) => v.doc)), [oldestFirst]);
  const points = useMemo(() => {
    if (!item) return [];
    const all = itemHistory(oldestFirst.map((v) => ({ at: v.at, note: v.note, doc: v.doc })), item);
    return onlyChanges ? changesOnly(all) : all;
  }, [oldestFirst, item, onlyChanges]);

  useEffect(() => {
    if (!item && options.length > 0) setItem(options[0].key);
  }, [options, item]);

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className={"btn " + (open ? "btn-gold" : "btn-ghost")}>
        {open ? "Close history" : "History"}
      </button>

      {open && (
        <div className="card mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="kicker">Sheet history</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">Every price you&apos;ve ever saved</h2>
            </div>
            <div className="flex gap-1.5 text-xs">
              {(["changes", "item"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={"rounded-full border px-3 py-1.5 transition " + (tab === t ? "border-gold/60 bg-gold/15 text-goldlight" : "border-bone/10 text-faded hover:text-goldlight")}
                >
                  {t === "changes" ? "What changed" : "One item over time"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faded">
            A copy of the sheet is kept every time you hit Save. The sales history costs each order with
            the copy that was current the day it was paid, so nothing here is ever rewritten.
          </p>

          {versions === null && !error && <p className="mt-6 text-sm text-faded">Loading…</p>}
          {error && <p className="mt-6 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{error}</p>}

          {/* ---------- what changed ---------- */}
          {versions && !error && tab === "changes" && (
            <div className="mt-6 space-y-3">
              {versions.length === 0 && (
                <p className="rounded-xl bg-black/20 p-4 text-sm text-faded">
                  No saved versions yet. From now on every Save keeps a dated copy; the entry below is the sheet as it is right now.
                </p>
              )}
              {timeline.map((v, i) => {
                const prev = timeline[i + 1] ?? null;
                const changes = diffDocs(prev ? prev.doc : null, v.doc);
                const key = v.id === null ? "live" : String(v.id);
                const isOpen = expanded[key] ?? i === 0;
                const groups = (["blank", "material", "type", "design"] as const)
                  .map((k) => ({ kind: k, rows: changes.filter((c) => c.kind === k) }))
                  .filter((g) => g.rows.length > 0);
                const summary = groups
                  .map((g) => `${g.rows.length} ${g.rows.length === 1 ? KIND_ONE[g.kind] : KIND_LABEL[g.kind].toLowerCase()}`)
                  .join(" · ");
                return (
                  <div key={key} className="rounded-xl border border-bone/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [key]: !isOpen }))}
                      className="flex w-full flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left"
                    >
                      <span>
                        <span className="font-semibold text-bone">
                          {v.id === null ? "Right now" : fmtWhen(v.at)}
                        </span>
                        {v.id === null && (
                          <span className="ml-2 text-xs text-faded">the live sheet — {prev ? "differs from the last saved copy" : "not saved as a version yet"}</span>
                        )}
                        {v.note && <span className="ml-2 text-sm text-goldlight">“{v.note}”</span>}
                      </span>
                      <span className="text-xs text-faded">
                        {prev ? (changes.length === 0 ? "nothing changed" : summary) : "first version"} {isOpen ? "▾" : "▸"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-bone/5 px-4 py-3">
                        {!prev && (
                          <p className="text-sm text-faded">
                            {Object.values(v.doc.blanks).filter((x) => Number(x) > 0).length} blank prices ·{" "}
                            {v.doc.materials.length} materials · {v.doc.types.length} shirt types ·{" "}
                            {Object.keys(v.doc.designs).length} designs linked
                          </p>
                        )}
                        {prev && changes.length === 0 && (
                          <p className="text-sm text-faded">Saved without changing any numbers.</p>
                        )}
                        {groups.map((g) => (
                          <div key={g.kind} className="mt-2 first:mt-0">
                            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-faded">{KIND_LABEL[g.kind]}</p>
                            <ul className="mt-1 space-y-1 text-sm">
                              {g.rows.map((c, j) => (
                                <li key={j} className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="font-medium text-bone">{c.label}</span>
                                  <span className="text-faded">{c.what}</span>
                                  {(c.from || c.to) && (
                                    <span className="tabular-nums">
                                      {c.from && <span className="text-faded">{c.from}</span>}
                                      {c.from && c.to && <span className="text-faded"> → </span>}
                                      <span className="text-bone">{c.to}</span>
                                      {deltaText(c)}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {v.id !== null && (
                          <div className="mt-3 border-t border-bone/5 pt-3">
                            <button
                              type="button"
                              onClick={() => onRestore(v.doc, fmtWhen(v.at))}
                              className="text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
                            >
                              Load this version into the editor
                            </button>
                            <span className="ml-2 text-xs text-faded">(nothing changes until you Save)</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---------- one item over time ---------- */}
          {versions && !error && tab === "item" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-faded">
                  Item
                  <select value={item} onChange={(e) => setItem(e.target.value)} className="input mt-1 block min-w-[16rem] py-1.5 text-sm">
                    {["Blank tees", "Materials", "Shirt types (materials per shirt)"].map((group) => {
                      const opts = options.filter((o) => o.group === group);
                      if (opts.length === 0) return null;
                      return (
                        <optgroup key={group} label={group}>
                          {opts.map((o) => (
                            <option key={o.key} value={o.key}>{o.label}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-xs text-faded">
                  <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} className="accent-[#cf9440]" />
                  Only show when it changed
                </label>
              </div>
              {options.length === 0 ? (
                <p className="mt-4 text-sm text-faded">Nothing priced yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-bone/10 text-xs uppercase tracking-wider text-faded">
                        <th className="py-2 pr-3">When</th>
                        <th className="py-2 pr-3">Note</th>
                        <th className="py-2 pr-3 text-right">Value</th>
                        <th className="py-2 pr-3 text-right">Change</th>
                        <th className="py-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((p, i) => {
                        const prev = i > 0 ? points[i - 1].value : null;
                        const d = p.value !== null && prev !== null ? p.value - prev : null;
                        const isLive = i === points.length - 1 && timeline[0]?.id === null;
                        return (
                          <tr key={p.at + i} className="border-b border-bone/5 align-top">
                            <td className="py-2 pr-3 whitespace-nowrap">{isLive ? "Right now" : fmtDay(p.at)}</td>
                            <td className="py-2 pr-3 text-faded">{p.note || "—"}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-bone">{p.value === null ? "—" : money(p.value)}</td>
                            <td className={"py-2 pr-3 text-right " + (d === null || Math.abs(d) < 0.005 ? "text-faded" : d > 0 ? "text-rust" : "text-goldlight")}>
                              {d === null || Math.abs(d) < 0.005 ? (i === 0 ? "start" : "—") : `${d > 0 ? "+" : "−"}${money(Math.abs(d))}`}
                            </td>
                            <td className="py-2 text-xs text-faded">{p.detail}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-faded">
                    Blank tees show the price per blank; materials and shirt types show cost per shirt, which is what a sale gets costed with.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
