import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import InventoryManager, { type InvDesign } from "@/components/InventoryManager";
import { getDb } from "@/lib/db";
import { getAllProducts } from "@/lib/catalog";
import { loadItems, loadMoves } from "@/lib/inventory";
import { RETIRED_SLUGS } from "@/lib/products";
import { asset } from "@/lib/assets";
import type { InvItem, InvMove } from "@/lib/inventoryShared";

export const metadata: Metadata = {
  title: "Inventory",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const sql = getDb();
  let items: InvItem[] = [];
  let moves: InvMove[] = [];
  let error = "";
  if (!sql) {
    error = "No database connected yet. Inventory is kept in the database (README step 3).";
  } else {
    try {
      items = await loadItems(sql);
      moves = await loadMoves(sql);
    } catch {
      error =
        "The inventory tables aren't in the database yet. Run the latest schema.sql in Neon (it's safe to re-run), then reload this page.";
    }
  }

  // Designs you can put on the shelf: everything in the lineup, plus any
  // retired or hidden design that still has shirts sitting on hand.
  const products = (await getAllProducts().catch(() => null)) ?? [];
  const stocked = new Set(items.filter((i) => i.kind === "shirt" && i.qty > 0).map((i) => i.slug));
  const designs: InvDesign[] = products
    .filter((p) => (p.active && !RETIRED_SLUGS.includes(p.slug)) || stocked.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      image: p.card ? (/^https?:\/\//.test(p.card) ? p.card : asset(p.card)) : "",
      inLineup: p.active && !RETIRED_SLUGS.includes(p.slug),
    }));
  // shirts on the shelf for a design that no longer exists at all
  for (const slug of stocked) {
    if (!designs.some((d) => d.slug === slug)) {
      designs.push({ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), image: "", inLineup: false });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-5 sm:pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Inventory</h1>
      <AdminNav active="inventory" />
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-faded">
        What&apos;s on the shelf. Sales on Quick sale take shirts off by themselves, making a shirt in the
        Make queue uses a blank, and every change is written down under History.
      </p>
      <InventoryManager initialItems={items} initialMoves={moves} designs={designs} error={error} />
    </div>
  );
}
