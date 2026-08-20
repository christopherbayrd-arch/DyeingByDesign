import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import DropComposer from "@/components/DropComposer";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Announce a drop",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function DropPage() {
  const products = await getProducts();
  const designs = products.map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Announce a drop</h1>
      <AdminNav active="drop" />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
        Write it once and it goes to everyone on the drop list. Send yourself a
        test first — it&apos;s the same email your subscribers will get.
      </p>
      <DropComposer designs={designs} />
    </div>
  );
}
