import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import SwapsManager, { type SwapDesign } from "@/components/SwapsManager";
import { getDb } from "@/lib/db";
import { getAllProducts } from "@/lib/catalog";
import { loadSwapsSafe } from "@/lib/swaps";
import { SWAP_DAYS } from "@/lib/swapShared";

export const metadata: Metadata = {
  title: "Swaps",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SwapsPage() {
  const sql = getDb();
  const { swaps, error } = await loadSwapsSafe(sql);
  const designs: SwapDesign[] = ((await getAllProducts().catch(() => null)) ?? []).map((p) => ({
    slug: p.slug,
    name: p.name,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-5 sm:pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Swaps</h1>
      <AdminNav active="swaps" />
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-faded">
        No returns — everything is made for one person — but each piece gets one free size or color
        swap within {SWAP_DAYS} days. They pay to send theirs back, you ship the new one free.
        Marking a swap done puts the piece that came back on the Inventory shelf.
      </p>
      <SwapsManager initial={swaps} designs={designs} error={error} />
    </div>
  );
}
