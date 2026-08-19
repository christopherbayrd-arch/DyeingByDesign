import type { Metadata } from "next";
import CartView from "@/components/CartView";

export const metadata: Metadata = {
  title: "Your cart",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pt-14">
      <p className="kicker">Almost there</p>
      <h1 className="mb-8 mt-2 font-display text-4xl font-semibold">Your cart</h1>
      <CartView />
    </div>
  );
}
