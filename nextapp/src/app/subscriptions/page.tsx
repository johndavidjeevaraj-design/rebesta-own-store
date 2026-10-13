import type { Metadata } from "next";
import { SubscriptionsView } from "@/components/subscriptions-view";

export const metadata: Metadata = {
  title: "Your weekly basket — Rebesta Fresh",
  description: "Manage your weekly vegetable subscription — pause, resume or cancel anytime, pay on delivery.",
};

export default function SubscriptionsPage() {
  return <SubscriptionsView />;
}
