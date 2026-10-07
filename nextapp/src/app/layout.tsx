import type { Metadata } from "next";
import "./globals.css";
import LenisProvider from "@/components/lenis-provider";
import { ToastProvider } from "@/components/toaster";

export const metadata: Metadata = {
  title: "Rebesta Fresh — Fresh vegetables in Hosur, delivered every morning",
  description:
    "Farm-fresh vegetables handpicked every morning and delivered to your exact doorstep pin in Hosur. Free delivery over ₹500. COD & UPI.",
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
