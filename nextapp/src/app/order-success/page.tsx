import type { Metadata } from "next";
import { OrderSuccessView } from "@/components/order-success-view";

export const metadata: Metadata = {
  title: "Order confirmed — Rebesta Fresh",
  description: "Your fresh vegetables are locked in — see your order summary, timeline and rewards.",
};

export default function OrderSuccessPage() {
  return <OrderSuccessView />;
}
