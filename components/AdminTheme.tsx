"use client";

import { useEffect, useState } from "react";

// ============================================================
//  Light / dark for the order desk only.
//
//  Every colour utility in this app resolves to var(--color-*), so the
//  whole admin flips by setting one attribute on <html> — the palette
//  behind it lives in app/globals.css. The shop itself never changes:
//  leaving /admin unmounts the admin layout, which takes the attribute
//  with it (see AdminThemeScope).
// ============================================================

const KEY = "dbd-admin-theme";
type Mode = "dark" | "light";

function apply(mode: Mode) {
  const el = document.documentElement;
  if (mode === "light") el.setAttribute("data-admin-theme", "light");
  else el.removeAttribute("data-admin-theme");
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // private window or storage off — it just won't be remembered
  }
}

export default function AdminThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    // the no-flash script in app/admin/layout.tsx has already set the
    // attribute; this only brings React's copy in line with the DOM
    setMode(document.documentElement.getAttribute("data-admin-theme") === "light" ? "light" : "dark");
  }, []);

  const light = mode === "light";
  function flip() {
    const next: Mode = light ? "dark" : "light";
    setMode(next);
    apply(next);
  }

  return (
    <button
      type="button"
      onClick={flip}
      title={light ? "Switch the desk back to dark" : "Switch the desk to daylight"}
      aria-label={light ? "Switch to the dark desk" : "Switch to the light desk"}
      className="flex items-center gap-1.5 rounded-full border border-bone/20 px-3 py-1.5 text-sm text-faded transition hover:border-gold/50 hover:text-goldlight"
    >
      {light ? (
        // moon
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        // sun
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
      {light ? "Dark" : "Light"}
    </button>
  );
}

// Mounted once in the admin layout. The admin layout survives moving
// between admin tabs and unmounts when you leave for the shop, which is
// exactly when the daylight palette should stop applying.
export function AdminThemeScope() {
  useEffect(() => () => document.documentElement.removeAttribute("data-admin-theme"), []);
  return null;
}
