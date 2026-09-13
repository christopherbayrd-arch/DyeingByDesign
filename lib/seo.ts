// schema.org data for search engines (Google, Bing, and the AI answer
// boxes). Nothing here is visible on the page — it tells search engines
// who the business is, that "DBD" means Dyeing By Design, where it's
// based, and what each shirt costs.
import { asset } from "@/lib/assets";
import { isSoldOut, SHIPPING_CENTS, type Product } from "@/lib/products";
import { isoWithOffset, lastDay, summaryOf, type NewsPost } from "@/lib/newsFormat";
import {
  FOUNDED,
  INSTAGRAM_PROFILE,
  SITE_NAME,
  SITE_SHORT,
  SITE_URL,
  SLOGAN,
  STATE,
  STATE_NAME,
  TOWN,
} from "@/lib/site";

const BUSINESS_ID = `${SITE_URL}/#business`;
const WEBSITE_ID = `${SITE_URL}/#website`;

// Absolute URL for a photo, whether it lives in public/ or in Blob storage.
export function absoluteImage(src: string): string {
  if (!src) return "";
  if (/^https?:\/\//.test(src)) return src;
  return `${SITE_URL}${asset(src)}`;
}

// Site-wide: who we are + the site itself. Rendered once, in the root layout.
export function siteJsonLd(): Record<string, unknown> {
  const description =
    `${SITE_NAME} (${SITE_SHORT}) makes one of a kind reverse bleach shirts and ` +
    `bandanas in ${TOWN}, ${STATE_NAME} — real leaves and hand-cut stencils on ` +
    `heavyweight cotton, bleached by hand one piece at a time.`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": BUSINESS_ID,
        name: SITE_NAME,
        alternateName: SITE_SHORT,
        slogan: SLOGAN,
        description,
        url: `${SITE_URL}/`,
        logo: absoluteImage("/images/logo.png"),
        image: [absoluteImage("/images/logo.png"), absoluteImage("/images/design-sumac.jpg")],
        foundingDate: FOUNDED,
        address: {
          "@type": "PostalAddress",
          addressLocality: TOWN,
          addressRegion: STATE,
          addressCountry: "US",
        },
        areaServed: [
          { "@type": "State", name: STATE_NAME },
          { "@type": "Country", name: "United States" },
        ],
        priceRange: "$$",
        currenciesAccepted: "USD",
        paymentAccepted: "Credit card, Apple Pay, Google Pay",
        sameAs: [INSTAGRAM_PROFILE],
        brand: { "@type": "Brand", name: SITE_NAME, alternateName: SITE_SHORT },
        knowsAbout: [
          "reverse bleach shirts",
          "bleach dye t-shirts",
          "botanical bleach printing",
          "hand-cut stencil shirts",
          "custom logo shirts",
          "bleach dyed dog bandanas",
          "matching dog and owner shirts",
        ],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        alternateName: SITE_SHORT,
        url: `${SITE_URL}/`,
        publisher: { "@id": BUSINESS_ID },
        inLanguage: "en-US",
      },
    ],
  };
}

// One shirt design, with its price and shipping — lets Google show the
// price under the result and list the shirt in shopping tabs.
export function productJsonLd(product: Product): Record<string, unknown> {
  const url = `${SITE_URL}/shop/${product.slug}`;
  const images = [product.image, product.card].filter(Boolean).map(absoluteImage);
  const kind = product.line === "stencil" ? "hand-cut stencil" : "real leaf";
  const bandana = product.kind === "bandana";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: bandana ? `${product.name} — hand bleached bandana` : `${product.name} bleach shirt`,
    description: product.blurb || product.story,
    image: images,
    url,
    sku: product.slug,
    brand: { "@type": "Brand", name: SITE_NAME, alternateName: SITE_SHORT },
    manufacturer: { "@id": BUSINESS_ID },
    material: "100% cotton",
    category: bandana
      ? "Apparel & Accessories > Clothing Accessories > Scarves & Shawls"
      : "Apparel & Accessories > Clothing > Shirts & Tops",
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Technique",
        value: bandana ? "Reverse bleach, any design from the lineup" : `Reverse bleach, ${kind}`,
      },
      { "@type": "PropertyValue", name: "Made in", value: `${TOWN}, ${STATE_NAME}` },
      ...(bandana
        ? [{ "@type": "PropertyValue", name: "Fits", value: "One size — dogs and people" }]
        : []),
    ],
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price: (product.priceCents / 100).toFixed(2),
      availability: isSoldOut(product)
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": BUSINESS_ID },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: (SHIPPING_CENTS / 100).toFixed(2),
          currency: "USD",
        },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      },
    },
  };
}

// The "Good to know" questions on the about page.
export function faqJsonLd(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

// A craft fair or market we'll be at. Lets Google list it in event
// searches ("craft fairs near Brunswick this weekend") with the date and place.
export function eventJsonLd(post: NewsPost): Record<string, unknown> {
  const url = `${SITE_URL}/news/${post.slug}`;
  const end = lastDay(post);
  const endDate = post.endTime
    ? isoWithOffset(end, post.endTime)
    : end !== post.startsOn
      ? end
      : "";
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${url}#event`,
    name: post.title,
    description: summaryOf(post),
    url,
    startDate: isoWithOffset(post.startsOn, post.startTime),
    ...(endDate ? { endDate } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: post.venue || post.town || TOWN,
      address: {
        "@type": "PostalAddress",
        ...(post.street ? { streetAddress: post.street } : {}),
        addressLocality: post.town || TOWN,
        addressRegion: post.state || STATE,
        addressCountry: "US",
      },
    },
    image: [absoluteImage(post.imageUrl || "/images/design-sumac.jpg")],
    ...(post.eventUrl ? { organizer: { "@type": "Organization", name: post.title, url: post.eventUrl } } : {}),
    // who'll be there selling
    attendee: { "@id": BUSINESS_ID },
  };
}

// An ordinary news post
export function articleJsonLd(post: NewsPost): Record<string, unknown> {
  const url = `${SITE_URL}/news/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#post`,
    headline: post.title,
    description: summaryOf(post),
    url,
    mainEntityOfPage: url,
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    image: [absoluteImage(post.imageUrl || "/images/design-sumac.jpg")],
    author: { "@id": BUSINESS_ID },
    publisher: { "@id": BUSINESS_ID },
  };
}
