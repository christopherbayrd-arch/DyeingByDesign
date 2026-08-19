"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/CartContext";

// Dropped onto the success page: empties the cart once after a paid checkout.
export default function ClearCart() {
  const { ready, clear } = useCart();
  const done = useRef(false);

  useEffect(() => {
    if (ready && !done.current) {
      done.current = true;
      clear();
    }
  }, [ready, clear]);

  return null;
}
