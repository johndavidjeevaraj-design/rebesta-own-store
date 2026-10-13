import type { Metadata, Viewport } from "next";
import "./globals.css";
import LenisProvider from "@/components/lenis-provider";
import { ToastProvider } from "@/components/toaster";
import { PwaRegister } from "@/components/pwa-register";

const SITE_URL = 'https://rebestafresh.in';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Rebesta Fresh — Farm-Fresh Vegetables Delivered in Hosur",
  description:
    "Order farm-fresh vegetables in Hosur with exact-pin morning delivery. Live stock, fair prices, cash on delivery & UPI. Free delivery over ₹500.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Rebesta Fresh — Farm-Fresh Vegetables Delivered in Hosur",
    description:
      "Live stock, fair prices, exact-pin morning delivery across Hosur. Cash on delivery & UPI. Free delivery over ₹500.",
    url: SITE_URL,
    siteName: "Rebesta Fresh",
    type: "website",
    images: [{ url: "/assets/brand/hero.jpg", width: 1376, height: 768, alt: "Fresh vegetables from Rebesta Fresh" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rebesta Fresh — Farm-Fresh Vegetables Delivered in Hosur",
    description: "Live stock, fair prices, exact-pin morning delivery across Hosur. Free delivery over ₹500.",
    images: ["/assets/brand/hero.jpg"],
  },
  /* installable web app — same setup the legacy pages had */
  manifest: "/manifest.json",
  applicationName: "Rebesta Fresh",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rebesta Fresh",
  },
  icons: {
    icon: [
      { url: "/assets/brand/icon-r-192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/brand/icon-r-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/assets/brand/icon-r-180.png", sizes: "180x180", type: "image/png" }],
  },
};

/* LocalBusiness structured data — GroceryStore schema for search engines */
const STORE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "GroceryStore",
  name: "Rebesta Fresh",
  url: SITE_URL,
  logo: `${SITE_URL}/assets/brand/logo-orange-leaf.png`,
  image: `${SITE_URL}/assets/brand/hero.jpg`,
  description:
    "Farm-fresh vegetables delivered every morning across Hosur. Live stock, fair prices, cash on delivery and UPI.",
  telephone: "+918438765119",
  priceRange: "₹",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Hosur",
    addressRegion: "Tamil Nadu",
    postalCode: "635109",
    addressCountry: "IN",
  },
  geo: { "@type": "GeoCoordinates", latitude: 12.7409, longitude: 77.8253 },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: "06:00",
    closes: "20:00",
  },
  sameAs: ["https://wa.me/918438765119"],
};

export const viewport: Viewport = {
  themeColor: "#032c13",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STORE_SCHEMA) }} />
        <LenisProvider>
          <ToastProvider>{children}</ToastProvider>
        </LenisProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
