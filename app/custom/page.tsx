import type { Metadata } from "next";
import CustomForm from "@/components/CustomForm";

export const metadata: Metadata = {
  title: "Custom requests",
  description:
    "Send us leaves from a tree that means something — a wedding venue, a family camp, a childhood yard — and we'll bleach print the only shirt like it on earth.",
};

const IDEAS = [
  {
    title: "The wedding tree",
    text: "Leaves from the oak you got married under, printed for your first anniversary.",
  },
  {
    title: "The home place",
    text: "The maple in the yard you grew up raking. A shirt for every sibling.",
  },
  {
    title: "In memory",
    text: "A quiet way to keep someone's favorite tree close. We handle these with care.",
  },
  {
    title: "The trail",
    text: "Ferns from the hike you do every year. Better than any souvenir shop tee.",
  },
];

export default function CustomPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 pt-14">
      <p className="kicker">Special requests</p>
      <h1 className="mt-2 max-w-2xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Your tree. Your story. One shirt.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-faded sm:text-base">
        Some trees mean something. Mail us the leaves — pressed flat between cardboard
        works great — or tell us what to go find, and we&apos;ll print a shirt that
        exists nowhere else. Custom pieces are priced one at a time depending on the
        design; tell us your idea and we&apos;ll reply with a quote and timeline.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {IDEAS.map((idea) => (
          <div key={idea.title} className="card p-5">
            <p className="font-display text-lg font-semibold text-goldlight">{idea.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-faded">{idea.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <h2 className="mb-5 font-display text-2xl font-semibold">Tell us what you&apos;re thinking</h2>
        <CustomForm />
      </div>
    </div>
  );
}
