"use client";

import { useState } from "react";

// Lays out as a row when the parent is wide enough and stacks when it isn't —
// wrap the parent in `@container` (footer, homepage) so it sizes to its column,
// not the whole screen.
export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("busy");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("done");
      } else {
        setMessage(data.error ?? "That didn't go through. Try again?");
        setState("error");
      }
    } catch {
      setMessage("That didn't go through. Try again?");
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-sm font-medium text-goldlight">You&apos;re on the list. Talk soon.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 @xs:flex-row @xs:flex-wrap">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="input @xs:min-w-0 @xs:flex-1"
        aria-label="Email address"
        autoComplete="email"
        inputMode="email"
      />
      <button className="btn btn-gold whitespace-nowrap" disabled={state === "busy"}>
        {state === "busy" ? "Adding…" : "Join the list"}
      </button>
      {state === "error" && <p className="text-xs text-rust @xs:w-full">{message}</p>}
    </form>
  );
}
