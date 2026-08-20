import type { Metadata } from "next";
import UnsubscribeForm from "@/components/UnsubscribeForm";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-5 pt-24 text-center">
      <p className="kicker">Drop list</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">
        Leaving the list?
      </h1>
      <p className="mx-auto mt-4 text-sm leading-relaxed text-faded">
        No hard feelings. Confirm below and we&apos;ll stop emailing you about
        drops. Your orders and anything in progress aren&apos;t affected.
      </p>
      <UnsubscribeForm token={t ?? ""} />
    </div>
  );
}
