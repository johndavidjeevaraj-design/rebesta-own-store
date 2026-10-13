import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";

export const metadata: Metadata = {
  title: "Today’s Offers — Fresh Vegetable Deals in Hosur | Rebesta Fresh",
  description: "Fresh vegetable deals and discounts in Hosur — today's offers on farm-fresh produce.",
};

export default function OffersPage() {
  return <ShopView mode="offers" />;
}
