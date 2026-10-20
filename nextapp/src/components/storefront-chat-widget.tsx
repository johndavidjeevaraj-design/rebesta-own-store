"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "@/components/chat-widget";

/* Customer support chat is storefront-only; keep it off staff tools. */
export function StorefrontChatWidget() {
  const pathname = usePathname();
  if (["/partner", "/admin"].some((route) => pathname === route || pathname.startsWith(`${route}/`))) return null;
  const avoidCheckoutBar = pathname === "/cart" || pathname.startsWith("/cart/");
  return <ChatWidget avoidCheckoutBar={avoidCheckoutBar} />;
}
