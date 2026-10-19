"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "@/components/chat-widget";

/* Customer support chat is storefront-only; keep it off staff tools. */
export function StorefrontChatWidget() {
  const pathname = usePathname();
  if (pathname === "/partner" || pathname.startsWith("/partner/")) return null;
  return <ChatWidget />;
}
