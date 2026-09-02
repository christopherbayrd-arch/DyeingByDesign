import { orderAlertHtml, requestAlertHtml, customerOrderHtml, testHtml, dropHtml } from "@/lib/email";
import { siteUrl } from "@/lib/orderFormat";

// Preview the notification emails without sending any (owner only).
//   /api/admin/preview-email?k=order | request | customer | test
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("k") ?? "order";
  const site = siteUrl();
  let html: string;

  if (kind === "request") {
    html = requestAlertHtml({
      name: "Jamie Cote",
      email: "jamie@example.com",
      size: "XL",
      kind: "Leaves / botanical",
      idea: "We got married under a big oak at my grandparents' place in Bowdoinham. I can mail you a box of leaves from it. Hoping for two shirts for our anniversary in October.",
      siteUrl: site,
    });
  } else if (kind === "customer") {
    html = customerOrderHtml({
      firstName: "Dana",
      itemLines: ["1 × Maple — size L", "2 × Sumac — size M"],
      total: "$124.97",
      siteUrl: site,
    });
  } else if (kind === "drop") {
    html = dropHtml({
      headline: "20 shirts. Numbered. Gone when they're gone.",
      bodyParagraphs: [
        "Picked the maples the week they turned. Twenty shirts, each one numbered on the tag, each one different because the spray never lands twice the same.",
        "They go up Friday at 7pm. Last fall's batch was gone in two days.",
      ],
      ctaLabel: "Shop the drop",
      ctaUrl: `${site}/shop`,
      feature: {
        name: "Maple",
        price: "$39.99",
        image: `${site}/images/design-maple.jpg`,
        url: `${site}/shop/maple`,
      },
      siteUrl: site,
      unsubUrl: `${site}/unsubscribe?t=preview`,
    });
  } else if (kind === "test") {
    html = testHtml(site);
  } else {
    html = orderAlertHtml({
      itemLines: ["1 × Maple — size L", "2 × Sumac — size M"],
      customerName: "Dana Whitfield",
      customerEmail: "dana@example.com",
      total: "$124.97",
      shipTo: "Dana Whitfield, 14 Pleasant St, Apt 2, Brunswick ME 04011",
      siteUrl: site,
    });
  }

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
