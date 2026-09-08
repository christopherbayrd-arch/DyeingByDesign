"use client";

import { SessionProvider } from "next-auth/react";
import { CartProvider } from "@/components/CartContext";

// Everything client side that needs to know who's signed in and what's
// in the cart. The session is fetched once per page load, not on every
// window focus, to keep the database quiet.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <CartProvider>{children}</CartProvider>
    </SessionProvider>
  );
}
