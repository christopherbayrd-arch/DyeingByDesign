// ============================================================
//  Customer sign in (Auth.js). Google / Apple / Facebook buttons plus an
//  emailed sign in link — each one switches on when its keys are in the
//  environment, so the site never shows a button that can't work.
//
//  Env (see README "Step 10 — Customer sign in"):
//    AUTH_SECRET                              required (openssl rand -base64 32)
//    AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET      Google button
//    AUTH_APPLE_ID / AUTH_APPLE_SECRET        Apple button (needs an Apple Developer account)
//    AUTH_FACEBOOK_ID / AUTH_FACEBOOK_SECRET  Facebook button (needs a Meta developer app)
//    RESEND_API_KEY + EMAIL_FROM              emailed link (same as customer emails)
//  Sessions and accounts live in Neon (users / accounts / sessions /
//  verification_token in schema.sql). Server only — never import this
//  from a client component; use next-auth/react there.
// ============================================================
import NextAuth, { type NextAuthConfig } from "next-auth";
import NeonAdapter from "@auth/neon-adapter";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Facebook from "next-auth/providers/facebook";
import Resend from "next-auth/providers/resend";
import { emailConfig, sendEmail, signInLinkHtml } from "@/lib/email";
import { siteUrl } from "@/lib/orderFormat";

// The Neon pool talks over WebSockets; Node before 22 has no global one.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

export function signInMethods() {
  const has = (k: string) => Boolean(process.env[k]);
  return {
    google: has("AUTH_GOOGLE_ID") && has("AUTH_GOOGLE_SECRET"),
    apple: has("AUTH_APPLE_ID") && has("AUTH_APPLE_SECRET"),
    facebook: has("AUTH_FACEBOOK_ID") && has("AUTH_FACEBOOK_SECRET"),
    email: emailConfig().canEmailCustomers,
    database: has("DATABASE_URL"),
    secret: has("AUTH_SECRET"),
  };
}

// Sign in can run at all: a secret to sign cookies, a database for
// sessions, and at least one way in.
export function authReady() {
  const m = signInMethods();
  return m.secret && m.database && (m.google || m.apple || m.facebook || m.email);
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const m = signInMethods();
  const providers: NextAuthConfig["providers"] = [];
  if (m.google) providers.push(Google({ allowDangerousEmailAccountLinking: true }));
  if (m.apple) providers.push(Apple);
  if (m.facebook) providers.push(Facebook({ allowDangerousEmailAccountLinking: true }));
  if (m.email) {
    providers.push(
      Resend({
        from: process.env.EMAIL_FROM,
        apiKey: process.env.RESEND_API_KEY,
        maxAge: 60 * 60, // the link works for an hour
        async sendVerificationRequest({ identifier, url }) {
          const res = await sendEmail({
            to: identifier,
            subject: "Your sign in link — Dyeing By Design",
            html: signInLinkHtml({ url, siteUrl: siteUrl() }),
          });
          if (!res.ok) throw new Error(res.error ?? "Could not send the sign in email.");
        },
      })
    );
  }
  const dbUrl = process.env.DATABASE_URL;
  return {
    adapter: dbUrl ? NeonAdapter(new Pool({ connectionString: dbUrl })) : undefined,
    providers,
    session: { strategy: dbUrl ? "database" : "jwt", maxAge: 60 * 60 * 24 * 90 },
    pages: { signIn: "/account/signin", verifyRequest: "/account/check-email", error: "/account/signin" },
    trustHost: true,
    callbacks: {
      // Only what the browser needs — never the session token itself
      session({ session, user }) {
        return {
          expires: session.expires,
          user: {
            id: String(user?.id ?? session.user?.id ?? ""),
            name: session.user?.name ?? null,
            email: session.user?.email ?? null,
            image: session.user?.image ?? null,
          },
        } as typeof session;
      },
    },
  };
});

// The signed in customer, or null — safe to call even before sign in is
// switched on (a bare auth() would throw without AUTH_SECRET).
export async function currentUser(): Promise<{ id: string; name: string; email: string; image: string } | null> {
  if (!authReady()) return null;
  try {
    const session = await auth();
    const u = session?.user;
    if (!u?.email) return null;
    return { id: String(u.id ?? ""), name: u.name ?? "", email: u.email, image: u.image ?? "" };
  } catch (err) {
    console.error("auth():", err);
    return null;
  }
}
