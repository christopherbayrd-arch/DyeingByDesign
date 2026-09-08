import type { Metadata } from "next";
import CartView from "@/components/CartView";
import { getProducts } from "@/lib/catalog";
import { cardCheckout } from "@/lib/orderMode";

export const metadata: Metadata = {
  title: "Your cart",
};

// Re-checked every minute so a design switched to "Track stock" in the
// admin moves to card checkout without a redeploy.
export const revalidate = 60;

export default async function CartPage() {
  const products = await getProducts();
  // Which designs check out by card right now (see lib/orderMode.ts)
  const cardSlugs = products.filter((p) => cardCheckout(p)).map((p) => p.slug);
  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Almost there</p>
      <h1 className="mb-8 mt-2 font-display text-4xl font-semibold">Your cart</h1>
      <CartView cardSlugs={cardSlugs} />
    </div>
  );
}
