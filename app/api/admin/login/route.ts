import { NextResponse } from "next/server";
import { ADMIN_COOKIE, safeEqual, sessionToken } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return NextResponse.json(
      { error: "Admin is not enabled yet — set ADMIN_PASSWORD (see README)." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const attempt = String(body?.password ?? "");

  if (!attempt || !safeEqual(attempt, password)) {
    return NextResponse.json({ error: "That password didn't work." }, { status: 401 });
  }

  const token = await sessionToken(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
