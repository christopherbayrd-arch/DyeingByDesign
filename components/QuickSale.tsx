"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BANDANA_PRICES,
  BOOTH_PRICES,
  CUSTOM_SLUG,
  OTHER_SLUG,
  PAY_METHODS,
  isPayMethod,
  payLabel,
  type PayMethod,
} from "@/lib/booth";
import { COLORS, ONE_SIZE, SIZES, colorName } from "@/lib/products";
import { shirtKey, type InvItem } from "@/lib/inventoryShared";

// ============================================================
//  Quick sale — ring up a booth or cash sale in a few taps.
//  Every sale is saved on this device first and then sent, so a
//  weak signal at a fair never loses one: it just waits and goes
//  when the phone is back online (the server ignores repeats).
// ============================================================

export type QuickDesign = { slug: string; name: string; image: string; kind?: "shirt" | "bandana" };
export type QuickEvent = { id: number; title: string; startsOn: string; endsOn: string };

type Line = {
  slug: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  unitCents: number;
  itemId?: number;
  variant?: string;     // the design on a bandana
  variantName?: string; // …spelled out, for the receipt line
};
export type ShelfStock = { shirts: Record<string, number>; others: InvItem[] };
// Everything the old "Record a sale" form on Sales history could do that a
// live booth sale doesn't need. It rides along with the sale so a back dated
// one still works from the offline queue.
type BackOffice = {
  channel?: string;     // market | instagram | other
  buyer?: string;
  shipping?: string;    // charged to them
  fee?: string;         // what the card cost you
  postage?: string;     // what the stamp cost you
  note?: string;
  backdated?: boolean;  // a date was typed by hand, so don't clamp it
};

type Pending = {
  clientId: string;
  soldAt: string;
  pay: string;
  eventId: number | null;
  lines: Line[];
  email?: string;
  extra?: BackOffice;
  state: "sending" | "waiting" | "signin" | "rejected";
  error?: string;
};
type ServerSale = {
  id: number;
  clientId: string;
  at: string;
  pay: string;
  total: number;
  eventId: number | null;
  lines: Line[];
};
type Row = {
  clientId: string;
  id?: number;
  at: string;
  pay: string;
  total: number;
  eventId: number | null;
  lines: Line[];
  state: "saved" | Pending["state"];
  error?: string;
};

const PENDING_KEY = "dbd-quicksale-pending-v1";
const PAY_KEY = "dbd-quicksale-pay";

