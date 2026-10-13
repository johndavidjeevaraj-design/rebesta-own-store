import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";

export const metadata: Metadata = {
  title: "Rebesta Fresh — All Fresh Products, Delivered in Hosur",
  description: "Browse every fresh vegetable in today's live stock. Farm-fresh, fair prices, morning delivery in Hosur.",
};

export default function ShopPage() {
  return <ShopView mode="shop" />;
}
