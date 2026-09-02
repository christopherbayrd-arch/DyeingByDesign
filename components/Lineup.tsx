import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { LINES, type Product } from "@/lib/products";

// Renders the catalog grouped into its two lines (Botanical / Graphic & Stencil).
// A line with nothing in it yet shows a short "coming soon" card that points
// people at custom requests, so the site never has an awkward empty gap.
export default function Lineup({
  products,
  columns = 4,
  compact = false,
}: {
  products: Product[];
  columns?: 3 | 4;
  compact?: boolean;
}) {
  const grid =
    columns === 4
      ? "grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4"
      : "grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3";

  return (
    <div className="space-y-14">
      {LINES.map((line) => {
        const items = products.filter((p) => (p.line ?? "botanical") === line.key);
        return (
          <section key={line.key} id={line.key}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className={"font-display font-semibold " + (compact ? "text-2xl" : "text-2xl sm:text-3xl")}>
                  {line.name}
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-faded">{line.tagline}</p>
              </div>
              {items.length > 0 && (
                <p className="text-xs text-faded">
                  {items.length} design{items.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
            {items.length > 0 ? (
              <div className={"mt-6 " + grid}>
                {items.map((p) => (
                  <ProductCard key={p.slug} product={p} />
                ))}
              </div>
            ) : (
              <div className="card mt-6 flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-relaxed text-faded">
                  {line.key === "stencil"
                    ? "The first stencil designs are being cut now. Until they land, any shape you can picture — a logo, a silhouette, a bold graphic — can be made as a 1-of-1."
                    : "New botanical designs are on the way. Have a leaf in mind? Send it as a custom request."}
                </p>
                <Link href="/custom" className="btn btn-ghost shrink-0">
                  Start a custom design
                </Link>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
