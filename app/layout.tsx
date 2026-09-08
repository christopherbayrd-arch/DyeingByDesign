import type { Metadata, Viewport } from "next";
import "./globals.css";
import { asset } from "@/lib/assets";
import { siteJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import JsonLd from "@/components/JsonLd";
import { CartProvider } from "@/components/CartContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // "DBD" sits in every title on purpose: it's the mark on the shirts, and
  // search engines only learn the short name if the site actually uses it.
  title: {
    default: "Dyeing By Design (DBD) · Hand bleached shirts made in Brunswick, Maine",
    template: "%s · Dyeing By Design (DBD)",
  },
  description:
    "DBD makes one of a kind reverse bleach shirts in Brunswick, Maine — real leaves and hand-cut stencils on heavyweight cotton, bleached by hand one shirt at a time. No two alike.",
  applicationName: "Dyeing By Design",
  keywords: [
    "DBD",
    "Dyeing By Design",
    "bleach shirts Maine",
    "reverse bleach t-shirt",
    "botanical bleach shirt",
    "custom stencil shirt",
    "Brunswick Maine",
  ],
  openGraph: {
    type: "website",
    siteName: "Dyeing By Design",
    locale: "en_US",
    title: "Dyeing By Design (DBD)",
    description:
      "Hand bleached botanical and stencil shirts made one at a time in Brunswick, Maine. One of a kind. By design.",
    images: [asset("/images/design-sumac.jpg")],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dyeing By Design (DBD)",
    description: "Hand bleached one of a kind shirts, made in Brunswick, Maine.",
    images: [asset("/images/design-sumac.jpg")],
  },
  robots: { index: true, follow: true },
};

// viewport-fit=cover lets the site paint edge to edge on iPhone; the safe-area
// padding in globals.css keeps content clear of the notch and home bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#191408",
};

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* React hoists this into <head>; system serif stands in if fonts are unreachable */}
        <link rel="stylesheet" precedence="default" href={FONTS_URL} />
        <JsonLd data={siteJsonLd()} />
        <CartProvider>
          <Header />
          <main className="min-h-[70vh]">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
