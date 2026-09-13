"use client";

import { useState } from "react";

// ============================================================
//  The gate in front of taking anything out of Sales history.
//
//  Four deliberate bits of friction, in the order that catches the
//  most mistakes:
//    1. it names exactly what leaves
//    2. it shows what the numbers change by, and which month they
//       come out of — a wrong row is obvious from the money
//    3. a reason, so the Removed list isn't a mystery later
//    4. the reference typed out by hand. A checkbox loses to muscle
//       memory; typing DBD-0042 does not.
//  The button stays dead until 3 and 4 are both satisfied.
// ============================================================

const money = (c: number) => `$${(Math.abs(c) / 100).toFixed(2)}`;

export default function ConfirmRemove({
  title,
  what,
  reference,
  amountCents,
  cogsCents,
  month,
  askRestock = true,
  restockHint,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  what: string[];               // the lines that leave, in words
  reference: string;            // what has to be typed
  amountCents: number;          // revenue that leaves
  cogsCents: number | null;     // cost that leaves (null = never costed)
  month: string;                // "September 2026"
  askRestock?: boolean;
  restockHint?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string, restock: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [restock, setRestock] = useState(false);

  const matches = typed.trim().toLowerCase() === reference.trim().toLowerCase();
  const ready = reason.trim().length > 0 && matches;
  const margin = cogsCents === null ? null : amountCents - cogsCents;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto whitespace-normal bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="card my-8 w-full max-w-lg overflow-hidden whitespace-normal p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="kicker">Out of the books</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
          </div>
          <button type="button" onClick={onCancel} className="text-2xl leading-none text-faded hover:text-bone" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mt-5 rounded-xl bg-black/20 p-4">
          <p className="kicker">What leaves</p>
          <ul className="mt-2 space-y-1 text-sm text-bone">
            {what.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>

        <div className="mt-3 rounded-xl border border-gold/25 bg-black/20 p-4">
          <p className="kicker text-goldlight">What the numbers do</p>
          <dl className="mt-2 space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-faded">Revenue</dt>
              <dd className="font-semibold text-rust">−{money(amountCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faded">Cost</dt>
              <dd className={cogsCents === null ? "text-faded" : "font-semibold text-rust"}>
                {cogsCents === null ? "never costed" : `−${money(cogsCents)}`}
              </dd>
            </div>
            <div className="flex justify-between border-t border-bone/15 pt-1.5">
              <dt className="text-faded">Margin</dt>
              <dd className={margin === null ? "text-faded" : "font-semibold text-rust"}>
                {margin === null ? "—" : `−${money(margin)}`}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-faded">
            Comes out of <strong className="text-bone">{month}</strong>. If those numbers
            aren&apos;t what you expected, this is the wrong row — close this and check.
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-faded">
          This is a correction to your records. Nothing is refunded and no money moves — if the
          customer is owed anything, do that in Stripe. It goes to <em>Removed</em> at the bottom
          of this page and can be put back.
        </p>

        {askRestock && (
          <label className="mt-4 flex items-start gap-2 text-sm text-faded">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="mt-1" />
            <span>
              <span className="font-medium text-bone">Put it back on the Inventory shelf</span>
              <span className="mt-0.5 block text-xs leading-relaxed">
                {restockHint ?? "Tick this if the piece never actually left, so the shelf count goes back up."}
              </span>
            </span>
          </label>
        )}

        <label className="mt-4 block text-sm text-faded">
          Why is it coming out?
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className="input mt-1 py-2 text-sm"
            placeholder="rang it up twice, my own test…"
          />
        </label>

        <label className="mt-3 block text-sm text-faded">
          Type <strong className="font-mono text-bone">{reference}</strong> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={"input mt-1 py-2 font-mono text-sm " + (typed && !matches ? "border-rust" : "")}
            placeholder={reference}
          />
        </label>

        {error && <p className="mt-3 text-sm text-rust">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            className="btn btn-gold grow disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!ready || busy}
            onClick={() => onConfirm(reason.trim(), restock)}
          >
            {busy ? "Taking it out…" : "Take it out"}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Never mind
          </button>
        </div>
      </div>
    </div>
  );
}
