import type { Metadata, Viewport } from "next";
import "./globals.css";
import LenisProvider from "@/components/lenis-provider";
import { ToastProvider } from "@/components/toaster";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Rebesta Fresh — Farm-Fresh Vegetables Delivered in Hosur Every Morning",
  description:
    "Order farm-fresh vegetables in Hosur with exact-pin morning delivery. Live stock, fair prices, cash on delivery & UPI. Free delivery over ₹500.",
  /* installable web app — same setup the legacy pages had */
  manifest: "/manifest.json",
  applicationName: "Rebesta Fresh",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rebesta Fresh",
  },
  icons: {
    icon: [
      { url: "/assets/brand/icon-r-192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/brand/icon-r-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/assets/brand/icon-r-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#032c13",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <LenisProvider>
          <ToastProvider>{children}</ToastProvider>
        </LenisProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
