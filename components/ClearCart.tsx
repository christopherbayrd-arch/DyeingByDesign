"use client";

import { useEffect, useRef } from "react";
import { takePaid, useCart } from "@/components/CartContext";

// Dropped onto the success page. A checkout can be for part of the cart —
// the ready to ship pieces, or one Buy now shirt — so this takes out exactly
// what was paid for and leaves the rest of the cart alone. If the note of
// what was paid for didn't survive the trip, it empties the cart, which is
// what it always used to do.
export default function ClearCart() {
  const { ready, clear, removeKeys } = useCart();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const paid = takePaid();
    if (paid && paid.length > 0) removeKeys(paid);
    else clear();
  }, [ready, clear, removeKeys]);

  return null;
}
