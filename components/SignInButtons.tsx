"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

// The buttons on /account/signin. Only the ways that are switched on get
// rendered (the server page decides), so nobody taps a dead button.
type Props = {
  methods: { google: boolean; apple: boolean; facebook: boolean; email: boolean };
  callbackUrl: string;
  error?: string;
};

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already signed up another way. Use the same button you used the first time, or the email link.",
  EmailSignin: "We couldn't send the sign in email just now. Try again in a minute.",
  Verification: "That link has expired or was already used. Ask for a new one below.",
  AccessDenied: "That sign in was turned down.",
  Configuration: "Sign in isn't finished being set up. Try the email link, or order as a guest.",
  Default: "Something went wrong signing you in. Try again.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.4-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}

export default function SignInButtons({ methods, callbackUrl, error }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(error ? ERRORS[error] ?? ERRORS.Default : "");

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setBusy("email");
    setMsg("");
    try {
      const res = await signIn("resend", { email: email.trim(), callbackUrl, redirect: false });
      if (res?.error) setMsg(ERRORS[res.error] ?? ERRORS.Default);
      else window.location.href = `/account/check-email?email=${encodeURIComponent(email.trim())}`;
    } catch {
      setMsg(ERRORS.Default);
    }
    setBusy("");
  }

  const social = [
    methods.google && { id: "google", label: "Continue with Google", mark: <GoogleMark /> },
    methods.apple && { id: "apple", label: "Continue with Apple", mark: <span aria-hidden="true" className="text-lg leading-none"></span> },
    methods.facebook && { id: "facebook", label: "Continue with Facebook", mark: <span aria-hidden="true" className="font-bold text-[#1877F2]">f</span> },
  ].filter(Boolean) as { id: string; label: string; mark: React.ReactNode }[];

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-xl border border-rust/50 bg-rust/10 p-3 text-sm">{msg}</p>}

      {social.length > 0 && (
        <div className="space-y-2.5">
          {social.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={busy !== ""}
              onClick={() => { setBusy(s.id); signIn(s.id, { callbackUrl }); }}
              className="btn btn-ghost w-full justify-center gap-3"
            >
              {s.mark}
              {busy === s.id ? "Opening…" : s.label}
            </button>
          ))}
        </div>
      )}

      {methods.email && (
        <form onSubmit={emailLink} className="space-y-2.5">
          {social.length > 0 && (
            <p className="text-center text-xs uppercase tracking-wider text-faded">or</p>
          )}
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Email me a sign in link</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@email.com"
              className="input"
            />
          </label>
          <button type="submit" disabled={busy !== "" || !email.includes("@")} className="btn btn-gold w-full">
            {busy === "email" ? "Sending…" : "Send the link"}
          </button>
          <p className="text-xs text-faded">No password. The link lands in your inbox and signs you in with one tap.</p>
        </form>
      )}
    </div>
  );
}
