import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SignInButtons from "@/components/SignInButtons";
import { authReady, currentUser, signInMethods } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Dyeing By Design to keep your cart and see your orders.",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

// Where you sign in. Signing in is optional — every order form works as
// a guest — it just remembers your cart and your details.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const safeCallback = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/account";
  const user = await currentUser();
  if (user && !error) redirect(safeCallback);
  const methods = signInMethods();
  const ready = authReady();

  return (
    <div className="mx-auto max-w-md px-5 pt-14">
      <p className="kicker">Your account</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Sign in</h1>
      <p className="mt-3 text-sm leading-relaxed text-faded">
        Signing in keeps your cart between your phone and laptop, fills in your details on the
        order form, and shows you where your orders are. You never need it to order — every form
        works as a guest.
      </p>
      <div className="card mt-8 p-6">
        {ready ? (
          <SignInButtons
            methods={{ google: methods.google, apple: methods.apple, facebook: methods.facebook, email: methods.email }}
            callbackUrl={safeCallback}
            error={error}
          />
        ) : (
          <p className="text-sm text-faded">
            Sign in isn&apos;t switched on yet. You can still order —{" "}
            <Link href="/shop" className="text-goldlight underline underline-offset-2">head to the lineup</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
