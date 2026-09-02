"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LINES, SIZES, fmtPrice, type Product, type ProductLine } from "@/lib/products";

type Draft = {
  name: string;
  slug: string;
  species: string;
  line: ProductLine;
  blurb: string;
  story: string;
  priceDollars: string; // edited as "39.99"
  trackStock: boolean;
  stock: Record<string, string>; // edited as strings
  image: string;
  card: string;
  badge: string;
  samplePhoto: boolean;
};

function toDraft(p: Product): Draft {
  const stock: Record<string, string> = {};
  for (const s of SIZES) stock[s] = String(p.stock?.[s] ?? 0);
  return {
    name: p.name,
    slug: p.slug,
    species: p.species,
    line: p.line ?? "botanical",
    blurb: p.blurb,
    story: p.story,
    priceDollars: (p.priceCents / 100).toFixed(2),
    trackStock: p.trackStock,
    stock,
    image: p.image,
    card: p.card,
    badge: p.badge ?? "",
    samplePhoto: Boolean(p.samplePhoto),
  };
}

export default function ProductManager() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [fatal, setFatal] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/products");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFatal(data.error ?? "Could not load products.");
        return;
      }
      setProducts(data.products);
      setFatal("");
    } catch {
      setFatal("Could not load products — check your connection and reload.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addProduct() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New design" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.product) {
        setProducts((prev) => [...(prev ?? []), data.product]);
      } else {
        setFatal(data.error ?? "Could not create the product.");
      }
    } catch {
      setFatal("Could not create the product.");
    }
    setCreating(false);
  }

  if (fatal) {
    return (
      <div className="card border-rust/50 bg-rust/10 p-5 text-sm leading-relaxed">
        {fatal}
      </div>
    );
  }
  if (!products) return <p className="text-faded">Loading products…</p>;

  return (
    <div className="space-y-5">
      {products.map((p) => (
        <ProductEditor
          key={p.id}
          product={p}
          onSaved={(updated) =>
            setProducts((prev) => prev!.map((x) => (x.id === updated.id ? updated : x)))
          }
          onDeleted={(id) => setProducts((prev) => prev!.filter((x) => x.id !== id))}
        />
      ))}
      <button className="btn btn-ghost" onClick={addProduct} disabled={creating}>
        {creating ? "Adding…" : "+ Add a design"}
      </button>
      <p className="text-xs text-faded">
        New designs start hidden — flip them to &quot;Shown&quot; when the photos and
        price are ready.
      </p>
    </div>
  );
}

