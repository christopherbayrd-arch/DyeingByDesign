import type { Metadata } from "next";
import { kindLabel } from "@/lib/requests";
import AdminNav from "@/components/AdminNav";
import EmailStatus from "@/components/EmailStatus";
import { emailConfig } from "@/lib/email";
import { pushConfig } from "@/lib/notify";
import { getDb } from "@/lib/db";
import { fmtPrice } from "@/lib/products";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Password-protected order desk (see middleware.ts + ADMIN_PASSWORD).
// Shows paid orders, custom requests, and the drop email list.

type Row = Record<string, unknown>;

function fmtDate(value: unknown) {
  try {
    return new Date(String(value)).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(value ?? "");
  }
}

function shipTo(shipping: unknown) {
  const s = shipping as { name?: string; address?: Record<string, string> } | null;
  if (!s?.address) return "—";
  const a = s.address;
  return [s.name, a.line1, a.line2, `${a.city ?? ""} ${a.state ?? ""} ${a.postal_code ?? ""}`]
    .filter(Boolean)
    .join(", ");
}

export default async function AdminPage() {
  const sql = getDb();
  const mail = emailConfig();

  if (!sql) {
    return (
      <div className="mx-auto max-w-3xl px-5 pt-16">
        <h1 className="font-display text-3xl font-semibold">Admin</h1>
        <AdminNav active="orders" />
        <EmailStatus
          hasKey={mail.hasKey}
          notify={mail.notify}
          canEmailCustomers={mail.canEmailCustomers}
        />
        <p className="mt-6 text-faded">
          No database connected yet. Add <code>DATABASE_URL</code> from Neon to your
          environment variables (README has the walkthrough), then reload.
        </p>
      </div>
    );
  }

  let orders: Row[] = [];
  let requests: Row[] = [];
  let signups: Row[] = [];
  let dbError = "";

  try {
    orders = (await sql`select * from orders order by created_at desc limit 200`) as Row[];
    requests = (await sql`select * from special_requests order by created_at desc limit 200`) as Row[];
    signups = (await sql`select * from drop_signups order by created_at desc limit 500`) as Row[];
  } catch (err) {
    dbError = `Could not read the database — have you run schema.sql in Neon yet? (${String(err).slice(0, 160)})`;
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pt-14">
      <p className="kicker">Order desk</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Admin</h1>
      <AdminNav active="orders" />
      <EmailStatus
        hasKey={mail.hasKey}
        notify={mail.notify}
        canEmailCustomers={mail.canEmailCustomers}
        pushEnabled={pushConfig().enabled}
      />

      {dbError && <p className="mt-6 rounded-xl border border-rust/50 bg-rust/10 p-4 text-sm">{dbError}</p>}

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold">
          Orders <span className="text-base text-faded">({orders.length})</span>
        </h2>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-bone/10 text-xs uppercase tracking-wider text-faded">
                <th className="p-3">When</th>
                <th className="p-3">Status</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Items</th>
                <th className="p-3">Ship to</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-faded">No orders yet — they&apos;ll appear here automatically when someone sends one.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={String(o.id)} className="border-b border-bone/5 align-top">
                  <td className="p-3 whitespace-nowrap text-faded">{fmtDate(o.created_at)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className={
                        "rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider " +
                        (o.status === "requested"
                          ? "border border-gold/60 text-goldlight"
                          : "bg-gold/20 text-goldlight")
                      }
                    >
                      {o.status === "requested" ? "Awaiting payment" : String(o.status ?? "paid")}
                    </span>
                    {String(o.stripe_session_id ?? "").startsWith("email_") && (
                      <div className="mt-1 text-[0.65rem] text-faded">
                        {String(o.stripe_session_id).replace("email_", "")}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{String(o.name ?? "—")}</div>
                    <div className="text-faded">{String(o.email ?? "")}</div>
                  </td>
                  <td className="p-3">{String(o.items ?? "—")}</td>
                  <td className="p-3 text-faded">{shipTo(o.shipping)}</td>
                  <td className="p-3 text-right font-semibold text-goldlight">
                    {typeof o.amount_total === "number" ? fmtPrice(o.amount_total) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">
          Custom requests <span className="text-base text-faded">({requests.length})</span>
        </h2>
        <div className="mt-4 space-y-3">
          {requests.length === 0 && (
            <p className="card p-4 text-sm text-faded">No custom requests yet.</p>
          )}
          {requests.map((r) => (
            <div key={String(r.id)} className="card p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {String(r.name)}{" "}
                  <span className="font-normal text-faded">
                    · {String(r.email)}
                    {r.kind ? ` · ${kindLabel(String(r.kind))}` : ""}
                    {r.size ? ` · size ${String(r.size)}` : ""}
                  </span>
                </p>
                <p className="text-xs text-faded">{fmtDate(r.created_at)}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-faded">{String(r.idea)}</p>
              {r.artwork_url ? (
                <a
                  href={String(r.artwork_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-goldlight underline underline-offset-2"
                >
                  Open attached artwork ↗
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">
          Drop list <span className="text-base text-faded">({signups.length})</span>
        </h2>
        <div className="card mt-4 p-4 text-sm leading-7 text-faded">
          {signups.length === 0
            ? "No signups yet."
            : signups.map((s) => String(s.email)).join(" · ")}
        </div>
      </section>
    </div>
  );
}
