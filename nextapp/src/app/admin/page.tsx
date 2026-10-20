import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = {
  title: "Rebesta Fresh Admin",
  description: "Owner dashboard for Rebesta Fresh store operations.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    title: "Rebesta Fresh Admin",
    description: "Owner dashboard for Rebesta Fresh store operations.",
  },
};

export default function AdminPage() {
  return <AdminView />;
}
