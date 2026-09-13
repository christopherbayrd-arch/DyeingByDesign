import type { Metadata } from "next";
import CartView from "@/components/CartView";
import { getProducts } from "@/lib/catalog";
import { stripeReady } from "@/lib/orderMode";
import { shelfMap } from "@/lib/products";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: true },
};

// Re-checked every minute, so a piece that lands on the Inventory shelf
// moves to card checkout within a minute, with no redeploy.
export const revalidate = 60;

export default async function CartPage() {
  const products = await getProducts();
  // What's on the shelf right now. The shelf decides how fast a line ships;
  // the Stripe keys decide whether it can be paid for here. Both get handed
  // to the browser, which can't see either for itself.
  const shelf = shelfMap(products);
  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Almost there</p>
      <h1 className="mb-8 mt-2 font-display text-4xl font-semibold">Your cart</h1>
      <CartView shelf={shelf} stripeReady={stripeReady()} />
    </div>
  );
}
