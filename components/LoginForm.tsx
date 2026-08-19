"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "That password didn't work.");
    } catch {
      setError("Could not reach the site. Try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card mt-8 w-full space-y-4 p-6 text-left">
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">Password</span>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="••••••••"
        />
      </label>
      <button className="btn btn-gold w-full" disabled={busy}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      {error && <p className="text-sm text-rust">{error}</p>}
      <p className="text-xs leading-relaxed text-faded">
        This is the ADMIN_PASSWORD set in your hosting settings. Forgot it? Change it in
        Vercel → Settings → Environment Variables, then redeploy.
      </p>
    </form>
  );
}
