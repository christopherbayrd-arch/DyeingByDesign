"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Stripe test payments land in the order list like any other order. They're
// stamped and tagged, kept out of Sales history, COGS and the make queue, and
// this clears them out for good in one go — no bin, they were never real.
export default function ClearTestOrders({ count }: { count: number }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clear() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-tests" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Couldn't clear those.");
      else {
        setSure(false);
        router.refresh();
      }
    } catch {
      setError("Couldn't clear those — check your connection.");
    }
    setBusy(false);
  }

  if (count === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-bone/15 bg-inset p-4 text-sm">
      <p className="text-faded">
        <strong className="text-bone">
          {count} test order{count === 1 ? "" : "s"}
        </strong>{" "}
        from Stripe test mode. They&apos;re already left out of Sales history, your costs and the
        make queue, so they only sit here until you clear them.
      </p>
      {!sure ? (
        <button
          type="button"
          onClick={() => setSure(true)}
          className="mt-2 text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
        >
          Clear the test orders
        </button>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-xs text-faded">Gone for good, no undo. Sure?</span>
          <button type="button" onClick={clear} disabled={busy} className="btn btn-gold px-4 py-1.5 text-xs">
            {busy ? "Clearing…" : `Yes, clear ${count}`}
          </button>
          <button type="button" onClick={() => setSure(false)} className="text-xs text-faded underline underline-offset-2">
            never mind
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
    </div>
  );
}
