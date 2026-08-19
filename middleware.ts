import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, safeEqual, sessionToken } from "@/lib/adminAuth";

// Protects the owner area (/admin pages and /api/admin endpoints).
// The owner signs in at /admin/login with ADMIN_PASSWORD.
export const config = {
  matcher: ["/admin/:path*", "/admin", "/api/admin/:path*"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // the login page and login API are public (you have to be able to log in)
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse(
      "Admin is not enabled yet. Set the ADMIN_PASSWORD environment variable (see README).",
      { status: 503 }
    );
  }

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value ?? "";
  const expected = await sessionToken(password);
  if (cookie && safeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  // not signed in
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}
