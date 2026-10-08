"use client";

import { useEffect, useState } from "react";
import { Leaf, Phone, MessageCircle } from "lucide-react";
import { api, Settings } from "@/lib/store";

export function SiteFooter() {
  const [fssai, setFssai] = useState("21523005000123");
  useEffect(() => {
    let live = true;
    api("/api/settings")
      .then((d: Settings) => {
        if (live && d?.business?.fssai) setFssai(d.business.fssai);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <footer className="mt-16 bg-forest text-white/85">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold text-white">
            <Leaf size={18} className="text-leaf-2" /> Rebesta Fresh
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Hosur&rsquo;s own quick-commerce vegetable store. Farm-fresh produce, live stock, exact-pin morning delivery.
          </p>
          <p className="mt-3 text-[0.7rem] text-white/50">FSSAI Lic. No. {fssai}</p>
        </div>
        <div>
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-leaf-2/90">Shop</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="/shop" className="transition hover:text-white">All vegetables</a></li>
            <li><a href="/shop" className="transition hover:text-white">Leafy greens</a></li>
            <li><a href="/shop" className="transition hover:text-white">Weekly veg boxes</a></li>
            <li><a href="/subscriptions" className="transition hover:text-white">Weekly basket</a></li>
          </ul>
        </div>
        <div>
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-leaf-2/90">Company</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="/about" className="transition hover:text-white">About us</a></li>
            <li><a href="/faq" className="transition hover:text-white">FAQ</a></li>
            <li><a href="/terms" className="transition hover:text-white">Terms &amp; conditions</a></li>
            <li><a href="/refund" className="transition hover:text-white">Refunds &amp; cancellations</a></li>
            <li><a href="/privacy" className="transition hover:text-white">Privacy</a></li>
          </ul>
        </div>
        <div>
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-leaf-2/90">Talk to us</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <a href="tel:+918438765119" className="flex items-center gap-2 transition hover:text-white">
                <Phone size={14} className="text-leaf-2" /> +91 84387 65119
              </a>
            </li>
            <li>
              <a href="https://wa.me/918438765119" target="_blank" rel="noreferrer" className="flex items-center gap-2 transition hover:text-white">
                <MessageCircle size={14} className="text-leaf-2" /> WhatsApp us
              </a>
            </li>
            <li className="text-white/60">Hosur, Tamil Nadu 635109</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-[0.72rem] text-white/50">
        © {new Date().getFullYear()} Rebesta Fresh · Farm-fresh vegetables, delivered every morning in Hosur
      </div>
    </footer>
  );
}
