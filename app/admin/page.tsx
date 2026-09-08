import type { Metadata } from "next";
import AdminNav from "@/components/AdminNav";
import EmailStatus from "@/components/EmailStatus";
import OrderStatus from "@/components/OrderStatus";
import ShipLabel from "@/components/ShipLabel";
import ArchiveOrder from "@/components/ArchiveOrder";
import RequestManager, { type RequestRow } from "@/components/RequestManager";
import { shippingConfig } from "@/lib/shipping";
import { emailConfig } from "@/lib/email";
import { pushConfig } from "@/lib/notify";
import { getDb } from "@/lib/db";
import { colorName, fmtPrice } from "@/lib/products";
import { orderNote, parseItemsMeta } from "@/lib/orderFormat";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Password-protected order desk (see middleware.ts + ADMIN_PASSWORD).
// Shows orders (card orders arrive as Paid; order requests as Awaiting
// payment until you flip them), custom requests, and the drop email list.

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

// "sumac|M|cherry-red|x2|3999; fern|L|sky-blue|x1|3999 | note: ..." → readable lines
function itemsText(items: unknown) {
  const raw = String(items ?? "");
  if (!raw) return "—";
  const lines = parseItemsMeta(raw).map((l) => {
    const name = l.slug.charAt(0).toUpperCase() + l.slug.slice(1);
    return `${l.qty} × ${name}${l.color ? ` · ${colorName(l.color)}` : ""} · ${l.size}`;
  });
  const note = orderNote(raw);
  return lines.join("\n") + (note ? `\nNote: ${note}` : "");
}

function shipTo(shipping: unknown) {
  const s = shipping as { name?: string; address?: Record<string, string> } | null;
  if (!s?.address) return "—";
  const a = s.address;
  return [s.name, a.line1, a.line2, `${a.city ?? ""} ${a.state ?? ""} ${a.postal_code ?? ""}`]
    .filter(Boolean)
    .join(", ");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const sql = getDb();
  const mail = emailConfig();
  const ship = shippingConfig();

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
  let archivedOrders = 0;
  let archivedRequests = 0;
  let dbError = "";

  try {
    orders = (showArchived
      ? await sql`select * from orders where archived_at is not null order by created_at desc limit 200`
      : await sql`select * from orders where archived_at is null order by created_at desc limit 200`) as Row[];
    requests = (showArchived
      ? await sql`select * from special_requests where archived_at is not null order by created_at desc limit 200`
      : await sql`select * from special_requests where archived_at is null order by created_at desc limit 200`) as Row[];
    const counts = (await sql`
      select (select count(*) from orders where archived_at is not null) as o,
             (select count(*) from special_requests where archived_at is not null) as r
    `) as { o: number | string; r: number | string }[];
    archivedOrders = Number(counts[0]?.o ?? 0);
    archivedRequests = Number(counts[0]?.r ?? 0);
    signups = (await sql`select * from drop_signups order by created_at desc limit 500`) as Row[];
  } catch (err) {
    dbError = `Could not read the database — have you run schema.sql in Neon yet? (${String(err).slice(0, 160)})`;
  }

  const requestRows: RequestRow[] = requests.map((r) => ({
    id: Number(r.id),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    kind: String(r.kind ?? ""),
    size: String(r.size ?? ""),
    color: String(r.color ?? ""),
    idea: String(r.idea ?? ""),
    artworkUrl: String(r.artwork_url ?? ""),
    status: String(r.status ?? "new"),
    note: String(r.note ?? ""),
    orderId: r.order_id ? Number(r.order_id) : null,
    quoteCents: typeof r.quote_cents === "number" ? r.quote_cents : null,
    archived: Boolean(r.archived_at),
  }));

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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">
            {showArchived ? "Archived orders" : "Orders"} <span className="text-base text-faded">({orders.length})</span>
          </h2>
          {(archivedOrders > 0 || showArchived) && (
            <a href={showArchived ? "/admin" : "/admin?archived=1"} className="text-sm text-faded underline underline-offset-2 transition hover:text-goldlight">
              {showArchived ? "Back to the desk" : `Show archived (${archivedOrders})`}
            </a>
          )}
        </div>
        <p className="mt-2 text-sm text-faded">
          Order requests wait here as <em>Awaiting payment</em>. Reply to the customer with a
          Stripe payment link or invoice, and once it&apos;s paid switch the status to
          <em> Paid</em> (then Made, then Shipped, if you want to track it).
          {ship.enabled
            ? " Buy label prices USPS for the shirts in the order, prints the label, marks it Shipped, and emails the customer the tracking number."
            : " Shipping labels switch on once EasyPost and your ship from address are in Vercel (README step 9)."}
        </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-bone/10 text-xs uppercase tracking-wider text-faded">
                <th className="p-3">When</th>
                <th className="p-3">Status</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Items</th>
                <th className="p-3">Ship to</th>
                <th className="p-3">Ship</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-faded">No orders yet — they&apos;ll appear here automatically when someone sends one.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={String(o.id)} id={`order-${String(o.id)}`} className="border-b border-bone/5 align-top">
                  <td className="p-3 whitespace-nowrap text-faded">
                    {fmtDate(o.created_at)}
                    <div className="text-[0.65rem]">#{String(o.id)}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <OrderStatus id={Number(o.id)} status={String(o.status ?? "paid")} />
                    {String(o.stripe_session_id ?? "").startsWith("email_") && (
                      <div className="mt-1 text-[0.65rem] text-faded">
                        {String(o.stripe_session_id).replace("email_", "")}
                      </div>
                    )}
                    {String(o.stripe_session_id ?? "").startsWith("custom_") && (
                      <div className="mt-1 text-[0.65rem] font-bold uppercase tracking-wider text-goldlight">custom piece</div>
                    )}
                    {String(o.stripe_session_id ?? "").startsWith("manual_") && (
                      <div className="mt-1 text-[0.65rem] text-faded">hand entered</div>
                    )}
                    <ArchiveOrder id={Number(o.id)} archived={Boolean(o.archived_at)} />
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{String(o.name ?? "—")}</div>
                    <div className="text-faded">{String(o.email ?? "")}</div>
                  </td>
                  <td className="p-3 whitespace-pre-line">{itemsText(o.items)}</td>
                  <td className="p-3 text-faded">{shipTo(o.shipping)}</td>
                  <td className="p-3">
                    <ShipLabel
                      orderId={Number(o.id)}
                      status={String(o.status ?? "paid")}
                      hasAddress={shipTo(o.shipping) !== "—"}
                      labelUrl={o.label_url ? String(o.label_url) : null}
                      tracking={o.tracking_number ? String(o.tracking_number) : null}
                      trackingUrl={o.tracking_url ? String(o.tracking_url) : null}
                      service={o.service ? String(o.service) : null}
                      postageCents={typeof o.postage_cents === "number" ? o.postage_cents : null}
                      enabled={ship.enabled}
                      missing={ship.missing}
                    />
                  </td>
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
          {showArchived ? "Archived custom requests" : "Custom requests"} <span className="text-base text-faded">({requests.length})</span>
        </h2>
        <RequestManager requests={requestRows} showingArchived={showArchived} archivedCount={archivedRequests} />
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
