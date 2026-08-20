"use client";

import { useState } from "react";

type Props = { hasKey: boolean; notify: string; canEmailCustomers: boolean };

export default function EmailStatus({ hasKey, notify, canEmailCustomers }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [good, setGood] = useState(false);

  const live = hasKey && Boolean(notify);

  async function sendTest() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setGood(true);
        setMessage(`Sent to ${data.to} — check your inbox (and spam, first time).`);
      } else {
        setGood(false);
        setMessage(data.error ?? "Could not send.");
      }
    } catch {
      setGood(false);
      setMessage("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <div className="card mt-8 p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={
            "rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider " +
            (live ? "bg-gold text-inkdeep" : "border border-bone/25 text-faded")
          }
        >
          {live ? "Alerts on" : "Alerts off"}
        </span>
        <p className="text-sm text-faded">
          {live ? (
            <>
              New orders and custom requests are emailed to{" "}
              <strong className="text-bone">{notify}</strong>.
              {!canEmailCustomers && " Customers aren't emailed yet (needs a verified sending domain — see README)."}
            </>
          ) : (
            <>
              Email alerts aren&apos;t set up yet. Add <code>RESEND_API_KEY</code> and{" "}
              <code>NOTIFY_EMAIL</code> in Vercel, then redeploy. Orders still save here
              either way.
            </>
          )}
        </p>
        <span className="flex-1" />
        <button className="btn btn-ghost px-4 py-2 text-xs" onClick={sendTest} disabled={busy}>
          {busy ? "Sending…" : "Send test email"}
        </button>
      </div>
      {message && (
        <p className={"mt-3 text-sm " + (good ? "text-goldlight" : "text-rust")}>{message}</p>
      )}
    </div>
  );
}
