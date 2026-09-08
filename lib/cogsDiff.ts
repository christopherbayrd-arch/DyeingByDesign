// ============================================================
//  What changed between two versions of the COGS sheet, and how one
//  item's price moved over time. Pure functions — used by the History
//  panel on /admin/cogs.
// ============================================================
import { COLORS, SIZES, colorName, stockKey } from "@/lib/products";
import { materialPerShirt, money, num, type CogsDoc } from "@/lib/cogs";

export type Change = {
  kind: "blank" | "material" | "type" | "design";
  label: string;        // "Black · L", "Bleach", "Bleach shirt (leaf)", "Sumac"
  what: string;         // "price", "cost per unit", "yield", "added", "removed", "linked to"…
  from: string;         // display strings
  to: string;
  delta?: number;       // dollars, when it's a money change
};

const d$ = (v: number) => money(v);

function blankLabel(key: string) {
  const [color, size] = key.split(":");
  return `${color ? colorName(color) : "?"} · ${size ?? "?"}`;
}

export function diffDocs(prev: CogsDoc | null, next: CogsDoc): Change[] {
  const out: Change[] = [];
  const p: CogsDoc = prev ?? { blanks: {}, materials: [], types: [], designs: {} };

  // --- blank tees ---
  const keys = new Set([...Object.keys(p.blanks), ...Object.keys(next.blanks)]);
  for (const key of [...keys].sort()) {
    const a = num(p.blanks[key]);
    const b = num(next.blanks[key]);
    if (a === b) continue;
    out.push({
      kind: "blank",
      label: blankLabel(key),
      what: a > 0 && b > 0 ? "price" : a > 0 ? "price cleared" : "price added",
      from: a > 0 ? d$(a) : "—",
      to: b > 0 ? d$(b) : "—",
      delta: a > 0 && b > 0 ? b - a : undefined,
    });
  }

  // --- materials ---
  const pm = new Map(p.materials.map((m) => [m.id, m]));
  const nm = new Map(next.materials.map((m) => [m.id, m]));
  for (const m of next.materials) {
    const was = pm.get(m.id);
    const label = m.name || "Untitled material";
    if (!was) {
      out.push({ kind: "material", label, what: "added", from: "—", to: `${d$(num(m.cost))} per ${m.unit || "unit"}, covers ${num(m.yield) || "?"} shirts` });
      continue;
    }
    if (num(was.cost) !== num(m.cost) || num(was.yield) !== num(m.yield) || (was.unit || "") !== (m.unit || "")) {
      const perWas = materialPerShirt(was);
      const perNow = materialPerShirt(m);
      const bits: string[] = [];
      if (num(was.cost) !== num(m.cost)) bits.push(`${d$(num(was.cost))} → ${d$(num(m.cost))} per ${m.unit || was.unit || "unit"}`);
      if ((was.unit || "") !== (m.unit || "")) bits.push(`unit ${was.unit || "?"} → ${m.unit || "?"}`);
      if (num(was.yield) !== num(m.yield)) bits.push(`covers ${num(was.yield) || "?"} → ${num(m.yield) || "?"} shirts`);
      out.push({
        kind: "material",
        label,
        what: bits.join(", "),
        from: `${d$(perWas)} per shirt`,
        to: `${d$(perNow)} per shirt`,
        delta: perNow - perWas,
      });
    } else if ((was.name || "") !== (m.name || "")) {
      out.push({ kind: "material", label, what: "renamed", from: was.name || "Untitled", to: m.name || "Untitled" });
    }
  }
  for (const m of p.materials) {
    if (!nm.has(m.id)) out.push({ kind: "material", label: m.name || "Untitled material", what: "removed", from: `${d$(num(m.cost))} per ${m.unit || "unit"}`, to: "—" });
  }

  // --- shirt types ---
  const pt = new Map(p.types.map((t) => [t.id, t]));
  const nt = new Map(next.types.map((t) => [t.id, t]));
  const matName = (id: string) => nm.get(id)?.name || pm.get(id)?.name || "a material";
  for (const t of next.types) {
    const was = pt.get(t.id);
    const label = t.name || "Untitled type";
    if (!was) {
      out.push({ kind: "type", label, what: "added", from: "—", to: `${Object.keys(t.uses).length} materials, price ${num(t.price) > 0 ? d$(num(t.price)) : "—"}` });
      continue;
    }
    if (num(was.price) !== num(t.price)) {
      out.push({ kind: "type", label, what: "sale price", from: num(was.price) > 0 ? d$(num(was.price)) : "—", to: num(t.price) > 0 ? d$(num(t.price)) : "—", delta: num(was.price) > 0 && num(t.price) > 0 ? num(t.price) - num(was.price) : undefined });
    }
    const useIds = new Set([...Object.keys(was.uses), ...Object.keys(t.uses)]);
    for (const id of useIds) {
      const a = was.uses[id];
      const b = t.uses[id];
      if (a === undefined && b !== undefined) out.push({ kind: "type", label, what: `now uses ${matName(id)}`, from: "—", to: `${num(b)} per shirt` });
      else if (a !== undefined && b === undefined) out.push({ kind: "type", label, what: `no longer uses ${matName(id)}`, from: `${num(a)} per shirt`, to: "—" });
      else if (num(a) !== num(b)) out.push({ kind: "type", label, what: `${matName(id)} per shirt`, from: String(num(a)), to: String(num(b)) });
    }
    if ((was.name || "") !== (t.name || "")) out.push({ kind: "type", label, what: "renamed", from: was.name || "Untitled", to: t.name || "Untitled" });
  }
  for (const t of p.types) {
    if (!nt.has(t.id)) out.push({ kind: "type", label: t.name || "Untitled type", what: "removed", from: "", to: "—" });
  }

  // --- design links ---
  const slugs = new Set([...Object.keys(p.designs), ...Object.keys(next.designs)]);
  const typeName = (id?: string) => (id ? nt.get(id)?.name || pt.get(id)?.name || "a type" : "—");
  for (const slug of [...slugs].sort()) {
    const a = p.designs[slug];
    const b = next.designs[slug];
    if (a === b) continue;
    out.push({ kind: "design", label: slug.charAt(0).toUpperCase() + slug.slice(1), what: "made like", from: typeName(a), to: typeName(b) });
  }
  return out;
}