function ProductEditor({
  product,
  onSaved,
  onDeleted,
}: {
  product: Product;
  onSaved: (p: Product) => void;
  onDeleted: (id: number) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(product));
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setMessage("");
  };

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true);
    setMessage("");
    const cents = Math.round(parseFloat(draft.priceDollars.replace(/[$,]/g, "")) * 100);
    const stock: Record<string, number> = {};
    for (const s of SIZES) stock[s] = Math.max(0, Math.floor(Number(draft.stock[s]) || 0));

    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          slug: draft.slug,
          species: draft.species,
          line: draft.line,
          blurb: draft.blurb,
          story: draft.story,
          priceCents: Number.isFinite(cents) ? cents : undefined,
          trackStock: draft.trackStock,
          stock,
          image: draft.image,
          card: draft.card,
          badge: draft.badge,
          samplePhoto: draft.samplePhoto,
          ...extra,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.product) {
        onSaved(data.product);
        setDraft(toDraft(data.product));
        setDirty(false);
        setMessage("Saved ✓");
      } else {
        setMessage(data.error ?? "Save failed — try again.");
      }
    } catch {
      setMessage("Save failed — check your connection.");
    }
    setSaving(false);
  }

  async function toggleActive() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !product.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.product) {
        onSaved(data.product);
        setMessage(data.product.active ? "Now shown on the site" : "Hidden from the site");
      }
    } catch {
      setMessage("Could not update.");
    }
    setSaving(false);
  }

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(product.id!);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Delete failed.");
    } catch {
      setMessage("Delete failed.");
    }
    setSaving(false);
    setConfirmDelete(false);
  }

  const totalStock = SIZES.reduce((n, s) => n + (Number(draft.stock[s]) || 0), 0);

  return (
    <div className="card p-5">
      {/* header row */}
      <div className="flex flex-wrap items-center gap-4">
        {draft.card ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.card}
            alt=""
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-bone/25 text-[0.6rem] text-faded">
            no photo
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold">
            {draft.name}{" "}
            <span className="text-sm font-normal text-faded">· {fmtPrice(Math.round(parseFloat(draft.priceDollars || "0") * 100) || product.priceCents)}</span>
          </p>
          <p className="text-xs text-faded">
            /shop/{draft.slug}
            {" · "}{draft.line === "stencil" ? "Graphic & Stencil" : "Botanical"}
            {draft.trackStock ? ` · ${totalStock} in stock` : " · always available"}
          </p>
        </div>
        <span className="flex-1" />
        <button
          onClick={toggleActive}
          disabled={saving}
          className={
            "rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition " +
            (product.active
              ? "bg-gold text-inkdeep"
              : "border border-bone/25 text-faded hover:border-gold")
          }
        >
          {product.active ? "Shown" : "Hidden"}
        </button>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-full border border-bone/25 px-3.5 py-1.5 text-xs font-medium text-bone transition hover:border-gold"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {/* availability — always visible */}
      <div className="mt-4 rounded-xl bg-black/20 p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              checked={!draft.trackStock}
              onChange={() => set("trackStock", false)}
            />
            Always available (made to order)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              checked={draft.trackStock}
              onChange={() => set("trackStock", true)}
            />
            Track stock by size
          </label>
        </div>
        {draft.trackStock && (
          <div className="mt-3 flex flex-wrap gap-3">
            {SIZES.map((s) => (
              <label key={s} className="text-xs text-faded">
                <span className="mb-1 block text-center font-semibold text-bone">{s}</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={draft.stock[s]}
                  onChange={(e) =>
                    set("stock", { ...draft.stock, [s]: e.target.value })
                  }
                  className="input w-16 px-2 py-1.5 text-center"
                />
              </label>
            ))}
            <p className="w-full text-xs text-faded">
              0 = that size shows as sold out. Counts go down automatically when orders
              are paid.
            </p>
          </div>
        )}
      </div>

      {/* full editor */}
      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Price (USD)</span>
            <input className="input" value={draft.priceDollars} onChange={(e) => set("priceDollars", e.target.value)} placeholder="39.99" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">URL name (slug)</span>
            <input className="input" value={draft.slug} onChange={(e) => set("slug", e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Lineup</span>
            <select className="input" value={draft.line} onChange={(e) => set("line", e.target.value as ProductLine)}>
              {LINES.map((l) => (
                <option key={l.key} value={l.key}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {draft.line === "stencil" ? "Style line (italic, under the name)" : "Species line (italic, under the name)"}
            </span>
            <input
              className="input"
              value={draft.species}
              onChange={(e) => set("species", e.target.value)}
              placeholder={draft.line === "stencil" ? "Hand-cut stencil · Celestial" : "Paper birch · Betula papyrifera"}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Card one-liner</span>
            <input className="input" value={draft.blurb} onChange={(e) => set("blurb", e.target.value)} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Story (the design&apos;s own page)</span>
            <textarea className="input resize-y" rows={4} value={draft.story} onChange={(e) => set("story", e.target.value)} />
          </label>

          <PhotoField label="Grid photo (square)" value={draft.card} onChange={(url) => set("card", url)} />
          <PhotoField label="Design page photo" value={draft.image} onChange={(url) => set("image", url)} />

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Badge (optional)</span>
            <input className="input" value={draft.badge} onChange={(e) => set("badge", e.target.value)} placeholder="The original / New / Limited" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={draft.samplePhoto}
              onChange={(e) => set("samplePhoto", e.target.checked)}
            />
            Photo is a technique sample (shows a small honesty note)
          </label>

          <div className="flex items-center gap-3 sm:col-span-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-faded underline underline-offset-2 hover:text-rust"
              >
                Delete this design
              </button>
            ) : (
              <span className="flex items-center gap-2 text-xs">
                Really delete forever?
                <button onClick={remove} disabled={saving} className="font-bold text-rust underline">
                  Yes, delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-faded underline">
                  Keep it
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* save bar */}
      {(dirty || message) && (
        <div className="mt-4 flex items-center gap-3">
          {dirty && (
            <button className="btn btn-gold px-5 py-2 text-sm" onClick={() => save()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
          {message && (
            <span className={"text-sm " + (message.includes("✓") || message.includes("site") ? "text-goldlight" : "text-rust")}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        onChange(data.url);
      } else {
        setError(data.error ?? "Upload failed.");
      }
    } catch {
      setError("Upload failed — check your connection.");
    }
    setUploading(false);
  }

  return (
    <div className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-bone/25 text-[0.55rem] text-faded">
            none
          </div>
        )}
        <button
          type="button"
          className="btn btn-ghost px-4 py-2 text-xs"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
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
      </div>
      {error && <p className="mt-1.5 text-xs text-rust">{error}</p>}
    </div>
  );
}
