import type { Metadata } from "next";
import CustomForm from "@/components/CustomForm";
import { isRequestKind } from "@/lib/requests";

export const metadata: Metadata = {
  title: "Custom designs",
  description:
    "Send us your leaves, logos, or design ideas for a 1-of-1 piece — a custom stencil of your business logo, a favorite graphic, or leaves from your own backyard, bleached by hand in Maine.",
};

const IDEAS = [
  {
    title: "Your logo, cut by hand",
    text: "A stencil of your business, band, or team logo — heat-sealed for sharp edges, burned in so it never peels.",
  },
  {
    title: "The wedding tree",
    text: "Leaves from the oak you got married under, printed for your first anniversary.",
  },
  {
    title: "A shape that's yours",
    text: "A moose silhouette, a moon phase, the ridgeline you can see from the porch. If it can be cut, it can be bleached.",
  },
  {
    title: "The home place",
    text: "The maple in the yard you grew up raking. A shirt for every sibling.",
  },
  {
    title: "In memory",
    text: "A quiet way to keep someone's favorite tree, or their handwriting, close. We handle these with care.",
  },
  {
    title: "The trail",
    text: "Ferns from the hike you do every year. Better than any souvenir shop tee.",
  },
];

export default async function CustomPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initialKind = type && isRequestKind(type) ? type : "leaves";

  return (
    <div className="mx-auto max-w-4xl px-5 pt-14">
      <p className="kicker">1-of-1 custom orders</p>
      <h1 className="mt-2 max-w-2xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Have a concept, logo, or local leaf in mind?
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-faded sm:text-base">
        Whether it&apos;s a custom stencil of your business logo, a favorite graphic, or
        leaves from your own backyard, we turn your idea into a custom piece of wearable
        art. Send us the file, mail us the leaves — pressed flat between cardboard works
        great — or just tell us what to go find. Custom pieces are priced one at a time
        depending on the design; tell us your idea and we&apos;ll reply with a quote and
        timeline.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {IDEAS.map((idea) => (
          <div key={idea.title} className="card p-5">
            <p className="font-display text-lg font-semibold text-goldlight">{idea.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-faded">{idea.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <h2 className="mb-5 font-display text-2xl font-semibold">Tell us what you&apos;re thinking</h2>
        <CustomForm initialKind={initialKind} />
      </div>
    </div>
  );
}
