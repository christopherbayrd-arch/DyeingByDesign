import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import DropComposer from "@/components/DropComposer";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Announce a drop",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Prefill = { subject?: string; headline?: string; message?: string; cta?: string; url?: string };

export default async function DropPage({ searchParams }: { searchParams: Promise<Prefill> }) {
  const products = await getProducts();
  const designs = products.map((p) => ({ slug: p.slug, name: p.name }));
  // "Email this to the drop list" on a news post lands here with the fields filled in
  const q = await searchParams;
  const initial = {
    subject: String(q.subject ?? "").slice(0, 160),
    headline: String(q.headline ?? "").slice(0, 120),
    message: String(q.message ?? "").slice(0, 6000),
    ctaLabel: String(q.cta ?? "").slice(0, 40),
    ctaUrl: String(q.url ?? "").slice(0, 300),
  };

  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Announce a drop</h1>
      <AdminNav active="drop" />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
        Write it once and it goes to everyone on the drop list. Send yourself a
        test first — it&apos;s the same email your subscribers will get.
      </p>
      <DropComposer designs={designs} initial={initial} />
    </div>
  );
}
