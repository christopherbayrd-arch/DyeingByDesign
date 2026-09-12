"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventCard from "@/components/EventCard";
import NewsCard from "@/components/NewsCard";
import {
  blankPost,
  craftFairStarter,
  emailDraftFor,
  eventDateLine,
  eventPhase,
  isDay,
  leftoverPlaceholders,
  postedLine,
  slugify,
  type NewsKind,
  type NewsPost,
} from "@/lib/newsFormat";

export type SitePhoto = { src: string; label: string; preview: string };
type Sales = Record<number, { shirts: number; revenue: number; cash: number }>;

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function statusOf(p: NewsPost): { label: string; cls: string } {
  if (!p.published) return { label: "Draft", cls: "border border-bone/30 text-faded" };
  if (p.kind === "event" && p.startsOn && eventPhase(p) === "over") {
    return { label: "Wrapped up", cls: "border border-bone/20 text-faded" };
  }
  return { label: "Live", cls: "bg-gold text-inkdeep" };
}

export default function NewsManager({
  initialPosts,
  error,
  photos,
  siteUrl,
}: {
  initialPosts: NewsPost[];
  error: string;
  photos: SitePhoto[];
  siteUrl: string;
}) {
  const [posts, setPosts] = useState<NewsPost[]>(initialPosts);
  const [sales, setSales] = useState<Sales>({});
  const [draft, setDraft] = useState<NewsPost | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  async function reload() {
    try {
      const res = await fetch("/api/admin/news", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.posts)) setPosts(data.posts);
      if (data.sales) setSales(data.sales);
    } catch {
      // keep what's on screen
    }
  }
  useEffect(() => {
    if (!error) reload();
  }, [error]);

  function show(next: NewsPost, touched: boolean) {
    if (!next.id && !next.slug && next.title) next = { ...next, slug: slugify(next.title) };
    setDraft(next);
    setSlugTouched(touched);
    setNote(null);
    setConfirmDelete(false);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function set<K extends keyof NewsPost>(key: K, value: NewsPost[K]) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, [key]: value };
      // Until a post has been live, its web address follows the title (unless
      // you typed one yourself). Once it's been live the address stays put,
      // so links people already have keep working.
      if (key === "title" && !d.publishedAt && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
  }

  // An address counts as hand-typed if it was ever live, or doesn't match the title
  function keepsAddress(p: NewsPost) {
    return Boolean(p.publishedAt) || (Boolean(p.slug) && p.slug !== slugify(p.title));
  }

  // Starter text says [Fair name] and [Town]; once those fields are filled
  // in (when you tap out of them), the summary and post pick them up.
  function fillIn(tag: string, value: string) {
    const v = value.trim();
    if (!v || v.includes("[")) return;
    setDraft((d) => (d ? { ...d, summary: d.summary.split(tag).join(v), body: d.body.split(tag).join(v) } : d));
  }
  // tapping into a "[Fair name]" style field selects it, so typing replaces it
  function selectPlaceholder(e: React.FocusEvent<HTMLInputElement>) {
    if (e.target.value.startsWith("[")) e.target.select();
  }

  const leftover = useMemo(
    () => (draft ? leftoverPlaceholders(draft.title, draft.summary, draft.body, draft.venue, draft.town, draft.booth) : []),
    [draft]
  );

  const emailHref = useMemo(() => {
    if (!draft?.id || !draft.published) return "";
    const e = emailDraftFor(draft);
    const q = new URLSearchParams({
      subject: e.subject,
      headline: e.headline,
      message: e.message.slice(0, 1800),
      cta: draft.kind === "event" ? "See the details" : "Read it",
      url: `/news/${draft.slug}`,
    });
    return `/admin/drop?${q.toString()}`;
  }, [draft]);

  async function save(action: "save" | "publish" | "unpublish") {
    if (!draft) return;
    setBusy(action);
    setNote(null);
    try {
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.post) {
        setDraft(data.post);
        setSlugTouched((t) => t || Boolean(data.post.publishedAt));
        setNote({
          good: true,
          text:
            action === "publish"
              ? "It's live on the site."
              : action === "unpublish"
                ? "Taken down. It's a draft again."
                : data.post.published
                  ? "Saved. The site shows the change right away."
                  : "Draft saved. Only you can see it.",
        });
        await reload();
      } else {
        setNote({ good: false, text: data.error ?? "That didn't save." });
      }
    } catch {
      setNote({ good: false, text: "That didn't save. Check your connection and try again." });
    }
    setBusy("");
  }

  async function remove() {
    if (!draft) return;
    if (!draft.id) {
      setDraft(null);
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/admin/news?id=${draft.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDraft(null);
        await reload();
      } else {
        setNote({ good: false, text: data.error ?? "Couldn't delete it." });
      }
    } catch {
      setNote({ good: false, text: "Couldn't delete it. Check your connection." });
    }
    setBusy("");
    setConfirmDelete(false);
  }

  async function upload(file: File) {
    setUploading(true);
    setNote(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "news");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) set("imageUrl", data.url);
      else setNote({ good: false, text: data.error ?? "Upload failed." });
    } catch {
      setNote({ good: false, text: "Upload failed. Check your connection." });
    }
    setUploading(false);
  }

  async function copyLink() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${siteUrl}/news/${draft.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNote({ good: false, text: `Couldn't copy. The link is ${siteUrl}/news/${draft.slug}` });
    }
  }

  const photoPreview = draft?.imageUrl
    ? photos.find((p) => p.src === draft.imageUrl)?.preview ?? draft.imageUrl
    : "";
  const isEvent = draft?.kind === "event";
  const previewReady = draft && draft.title && (!isEvent || isDay(draft.startsOn));
  const eventSales = draft?.id ? sales[draft.id] : undefined;

  if (error) {
    return <p className="card mt-8 p-6 text-sm leading-relaxed text-rust">{error}</p>;
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ---------- the list ---------- */}
      <aside>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold px-5 py-2.5 text-sm" onClick={() => show(craftFairStarter(), false)}>
            + New event
          </button>
          <button type="button" className="btn btn-ghost px-5 py-2.5 text-sm" onClick={() => show(blankPost("news"), false)}>
            + News post
          </button>
        </div>
        {posts.length === 0 ? (
          <p className="mt-5 text-sm leading-relaxed text-faded">
            Nothing yet. <strong className="text-bone">New event</strong> starts you off with a
            craft fair post you can fill in.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {posts.map((p) => {
              const st = statusOf(p);
              const s = sales[p.id];
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => show({ ...p }, keepsAddress(p))}
                    className={
                      "card block w-full p-4 text-left transition hover:border-gold/60 " +
                      (draft?.id === p.id ? "!border-gold/80" : "")
                    }
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-gold">
                        {p.kind === "event" ? "Event" : "News"}
                      </span>
                      <span className={"rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider " + st.cls}>
                        {st.label}
                      </span>
                    </span>
                    <span className="mt-1.5 block font-display text-lg font-semibold leading-snug">{p.title}</span>
                    <span className="block text-xs text-faded">
                      {p.kind === "event" ? eventDateLine(p) : postedLine(p.publishedAt) || "Not posted yet"}
                    </span>
                    {s && s.shirts > 0 && (
                      <span className="mt-1.5 block text-xs font-medium text-goldlight">
                        Sold here: {s.shirts} {s.shirts === 1 ? "shirt" : "shirts"} · {dollars(s.revenue)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* ---------- the editor ---------- */}
      <section ref={editorRef} className="min-w-0 scroll-mt-24">
        {!draft ? (
          <div className="card flex min-h-60 flex-col items-center justify-center p-8 text-center">
            <p className="font-display text-2xl font-semibold">Pick a post, or start a new one.</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-faded">
              Doing a craft fair? <strong className="text-bone">New event</strong> fills in a starter post.
              Swap in the fair&apos;s name, day, and booth, then publish.
            </p>
          </div>
        ) : (
          <div className="card space-y-6 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-full border border-bone/20 p-1 text-sm">
                {(["event", "news"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("kind", k)}
                    className={
                      "rounded-full px-4 py-1.5 font-medium transition " +
                      (draft.kind === k ? "bg-gold text-inkdeep" : "text-faded hover:text-goldlight")
                    }
                  >
                    {k === "event" ? "Event" : "News post"}
                  </button>
                ))}
              </div>
              <span className={"rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider " + statusOf(draft).cls}>
                {draft.id ? statusOf(draft).label : "New · not saved"}
              </span>
            </div>

            <div className="text-sm">
              <label className="block">
                <span className="mb-1.5 block font-medium">{isEvent ? "Name of the fair or market" : "Title"}</span>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  onFocus={selectPlaceholder}
                  onBlur={(e) => fillIn("[Fair name]", e.target.value)}
                  placeholder={isEvent ? "Harvest Craft Fair" : "Cedar is here"}
                />
              </label>
              <label className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-faded">
                <span>Web address: {siteUrl.replace(/^https?:\/\//, "")}/news/</span>
                <input
                  className="input inline-block w-auto min-w-0 flex-1 px-2 py-1 text-xs"
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Short summary</span>
              <textarea
                className="input resize-y"
                rows={2}
                value={draft.summary}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="A line or two. Shows on the home page card, the news page, and in Google."
              />
            </label>

            {isEvent && (
              <fieldset className="space-y-4 rounded-2xl border border-bone/10 p-4 sm:p-5">
                <legend className="kicker px-2">When &amp; where</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">Day</span>
                    <input type="date" className="input" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">
                      Last day <span className="font-normal text-faded">(only if it runs more than one)</span>
                    </span>
                    <input type="date" className="input" value={draft.endsOn} min={draft.startsOn || undefined} onChange={(e) => set("endsOn", e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">Opens</span>
                    <input type="time" className="input" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">Closes</span>
                    <input type="time" className="input" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium">Place</span>
                    <input className="input" value={draft.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Community Center" />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1.5 block font-medium">
                      Street address <span className="font-normal text-faded">(for the Directions button)</span>
                    </span>
                    <input className="input" value={draft.street} onChange={(e) => set("street", e.target.value)} placeholder="123 Main St" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">Town</span>
                    <input
                      className="input"
                      value={draft.town}
                      onChange={(e) => set("town", e.target.value)}
                      onBlur={(e) => fillIn("[Town]", e.target.value)}
                      placeholder="Brunswick"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">State</span>
                    <input className="input" value={draft.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">
                      Booth <span className="font-normal text-faded">(if you know it)</span>
                    </span>
                    <input className="input" value={draft.booth} onChange={(e) => set("booth", e.target.value)} placeholder="Booth 14" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">
                      The fair&apos;s website <span className="font-normal text-faded">(optional)</span>
                    </span>
                    <input className="input" value={draft.eventUrl} onChange={(e) => set("eventUrl", e.target.value)} placeholder="https://" inputMode="url" />
                  </label>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#cf9440]"
                    checked={draft.showOnHome}
                    onChange={(e) => set("showOnHome", e.target.checked)}
                  />
                  <span>
                    Show the countdown card on the home page
                    <span className="block text-xs text-faded">It takes itself down the day after the event.</span>
                  </span>
                </label>
              </fieldset>
            )}

            <div className="text-sm">
              <span className="mb-1.5 block font-medium">
                Photo <span className="font-normal text-faded">(optional)</span>
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-bone/25 text-[0.6rem] text-faded">
                    none
                  </div>
                )}
                <button type="button" className="btn btn-ghost px-4 py-2 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? "Uploading…" : "Upload photo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.target.value = "";
                  }}
                />
                <select
                  className="input w-auto max-w-full py-2 text-sm"
                  value=""
                  onChange={(e) => e.target.value && set("imageUrl", e.target.value)}
                  aria-label="Use a photo already on the site"
                >
                  <option value="">Or use one already on the site…</option>
                  {photos.map((p) => (
                    <option key={p.src} value={p.src}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {draft.imageUrl && (
                  <button type="button" className="text-xs text-faded underline underline-offset-2 hover:text-rust" onClick={() => set("imageUrl", "")}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="text-sm">
              <label className="block">
                <span className="mb-1.5 block font-medium">The post</span>
                <textarea
                  className="input resize-y leading-relaxed"
                  rows={9}
                  value={draft.body}
                  onChange={(e) => set("body", e.target.value)}
                  placeholder={"What's happening, what you're bringing, anything people should know.\n\n- Start a line with a dash for a bullet"}
                />
              </label>
              <p className="mt-1.5 text-xs text-faded">
                Leave a blank line between paragraphs. Start a line with “- ” for a bullet. Links you paste in work.
              </p>
            </div>

            {previewReady && (
              <div>
                <p className="kicker mb-3">{isEvent ? "How the home page card looks" : "How it looks on the news page"}</p>
                <div className="pointer-events-none" aria-hidden="true">
                  {isEvent ? (
                    <EventCard post={draft} />
                  ) : (
                    <div className="max-w-sm">
                      <NewsCard post={{ ...draft, publishedAt: draft.publishedAt ?? new Date().toISOString() }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {leftover.length > 0 && (
              <p className="rounded-xl border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-bone">
                Still to fill in before it can go live: <strong>{leftover.join(", ")}</strong>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-bone/10 pt-5">
              {!draft.published ? (
                <>
                  <button type="button" className="btn btn-ghost px-5 py-2.5 text-sm" disabled={busy !== ""} onClick={() => save("save")}>
                    {busy === "save" ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold px-5 py-2.5 text-sm"
                    disabled={busy !== "" || leftover.length > 0}
                    onClick={() => save("publish")}
                  >
                    {busy === "publish" ? "Publishing…" : "Publish"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-gold px-5 py-2.5 text-sm" disabled={busy !== ""} onClick={() => save("save")}>
                    {busy === "save" ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="btn btn-ghost px-5 py-2.5 text-sm" disabled={busy !== ""} onClick={() => save("unpublish")}>
                    {busy === "unpublish" ? "Taking it down…" : "Unpublish"}
                  </button>
                </>
              )}
              <span className="flex-1" />
              {confirmDelete ? (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <strong>Delete it for good?</strong>
                  <button type="button" className="btn btn-ghost px-4 py-2 text-sm hover:!border-rust hover:!text-rust" disabled={busy !== ""} onClick={remove}>
                    {busy === "delete" ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button type="button" className="text-faded underline underline-offset-2" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" className="text-sm text-faded underline underline-offset-2 transition hover:text-rust" onClick={() => setConfirmDelete(true)}>
                  {draft.id ? "Delete" : "Discard"}
                </button>
              )}
            </div>

            {note && <p className={"text-sm " + (note.good ? "text-goldlight" : "text-rust")}>{note.text}</p>}

            {draft.id > 0 && draft.published && (
              <div className="rounded-2xl border border-bone/10 p-4 sm:p-5">
                <p className="kicker">Spread the word</p>
                <div className="mt-3 flex flex-col gap-2.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
                  <a href={`/news/${draft.slug}`} target="_blank" rel="noopener noreferrer" className="text-goldlight underline underline-offset-2">
                    View it on the site ↗
                  </a>
                  <button type="button" onClick={copyLink} className="text-left text-goldlight underline underline-offset-2">
                    {copied ? "Link copied" : "Copy the link (Instagram bio, stories, texts)"}
                  </button>
                  <a href={emailHref} className="text-goldlight underline underline-offset-2">
                    Email it to the drop list →
                  </a>
                </div>
              </div>
            )}

            {draft.id > 0 && isEvent && (
              <div className="rounded-2xl border border-bone/10 p-4 sm:p-5">
                <p className="kicker">At the booth</p>
                <p className="mt-2 text-sm leading-relaxed text-faded">
                  {eventSales && eventSales.shirts > 0 ? (
                    <>
                      Sold here so far: <strong className="text-bone">{eventSales.shirts} {eventSales.shirts === 1 ? "shirt" : "shirts"}</strong>{" "}
                      for <strong className="text-bone">{dollars(eventSales.revenue)}</strong>
                      {eventSales.cash > 0 ? <> ({dollars(eventSales.cash)} cash)</> : null}.{" "}
                    </>
                  ) : (
                    <>Ring up sales on the Quick sale screen and they&apos;ll add up here. </>
                  )}
                  <a href={`/admin/sell?event=${draft.id}`} className="text-goldlight underline underline-offset-2">
                    Open Quick sale for this event →
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
