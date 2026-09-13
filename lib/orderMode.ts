// Server-only helpers for how a shirt gets paid for.
// (Client components can't see env vars, so pages work this out and pass
// the answer down as a prop.)
import { onHand, paysByCard, type Product } from "@/lib/products";

// True once STRIPE_SECRET_KEY is set in Vercel. Until then every order
// takes the email / order request route, whatever ORDER_MODE says.
export function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Can this exact piece be bought by card right now? Pages hand the answer
// down to the browser, which can't read env vars itself.
export function cardCheckout(
  p: Product,
  size: string,
  color: string,
  variant = "",
  qty = 1
): boolean {
  return paysByCard(stripeReady(), onHand(p, size, color, variant), qty);
}

