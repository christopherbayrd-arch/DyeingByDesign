"use client";

import { useMemo, useState } from "react";
import { colorName, ONE_SIZE } from "@/lib/products";
import { RETURN_ADDRESS } from "@/lib/site";
import {
  SWAP_DAYS,
  SWAP_LABELS,
  daysSince,
  reasonLabel,
  type Swap,
  type SwapStatus,
} from "@/lib/swapShared";

// ============================================================
//  /admin/swaps — the exchange board.
//
//  Asked for → Approved (they get the address) → Replacement sent →
//  Done (what came back goes on the Inventory shelf). Declined stops
//  it anywhere along the way. Every move can send the customer an
//  email; untick the box to move it quietly.
// ============================================================

export type SwapDesign = { slug: string; name: string };

const OPEN: SwapStatus[] = ["requested", "approved", "sent"];

function when(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ago(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function SwapsManager({
  initial,
  designs,
  error,
}: {
  initial: Swap[];
  designs: SwapDesign[];
  error: string;
}) {
  const [swaps, setSwaps] = useState<Swap[]>(initial);
  const [busy, setBusy] = useState(0);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [tell, setTell] = useState(true);
  const [fromStock, setFromStock] = useState<Record<number, boolean>>({});
  const [confirmRemove, setConfirmRemove] = useState(0);

  const nameOf = (slug: string) =>
    designs.find((d) => d.slug === slug)?.name ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "");

  const piece = (slug: string, variant: string, color: string, size: string) => {
    const what = variant ? `${nameOf(slug)} · ${nameOf(variant)}` : nameOf(slug);
    return [what, color ? colorName(color) : "", size && size !== ONE_SIZE ? size : ""].filter(Boolean).join(" · ");
  };

  const open = useMemo(() => swaps.filter((s) => OPEN.includes(s.status)), [swaps]);
  const closed = useMemo(() => swaps.filter((s) => !OPEN.includes(s.status)), [swaps]);

  async function move(s: Swap, status: SwapStatus) {
    setBusy(s.id);
    setNote(null);
    try {
      const res = await fetch("/api/admin/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: s.id,
          status,
          tell,
          ownerNote: notes[s.id] ?? s.ownerNote,
          ...(status === "sent" ? { fromStock: Boolean(fromStock[s.id]) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.swaps)) {
        setSwaps(data.swaps);
        setNote({
          text:
            `${s.ref} → ${SWAP_LABELS[status].toLowerCase()}.` +
            (data.emailed ? " They've been emailed." : tell ? " (No email went out — email isn't set up.)" : "") +
            (data.shelf ? ` ${data.shelf}` : ""),
          good: true,
        });
      } else {
        setNote({ text: data.error ?? "That didn't save.", good: false });
      }
    } catch {
      setNote({ text: "That didn't save. Check your connection.", good: false });
    }
    setBusy(0);
  }

  async function remove(s: Swap) {
    setConfirmRemove(0);
    setBusy(s.id);
    try {
      const res = await fetch(`/api/admin/swaps?id=${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.swaps)) {
        setSwaps(data.swaps);
        setNote({ text: `${s.ref} removed.`, good: true });
      } else {
        setNote({ text: data.error ?? "Couldn't remove that one.", good: false });
      }
    } catch {
      setNote({ text: "Couldn't remove that one.", good: false });
    }
    setBusy(0);
  }

  if (error) return <p className="card mt-8 p-6 text-sm leading-relaxed text-rust">{error}</p>;

  const card = (s: Swap) => {
    const have = piece(s.slug, s.variant, s.color, s.size);
    const want = piece(s.slug, s.variant, s.wantColor || s.color, s.wantSize || s.size);
    const late = s.orderAt ? daysSince(s.orderAt) > SWAP_DAYS : false;
    const working = busy === s.id;
    const addr = s.address;
    const shipTo = addr
      ? [s.name, addr.line1, addr.line2, [addr.city, addr.state].filter(Boolean).join(", "), addr.postal]
          .filter(Boolean)
          .join(" · ")
      : "";

    return (
      <article key={s.id} className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-display text-xl font-semibold">
            {s.ref}
            <span className="ml-2 text-sm font-normal text-faded">{s.name || s.email}</span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-faded">
            <span className="rounded-full border border-gold/40 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-goldlight">
              {SWAP_LABELS[s.status]}
            </span>
            <span title={new Date(s.createdAt).toLocaleString()}>asked {ago(daysSince(s.createdAt))}</span>
          </p>
        </div>

        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-faded">They have </span>
            <span className="text-bone">{have}</span>
          </p>
          <p>
            <span className="text-faded">They want </span>
            <strong className="text-goldlight">{want}</strong>
          </p>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faded">
          <span>{reasonLabel(s.reason)}</span>
          {s.orderRef && <span>· order {s.orderRef.replace("email_", "")}</span>}
          {s.orderAt && <span>· bought {when(s.orderAt)}</span>}
          {!s.lineId && <span className="text-rust">· not matched to an order line</span>}
          {late && <span className="text-rust">· past the {SWAP_DAYS} day window</span>}
          <a href={`mailto:${s.email}`} className="underline underline-offset-2 hover:text-goldlight">
            {s.email}
          </a>
        </p>

        {s.note && <p className="mt-2 rounded-xl bg-black/20 px-3 py-2 text-sm leading-relaxed text-faded">{s.note}</p>}
        {shipTo && <p className="mt-2 text-xs text-faded">New one goes to: {shipTo}</p>}

        {OPEN.includes(s.status) && (
          <>
            <label className="mt-4 block text-sm">
              <span className="mb-1.5 block text-faded">
                {s.status === "requested"
                  ? RETURN_ADDRESS
                    ? "Anything to add to the email?"
                    : "Where should they send it? (goes in the email)"
                  : "Anything to add to the email?"}
              </span>
              <textarea
                className="input min-h-16 py-2 text-sm"
                value={notes[s.id] ?? s.ownerNote}
                onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
                placeholder={
                  s.status === "requested" && !RETURN_ADDRESS
                    ? "Dyeing By Design, 12 Maple St, Brunswick, ME 04011"
                    : "Optional"
                }
              />
            </label>

            {s.status === "approved" && (
              <label className="mt-3 flex items-start gap-2 text-sm text-faded">
                <input
                  type="checkbox"
                  checked={Boolean(fromStock[s.id])}
                  onChange={(e) => setFromStock({ ...fromStock, [s.id]: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-[#cf9440]"
                />
                <span>
                  The replacement came off the shelf
                  <span className="block text-xs">Takes one {want} off the Inventory count.</span>
                </span>
              </label>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {s.status === "requested" && (
                <button type="button" className="btn btn-gold" disabled={working} onClick={() => move(s, "approved")}>
                  {working ? "…" : "Approve · send the address"}
                </button>
              )}
              {s.status === "approved" && (
                <button type="button" className="btn btn-gold" disabled={working} onClick={() => move(s, "sent")}>
                  {working ? "…" : "Replacement sent"}
                </button>
              )}
              {(s.status === "sent" || s.status === "approved") && (
                <button type="button" className="btn btn-ghost" disabled={working} onClick={() => move(s, "done")}>
                  {working ? "…" : "Theirs came back · done"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost text-rust"
                disabled={working}
                onClick={() => move(s, "declined")}
              >
                Decline
              </button>
            </div>
          </>
        )}

        {!OPEN.includes(s.status) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-faded">
              {s.status === "done"
                ? `Done ${when(s.doneAt ?? "")}${s.fromStock ? " · replacement came off the shelf" : ""}`
                : `Declined ${when(s.decidedAt ?? "")}${s.ownerNote ? ` · ${s.ownerNote}` : ""}`}
            </p>
            {confirmRemove === s.id ? (
              <button type="button" onClick={() => remove(s)} className="text-xs font-semibold text-rust underline underline-offset-2">
                Remove it for good?
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(s.id)} className="text-xs text-faded underline underline-offset-2 hover:text-rust">
                Remove
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="mt-6 space-y-5">
      {note && (
        <p className={"rounded-xl px-4 py-3 text-sm " + (note.good ? "bg-gold/15 text-bone" : "bg-rust/15 text-bone")}>
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-faded">
          {open.length === 0
            ? "Nothing waiting."
            : `${open.length} swap${open.length === 1 ? "" : "s"} in progress.`}
        </p>
        <label className="flex items-center gap-2 text-sm text-faded">
          <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} className="h-4 w-4 accent-[#cf9440]" />
          Email the customer on every change
        </label>
      </div>

      {!RETURN_ADDRESS && open.some((s) => s.status === "requested") && (
        <p className="rounded-xl bg-black/20 px-4 py-3 text-xs leading-relaxed text-faded">
          No return address is set on the site, so type where they should send it in the box below and it
          goes in the approval email. To have it filled in every time, set <code>RETURN_ADDRESS</code> in{" "}
          <code>lib/site.ts</code>.
        </p>
      )}

      {open.length > 0 && <div className="space-y-4">{open.map(card)}</div>}

      {closed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-sm text-goldlight underline underline-offset-2"
          >
            {showDone ? "Hide" : `Show finished (${closed.length})`}
          </button>
          {showDone && <div className="mt-4 space-y-4">{closed.map(card)}</div>}
        </div>
      )}

      {swaps.length === 0 && (
        <p className="card p-6 text-sm leading-relaxed text-faded">
          No swaps yet. When someone asks for a different size or color from{" "}
          <a href="/swap" className="text-goldlight underline underline-offset-2">
            the swap page
          </a>
          , it lands here and you get an email.
        </p>
      )}
    </div>
  );
}
