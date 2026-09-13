import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { colorName, ONE_SIZE } from "@/lib/products";
import { emailConfig, sendEmail, customerSwapHtml } from "@/lib/email";
import { siteUrl } from "@/lib/orderFormat";
import { RETURN_ADDRESS } from "@/lib/site";
import { loadSwaps, loadSwap, setSwapStatus } from "@/lib/swaps";
import { isSwapStatus, type SwapStatus } from "@/lib/swapShared";

// The swaps board. Owner only — middleware guards /api/admin.
//   GET                          every swap
//   POST { id, status, ... }     move one along (and tell the customer)
//   DELETE ?id=                  remove one that shouldn't be there

const NO_TABLE =
  "The swaps table isn't in the database yet. Run the latest schema.sql in Neon (it's safe to re-run), then reload.";

async function everything(sql: NonNullable<ReturnType<typeof getDb>>) {
  return { swaps: await loadSwaps(sql) };
}

export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ swaps: [], error: "No database connected." });
  try {
    return NextResponse.json(await everything(sql));
  } catch {
    return NextResponse.json({ swaps: [], error: NO_TABLE });
  }
}

// "Sumac · Royal blue · L"
async function pieceText(slug: string, variant: string, color: string, size: string) {
  const p = await getProduct(slug).catch(() => null);
  const v = variant ? (await getProduct(variant).catch(() => null))?.name ?? variant : "";
  const name = p?.name ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "");
  return [v ? `${name} · ${v}` : name, color ? colorName(color) : "", size && size !== ONE_SIZE ? size : ""]
    .filter(Boolean)
    .join(" · ");
}

export async function POST(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id) || 0;
  const status = String(b.status ?? "");
  if (!id || !isSwapStatus(status)) {
    return NextResponse.json({ error: "Which swap, and what happened to it?" }, { status: 400 });
  }
  const ownerNote = String(b.ownerNote ?? "").trim().slice(0, 1500);
  const fromStock = Boolean(b.fromStock);
  const tell = b.tell !== false; // email the customer unless told not to

  try {
    const before = await loadSwap(sql, id);
    if (!before) return NextResponse.json({ error: "That swap isn't there any more." }, { status: 404 });

    const { swap, shelf } = await setSwapStatus(sql, id, status as SwapStatus, {
      ownerNote: typeof b.ownerNote === "string" ? ownerNote : undefined,
      fromStock: typeof b.fromStock === "boolean" ? fromStock : undefined,
    });
    if (!swap) return NextResponse.json({ error: "That swap isn't there any more." }, { status: 404 });

    let emailed = false;
    const cfg = emailConfig();
    if (tell && cfg.canNotifyOwner && swap.email.includes("@") && status !== "requested") {
      const have = await pieceText(swap.slug, swap.variant, swap.color, swap.size);
      const want = await pieceText(
        swap.slug,
        swap.variant,
        swap.wantColor || swap.color,
        swap.wantSize || swap.size
      );
      const res = await sendEmail({
        to: swap.email,
        subject: `Swap ${swap.ref} — ${status === "declined" ? "about your swap" : status === "sent" ? "on its way" : status === "done" ? "all set" : "approved"}`,
        replyTo: cfg.notify,
        html: customerSwapHtml({
          firstName: swap.name.split(" ")[0] ?? "",
          ref: swap.ref,
          have,
          want,
          status: swap.status,
          message: swap.ownerNote,
          returnTo: status === "approved" ? RETURN_ADDRESS : "",
          siteUrl: siteUrl(),
        }),
      }).catch(() => ({ ok: false }));
      emailed = Boolean(res?.ok);
    }

    return NextResponse.json({ ok: true, emailed, shelf, ...(await everything(sql)) });
  } catch (err) {
    console.error("swaps:", err);
    const msg = String((err as Error)?.message ?? err);
    if (/swaps/.test(msg) && /does not exist/.test(msg)) {
      return NextResponse.json({ error: NO_TABLE }, { status: 500 });
    }
    return NextResponse.json({ error: "Couldn't save that. Try again in a minute." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "No database connected." }, { status: 503 });
  const id = Number(new URL(req.url).searchParams.get("id")) || 0;
  if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });
  try {
    await sql`delete from swaps where id = ${id}`;
    return NextResponse.json({ ok: true, ...(await everything(sql)) });
  } catch {
    return NextResponse.json({ error: "Couldn't remove that one." }, { status: 500 });
  }
}
