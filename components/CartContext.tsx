"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { isColorKey } from "@/lib/products";

// Each cart line carries a snapshot of what the buyer saw (name, price, photo)
// so the cart renders instantly. The server always re-checks real prices and
// stock from the database at checkout — the snapshot is display-only.
export type CartLine = {
  slug: string;
  size: string;
  color: string;     // color key, see COLORS in lib/products.ts
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
const STORAGE_KEY = "dbd-cart-v3"; // v3: lines carry a color

const lineKey = (l: CartLine) => `${l.slug}|${l.size}|${l.color}`;

// Phone cart + laptop cart → one cart (same shirt on both keeps the bigger qty)
function mergeLines(a: CartLine[], b: CartLine[]): CartLine[] {
  const out = new Map<string, CartLine>();
  for (const l of [...a, ...b]) {
    const k = lineKey(l);
    const prev = out.get(k);
    out.set(k, prev ? { ...prev, qty: Math.min(10, Math.max(prev.qty, l.qty)) } : l);
  }
  return [...out.values()];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const { status } = useSession();
  const synced = useRef(false);          // this session's cart has been merged with the account's
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // (a color that's been retired from COLORS drops out of the cart quietly)
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && l.slug && l.size && l.color && isColorKey(l.color)));
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

  // Signed in: pull the account's cart once, merge it with what's here,
  // then keep the account copy up to date as the cart changes.
  useEffect(() => {
    if (status !== "authenticated") {
      synced.current = false;
      return;
    }
    if (!ready || synced.current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !Array.isArray(data.lines)) return;
        synced.current = true;
        setLines((local) => {
          const merged = mergeLines(data.lines, local);
          fetch("/api/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: merged }) }).catch(() => {});
          return merged;
        });
      } catch {
        // offline or sign in not set up — the browser copy still works
      }
    })();
    return () => { cancelled = true; };
  }, [status, ready]);

  useEffect(() => {
    if (!synced.current || status !== "authenticated") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) }).catch(() => {});
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [lines, status]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const i = prev.findIndex((p) => p.slug === line.slug && p.size === line.size && p.color === line.color);
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
