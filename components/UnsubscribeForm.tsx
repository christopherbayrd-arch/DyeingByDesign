"use client";

import { useState } from "react";
import Link from "next/link";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function go() {
    setState("busy");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      setState(data.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card mt-8 p-7">
        <p className="font-display text-xl">You&apos;re off the list.</p>
        <p className="mt-2 text-sm leading-relaxed text-faded">
          You won&apos;t get drop emails from us again. The shop stays right
          where it is if you ever want to wander back.
        </p>
        <Link href="/" className="btn btn-ghost mt-5">
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="card mt-8 p-7">
      <button className="btn btn-gold w-full" onClick={go} disabled={state === "busy" || !token}>
        {state === "busy" ? "One sec…" : "Confirm unsubscribe"}
      </button>
      {!token && (
        <p className="mt-3 text-sm text-rust">
          This link is missing its code. Use the unsubscribe link at the bottom of
          any drop email.
        </p>
      )}
      {state === "error" && (
        <p className="mt-3 text-sm text-rust">
          That link didn&apos;t work — it may already have been used. Reply to any
          of our emails and we&apos;ll take you off by hand.
        </p>
      )}
      <p className="mt-4 text-xs text-faded">
        Changed your mind? Just close this page.
      </p>
    </div>
  );
}
