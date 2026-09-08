import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import CogsManager from "@/components/CogsManager";

export const metadata: Metadata = {
  title: "COGS",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function AdminCogsPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">COGS</h1>
      <AdminNav active="cogs" />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faded">
        What a shirt costs you to make. Four steps: what you pay for blanks, what
        you pay for materials and how many shirts a purchase covers, the product
        types you build from them, then each design on the site with its margin at
        today&apos;s price. Everything updates as you type; hit Save when you&apos;re
        done. Nothing here shows on the site.
      </p>
      <div className="mt-8">
        <CogsManager />
      </div>
    </div>
  );
}
