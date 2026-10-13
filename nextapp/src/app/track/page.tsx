import type { Metadata } from "next";
import { TrackView } from "@/components/track-view";

export const metadata: Metadata = {
  title: "Track your order — Rebesta Fresh",
  description: "See exactly where your vegetable delivery is — live partner location, delivery proof and full order history.",
};

export default function TrackPage() {
  return <TrackView />;
}
