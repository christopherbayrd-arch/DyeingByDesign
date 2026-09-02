import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/CartContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Dyeing By Design — hand bleached botanical & stencil shirts, made in Maine",
    template: "%s · Dyeing By Design",
  },
  description:
    "Real botanicals, custom stencils, and hand-cut graphics on heavyweight cotton. Bleached by hand in Maine, one shirt at a time. No two alike.",
  openGraph: {
    title: "Dyeing By Design",
    description:
      "Hand bleached botanical and stencil shirts made one at a time in Maine. One of a kind. By design.",
    images: ["/images/design-sumac.jpg"],
  },
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
        <CartProvider>
          <Header />
          <main className="min-h-[70vh]">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