// ---- one item over time ----
export type ItemKey = { kind: "blank"; key: string } | { kind: "material"; id: string } | { kind: "type"; id: string };

export type ItemPoint = { at: string; note: string; value: number | null; detail: string };

export function itemOptions(docs: CogsDoc[]): { key: string; label: string; group: string }[] {
  const blanks = new Set<string>();
  const materials = new Map<string, string>();
  const types = new Map<string, string>();
  for (const d of docs) {
    for (const [k, v] of Object.entries(d.blanks)) if (num(v) > 0) blanks.add(k);
    for (const m of d.materials) materials.set(m.id, m.name || materials.get(m.id) || "Untitled material");
    for (const t of d.types) types.set(t.id, t.name || types.get(t.id) || "Untitled type");
  }
  const order = (k: string) => {
    const [c, s] = k.split(":");
    return COLORS.findIndex((x) => x.key === c) * 100 + SIZES.indexOf(s);
  };
  return [
    ...[...blanks].sort((a, b) => order(a) - order(b)).map((k) => ({ key: `blank:${k}`, label: blankLabel(k), group: "Blank tees" })),
    ...[...materials.entries()].map(([id, name]) => ({ key: `material:${id}`, label: name, group: "Materials" })),
    ...[...types.entries()].map(([id, name]) => ({ key: `type:${id}`, label: name, group: "Shirt types (materials per shirt)" })),
  ];
}

// Value of one item in each version (oldest first). `versions` oldest first.
export function itemHistory(versions: { at: string; note: string; doc: CogsDoc }[], key: string): ItemPoint[] {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  return versions.map((v) => {
    if (kind === "blank") {
      const n = num(v.doc.blanks[id]);
      return { at: v.at, note: v.note, value: n > 0 ? n : null, detail: n > 0 ? d$(n) : "no price" };
    }
    if (kind === "material") {
      const m = v.doc.materials.find((x) => x.id === id);
      if (!m) return { at: v.at, note: v.note, value: null, detail: "not on the sheet" };
      const per = materialPerShirt(m);
      return { at: v.at, note: v.note, value: per > 0 ? per : null, detail: `${d$(num(m.cost))} per ${m.unit || "unit"} · covers ${num(m.yield) || "?"} → ${d$(per)} per shirt` };
    }
    const t = v.doc.types.find((x) => x.id === id);
    if (!t) return { at: v.at, note: v.note, value: null, detail: "not on the sheet" };
    let total = 0;
    const parts: string[] = [];
    for (const m of v.doc.materials) {
      if (t.uses[m.id] === undefined) continue;
      const c = materialPerShirt(m) * num(t.uses[m.id]);
      total += c;
      parts.push(`${m.name || "material"} ${d$(c)}`);
    }
    return { at: v.at, note: v.note, value: total, detail: `${d$(total)} materials per shirt (${parts.join(", ") || "nothing linked"})${num(t.price) > 0 ? ` · price ${d$(num(t.price))}` : ""}` };
  });
}

// Drop consecutive points where nothing changed, keep first and last
export function changesOnly(points: ItemPoint[]): ItemPoint[] {
  return points.filter((p, i) => i === 0 || i === points.length - 1 || p.detail !== points[i - 1].detail);
}

// A stable string for "did the sheet actually change?"
export function fingerprint(doc: CogsDoc): string {
  return JSON.stringify({
    b: Object.entries(doc.blanks).filter(([, v]) => num(v) > 0).sort().map(([k, v]) => [k, num(v)]),
    m: doc.materials.map((m) => [m.id, m.name, m.unit, num(m.cost), num(m.yield)]),
    t: doc.types.map((t) => [t.id, t.name, num(t.price), Object.entries(t.uses).sort().map(([k, v]) => [k, num(v)])]),
    d: Object.entries(doc.designs).sort(),
  });
}

export { stockKey };
