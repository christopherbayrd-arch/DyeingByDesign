"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

// "Sign in" or the customer's first name, for the header. Renders nothing
// until the session check comes back so the header doesn't flicker.
export default function AccountLink({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  const { data, status } = useSession();
  if (status === "loading") return null;
  const name = data?.user?.name?.split(" ")[0];
  return (
    <Link href={data?.user ? "/account" : "/account/signin"} onClick={onClick} className={className}>
      {data?.user ? name || "Account" : "Sign in"}
    </Link>
  );
}
