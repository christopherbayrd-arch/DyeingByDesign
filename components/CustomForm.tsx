"use client";

import { useState } from "react";
import { SIZES } from "@/lib/products";

export default function CustomForm() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState("busy");
    try {
      const res = await fetch("/api/special-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("done");
      } else {
        setMessage(body.error ?? "That didn't go through. Try again in a minute.");
        setState("error");
      }
    } catch {
      setMessage("That didn't go through. Try again in a minute.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Got it. We&apos;re already thinking about it.</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-faded">
          We read every request and reply within a couple of days with a price and a
          timeline. Keep an eye on your inbox.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Your name</span>
          <input name="name" required maxLength={120} className="input" placeholder="Jane Doe" />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            className="input"
            placeholder="you@email.com"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">Shirt size</span>
        <select name="size" className="input w-auto" defaultValue="">
          <option value="">Not sure yet</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">Tell us about it</span>
        <textarea
          name="idea"
          required
          maxLength={4000}
          rows={6}
          className="input resize-y"
          placeholder="What tree or plant? What's the story behind it? Can you mail us the leaves, or should we find a match? Any colors or ideas you have in mind?"
        />
      </label>

      {/* honeypot — humans never see this */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn btn-gold" disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : "Send the request"}
        </button>
        <p className="text-xs text-faded">
          Custom pieces are quoted one at a time — we&apos;ll reply with a price.
        </p>
      </div>
      {state === "error" && <p className="text-sm text-rust">{message}</p>}
    </form>
  );
}
