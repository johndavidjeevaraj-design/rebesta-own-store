import type { Metadata } from "next";
import { ProductFallbackView } from "@/components/product-fallback";

export const metadata: Metadata = {
  title: "Fresh Product — Rebesta Fresh",
  description: "View live product details and availability from Rebesta Fresh in Hosur.",
  alternates: { canonical: "/product-fallback" },
  openGraph: {
    title: "Fresh Product — Rebesta Fresh",
    description: "View live product details and availability from Rebesta Fresh in Hosur.",
    type: "website",
    images: ["/assets/brand/hero.jpg"],
  },
};

export default function ProductFallbackPage() {
  return <ProductFallbackView />;
}
