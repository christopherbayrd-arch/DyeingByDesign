import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

// One place for the Instagram link so the header, footer, and artist page
// all open the same profile in a new tab. Pass children to change the label.
export default function InstagramLink({
  className = "",
  children,
  onClick,
}: {
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`${INSTAGRAM_HANDLE} on Instagram`}
      className={className}
      onClick={onClick}
    >
      {children ?? (
        <>
          Instagram <span aria-hidden="true">↗</span>
        </>
      )}
    </a>
  );
}
