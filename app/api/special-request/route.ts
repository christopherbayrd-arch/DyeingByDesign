import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { emailConfig, sendEmail, requestAlertHtml } from "@/lib/email";
import { siteUrl } from "@/lib/orderFormat";
import { sendPush } from "@/lib/notify";
import {
  ARTWORK_MAX_BYTES,
  ARTWORK_TYPES,
  isRequestKind,
  kindLabel,
  type RequestKind,
} from "@/lib/requests";

// Saves a custom request from the /custom page into Neon. Accepts a
// multipart form so people can attach a logo or graphic; the file goes to
// Vercel Blob (same store the admin photo uploads use) and its URL is saved
// on the request + linked in the owner's alert email.

export async function POST(req: Request) {
  try {
    // Accept both multipart (the form) and JSON (older clients / tests)
    let fields: Record<string, string> = {};
    let file: File | null = null;
    const ctype = req.headers.get("content-type") ?? "";
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (v instanceof File) {
          if (k === "artwork" && v.size > 0) file = v;
        } else {
          fields[k] = String(v);
        }
      }
    } else {
      fields = await req.json().catch(() => ({}));
    }

    // honeypot: real people never fill the hidden "website" field
    if (typeof fields.website === "string" && fields.website.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const name = String(fields.name ?? "").trim().slice(0, 120);
    const email = String(fields.email ?? "").trim().slice(0, 200);
    const size = String(fields.size ?? "").trim().slice(0, 10);
    const idea = String(fields.idea ?? "").trim().slice(0, 4000);
    const kindRaw = String(fields.kind ?? "").trim();
    const kind: RequestKind = isRequestKind(kindRaw) ? kindRaw : "other";

    if (!name || !email.includes("@") || !idea) {
      return NextResponse.json(
        { error: "Name, email, and a few words about your idea are required." },
        { status: 400 }
      );
    }

    if (file) {
      if (!ARTWORK_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: "Artwork should be a PNG, JPG, WebP, GIF, SVG, or PDF." },
          { status: 400 }
        );
      }
      if (file.size > ARTWORK_MAX_BYTES) {
        return NextResponse.json(
          { error: "That file is over 10MB — export a smaller version and try again." },
          { status: 400 }
        );
      }
    }

    const sql = getDb();
    if (!sql) {
      return NextResponse.json(
        { error: "The request box isn't hooked up yet — the database still needs connecting (see README)." },
        { status: 503 }
      );
    }

    // Upload the artwork (if any). If Blob isn't connected we still take the
    // request and just ask them to email the file.
    let artworkUrl: string | null = null;
    let artworkNote = "";
    if (file) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        artworkNote = "(artwork attached but file storage isn't connected — ask them to email it)";
      } else {
        try {
          const safeName = (file.name || "artwork").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
          const blob = await put(`requests/${safeName}`, file, {
            access: "public",
            addRandomSuffix: true,
          });
          artworkUrl = blob.url;
        } catch (err) {
          console.error("artwork upload failed:", err);
          artworkNote = "(artwork upload failed — ask them to email it)";
        }
      }
    }

    await sql`
      insert into special_requests (name, email, size, idea, kind, artwork_url)
      values (${name}, ${email}, ${size || null}, ${idea}, ${kind}, ${artworkUrl})
    `;

    // Tell the shop about it — never let email trouble fail the request
    try {
      const cfg = emailConfig();
      if (cfg.canNotifyOwner) {
        const res = await sendEmail({
          to: cfg.notify,
          subject: `Custom request (${kindLabel(kind)}) from ${name}`,
          replyTo: email,
          html: requestAlertHtml({
            name,
            email,
            size,
            idea,
            kind: kindLabel(kind),
            artworkUrl,
            artworkNote,
            siteUrl: siteUrl(),
          }),
        });
        if (!res.ok) console.error("request email failed:", res.error);
      }
    } catch (err) {
      console.error("request notification error:", err);
    }

    sendPush({
      title: `Custom request · ${kindLabel(kind)}`,
      message: `${name}${size ? ` · size ${size}` : ""}\n${idea.slice(0, 300)}`,
      url: artworkUrl ?? `${siteUrl()}/admin`,
      urlTitle: artworkUrl ? "See the artwork" : "Open the order desk",
      sound: "magic",
    }).catch(() => {});

    return NextResponse.json({ ok: true, artworkNote: artworkNote || undefined });
  } catch (err) {
    console.error("special request error:", err);
    return NextResponse.json(
      { error: "Something went wrong on our end. Try again in a minute." },
      { status: 500 }
    );
  }
}

