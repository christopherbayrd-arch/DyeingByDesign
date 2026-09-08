import type { NextRequest } from "next/server";
import { authReady, handlers } from "@/lib/auth";

// Auth.js endpoints (/api/auth/signin, /api/auth/callback/google,
// /api/auth/session, …). Auth.js reads the action and provider from the
// URL itself, so two plain dynamic folders ([action] and
// [action]/[provider]) cover everything a [...nextauth] catch-all would —
// and GitHub's web uploader refuses folder names with "..." in them.
// Until sign in is configured they answer with an empty object so the
// header's "who's signed in?" check just sees nobody.
export async function GET(req: NextRequest) {
  if (!authReady()) return Response.json({});
  return handlers.GET(req);
}
export async function POST(req: NextRequest) {
  if (!authReady()) return Response.json({ error: "Sign in isn't switched on yet." }, { status: 503 });
  return handlers.POST(req);
}
