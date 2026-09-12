import { bodyBlocks, linkParts } from "@/lib/newsFormat";

// Web addresses typed into a post become links
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-goldlight underline underline-offset-2 transition hover:text-gold"
          >
            {part.text.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

// A post's text: blank line = new paragraph, "- " = bullet
export default function NewsBody({ body }: { body: string }) {
  const blocks = bodyBlocks(body);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-5 text-base leading-relaxed text-bone/90">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} className="space-y-2.5">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                <span>
                  <Linked text={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Linked text={line} />
              </span>
            ))}
          </p>
        )
      )}
    </div>
  );
}
