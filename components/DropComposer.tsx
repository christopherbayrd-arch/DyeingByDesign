"use client";

import { useEffect, useState } from "react";

type Info = {
  recipients: number;
  unsubscribed: number;
  history: Record<string, unknown>[];
  canSend: boolean;
  reason: string;
};

export default function DropComposer({ designs }: { designs: { slug: string; name: string }[] }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [message, setMessage] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Shop the drop");
  const [ctaUrl, setCtaUrl] = useState("/shop");
  const [featureSlug, setFeatureSlug] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [good, setGood] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/admin/drop");
      setInfo(await res.json());
    } catch {
      setNote("Could not load the list.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  const ready = subject.trim() && headline.trim() && message.trim();

  async function post(testOnly: boolean) {
    setBusy(testOnly ? "test" : "send");
    setNote("");
    try {
      const res = await fetch("/api/admin/drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, headline, message, ctaLabel, ctaUrl, featureSlug, testOnly }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setGood(true);
        setNote(
          testOnly
            ? `Test sent to ${data.to}. Check it over before sending for real.`
            : `Sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}.${data.failed ? ` ${data.failed} failed.` : ""}`
        );
        if (!testOnly) load();
      } else {
        setGood(false);
        setNote(data.error ?? "That didn't go through.");
      }
    } catch {
      setGood(false);
      setNote("That didn't go through.");
    }
    setBusy("");
    setConfirming(false);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_290px]">
      {/* composer */}
      <div className="card space-y-5 p-6">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Subject line</span>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="The Dark Harvest drop is live"
          />
          <span className="mt-1 block text-xs text-faded">
            What they see in their inbox. Short and specific beats clever.
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Headline</span>
          <input
            className="input"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="20 shirts. Numbered. Gone when they're gone."
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Message</span>
          <textarea
            className="input resize-y"
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={"Tell them what you made and why it's worth their time.\n\nLeave a blank line between paragraphs."}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Button text</span>
            <input className="input" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Button goes to</span>
            <input className="input" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="/shop" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Feature a design (optional)</span>
          <select className="input w-auto" value={featureSlug} onChange={(e) => setFeatureSlug(e.target.value)}>
            <option value="">No photo</option>
            {designs.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-faded">
            Drops its photo, name, and price into the middle of the email.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-bone/10 pt-5">
          <button
            className="btn btn-ghost px-5 py-2.5 text-sm"
            disabled={!ready || busy !== ""}
            onClick={() => post(true)}
          >
            {busy === "test" ? "Sending…" : "Send test to me"}
          </button>

          {!confirming ? (
            <button
              className="btn btn-gold px-5 py-2.5 text-sm"
              disabled={!ready || busy !== "" || !info?.recipients}
              onClick={() => setConfirming(true)}
            >
              Send to {info?.recipients ?? 0} {info?.recipients === 1 ? "subscriber" : "subscribers"}
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-bone">Send for real?</strong>
              <button className="btn btn-gold px-4 py-2 text-sm" disabled={busy !== ""} onClick={() => post(false)}>
                {busy === "send" ? "Sending…" : "Yes, send it"}
              </button>
              <button className="text-faded underline underline-offset-2" onClick={() => setConfirming(false)}>
                Not yet
              </button>
            </span>
          )}
        </div>

        {note && <p className={"text-sm " + (good ? "text-goldlight" : "text-rust")}>{note}</p>}
      </div>

      {/* sidebar */}
      <aside className="space-y-4">
        <div className="card p-5">
          <p className="kicker">The list</p>
          <p className="mt-2 font-display text-4xl font-semibold text-goldlight">
            {info ? info.recipients : "—"}
          </p>
          <p className="text-sm text-faded">
            {info?.recipients === 1 ? "person waiting" : "people waiting"}
            {info?.unsubscribed ? ` · ${info.unsubscribed} unsubscribed` : ""}
          </p>
          {info && !info.canSend && (
            <p className="mt-3 border-t border-bone/10 pt-3 text-xs leading-relaxed text-faded">
              {info.reason}
            </p>
          )}
        </div>

        <div className="card p-5">
          <p className="kicker">Already sent</p>
          {!info || info.history.length === 0 ? (
            <p className="mt-2 text-sm text-faded">Nothing yet.</p>
          ) : (
            <ul className="mt-2 space-y-2.5 text-sm">
              {info.history.map((h) => (
                <li key={String(h.id)} className="border-b border-bone/5 pb-2 last:border-0">
                  <p className="text-bone">{String(h.subject)}</p>
                  <p className="text-xs text-faded">
                    {new Date(String(h.created_at)).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {String(h.sent)} sent
                    {Number(h.failed) > 0 ? ` · ${String(h.failed)} failed` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs leading-relaxed text-faded">
          Everyone gets their own copy — no one sees anyone else&apos;s address —
          and every email carries an unsubscribe link, which is both the law and
          the decent thing to do.
        </p>
      </aside>
    </div>
  );
}
