"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Status pill on the /admin orders table. Pick a new status and it saves
// straight away — no separate save button.
const LABELS: Record<string, string> = {
  requested: "Awaiting payment",
  paid: "Paid",
  made: "Made",
  shipped: "Shipped",
};

export default function OrderStatus({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(LABELS[status] ? status : "paid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setValue(prev);
        setError(data.error ?? "Didn't save.");
      } else {
        router.refresh();
      }
    } catch {
      setValue(prev);
      setError("Didn't save — check your connection.");
    }
    setBusy(false);
  }

  return (
    <div>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        aria-label="Order status"
        className={
          "rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider outline-none " +
          (value === "requested"
            ? "border-gold/60 bg-transparent text-goldlight"
            : "border-transparent bg-gold/20 text-goldlight")
        }
      >
        {Object.entries(LABELS).map(([k, label]) => (
          <option key={k} value={k} className="bg-ink text-bone">
            {label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[0.65rem] text-rust">{error}</p>}
    </div>
  );
}
