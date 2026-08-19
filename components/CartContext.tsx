"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Each cart line carries a snapshot of what the buyer saw (name, price, photo)
// so the cart renders instantly. The server always re-checks real prices and
// stock from the database at checkout — the snapshot is display-only.
export type CartLine = {
  slug: string;
  size: string;
  qty: number;
  name: string;
  priceCents: number;
  card: string;
};

type CartApi = {
  lines: CartLine[];
  ready: boolean;
  add: (line: CartLine) => void;
  remove: (index: number) => void;
  setQty: (index: number, qty: number) => void;
  clear: () => void;
  count: number;
  subtotalCents: number;
};

const CartCtx = createContext<CartApi | null>(null);
const STORAGE_KEY = "dbd-cart-v2";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && l.slug && l.size));
      }
    } catch {
      // corrupted cart? start fresh
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage unavailable — cart just won't persist
    }
  }, [lines, ready]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const i = prev.findIndex((p) => p.slug === line.slug && p.size === line.size);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...line, qty: Math.min(10, next[i].qty + line.qty) };
        return next;
      }
      return [...prev, line];
    });
  }, []);

  const remove = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setQty = useCallback((index: number, qty: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, qty: Math.min(10, Math.max(1, qty)) } : l))
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const subtotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + l.priceCents * l.qty, 0),
    [lines]
  );

  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  const api = useMemo(
    () => ({ lines, ready, add, remove, setQty, clear, count, subtotalCents }),
    [lines, ready, add, remove, setQty, clear, count, subtotalCents]
  );

  return <CartCtx.Provider value={api}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
