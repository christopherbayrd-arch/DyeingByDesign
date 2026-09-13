import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import ClearCart from "@/components/ClearCart";
import { fmtPrice } from "@/lib/products";

export const metadata: Metadata = {
  title: "Order received",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let email: string | null = null;
  let total: number | null = null;
  const key = process.env.STRIPE_SECRET_KEY;

  if (key && session_id) {
    try {
      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.retrieve(session_id);
      email = session.customer_details?.email ?? null;
      total = session.amount_total;
    } catch {
      // still show the thank-you page
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pt-20 text-center">
      <ClearCart />
      <p className="kicker">Order received</p>
      <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
        It&apos;s already made.
      </h1>
      {/* Every card order is for a piece that was on the shelf when it sold —
          the site won't take a card for anything else — so this page never
          promises making time it doesn't need. */}
      <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-faded">
        Thank you. This one was bleached, washed, and waiting on the shelf, so
        there&apos;s nothing to wait on now.
        {total != null && (
          <>
            {" "}
            We&apos;ve got your order for <strong className="text-bone">{fmtPrice(total)}</strong>.
          </>
        )}
        {email && (
          <>
            {" "}
            A receipt is on its way to <strong className="text-bone">{email}</strong>.
          </>
        )}{" "}
        It goes in the mail in the next day or two, and we&apos;ll email you tracking
        the moment it does.
      </p>
      <div className="mt-9 flex justify-center gap-3">
        <Link href="/shop" className="btn btn-ghost">
          Keep browsing
        </Link>
        <Link href="/" className="btn btn-gold">
          Back home
        </Link>
      </div>
    </div>
  );
}
