// Drops a schema.org block into the page for search engines. Invisible to
// people. The "<" escape keeps a stray tag in product copy from breaking
// out of the script (the pattern Next.js recommends).
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
