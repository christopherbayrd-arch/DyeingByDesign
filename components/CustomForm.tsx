"use client";

import { useRef, useState } from "react";
import { COLORS, SIZES } from "@/lib/products";
import ShirtPreview from "@/components/ShirtPreview";
import { ARTWORK_ACCEPT, ARTWORK_MAX_BYTES, REQUEST_KINDS, type RequestKind } from "@/lib/requests";

export default function CustomForm({ initialKind = "leaves" }: { initialKind?: RequestKind }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<RequestKind>(initialKind);
  const [color, setColor] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const wantsArtwork = kind === "logo" || kind === "graphic";

  function pickFile(f: File | undefined) {
    setFileError("");
    if (!f) {
      setFileName("");
      return;
    }
    if (f.size > ARTWORK_MAX_BYTES) {
      setFileError("That file is over 10MB — export a smaller version.");
      if (fileRef.current) fileRef.current.value = "";
      setFileName("");
      return;
    }
    setFileName(f.name);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (fileError) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setState("busy");
    try {
      const res = await fetch("/api/special-request", { method: "POST", body: data });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setNote(body.artworkNote ? "One thing: your file didn't upload, so reply to our email with it attached." : "");
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
        {note && <p className="mx-auto mt-3 max-w-md text-sm text-goldlight">{note}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6 sm:p-8">
      {/* what kind of piece */}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium">What are we making?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REQUEST_KINDS.map((k) => (
            <label
              key={k.key}
              className={
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition " +
                (kind === k.key
                  ? "border-gold bg-gold/10"
                  : "border-bone/15 hover:border-bone/40")
              }
            >
              <input
                type="radio"
                name="kind"
                value={k.key}
                checked={kind === k.key}
                onChange={() => setKind(k.key)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-bone">{k.label}</span>
                <span className="block text-xs leading-relaxed text-faded">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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

      <div className="text-sm">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-medium">Shirt color</span>
          <span className="text-faded">{color ? COLORS.find((c) => c.key === color)?.name : "Not sure yet — we can suggest one"}</span>
        </div>
        <input type="hidden" name="color" value={color} />
        <div className="flex items-start gap-4">
          <div className="flex flex-1 flex-wrap gap-2.5">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={c.name}
                title={c.name}
                onClick={() => setColor(color === c.key ? "" : c.key)}
                className={
                  "relative h-9 w-9 rounded-full border-2 transition " +
                  (color === c.key ? "border-goldlight scale-110" : "border-bone/20 hover:border-bone/60")
                }
                style={{ background: c.hex }}
              >
                {color === c.key && (
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white drop-shadow">✓</span>
                )}
              </button>
            ))}
          </div>
          <div className="shrink-0 rounded-xl bg-black/20 p-2 text-center">
            <ShirtPreview color={color || null} size={92} />
            <p className="mt-0.5 text-[0.6rem] uppercase tracking-wider text-faded">the blank</p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-faded">
          Bleach reads differently on every blank — dark colors give the highest contrast, brights go soft and pastel. Tap again to clear.
        </p>
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
          placeholder={
            kind === "leaves"
              ? "What tree or plant? What's the story behind it? Can you mail us the leaves, or should we find a match? Any colors or ideas you have in mind?"
              : kind === "logo"
                ? "Whose logo, and where should it sit — chest, back, sleeve? Roughly how big? Anything you'd want changed or simplified for a stencil?"
                : kind === "graphic"
                  ? "Describe the shape or scene — a moose silhouette, a moon phase, a mountain line. Where on the shirt, and how big? Attach a reference if you have one."
                  : "Describe the idea however makes sense. Placement, size, feel, the story behind it — the more the better."
          }
        />
      </label>

      {/* artwork upload — shown for every type, nudged for logos and graphics */}
      <div className="text-sm">
        <span className="mb-1.5 block font-medium">
          Artwork or reference {wantsArtwork ? "" : "(optional)"}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost px-4 py-2 text-xs"
            onClick={() => fileRef.current?.click()}
          >
            {fileName ? "Change file" : "Attach a file"}
          </button>
          <input
            ref={fileRef}
            type="file"
            name="artwork"
            accept={ARTWORK_ACCEPT}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {fileName ? (
            <span className="text-xs text-bone">
              {fileName}{" "}
              <button
                type="button"
                className="ml-1 text-faded underline underline-offset-2"
                onClick={() => {
                  if (fileRef.current) fileRef.current.value = "";
                  pickFile(undefined);
                }}
              >
                remove
              </button>
            </span>
          ) : (
            <span className="text-xs text-faded">
              PNG, JPG, SVG, or PDF up to 10MB.{" "}
              {wantsArtwork
                ? "A clean, high-contrast version cuts the sharpest stencil — vector (SVG/PDF) is ideal."
                : "A photo of the leaf or a sketch of the idea helps."}
            </span>
          )}
        </div>
        {fileError && <p className="mt-1.5 text-xs text-rust">{fileError}</p>}
      </div>

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
