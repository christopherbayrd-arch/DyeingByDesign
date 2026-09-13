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
import { isColorKey, pieceKey, type ProductKind } from "@/lib/products";

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
  variant?: string;      // which design goes on a bandana
  kind?: ProductKind;    // shirt | bandana (for the set price)
};

type CartApi = {
  lines: CartLine[];
  ready: boolean;
  add: (line: CartLine) => void;
  remove: (index: number) => void;
  removeKeys: (keys: string[]) => void;
  setQty: (index: number, qty: number) => void;
  clear: () => void;
  count: number;
  subtotalCents: number;
};

const CartCtx = createContext<CartApi | null>(null);
const STORAGE_KEY = "dbd-cart-v3"; // v3: lines carry a color
const PAID_KEY = "dbd-paid-v1";    // what the trip to Stripe was actually for

// The same name the shelf uses, so a cart line and a shelf count line up
export const lineKey = (l: CartLine) => pieceKey(l.slug, l.color, l.size, l.variant ?? "");

// Checkout can be for part of the cart, so the pieces being paid for are
// noted before the browser leaves for Stripe. Coming back to /success, those
// come out of the cart and anything else stays put. (sessionStorage lives in
// the tab, so it survives the round trip to Stripe and back.)
export function markPaid(keys: string[]) {
  try {
    sessionStorage.setItem(PAID_KEY, JSON.stringify(keys));
  } catch {
    // no session storage: /success falls back to emptying the whole cart
  }
}

export function takePaid(): string[] | null {
  try {
    const raw = sessionStorage.getItem(PAID_KEY);
    sessionStorage.removeItem(PAID_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.every((k) => typeof k === "string") ? parsed : null;
  } catch {
    return null;
  }
}

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
      const i = prev.findIndex(
        (p) => p.slug === line.slug && p.size === line.size && p.color === line.color && (p.variant ?? "") === (line.variant ?? "")
      );
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

  // Take out just the pieces that were paid for, leaving the rest of the cart
  const removeKeys = useCallback((keys: string[]) => {
    const gone = new Set(keys);
    setLines((prev) => prev.filter((l) => !gone.has(lineKey(l))));
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
    () => ({ lines, ready, add, remove, removeKeys, setQty, clear, count, subtotalCents }),
    [lines, ready, add, remove, removeKeys, setQty, clear, count, subtotalCents]
  );

  return <CartCtx.Provider value={api}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
