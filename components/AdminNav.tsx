import Link from "next/link";

export default function AdminNav({ active }: { active: "orders" | "products" }) {
  const tab = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={
        "rounded-full px-4 py-1.5 text-sm font-medium transition " +
        (active === key
          ? "bg-gold text-inkdeep"
          : "text-faded hover:text-goldlight")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {tab("/admin", "Orders & requests", "orders")}
      {tab("/admin/products", "Products & stock", "products")}
      <span className="flex-1" />
      <Link href="/" className="text-sm text-faded transition hover:text-goldlight">
        View site ↗
      </Link>
      <form action="/api/admin/logout" method="post">
        <button className="text-sm text-faded underline underline-offset-2 transition hover:text-rust">
          Log out
        </button>
      </form>
    </div>
  );
}
