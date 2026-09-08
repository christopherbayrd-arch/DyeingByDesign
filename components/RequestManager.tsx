"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS, SIZES, colorName } from "@/lib/products";
import { kindLabel } from "@/lib/requests";

// ============================================================
//  Custom requests on /admin: status, your own note, archive, and
//  "Turn into order" — which makes a real order (same statuses, Buy
//  label, Sales history) with a price and, if you know it, a cost.
// ============================================================

export type RequestRow = {
  id: number;
  createdAt: string;
  name: string;
  email: string;
  kind: string;
  size: string;
  color: string;
  idea: string;
  artworkUrl: string;
  status: string;
  note: string;
  orderId: number | null;
  quoteCents: number | null;
  archived: boolean;
};

const STATUS: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "quoted", label: "Quoted" },
  { key: "accepted", label: "Accepted" },
  { key: "done", label: "Done" },
];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

async function post(body: unknown) {
  const res = await fetch("/api/admin/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't save.");
  return data;
}

function RequestCard({ r }: { r: RequestRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState(STATUS.some((s) => s.key === r.status) ? r.status : "new");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    price: r.quoteCents !== null ? (r.quoteCents / 100).toFixed(2) : "",
    shipping: "7.00",
    size: r.size || "M",
    color: r.color || "",
    cost: "",
    name: r.name,
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal: "",
  });

  async function run(label: string, body: unknown) {
    setBusy(label);
    setMsg("");
    try {
      const d = await post(body);
      router.refresh();
      return d;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy("");
    }
    return null;
  }

  async function changeStatus(next: string) {
    const prev = status;
    setStatus(next);
    const d = await run("status", { id: r.id, action: "status", status: next });
    if (!d) setStatus(prev);
  }

  async function saveNote(note: string) {
    if (note === r.note) return;
    await run("note", { id: r.id, action: "note", note });
  }

  async function convert(e: React.FormEvent) {
    e.preventDefault();
    const d = await run("convert", {
      id: r.id,
      action: "convert",
      price: form.price,
      shipping: form.shipping,
      size: form.size,
      color: form.color,
      cost: form.cost,
      address: { name: form.name, line1: form.line1, line2: form.line2, city: form.city, state: form.state, postal: form.postal },
    });
    if (d?.orderId) {
      setOpen(false);
      setMsg(`Now order #${d.orderId} in the Orders table above.`);
    }
  }

  return (
    <div className={"card p-4 text-sm " + (r.archived ? "opacity-70" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {r.name}{" "}
            <span className="font-normal text-faded">
              · {r.email}
              {r.kind ? ` · ${kindLabel(r.kind)}` : ""}
              {r.size ? ` · size ${r.size}` : ""}
              {r.color ? ` · ${colorName(r.color)}` : ""}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-faded">
            {fmtDate(r.createdAt)}
            {r.orderId && (
              <>
                {" · "}
                <a href={`#order-${r.orderId}`} className="text-goldlight underline underline-offset-2">Order #{r.orderId}</a>
                {r.quoteCents !== null ? ` · quoted $${(r.quoteCents / 100).toFixed(2)}` : ""}
              </>
            )}
            {r.archived && " · archived"}
          </p>
        </div>
        <select
          value={status}
          disabled={busy !== ""}
          onChange={(e) => changeStatus(e.target.value)}
          aria-label="Request status"
          className={"rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider outline-none " + (status === "new" ? "border-gold/60 bg-transparent text-goldlight" : "border-transparent bg-gold/20 text-goldlight")}
        >
          {STATUS.map((s) => (
            <option key={s.key} value={s.key} className="bg-ink text-bone">{s.label}</option>
          ))}
        </select>
      </div>

      <p className="mt-2 whitespace-pre-wrap leading-relaxed text-faded">{r.idea}</p>
      {r.artworkUrl && (
        <a href={r.artworkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-goldlight underline underline-offset-2">
          Open attached artwork ↗
        </a>
      )}

      <label className="mt-3 block text-xs text-faded">
        Your note (the customer never sees this)
        <textarea
          key={`note-${r.id}-${r.note}`}
          defaultValue={r.note}
          onBlur={(e) => saveNote(e.target.value)}
          rows={2}
          placeholder="Quoted $55, leaves arriving Tuesday…"
          className="input mt-1 resize-y py-1.5 text-sm"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!r.orderId && (
          <button type="button" onClick={() => setOpen((v) => !v)} className={"btn min-h-0 px-3 py-1.5 text-xs " + (open ? "btn-ghost" : "btn-gold")}>
            {open ? "Cancel" : "Turn into order"}
          </button>
        )}
        <button
          type="button"
          disabled={busy !== ""}
          onClick={() => run(r.archived ? "unarchive" : "archive", { id: r.id, action: r.archived ? "unarchive" : "archive" })}
          className="text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
        >
          {busy === "archive" || busy === "unarchive" ? "…" : r.archived ? "Put back on the desk" : "Archive"}
        </button>
        {msg && <span className="text-xs text-goldlight">{msg}</span>}
      </div>

      {open && (
        <form onSubmit={convert} className="mt-3 rounded-xl border border-bone/10 bg-black/20 p-4">
          <p className="text-xs text-faded">
            Makes a real order for this piece: it gets the same statuses, the Buy label button, and a row in
            Sales history. Price is what you quoted. Cost is optional — type it if you know what this one
            will cost you, otherwise set it later in Sales history.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-faded">
              Price ($)
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" required className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Shipping charged ($)
              <input value={form.shipping} onChange={(e) => setForm({ ...form, shipping: e.target.value })} inputMode="decimal" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <label className="text-xs text-faded">
              Cost to you ($, optional)
              <input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} inputMode="decimal" placeholder="blank + materials" className="input mt-1 block w-full py-1.5 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-faded">
                Size
                <select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="input mt-1 block w-full py-1.5 text-sm">
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs text-faded">
                Color
                <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="input mt-1 block w-full py-1.5 text-sm">
                  <option value="">—</option>
                  {COLORS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-faded">Ship to (optional now — the label button will ask if it&apos;s missing)</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-6">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="input py-1.5 text-sm sm:col-span-2" />
            <input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="Street" className="input py-1.5 text-sm sm:col-span-2" />
            <input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} placeholder="Apt / unit" className="input py-1.5 text-sm sm:col-span-2" />
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="input py-1.5 text-sm sm:col-span-3" />
            <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="ME" maxLength={2} className="input py-1.5 text-center text-sm uppercase" />
            <input value={form.postal} onChange={(e) => setForm({ ...form, postal: e.target.value })} placeholder="ZIP" className="input py-1.5 text-sm sm:col-span-2" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={busy !== ""} className="btn btn-gold min-h-0 px-3 py-1.5 text-xs">
              {busy === "convert" ? "Creating…" : "Create the order"}
            </button>
            {msg && <span className="text-xs text-rust">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

export default function RequestManager({ requests, showingArchived, archivedCount }: { requests: RequestRow[]; showingArchived: boolean; archivedCount: number }) {
  return (
    <div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm text-faded">
        <p>
          Reply to the customer by email to quote it. When they say yes, <em>Turn into order</em> puts it in the
          Orders table with everything a lineup order gets. Archive anything that&apos;s finished or went quiet.
        </p>
        {archivedCount > 0 && (
          <a href={showingArchived ? "/admin" : "/admin?archived=1"} className="whitespace-nowrap underline underline-offset-2 transition hover:text-goldlight">
            {showingArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </a>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {requests.length === 0 && (
          <p className="card p-4 text-sm text-faded">{showingArchived ? "Nothing archived." : "No custom requests waiting."}</p>
        )}
        {requests.map((r) => (
          // keyed on status + order so a card re-renders fresh after a change lands
          <RequestCard key={`${r.id}-${r.status}-${r.orderId ?? ""}`} r={r} />
        ))}
      </div>
    </div>
  );
}
