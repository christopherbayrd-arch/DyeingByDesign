import { NextRequest, NextResponse } from "next/server";

// Protects /admin with a simple password prompt (HTTP Basic auth).
// Set ADMIN_PASSWORD in your environment variables. Username can be anything.
export const config = { matcher: ["/admin/:path*", "/admin"] };

export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse(
      "Admin is not enabled yet. Set the ADMIN_PASSWORD environment variable (see README).",
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === password) return NextResponse.next();
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dyeing By Design admin"' },
  });
}
