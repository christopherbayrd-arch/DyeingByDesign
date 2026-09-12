import { getPublishedPost } from "@/lib/news";
import { icsFor } from "@/lib/newsFormat";
import { SITE_URL } from "@/lib/site";

// /news/<event>/calendar.ics — the "Add to Apple or Outlook calendar" link.
// iPhones open it straight into the Calendar app.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post || post.kind !== "event" || !post.startsOn) {
    return new Response("Not found", { status: 404 });
  }
  const pageUrl = `${SITE_URL}/news/${post.slug}`;
  const host = new URL(SITE_URL).host.replace(/^www\./, "");
  return new Response(icsFor(post, pageUrl, host), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${post.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
