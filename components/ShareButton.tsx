"use client";

import { useState } from "react";

// Phones get the share sheet (text it, post it, AirDrop it); computers copy the link.
export default function ShareButton({
  url,
  title,
  label = "Share",
  className = "",
}: {
  url: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // closed the share sheet, or the browser said no — nothing to do
    }
  }

  return (
    <button type="button" onClick={share} className={className}>
      {copied ? "Link copied" : label}
    </button>
  );
}
