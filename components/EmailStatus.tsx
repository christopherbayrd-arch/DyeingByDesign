"use client";

import { useState } from "react";

type Props = { hasKey: boolean; notify: string; canEmailCustomers: boolean; pushEnabled?: boolean };

export default function EmailStatus({ hasKey, notify, canEmailCustomers, pushEnabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [good, setGood] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [pushGood, setPushGood] = useState(false);

  async function sendTestPush() {
    setPushBusy(true);
    setPushMessage("");
    try {
      const res = await fetch("/api/admin/test-push", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setPushGood(res.ok);
      setPushMessage(res.ok ? "Sent — your phone should buzz any second." : data.error ?? "Could not send.");
    } catch {
      setPushGood(false);
      setPushMessage("Could not reach the server.");
    }
    setPushBusy(false);
  }

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

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-bone/10 pt-4">
        <span
          className={
            "rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider " +
            (pushEnabled ? "bg-gold text-inkdeep" : "border border-bone/25 text-faded")
          }
        >
          {pushEnabled ? "Phone on" : "Phone off"}
        </span>
        <p className="text-sm text-faded">
          {pushEnabled ? (
            <>Orders and custom requests also push to your phone through Pushover.</>
          ) : (
            <>
              Phone alerts aren&apos;t set up. Install Pushover, then add{" "}
              <code>PUSHOVER_USER_KEY</code> and <code>PUSHOVER_APP_TOKEN</code> in Vercel
              (steps in <code>lib/notify.ts</code>).
            </>
          )}
        </p>
        <span className="flex-1" />
        <button className="btn btn-ghost px-4 py-2 text-xs" onClick={sendTestPush} disabled={pushBusy}>
          {pushBusy ? "Sending…" : "Send test push"}
        </button>
      </div>
      {pushMessage && (
        <p className={"mt-3 text-sm " + (pushGood ? "text-goldlight" : "text-rust")}>{pushMessage}</p>
      )}
    </div>
  );
}
