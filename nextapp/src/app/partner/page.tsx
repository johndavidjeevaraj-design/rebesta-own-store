import type { Metadata } from "next";
import { PartnerView } from "@/components/partner-view";

export const metadata: Metadata = {
  title: "Delivery Partner — Rebesta Fresh",
  description: "Rebesta Fresh delivery partner app — today's orders, navigation and live tracking.",
  alternates: { canonical: "/partner" },
  openGraph: {
    type: "website",
    title: "Partner with Rebesta Fresh",
    description: "Deliver fresh vegetables in Hosur with Rebesta Fresh — flexible delivery partner opportunities with fair per-drop payouts.",
    url: "https://rebestafresh.in/partner",
    images: ["https://rebestafresh.in/assets/brand/logo.png"],
  },
  twitter: {
    card: "summary",
    title: "Partner with Rebesta Fresh",
    description: "Deliver fresh vegetables in Hosur with Rebesta Fresh — flexible delivery partner opportunities with fair per-drop payouts.",
    images: ["https://rebestafresh.in/assets/brand/logo.png"],
  },
};

export default function PartnerPage() {
  return <PartnerView />;
}
