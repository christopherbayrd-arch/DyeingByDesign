"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OrderEdit, { type EditLine, type EditShipping } from "@/components/OrderEdit";
import { fmtPrice } from "@/lib/products";

// Everything you can do to one order that isn't just moving its status along.
// Opens as a panel over the desk so it works on a phone, where the orders
// table is a swipe wide.
//
// The three ways an order stops being live are kept apart on purpose:
//   archive  done with, off the desk, still a sale
//   cancel   real order, not happening, keeps its number and its history
//   delete   never a real order; sits in the bin for 30 days first
export default function OrderActions({
  id,
  status,
  archived,
  testMode,
  deleted,
  binDaysLeft,
  cancelled,
  cancelReason,
  refundCents,
  restocked,
  amountTotal,
  lines,
  customer,
  shipping,
}: {
  id: number;
  status: string;
  archived: boolean;
  testMode: boolean;
  deleted: boolean;
  binDaysLeft: number | null;
  cancelled: boolean;
  cancelReason: string;
  refundCents: number | null;
  restocked: boolean;
  amountTotal: number | null;
  lines: EditLine[];
  customer: { name: string; email: string };
  shipping: EditShipping;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<"" | "edit" | "cancel" | "delete">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(status !== "requested" && !cancelled);
  const [refund, setRefund] = useState("");
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");
  const [knowsAboutMoney, setKnowsAboutMoney] = useState(false);

  // money has actually gone through: a test never counts, nor does a request
  // nobody has paid yet
  const hasMoney = !testMode && status !== "requested" && (amountTotal ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  function close() {
    setOpen(false);
    setPane("");
    setError("");
    setSaid("");
  }

  // `describe` turns the answer into a line to show. Pass one when the panel
  // should stay open and report what happened (a cancel that couldn't email,
  // say); leave it off and the panel just closes.
  async function act(
    body: Record<string, unknown>,
    describe?: (data: Record<string, unknown>) => string
  ) {
    setBusy(true);
    setError("");
    setSaid("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't work.");
        if (data.needsMoneyConfirm) setKnowsAboutMoney(false);
      } else if (describe) {
        const line = describe(data);
        // an email that didn't go is a warning, not a success line
        if (data.emailError) setError(String(data.emailError));
        setSaid(line);
        router.refresh();
      } else {
        close();
        router.refresh();
      }
    } catch {
      setError("That didn't work — check your connection.");
    }
    setBusy(false);
  }

  const archiveIt = () =>
    fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, archived: !archived }),
    })
      .then(() => {
        close();
        router.refresh();
      })
      .catch(() => setError("That didn't save."));

  const link = "text-[0.65rem] text-faded underline underline-offset-2 transition hover:text-goldlight";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={"mt-1 block " + link}>
        manage
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto whitespace-normal bg-black/70 p-4 backdrop-blur-sm"
          onClick={close}
          role="presentation"
        >
          <div
            className="card my-8 w-full max-w-lg overflow-hidden whitespace-normal p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Order ${id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="kicker">Order #{id}</p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {customer.name || "No name"}
                </p>
                <p className="text-sm text-faded">
                  {customer.email || "no email"}
                  {typeof amountTotal === "number" ? ` · ${fmtPrice(amountTotal)}` : ""}
                </p>
                {testMode && (
                  <span className="mt-2 inline-block rounded-full border border-bone/30 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-faded">
                    Stripe test
                  </span>
                )}
              </div>
              <button type="button" onClick={close} className="text-2xl leading-none text-faded hover:text-bone" aria-label="Close">
                ×
              </button>
            </div>

            {/* ---- already in the bin ---- */}
            {deleted ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-xl border border-rust/40 bg-rust/10 p-4 text-sm leading-relaxed">
                  In the bin.{" "}
                  {binDaysLeft !== null && binDaysLeft > 0
                    ? `Gone for good in ${binDaysLeft} day${binDaysLeft === 1 ? "" : "s"} unless you put it back.`
                    : "It empties on the next load of this page."}
                </p>
                <button className="btn btn-gold w-full" disabled={busy} onClick={() => act({ action: "restore" })}>
                  {busy ? "…" : "Put it back"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: "purge" })}
                  className="w-full text-xs text-faded underline underline-offset-2 transition hover:text-rust"
                >
                  or empty it now, for good
                </button>
              </div>
            ) : cancelled ? (
              /* ---- cancelled ---- */
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-bone/15 bg-black/20 p-4 text-sm leading-relaxed text-faded">
                  <p className="font-semibold text-bone">Cancelled.</p>
                  {cancelReason && <p className="mt-1">{cancelReason}</p>}
                  <p className="mt-1">
                    {restocked ? "The shirts went back on the shelf. " : "Nothing went back on the shelf. "}
                    {refundCents !== null
                      ? `${fmtPrice(refundCents)} went back to the customer.`
                      : "No refund recorded."}
                  </p>
                  <p className="mt-2">
                    It keeps its number and stays here, but it&apos;s out of your revenue and out
                    of the make queue.
                  </p>
                </div>
                {said && <p className="text-sm text-goldlight">{said}</p>}
                {error && <p className="text-sm text-rust">{error}</p>}
                <button
                  className="btn btn-ghost w-full"
                  disabled={busy}
                  onClick={() =>
                    act({ action: "resend-cancelled" }, (d) => `Sent again to ${String(d.sent ?? customer.email)}.`)
                  }
                >
                  {busy ? "…" : "Email them the cancellation again"}
                </button>
                <button className="btn btn-ghost w-full" disabled={busy} onClick={() => act({ action: "uncancel" })}>
                  {busy ? "…" : "Un-cancel it"}
                </button>
                {restocked && (
                  <p className="text-xs leading-relaxed text-faded">
                    Un-cancelling takes those shirts back off the shelf, so the count still matches
                    what&apos;s promised to somebody.
                  </p>
                )}
              </div>
            ) : pane === "edit" ? (
              <div className="mt-6">
                <button type="button" onClick={() => setPane("")} className={"mb-4 " + link}>
                  ← back
                </button>
                <OrderEdit
                  id={id}
                  lines={lines}
                  customer={customer}
                  shipping={shipping}
                  paid={status !== "requested"}
                  onSaved={() => {
                    close();
                    router.refresh();
                  }}
                />
              </div>
            ) : pane === "cancel" ? (
              /* ---- cancel form ---- */
              <div className="mt-6 space-y-4">
                <button type="button" onClick={() => setPane("")} className={link}>
                  ← back
                </button>
                <p className="text-sm leading-relaxed text-faded">
                  The order stays here with its number and its history. It just drops out of your
                  revenue and out of the make queue.
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input py-2 text-sm"
                  placeholder="Why? (customer changed their mind…)"
                  maxLength={300}
                />
                <label className="flex items-start gap-2 text-sm text-faded">
                  <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="mt-1" />
                  <span>Put the shirts back on the Inventory shelf</span>
                </label>
                {hasMoney && (
                  <label className="block text-sm text-faded">
                    Money you sent back (leave empty if none)
                    <input
                      value={refund}
                      onChange={(e) => setRefund(e.target.value)}
                      inputMode="decimal"
                      className="input mt-1 py-2 text-sm"
                      placeholder={typeof amountTotal === "number" ? (amountTotal / 100).toFixed(2) : "0.00"}
                    />
                    <span className="mt-1 block text-xs">
                      Writing it down here doesn&apos;t refund anybody — do that in Stripe.
                    </span>
                  </label>
                )}
                <div className="rounded-xl bg-black/20 p-3">
                  <label className="flex items-start gap-2 text-sm text-faded">
                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-1" />
                    <span>
                      <span className="font-medium text-bone">Email the customer</span>
                      <span className="mt-0.5 block text-xs leading-relaxed">
                        Tells them it&apos;s cancelled and nothing is being made. The money line
                        follows what you put above:{" "}
                        {refund.trim()
                          ? "it says that amount is on its way back."
                          : hasMoney
                            ? "with no amount filled in it says you'll be in touch about the refund."
                            : "it says nothing was ever charged."}
                      </span>
                    </span>
                  </label>
                  {notify && (
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={600}
                      rows={2}
                      className="input mt-2 resize-y py-2 text-sm"
                      placeholder="Anything to say to them? (optional, goes in the email)"
                    />
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-faded">
                    Your reason above stays here on the desk — the customer never sees it.
                  </p>
                </div>
                {said && <p className="text-sm text-goldlight">{said}</p>}
                {error && <p className="text-sm text-rust">{error}</p>}
                <button
                  className="btn btn-gold w-full"
                  disabled={busy}
                  onClick={() =>
                    act({ action: "cancel", reason, restock, refund, notify, message }, (d) => {
                      const back = Number(d.restocked) > 0 ? `, ${d.restocked} back on the shelf` : "";
                      if (!notify) return `Cancelled${back}. No email sent.`;
                      return d.emailed
                        ? `Cancelled${back}. Email sent to ${String(d.emailed)}.`
                        : `Cancelled${back}, but the email didn't go.`;
                    })
                  }
                >
                  {busy ? "…" : "Cancel this order"}
                </button>
              </div>
            ) : pane === "delete" ? (
              /* ---- delete form ---- */
              <div className="mt-6 space-y-4">
                <button type="button" onClick={() => setPane("")} className={link}>
                  ← back
                </button>
                <p className="text-sm leading-relaxed text-faded">
                  Delete is for something that was never a real order — your own test, spam, a
                  double click. It goes in the bin and you can put it back for 30 days, then
                  it&apos;s gone. If this was a real order that isn&apos;t happening,{" "}
                  <button type="button" onClick={() => setPane("cancel")} className="text-goldlight underline underline-offset-2">
                    cancel it instead
                  </button>
                  .
                </p>
                {hasMoney && (
                  <div className="rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm leading-relaxed">
                    <p className="font-semibold">
                      {typeof amountTotal === "number" ? fmtPrice(amountTotal) : "Money"} went through on this one.
                    </p>
                    <p className="mt-1 text-faded">
                      Deleting it here does not refund the customer. Stripe still has the money and
                      it&apos;s still on their statement. Refund it in Stripe first.
                    </p>
                    <label className="mt-3 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={knowsAboutMoney}
                        onChange={(e) => setKnowsAboutMoney(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-faded">I know. Delete it anyway.</span>
                    </label>
                  </div>
                )}
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input py-2 text-sm"
                  placeholder="Why? (my own test, spam…)"
                  maxLength={300}
                />
                <label className="flex items-start gap-2 text-sm text-faded">
                  <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="mt-1" />
                  <span>Put the shirts back on the Inventory shelf</span>
                </label>
                {error && <p className="text-sm text-rust">{error}</p>}
                <button
                  className="btn btn-gold w-full"
                  disabled={busy || (hasMoney && !knowsAboutMoney)}
                  onClick={() => act({ action: "delete", reason, restock, confirmMoney: knowsAboutMoney })}
                >
                  {busy ? "…" : "Move it to the bin"}
                </button>
              </div>
            ) : (
              /* ---- the menu ---- */
              <div className="mt-6 flex flex-col gap-2">
                <Action label="Edit what's in it" hint="Size, color, quantity, price, or where it's going." onClick={() => setPane("edit")} />
                <Action
                  label="Send the customer their copy again"
                  hint="The email that matches where this order has got to."
                  onClick={() =>
                    act({ action: "resend" }, (d) => `Sent again to ${String(d.sent ?? customer.email)}.`)
                  }
                  busy={busy}
                />
                <Action
                  label={archived ? "Put it back on the desk" : "Archive it"}
                  hint={archived ? "Back in the main list." : "Done with. Off the desk, still a sale in your history."}
                  onClick={archiveIt}
                />
                <Action
                  label="Cancel it"
                  hint="Real order, not happening. Keeps its number, drops out of revenue."
                  onClick={() => setPane("cancel")}
                />
                <Action
                  label="Delete it"
                  hint="Never a real order. Goes in the bin for 30 days first."
                  danger
                  onClick={() => setPane("delete")}
                />
                {said && <p className="pt-1 text-sm text-goldlight">{said}</p>}
                {error && <p className="pt-1 text-sm text-rust">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Action({
  label,
  hint,
  onClick,
  danger,
  busy,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        "w-full rounded-xl bg-black/20 p-3 text-left transition hover:bg-black/40 disabled:opacity-50 " +
        (danger ? "hover:bg-rust/15" : "")
      }
    >
      <span className={"block text-sm font-semibold " + (danger ? "text-rust" : "text-bone")}>{label}</span>
      <span className="mt-0.5 block text-xs leading-relaxed text-faded">{hint}</span>
    </button>
  );
}
