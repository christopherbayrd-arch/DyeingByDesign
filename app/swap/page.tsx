import type { Metadata } from "next";
import Link from "next/link";
import SwapForm, { type SwapLine, type SwapProduct } from "@/components/SwapForm";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getProducts } from "@/lib/catalog";
import { SWAP_DAYS } from "@/lib/swapShared";

export const metadata: Metadata = {
  title: "Swap a size or color",
  description:
    "Every DBD piece is made to order, so there are no returns — but each one gets a free swap for a different size or color. Here's how.",
  alternates: { canonical: "/swap" },
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// The customer side of the swap policy: pick the piece, pick what you'd
// rather have, send it. Signing in fills the list in from real orders;
// anyone else can describe what they have.
export default async function SwapPage({ searchParams }: { searchParams: Promise<{ line?: string; order?: string }> }) {
  const { line } = await searchParams;
  const me = await currentUser();
  const sql = getDb();

  const products = await getProducts();
  const opts: SwapProduct[] = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    sizes: p.sizes,
    kind: p.kind,
  }));
  const nameOf = (slug: string) =>
    products.find((p) => p.slug === slug)?.name ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "");

  // Everything this customer has bought that's been made or shipped
  let lines: SwapLine[] = [];
  if (sql && me) {
    try {
      const rows = (await sql`
        select l.id, l.order_id, l.slug, l.name, l.color, l.size, l.qty, l.variant, l.swapped_at,
               o.stripe_session_id, coalesce(o.sold_at, o.paid_at, o.created_at) as at,
               (select s.ref from swaps s
                 where s.line_id = l.id and s.status in ('requested', 'approved', 'sent')
                 order by s.id desc limit 1) as open_ref
        from order_lines l
        join orders o on o.id = l.order_id
        where (o.user_id = ${Number(me.id) || 0} or lower(o.email) = lower(${me.email}))
          and o.status in ('paid', 'made', 'shipped')
          and l.slug <> 'custom'
        order by o.created_at desc, l.id
        limit 40
      `) as Row[];
      lines = rows.map((r) => ({
        id: Number(r.id),
        orderId: Number(r.order_id),
        orderRef: str(r.stripe_session_id).startsWith("email_") ? str(r.stripe_session_id).replace("email_", "") : "",
        orderAt: r.at ? new Date(String(r.at)).toISOString() : "",
        slug: str(r.slug),
        name: str(r.name) || nameOf(str(r.slug)),
        variant: str(r.variant),
        variantName: str(r.variant) ? nameOf(str(r.variant)) : "",
        color: str(r.color),
        size: str(r.size),
        qty: Number(r.qty) || 1,
        swapped: Boolean(r.swapped_at),
        openSwap: str(r.open_ref),
      }));
    } catch {
      // database without the swaps table / variant column yet — the form
      // still works, people just describe what they have
      lines = [];
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-14">
      <p className="kicker">Sizes &amp; swaps</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">
        Wrong size? We&apos;ll fix it.
      </h1>
      <div className="mt-5 space-y-4 text-sm leading-relaxed text-faded sm:text-base">
        <p>
          Every piece is bleached by hand for one person, so nothing gets returned for a refund.
          What you get instead is a swap: <strong className="text-bone">one free exchange per
          piece</strong> for a different size or color, within {SWAP_DAYS} days of it landing.
        </p>
        <p>
          You cover postage to send yours back — any envelope will do. We make the new one and
          ship it to you free. The design stays the same; the size and color are yours to change.
        </p>
      </div>

      {!me && (
        <p className="card mt-6 p-4 text-sm leading-relaxed text-faded">
          <Link href="/account/signin?callbackUrl=/swap" className="font-semibold text-goldlight underline underline-offset-2">
            Sign in
          </Link>{" "}
          and we&apos;ll list your orders here so you can just tap the one. No account? Describe it
          below and we&apos;ll match it up.
        </p>
      )}

      <SwapForm
        lines={lines}
        products={opts}
        signedIn={Boolean(me)}
        defaultName={me?.name ?? ""}
        defaultEmail={me?.email ?? ""}
        preselect={Number(line) || 0}
      />

      <p className="mt-8 text-xs leading-relaxed text-faded">
        Custom pieces are made from your own idea, so they can&apos;t be swapped — but if something
        arrived damaged or wrong,{" "}
        <Link href="/custom" className="underline underline-offset-2 hover:text-goldlight">
          tell us
        </Link>{" "}
        and we&apos;ll make it right.
      </p>
    </div>
  );
}