function readPending(): Pending[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writePending(list: Pending[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // private browsing — the sale still sends, it just can't wait offline
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${r()}${r()}`;
}

function dollars(c: number) {
  return `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
}
function shirtsIn(lines: Line[]) {
  return lines.reduce((n, l) => n + l.qty, 0);
}
function totalOf(lines: Line[]) {
  return lines.reduce((n, l) => n + l.qty * l.unitCents, 0);
}
function lineText(l: Line) {
  const what = l.variantName ? `${l.name} · ${l.variantName}` : l.name;
  return [
    l.qty > 1 ? `${l.qty} × ${what}` : what,
    l.color ? colorName(l.color) : "",
    l.size === ONE_SIZE ? "" : l.size,
  ]
    .filter(Boolean)
    .join(" · ");
}
function timeText(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function shortDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}
function dayBounds() {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  e.setDate(e.getDate() + 1);
  return { from: s.toISOString(), to: e.toISOString() };
}
// Change owed for the bills people usually hand over
function changeHints(total: number): string {
  const bills = [2000, 4000, 5000, 6000, 10000, 20000].filter((b) => b > total).slice(0, 3);
  return bills.map((b) => `${dollars(b)} → ${dollars(b - total)}`).join(" · ");
}
function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

const STATE_TEXT: Record<string, string> = {
  sending: "sending…",
  waiting: "saved on this device, sends when there's signal",
  signin: "log in again to send",
  rejected: "not sent",
};

export default function QuickSale({
  designs,
  events,
  defaultEventId,
  dbReady,
  initialStock,
}: {
  designs: QuickDesign[];
  events: QuickEvent[];
  defaultEventId: number;
  dbReady: boolean;
  initialStock: ShelfStock;
}) {
  // ---- the shirt being rung up ----
  const [slug, setSlug] = useState("");
  const [variant, setVariant] = useState(""); // which design goes on a bandana
  const [otherName, setOtherName] = useState("");
  const [otherItemId, setOtherItemId] = useState(0); // an "other" item from the Inventory shelf
  // what's on the shelf (Inventory), so the booth can see what's left
  const [stock, setStock] = useState<ShelfStock>(initialStock);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [priceIdx, setPriceIdx] = useState(0); // -1 = typed amount
  const [otherPrice, setOtherPrice] = useState("");
  const [pay, setPay] = useState<PayMethod>("cash");
  const [eventId, setEventId] = useState(defaultEventId);
  const [cart, setCart] = useState<Line[]>([]);
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  // "Not at the table" — the old Record a sale fields, folded in here and
  // kept shut by default so the booth stays a two tap screen.
  const [showBack, setShowBack] = useState(false);
  const [soldOn, setSoldOn] = useState("");        // yyyy-mm-dd, empty = right now
  const [channel, setChannel] = useState("market");
  const [buyer, setBuyer] = useState("");
  const [shipCharged, setShipCharged] = useState("");
  const [feePaid, setFeePaid] = useState("");
  const [postagePaid, setPostagePaid] = useState("");
  const [saleNote, setSaleNote] = useState("");

  // ---- what's been rung up ----
  const [server, setServer] = useState<ServerSale[]>([]);
  const [eventTotals, setEventTotals] = useState<{ shirts: number; revenue: number; cash: number } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState("");
  const [toast, setToast] = useState<{ text: string; clientId: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState("");
  const undone = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Pending[]>([]);
  const topRef = useRef<HTMLDivElement>(null);
  const flushing = useRef(false);

  // Load anything left waiting on this device, and the last payment choice
  useEffect(() => {
    setPending(readPending().map((p) => (p.state === "sending" ? { ...p, state: "waiting" } : p)));
    try {
      const saved = localStorage.getItem(PAY_KEY);
      if (saved && isPayMethod(saved)) setPay(saved);
    } catch {
      // fine
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    pendingRef.current = pending;
    if (loaded) writePending(pending);
  }, [pending, loaded]);

  const refresh = useCallback(async () => {
    if (!dbReady) return;
    const { from, to } = dayBounds();
    const q = new URLSearchParams({ from, to });
    if (eventId) q.set("event", String(eventId));
    try {
      const res = await fetch(`/api/admin/booth?${q.toString()}`, { cache: "no-store" });
      if (res.status === 401) {
        setProblem("signin");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.sales)) setServer(data.sales);
      if (data.stock) setStock(data.stock);
      setEventTotals(data.event ?? null);
      setProblem(data.error ?? "");
    } catch {
      // no signal — keep what's on screen
    }
  }, [dbReady, eventId]);

  const send = useCallback(async (sale: Pending): Promise<boolean> => {
    setPending((list) => list.map((p) => (p.clientId === sale.clientId ? { ...p, state: "sending" } : p)));
    try {
      const res = await fetch("/api/admin/booth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: sale.clientId,
          soldAt: sale.soldAt,
          pay: sale.pay,
          eventId: sale.eventId,
          lines: sale.lines,
          email: sale.email,
          ...(sale.extra ?? {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPending((list) => list.filter((p) => p.clientId !== sale.clientId));
        if (undone.current.has(sale.clientId)) {
          // it was undone while it was on its way — take it back out
          await fetch(`/api/admin/booth?client=${sale.clientId}`, { method: "DELETE" }).catch(() => null);
        }
        return true;
      }
      const state: Pending["state"] = res.status === 401 ? "signin" : res.status >= 500 ? "waiting" : "rejected";
      setPending((list) =>
        list.map((p) => (p.clientId === sale.clientId ? { ...p, state, error: data.error ?? "" } : p))
      );
    } catch {
      setPending((list) => list.map((p) => (p.clientId === sale.clientId ? { ...p, state: "waiting" } : p)));
    }
    return false;
  }, []);

  // Send anything that's waiting, then reload the list
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const p of pendingRef.current) {
        if (p.state === "waiting" && !undone.current.has(p.clientId)) await send(p);
      }
    } finally {
      flushing.current = false;
    }
    await refresh();
  }, [send, refresh]);

  useEffect(() => {
    if (!loaded) return;
    flush();
    const timer = setInterval(flush, 20000); // picks up sales from a second phone, too
    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loaded, flush]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- the current piece + this sale ----
  // bandanas are one size and have their own price buttons
  const picked = designs.find((d) => d.slug === slug) ?? null;
  const isBandana = picked?.kind === "bandana";
  const shirtDesigns = designs.filter((d) => d.kind !== "bandana");
  const prices = isBandana ? BANDANA_PRICES : BOOTH_PRICES;
  const typedCents = Math.round(parseFloat(otherPrice.replace(/[$,\s]/g, "")) * 100);
  const unitCents = priceIdx >= 0 ? prices[priceIdx]?.cents ?? 0 : typedCents;
  const priceOk = Number.isFinite(unitCents) && unitCents >= 0 && unitCents <= 100000;
  const designName =
    slug === CUSTOM_SLUG
      ? "Custom piece"
      : slug === OTHER_SLUG
        ? otherName.trim() || "Other"
        : picked?.name ?? "";
  const variantName = variant ? designs.find((d) => d.slug === variant)?.name ?? variant : "";
  const current: Line | null =
    slug && priceOk && (!isBandana || variant)
      ? {
          slug,
          name: designName,
          color,
          size: isBandana ? ONE_SIZE : size,
          qty,
          unitCents,
          ...(slug === OTHER_SLUG && otherItemId ? { itemId: otherItemId } : {}),
          ...(isBandana ? { variant, variantName } : {}),
        }
      : null;

  // on hand counts for the tiles, swatches, and size buttons
  // (a bandana's count is per design, which is the 4th part of its key)
  const onHand = (s: string, c = "", z = "", v = "") => {
    let n = 0;
    for (const [k, q] of Object.entries(stock.shirts)) {
      const [ks, kc, kz, kv = ""] = k.split("|");
      if (ks === s && (!c || kc === c) && (!z || kz === z) && (!v || kv === v)) n += q;
    }
    return n;
  };
  const isDesign = Boolean(slug) && slug !== CUSTOM_SLUG && slug !== OTHER_SLUG;
  // "shirt" everywhere until there are bandanas to sell too
  const hasBandanas = designs.some((d) => d.kind === "bandana");
  const thing = hasBandanas ? "piece" : "shirt";
  const things = hasBandanas ? "pieces" : "shirts";
  // the booth's version of the set price: a shirt already rung up on this
  // sale means the next bandana is $5, not $10
  const shirtsInCart = cart.filter((l) => l.slug !== OTHER_SLUG && !l.variant).reduce((n, l) => n + l.qty, 0);
  const bandanasInCart = cart.filter((l) => Boolean(l.variant)).reduce((n, l) => n + l.qty, 0);
  const priceFor = (d: QuickDesign | null) =>
    d?.kind === "bandana" && shirtsInCart > bandanasInCart ? 1 : 0;
  const shelfOthers = stock.others.filter((o) => o.qty > 0);
  const lines = current ? [...cart, current] : cart;
  const total = totalOf(lines);
  const canRecord = lines.length > 0 && (!slug || priceOk);

  // Picking a design tile: a bandana switches to its own price buttons and
  // its one size, and asks which design goes on it.
  function pickDesign(d: QuickDesign) {
    if (slug === d.slug) {
      setSlug("");
      setVariant("");
      return;
    }
    setSlug(d.slug);
    setVariant("");
    setPriceIdx(priceFor(d));
    if (d.kind === "bandana") setSize(ONE_SIZE);
    else if (size === ONE_SIZE) setSize("");
  }

  function choosePay(k: PayMethod) {
    setPay(k);
    try {
      localStorage.setItem(PAY_KEY, k);
    } catch {
      // fine
    }
  }

  function resetShirt() {
    setSlug("");
    setVariant("");
    setOtherName("");
    setOtherItemId(0);
    setColor("");
    setSize("");
    setQty(1);
    setPriceIdx(0);
    setOtherPrice("");
  }

  // Phones: bring the totals and the design tiles back into view. Bigger
  // screens keep everything in place (the right column stays put).
  function backToTop() {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 72; // clear the sticky header
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }

  function addAnother() {
    if (!current) return;
    setCart((c) => [...c, current]);
    resetShirt();
    backToTop();
  }

  function record() {
    if (!canRecord) return;
    // A typed date means noon that day, so a back dated sale is costed with
    // the COGS sheet that was true then — same rule Record a sale used.
    const typedDay = showBack && soldOn ? new Date(`${soldOn}T12:00:00`) : null;
    const extra: BackOffice | undefined = showBack
      ? {
          channel,
          buyer: buyer.trim() || undefined,
          shipping: shipCharged.trim() || undefined,
          fee: feePaid.trim() || undefined,
          postage: postagePaid.trim() || undefined,
          note: saleNote.trim() || undefined,
          backdated: Boolean(typedDay),
        }
      : undefined;
    const sale: Pending = {
      clientId: newId(),
      soldAt: (typedDay && !Number.isNaN(typedDay.getTime()) ? typedDay : new Date()).toISOString(),
      pay,
      eventId: eventId || null,
      lines,
      email: showEmail && email.includes("@") ? email.trim() : undefined,
      extra,
      state: "sending",
    };
    setPending((list) => [sale, ...list]);
    // take them off the counts on screen right away (the server does the real thing)
    setStock((st) => {
      const shirts = { ...st.shirts };
      let others = st.others;
      for (const l of lines) {
        if (l.slug !== CUSTOM_SLUG && l.slug !== OTHER_SLUG && l.color && l.size) {
          const k = shirtKey(l.slug, l.color, l.size, l.variant ?? "");
          if (k in shirts) shirts[k] = Math.max(0, shirts[k] - l.qty);
        } else if (l.itemId) {
          others = others.map((o) => (o.id === l.itemId ? { ...o, qty: Math.max(0, o.qty - l.qty) } : o));
        }
      }
      return { shirts, others };
    });
    setToast({
      text: `${lines.length === 1 ? lineText(lines[0]) : `${shirtsIn(lines)} ${things}`} · ${dollars(total)} ${payLabel(pay).toLowerCase()}`,
      clientId: sale.clientId,
    });
    resetShirt();
    setCart([]);
    setEmail("");
    setShowEmail(false);
    try {
      navigator.vibrate?.(25);
    } catch {
      // not every phone buzzes
    }
    backToTop();
    send(sale).then((ok) => {
      if (ok) refresh();
    });
  }

  async function remove(clientId: string, id?: number, saved = false) {
    setConfirmRemove("");
    undone.current.add(clientId);
    setPending((list) => list.filter((p) => p.clientId !== clientId));
    if (toast?.clientId === clientId) setToast(null);
    if (!saved) {
      // may still be on its way; the DELETE below catches that case too
      fetch(`/api/admin/booth?client=${clientId}`, { method: "DELETE" }).catch(() => null);
      return;
    }
    try {
      const res = await fetch(id ? `/api/admin/booth?id=${id}` : `/api/admin/booth?client=${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("no");
      setServer((list) => list.filter((s) => s.clientId !== clientId));
    } catch {
      setToast({ text: "No signal, so that one couldn't be removed yet. Try again in a minute.", clientId: "" });
    }
    refresh();
  }

  // ---- today's list: what's still on this device + what the server has ----
  const rows: Row[] = useMemo(() => {
    const onServer = new Set(server.map((s) => s.clientId));
    const local: Row[] = pending
      .filter((p) => !onServer.has(p.clientId))
      .map((p) => ({
        clientId: p.clientId,
        at: p.soldAt,
        pay: p.pay,
        total: totalOf(p.lines),
        eventId: p.eventId,
        lines: p.lines,
        state: p.state,
        error: p.error,
      }));
    const saved: Row[] = server
      .filter((s) => !undone.current.has(s.clientId))
      .map((s) => ({ ...s, state: "saved" as const }));
    return [...local, ...saved].sort((a, b) => b.at.localeCompare(a.at));
  }, [server, pending]);

  const { from: todayFrom } = dayBounds();
  const today = rows
    .filter((r) => r.at >= todayFrom)
    .reduce(
      (t, r) => {
        t.sales += 1;
        t.shirts += shirtsIn(r.lines);
        t.revenue += r.total;
        if (r.pay === "cash") t.cash += r.total;
        else if (r.pay === "card") t.card += r.total;
        else t.other += r.total;
        return t;
      },
      { sales: 0, shirts: 0, revenue: 0, cash: 0, card: 0, other: 0 }
    );
  const waiting = pending.filter((p) => p.state === "waiting" || p.state === "signin").length;
  const needsSignin = problem === "signin" || pending.some((p) => p.state === "signin");
  const event = events.find((e) => e.id === eventId);
  const pendingForEvent = pending.filter((p) => eventId && p.eventId === eventId);
  const eventShirts = (eventTotals?.shirts ?? 0) + pendingForEvent.reduce((n, p) => n + shirtsIn(p.lines), 0);
  const eventRevenue = (eventTotals?.revenue ?? 0) + pendingForEvent.reduce((n, p) => n + totalOf(p.lines), 0);
  const eventCash =
    (eventTotals?.cash ?? 0) + pendingForEvent.filter((p) => p.pay === "cash").reduce((n, p) => n + totalOf(p.lines), 0);
  const todayForEvent = rows.filter((r) => r.at >= todayFrom && eventId && r.eventId === eventId);
  const showWholeEvent = Boolean(event) && eventShirts !== todayForEvent.reduce((n, r) => n + shirtsIn(r.lines), 0);

  const recordLabel = canRecord ? `Record sale · ${dollars(total)} ${payLabel(pay).toLowerCase()}` : "Record sale";

  // ---------- pieces ----------

  const step = (n: number, text: string, hint?: string) => (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full bg-gold text-xs font-bold text-inkdeep">
        {n}
      </span>
      <span className="font-display text-lg font-semibold">{text}</span>
      {hint && <span className="text-xs text-faded">{hint}</span>}
    </div>
  );

  const summaryPanel = (
    <div className="card p-4 sm:p-5">
      <label className="block">
        <span className="kicker">Selling at</span>
        <select
          className="input mt-1.5 py-2.5"
          value={eventId}
          onChange={(e) => setEventId(Number(e.target.value))}
        >
          <option value={0}>No event, just a sale</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} · {shortDay(ev.startsOn)}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-faded">Today</p>
          <p className="font-display text-3xl font-semibold leading-tight">{dollars(today.revenue)}</p>
          <p className="text-xs text-faded">
            {today.shirts} {today.shirts === 1 ? thing : things} · {today.sales} {today.sales === 1 ? "sale" : "sales"}
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-faded">Cash taken</p>
          <p className="font-display text-3xl font-semibold leading-tight text-goldlight">{dollars(today.cash)}</p>
          <p className="text-xs text-faded">
            card {dollars(today.card)}
            {today.other > 0 ? ` · other ${dollars(today.other)}` : ""}
          </p>
        </div>
      </div>
      {showWholeEvent && event && (
        <p className="mt-3 border-t border-bone/10 pt-3 text-xs leading-relaxed text-faded">
          Whole event so far: <strong className="text-bone">{eventShirts} shirts · {dollars(eventRevenue)}</strong> ·
          cash {dollars(eventCash)}
        </p>
      )}
      {waiting > 0 && (
        <p className="mt-3 rounded-xl bg-rust/15 px-3 py-2 text-xs leading-relaxed text-bone">
          {waiting} {waiting === 1 ? "sale is" : "sales are"} saved on this device and will send when there&apos;s signal.
          They already count in the totals.
        </p>
      )}
      {needsSignin && (
        <p className="mt-3 rounded-xl bg-rust/15 px-3 py-2 text-xs leading-relaxed text-bone">
          You&apos;ve been logged out.{" "}
          <a href="/admin/login" className="font-semibold text-goldlight underline underline-offset-2">
            Log in again
          </a>{" "}
          and come back here; anything saved on this device sends by itself.
        </p>
      )}
      {problem && problem !== "signin" && <p className="mt-3 text-xs leading-relaxed text-rust">{problem}</p>}
    </div>
  );

  const cartList = cart.length > 0 && (
    <ul className="space-y-2 text-sm">
      {cart.map((l, i) => (
        <li key={i} className="flex items-start justify-between gap-3">
          <span className="min-w-0">{lineText(l)}</span>
          <span className="flex shrink-0 items-center gap-2">
            {dollars(l.qty * l.unitCents)}
            <button
              type="button"
              aria-label={`Take ${l.name} off this sale`}
              onClick={() => setCart((c) => c.filter((_, j) => j !== i))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-faded transition hover:text-rust"
            >
              ×
            </button>
          </span>
        </li>
      ))}
    </ul>
  );

  const salePanel = (
    <div className="card p-4 sm:p-5">
      <p className="kicker">This sale</p>
      <div className="mt-3">
        {lines.length === 0 ? (
          <p className="text-sm text-faded">Tap a {thing} to start.</p>
        ) : (
          <>
            {cartList}
            {current && (
              <p className={"flex justify-between gap-3 text-sm text-goldlight " + (cart.length ? "mt-2" : "")}>
                <span className="min-w-0">{lineText(current)}</span>
                <span className="shrink-0">{dollars(current.qty * current.unitCents)}</span>
              </p>
            )}
          </>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-bone/10 pt-3">
        <span className="text-sm text-faded">Total</span>
        <span className="font-display text-3xl font-semibold">{dollars(total)}</span>
      </div>
      {pay === "cash" && total > 0 && <p className="mt-1 text-right text-xs text-faded">Change: {changeHints(total)}</p>}

      {/* Everything the old Record a sale form on Sales history did. Shut by
          default: at a table you never need any of it, and an extra tap
          between a customer and their shirt is the wrong trade. */}
      <div className="mt-4 border-t border-bone/10 pt-3">
        {!showBack ? (
          <button
            type="button"
            onClick={() => setShowBack(true)}
            className="text-xs text-faded underline underline-offset-2 transition hover:text-goldlight"
          >
            Not at the table? An Instagram DM, or one you forgot to ring up →
          </button>
        ) : (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="kicker">Not at the table</p>
              <button type="button" onClick={() => setShowBack(false)} className="text-xs text-faded underline underline-offset-2 hover:text-goldlight">
                close
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-faded">
                When was it sold
                <input
                  type="date"
                  value={soldOn}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSoldOn(e.target.value)}
                  className="input mt-1 block w-full py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-faded">
                Where
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input mt-1 block w-full py-1.5 text-sm">
                  <option value="market" className="bg-ink">Market / in person</option>
                  <option value="instagram" className="bg-ink">Instagram / DM</option>
                  <option value="other" className="bg-ink">Other</option>
                </select>
              </label>
              <label className="col-span-2 text-xs text-faded">
                Who bought it (optional)
                <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className="input mt-1 block w-full py-1.5 text-sm" />
              </label>
              <label className="text-xs text-faded">
                Shipping you charged
                <input value={shipCharged} onChange={(e) => setShipCharged(e.target.value)} inputMode="decimal" placeholder="0.00" className="input mt-1 block w-full py-1.5 text-sm" />
              </label>
              <label className="text-xs text-faded">
                Card fee you paid
                <input value={feePaid} onChange={(e) => setFeePaid(e.target.value)} inputMode="decimal" placeholder="0.00" className="input mt-1 block w-full py-1.5 text-sm" />
              </label>
              <label className="col-span-2 text-xs text-faded">
                Postage you paid
                <input value={postagePaid} onChange={(e) => setPostagePaid(e.target.value)} inputMode="decimal" placeholder="0.00" className="input mt-1 block w-full py-1.5 text-sm" />
              </label>
              <label className="col-span-2 text-xs text-faded">
                Note
                <input value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder="Brunswick farmers market" className="input mt-1 block w-full py-1.5 text-sm" />
              </label>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-faded">
              Leave the date empty for right now. Put a date in and the cost gets frozen with the
              COGS sheet that was true that day, not today&apos;s.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        <button type="button" className="btn btn-gold min-h-14 w-full text-base" disabled={!canRecord} onClick={record}>
          {recordLabel}
        </button>
        <button type="button" className="btn btn-ghost w-full text-sm" disabled={!current} onClick={addAnother}>
          + Add another {thing} to this sale
        </button>
      </div>
    </div>
  );

  const todayPanel = (
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="kicker">Rung up today</p>
        <a href="/admin/history" className="text-xs text-faded underline underline-offset-2 hover:text-goldlight">
          Sales history →
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-faded">Nothing yet today.</p>
      ) : (
        <ul className="mt-2 divide-y divide-bone/10">
          {rows.map((r) => (
            <li key={r.clientId} className="flex items-start gap-3 py-2.5 text-sm">
              <span className="w-14 shrink-0 pt-0.5 text-xs text-faded">{timeText(r.at)}</span>
              <span className="min-w-0 flex-1">
                {r.lines.map((l, i) => (
                  <span key={i} className="block">
                    {lineText(l)}
                  </span>
                ))}
                <span className="text-xs text-faded">
                  {payLabel(r.pay)}
                  {r.state !== "saved" && (
                    <>
                      {" · "}
                      <span className={r.state === "rejected" ? "text-rust" : "text-goldlight"}>{STATE_TEXT[r.state]}</span>
                    </>
                  )}
                </span>
                {r.error && r.state !== "saved" && <span className="block text-xs text-rust">{r.error}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{dollars(r.total)}</span>
                {confirmRemove === r.clientId ? (
                  <button
                    type="button"
                    onClick={() => remove(r.clientId, r.id, r.state === "saved")}
                    className="text-xs font-semibold text-rust underline underline-offset-2"
                  >
                    Remove it?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(r.clientId)}
                    className="text-xs text-faded underline underline-offset-2 hover:text-rust"
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ---------- the screen ----------

  return (
    <>
      {!dbReady && (
        <p className="card mt-6 p-4 text-sm leading-relaxed text-rust">
          No database connected yet, so sales can&apos;t be saved to the site. They&apos;ll wait on this
          device until it is.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        {/* ---------- left: pick the shirt ---------- */}
        <div className="min-w-0 space-y-4">
          <div ref={topRef} className="md:hidden">
            {summaryPanel}
          </div>

          {cart.length > 0 && (
            <div className="card border-gold/40 p-4 md:hidden">
              <p className="kicker mb-2">In this sale so far</p>
              {cartList}
            </div>
          )}

          <section className="card p-4 sm:p-5">
            {step(1, cart.length ? `Next ${thing}` : hasBandanas ? "What are they buying?" : "Which shirt?")}
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {designs.map((d) => {
                const on = slug === d.slug;
                const have = onHand(d.slug);
                return (
                  <button
                    key={d.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickDesign(d)}
                    className={
                      "relative aspect-square overflow-hidden rounded-2xl border-2 bg-panel text-left transition " +
                      (on ? "border-gold shadow-[0_0_0_3px_rgba(207,148,64,0.3)]" : "border-transparent")
                    }
                  >
                    {d.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-inkdeep/95 via-inkdeep/70 to-transparent px-2.5 pb-2 pt-10 leading-tight">
                      <span className="block font-display text-base font-semibold text-bone">{d.name}</span>
                      {have > 0 && <span className="block text-[0.7rem] font-semibold text-goldlight">{have} on hand</span>}
                    </span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs font-bold text-inkdeep">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
              {[
                { key: CUSTOM_SLUG, name: "Custom piece", sub: "one of a kind" },
                { key: OTHER_SLUG, name: "Other", sub: "tie dye, hoodie…" },
              ].map((t) => {
                const on = slug === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSlug(on ? "" : t.key)}
                    className={
                      "relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 px-2 text-center transition " +
                      (on
                        ? "border-gold bg-gold/15 shadow-[0_0_0_3px_rgba(207,148,64,0.3)]"
                        : "border-dashed border-bone/25 bg-inset")
                    }
                  >
                    <span className="font-display text-base font-semibold leading-tight">{t.name}</span>
                    <span className="mt-1 text-[0.7rem] text-faded">{t.sub}</span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs font-bold text-inkdeep">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {slug === OTHER_SLUG && (
              <div className="mt-3 space-y-3">
                {shelfOthers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {shelfOthers.map((o) => {
                      const picked = otherItemId === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          data-active={picked}
                          aria-pressed={picked}
                          onClick={() => {
                            if (picked) {
                              setOtherItemId(0);
                              setOtherName("");
                              return;
                            }
                            setOtherItemId(o.id);
                            setOtherName([o.name, o.color].filter(Boolean).join(" · "));
                            setSize(o.size);
                            setColor("");
                            if (o.priceCents !== null) {
                              setPriceIdx(-1);
                              setOtherPrice((o.priceCents / 100).toFixed(o.priceCents % 100 ? 2 : 0));
                            }
                          }}
                          className="size-pill flex min-h-12 flex-col items-start justify-center px-4 text-left leading-tight"
                        >
                          <span className="text-sm font-semibold">{[o.name, o.size].filter(Boolean).join(" · ")}</span>
                          <span className="text-[0.7rem] opacity-80">
                            {[o.color, o.priceCents !== null ? `$${(o.priceCents / 100).toFixed(o.priceCents % 100 ? 2 : 0)}` : "", `${o.qty} left`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <input
                  className="input"
                  value={otherItemId ? "" : otherName}
                  onChange={(e) => {
                    setOtherItemId(0);
                    setOtherName(e.target.value);
                  }}
                  placeholder={shelfOthers.length ? "Or something else… (what was it?)" : "What was it? (tie dye tee, hoodie, tote…)"}
                  aria-label="What was it?"
                />
              </div>
            )}
            {isBandana && (
              <div className="mt-3">
                <p className="mb-2 text-sm text-faded">Which design is on it?</p>
                <div className="flex flex-wrap gap-2">
                  {shirtDesigns.map((d) => {
                    const on = variant === d.slug;
                    const have = color ? onHand(slug, color, ONE_SIZE, d.slug) : onHand(slug, "", ONE_SIZE, d.slug);
                    return (
                      <button
                        key={d.slug}
                        type="button"
                        data-active={on}
                        aria-pressed={on}
                        onClick={() => setVariant(on ? "" : d.slug)}
                        className="size-pill flex min-h-12 items-center gap-2 py-1.5 pl-1.5 pr-4"
                      >
                        {d.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.image} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span className="h-9 w-9 rounded-full border border-dashed border-bone/30" />
                        )}
                        <span className="leading-tight">
                          {d.name}
                          {have > 0 && <span className="block text-[0.7rem] font-semibold opacity-80">{have} on hand</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            {step(2, "Color", "optional, but it makes the cost exact")}
            <div className="grid grid-cols-5 gap-x-2 gap-y-3 sm:grid-cols-9">
              {COLORS.map((c) => {
                const on = color === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    aria-label={c.name}
                    onClick={() => setColor(on ? "" : c.key)}
                    className="flex flex-col items-center gap-1.5 text-center"
                  >
                    <span
                      className={
                        "flex h-11 w-11 items-center justify-center rounded-full border transition " +
                        (on ? "border-gold ring-2 ring-gold ring-offset-2 ring-offset-bark" : "border-bone/30")
                      }
                      style={{ background: c.hex }}
                    >
                      {on && <span className={"text-sm font-bold " + (isLight(c.hex) ? "text-inkdeep" : "text-bone")}>✓</span>}
                    </span>
                    <span className={"text-[0.65rem] leading-tight " + (on ? "text-goldlight" : "text-faded")}>
                      {c.name}
                      {isDesign && onHand(slug, c.key) > 0 && <span className="block font-semibold text-goldlight">{onHand(slug, c.key)} on hand</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            {step(3, isBandana ? "Size" : "Size", isBandana ? "" : isDesign && color ? "numbers are how many you have" : "optional")}
            {isBandana ? (
              <p className="text-sm text-faded">One size — nothing to pick.</p>
            ) : (
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => {
                const have = isDesign && color ? onHand(slug, color, s) : -1;
                return (
                  <button
                    key={s}
                    type="button"
                    data-active={size === s}
                    aria-pressed={size === s}
                    aria-label={have >= 0 ? `${s}, ${have} on hand` : s}
                    onClick={() => setSize(size === s ? "" : s)}
                    className={"size-pill min-h-12 min-w-14 text-base " + (have === 0 && size !== s ? "opacity-50" : "")}
                  >
                    {s}
                    {have >= 0 && <span className="ml-1.5 text-xs font-semibold opacity-75">{have}</span>}
                  </button>
                );
              })}
            </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            {step(4, "Price")}
            <div className="flex flex-wrap gap-2">
              {prices.map((p, i) => (
                <button
                  key={p.cents}
                  type="button"
                  data-active={priceIdx === i}
                  aria-pressed={priceIdx === i}
                  onClick={() => setPriceIdx(i)}
                  className="size-pill flex min-h-14 flex-col items-center justify-center px-5 leading-tight"
                >
                  <span className="text-lg font-bold">{p.label}</span>
                  <span className="text-[0.7rem] opacity-80">{p.note}</span>
                </button>
              ))}
              <label
                data-active={priceIdx === -1}
                className="size-pill flex min-h-14 cursor-text items-center gap-1 px-4"
                onClick={() => setPriceIdx(-1)}
              >
                <span className="text-sm">Other $</span>
                <input
                  inputMode="decimal"
                  value={otherPrice}
                  onChange={(e) => {
                    setOtherPrice(e.target.value);
                    setPriceIdx(-1);
                  }}
                  onFocus={() => setPriceIdx(-1)}
                  placeholder="0"
                  aria-label="Other amount"
                  className="w-16 bg-transparent text-lg font-bold text-inherit outline-none placeholder:text-current placeholder:opacity-40"
                />
              </label>
            </div>
            {priceIdx === -1 && slug && !priceOk && (
              <p className="mt-2 text-xs text-rust">Type what they paid for each one.</p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-faded">How many</span>
              <div className="flex items-center rounded-full border border-bone/25">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-11 w-11 text-xl text-bone" aria-label="One fewer">
                  −
                </button>
                <span className="w-8 text-center text-lg font-bold">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} className="h-11 w-11 text-xl text-bone" aria-label="One more">
                  +
                </button>
              </div>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            {step(5, "Paid with")}
            <div className="grid grid-cols-4 gap-2">
              {PAY_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  data-active={pay === m.key}
                  aria-pressed={pay === m.key}
                  onClick={() => choosePay(m.key)}
                  className="size-pill min-h-12 px-2 text-base"
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {showEmail ? (
                <label className="block text-sm">
                  <span className="mb-1.5 block text-faded">Their email, for the drop list</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="their@email.com"
                  />
                </label>
              ) : (
                <button type="button" className="text-sm text-goldlight underline underline-offset-2" onClick={() => setShowEmail(true)}>
                  + Add their email to the drop list
                </button>
              )}
            </div>
          </section>

          <div className="md:hidden">{todayPanel}</div>
        </div>

        {/* ---------- right (iPad + laptop): totals, this sale, today ---------- */}
        <div className="hidden md:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-4 overflow-y-auto pb-4">
            {summaryPanel}
            {salePanel}
            {todayPanel}
          </div>
        </div>
      </div>

      {/* ---------- phone: the record button is always in reach ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-bone/15 bg-ink/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-faded">
            {lines.length === 0 ? `Tap a ${thing} to start` : lines.length === 1 ? lineText(lines[0]) : `${shirtsIn(lines)} ${things}`}
          </span>
          {current ? (
            <button type="button" onClick={addAnother} className="shrink-0 font-semibold text-goldlight">
              + Add another
            </button>
          ) : null}
        </div>
        {pay === "cash" && total > 0 && <p className="mt-0.5 text-xs text-faded">Change: {changeHints(total)}</p>}
        <button type="button" className="btn btn-gold mt-2 min-h-14 w-full text-base" disabled={!canRecord} onClick={record}>
          {recordLabel}
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-gold/40 bg-panel px-4 py-3 text-sm shadow-2xl md:inset-x-auto md:bottom-6 md:right-6"
        >
          {toast.clientId && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-inkdeep">
              ✓
            </span>
          )}
          <span className="min-w-0 flex-1">
            {toast.clientId && <strong className="block text-bone">Sale recorded</strong>}
            <span className="block text-faded">{toast.text}</span>
          </span>
          {toast.clientId && (
            <button
              type="button"
              onClick={() => {
                const row = rows.find((r) => r.clientId === toast.clientId);
                remove(toast.clientId, row?.id, row?.state === "saved");
              }}
              className="shrink-0 font-semibold text-goldlight underline underline-offset-2"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}
