import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-5 pt-14">
      <p className="kicker">Your account</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Check your email</h1>
      <div className="card mt-8 p-6 text-sm leading-relaxed text-faded">
        <p>
          We sent a sign in link{email ? <> to <span className="text-bone">{email}</span></> : ""}. Tap it and
          you&apos;re in. It works for an hour, and only once.
        </p>
        <p className="mt-3">Nothing there? Check spam, then <Link href="/account/signin" className="text-goldlight underline underline-offset-2">ask for a new one</Link>.</p>
      </div>
    </div>
  );
}
