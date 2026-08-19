import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Owner photo uploads (guarded by middleware). Files land in Vercel Blob
// storage and we hand back the public URL to store on the product.
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Photo storage isn't connected yet. In Vercel: Storage → Create → Blob → connect it to this project, then redeploy (README has the steps).",
      },
      { status: 503 }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "That doesn't look like an image." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "That photo is over 8MB — export a smaller version and try again." },
        { status: 400 }
      );
    }

    const safeName = (file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    const blob = await put(`products/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("upload error:", err);
    return NextResponse.json(
      { error: "Upload failed. Try again in a minute." },
      { status: 500 }
    );
  }
}
