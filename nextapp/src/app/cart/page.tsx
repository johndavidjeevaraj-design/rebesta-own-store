import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = {
  title: "Your basket — Rebesta Fresh",
  description: "Review your basket, apply coupons, pick a morning slot and check out — fresh vegetables delivered in Hosur.",
};

export default function CartPage() {
  return <CartView />;
}
