import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import ProductManager from "@/components/ProductManager";

export const metadata: Metadata = {
  title: "Products & stock",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function AdminProductsPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Products & stock</h1>
      <AdminNav active="products" />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
        Changes here go live on the site within about a minute. &quot;Always
        available&quot; means made to order — no limits. &quot;Only sell what&apos;s on
        hand&quot; sells from the counts on the{" "}
        <a href="/admin/inventory" className="text-goldlight underline underline-offset-2">Inventory</a> tab:
        checkout blocks anything you don&apos;t have, and every paid order takes it off.
      </p>
      <div className="mt-8">
        <ProductManager />
      </div>
    </div>
  );
}
