import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";

export const metadata: Metadata = {
  title: "Fresh Greens & Keerai Delivered in Hosur | Rebesta Fresh",
  description: "Keerai and leafy greens picked this morning — farm-fresh delivery across Hosur.",
};

export default function GreensPage() {
  return <ShopView mode="greens" />;
}
