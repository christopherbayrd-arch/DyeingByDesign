// Server-only helpers for how a shirt gets paid for.
// (Client components can't see env vars, so pages work this out and pass
// the answer down as a prop.)
import { paysByCard, type Product } from "@/lib/products";

// True once STRIPE_SECRET_KEY is set in Vercel. Until then every order
// takes the email / order request route, whatever ORDER_MODE says.
export function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function cardCheckout(p: Pick<Product, "trackStock">): boolean {
  return paysByCard(p, stripeReady());
}
