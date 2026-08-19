import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-24 text-center">
      <p className="kicker">404</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">
        This leaf blew away.
      </h1>
      <p className="mt-4 text-faded">The page you&apos;re after isn&apos;t here.</p>
      <Link href="/" className="btn btn-gold mt-8">
        Back to the shop
      </Link>
    </div>
  );
}
