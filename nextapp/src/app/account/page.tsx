import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";

export const metadata: Metadata = {
  title: "Your account — Rebesta Fresh",
  description: "Your profile and every Rebesta order in one place.",
};

export default function AccountPage() {
  return <AccountView />;
}
