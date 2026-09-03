import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";
import { asset } from "@/lib/assets";

export const metadata: Metadata = {
  title: "Owner login",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 pt-24 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset("/images/logo-mark.png")} alt="" width={52} height={52} />
      <h1 className="mt-4 font-display text-3xl font-semibold">Owner login</h1>
      <p className="mt-2 text-sm text-faded">
        The back room of Dyeing By Design — orders, products, and stock.
      </p>
      <LoginForm />
    </div>
  );
}
