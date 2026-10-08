import type { Metadata } from "next";
import "./globals.css";
import LenisProvider from "@/components/lenis-provider";
import { ToastProvider } from "@/components/toaster";

export const metadata: Metadata = {
  title: "Rebesta Fresh — Farm-Fresh Vegetables Delivered in Hosur Every Morning",
  description:
    "Order farm-fresh vegetables in Hosur with exact-pin morning delivery. Live stock, fair prices, cash on delivery & UPI. Free delivery over ₹500.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <LenisProvider>
          <ToastProvider>{children}</ToastProvider>
        </LenisProvider>
      </body>
    </html>
  );
}
