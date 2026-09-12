import Link from "next/link";

export default function AdminNav({
  active,
}: {
  active: "orders" | "sell" | "queue" | "inventory" | "products" | "cogs" | "history" | "news" | "drop";
}) {
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
      {tab("/admin/sell", "Quick sale", "sell")}
      {tab("/admin/queue", "Make queue", "queue")}
      {tab("/admin/inventory", "Inventory", "inventory")}
      {tab("/admin/products", "Products & stock", "products")}
      {tab("/admin/cogs", "COGS", "cogs")}
      {tab("/admin/history", "Sales history", "history")}
      {tab("/admin/news", "News", "news")}
      {tab("/admin/drop", "Announce a drop", "drop")}
      <span className="ml-auto flex items-center gap-4 pl-2">
        <Link href="/" className="text-sm text-faded transition hover:text-goldlight">
          View site ↗
        </Link>
        <form action="/api/admin/logout" method="post">
          <button className="text-sm text-faded underline underline-offset-2 transition hover:text-rust">
            Log out
          </button>
        </form>
      </span>
    </div>
  );
}
