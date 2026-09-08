import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, signOut } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { colorName, fmtPrice } from "@/lib/products";
import { orderNote, parseItemsMeta } from "@/lib/orderFormat";
import { kindLabel } from "@/lib/requests";
import { queuePositions } from "@/lib/queue";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const STATUS: Record<string, string> = {
  requested: "Request received",
  paid: "Paid",
  made: "Made",
  shipped: "Shipped",
};

function when(v: unknown) {
  try {
    return new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function itemLines(items: unknown) {
  return parseItemsMeta(String(items ?? "")).map((l) => {
    const name = l.slug.charAt(0).toUpperCase() + l.slug.slice(1);
    return `${l.qty} × ${name}${l.color ? ` · ${colorName(l.color)}` : ""}${l.size ? ` · ${l.size}` : ""}`;
  });
}

// The signed in customer's page: their orders and requests, and sign out.
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/account/signin?callbackUrl=/account");

  const sql = getDb();
  let orders: Row[] = [];
  let requests: Row[] = [];
  let inLine = new Map<number, { position: number; of: number }>();
  if (sql) {
    try {
      const uid = Number(user.id) || 0;
      orders = (await sql`
        select id, created_at, status, items, amount_total, tracking_number, tracking_url, stripe_session_id
        from orders
        where user_id = ${uid} or lower(email) = lower(${user.email})
        order by created_at desc limit 50
      `) as Row[];
      requests = (await sql`
        select id, created_at, status, kind, size, color, idea
        from special_requests
        where user_id = ${uid} or lower(email) = lower(${user.email})
        order by created_at desc limit 50
      `) as Row[];
      if (orders.some((o) => o.status === "requested" || o.status === "paid")) {
        inLine = await queuePositions(sql).catch(() => new Map());
      }
    } catch (err) {
      console.error("account page:", err);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-14">
      <p className="kicker">Your account</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">{user.name ? `Hi, ${user.name.split(" ")[0]}` : "Hi there"}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-faded">
        <span>{user.email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="underline underline-offset-2 transition hover:text-goldlight">Sign out</button>
        </form>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold">Your orders</h2>
        {orders.length === 0 ? (
          <p className="card mt-4 p-5 text-sm text-faded">
            Nothing yet. When you send an order from your cart it shows up here, with tracking once it ships.{" "}
            <Link href="/shop" className="text-goldlight underline underline-offset-2">See the lineup</Link>.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {orders.map((o) => {
              const status = String(o.status ?? "paid");
              const ref = String(o.stripe_session_id ?? "");
              const note = orderNote(o.items as string);
              const place = inLine.get(Number(o.id));
              return (
                <div key={String(o.id)} className="card p-5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-bone">
                      {when(o.created_at)}
                      {ref.startsWith("email_") && <span className="ml-2 font-normal text-faded">{ref.replace("email_", "")}</span>}
                    </p>
                    <span className={"rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider " + (status === "shipped" ? "border-transparent bg-gold/20 text-goldlight" : "border-gold/40 text-goldlight")}>
                      {STATUS[status] ?? status}
                    </span>
                  </div>
                  <ul className="mt-2 text-faded">
                    {itemLines(o.items).map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                  {note && <p className="mt-1 text-xs text-faded">Note: {note}</p>}
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-faded">
                      {o.tracking_number ? (
                        <>Tracking:{" "}
                          {o.tracking_url ? (
                            <a href={String(o.tracking_url)} target="_blank" rel="noreferrer" className="text-goldlight underline underline-offset-2">{String(o.tracking_number)}</a>
                          ) : String(o.tracking_number)}
                        </>
                      ) : status === "requested" ? (
                        place ? `#${place.position} in line to be made. We'll email you when it's ready, with a link to pay.` : "We'll email you when it's ready, with a link to pay."
                      ) : status === "shipped" ? "" : place ? `#${place.position} in line. Being made by hand — tracking arrives by email when it ships.` : "Being made by hand. Tracking arrives by email when it ships."}
                    </span>
                    {typeof o.amount_total === "number" && <span className="font-semibold text-goldlight">{fmtPrice(o.amount_total)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {requests.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold">Your custom requests</h2>
          <div className="mt-4 space-y-3">
            {requests.map((r) => (
              <div key={String(r.id)} className="card p-5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-bone">
                    {when(r.created_at)}
                    <span className="ml-2 font-normal text-faded">
                      {r.kind ? kindLabel(String(r.kind)) : "Custom"}
                      {r.size ? ` · size ${String(r.size)}` : ""}
                      {r.color ? ` · ${colorName(String(r.color))}` : ""}
                    </span>
                  </p>
                  <span className="rounded-full border border-gold/40 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-goldlight">
                    {String(r.status ?? "new")}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-faded">{String(r.idea ?? "")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-xs text-faded">
        Questions about an order? Reply to any email we&apos;ve sent you — it reaches the person who makes your shirt.
      </p>
    </div>
  );
}
