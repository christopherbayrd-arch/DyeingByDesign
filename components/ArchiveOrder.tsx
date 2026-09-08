"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tiny "archive" link under an order's status on /admin. Archived orders
// leave the desk but stay in Sales history and on the customer's account.
export default function ArchiveOrder({ id, archived }: { id: number; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, archived: !archived }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Didn't save.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Didn't save — check your connection.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-1">
      <button type="button" onClick={toggle} disabled={busy} className="text-[0.65rem] text-faded underline underline-offset-2 transition hover:text-goldlight">
        {busy ? "…" : archived ? "put back" : "archive"}
      </button>
      {error && <p className="text-[0.65rem] text-rust">{error}</p>}
    </div>
  );
}
