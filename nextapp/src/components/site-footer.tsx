"use client";

import { useEffect, useState } from "react";
import { MapPin, Mail, MessageCircle } from "lucide-react";
import { api, Settings } from "@/lib/store";

export function SiteFooter() {
  const [fssai, setFssai] = useState("");
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
    <footer className="grain relative mt-20 bg-forest-3 pb-24 text-white md:pb-0">
      <div className="relative z-[2] mx-auto max-w-6xl px-4 pt-16">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
          <div>
            <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white/95">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/brand/logo.png" alt="Rebesta Fresh" className="h-8 w-8 object-contain" />
            </span>
            <p className="mt-4 max-w-xs font-display text-2xl font-extrabold leading-tight">
              Fresh from farms,
              <br />
              <span className="text-leaf-2">before breakfast.</span>
            </p>
            <p className="mt-3 max-w-xs text-[0.84rem] leading-relaxed text-white/60">
              Handpicked vegetables from local farms, delivered fresh to your doorstep in Hosur every morning.
            </p>
          </div>

          <nav aria-label="Quick links" className="space-y-1">
            <h4 className="mb-3 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/50">Quick links</h4>
            {[
              ["Shop fresh stock", "/shop"],
              ["Your basket", "/cart"],
              ["Track order", "/track"],
              ["Delivery partners", "/partner"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="block py-1 text-[0.88rem] font-semibold text-white/80 transition hover:text-[#ffc9b3]">
                {label}
              </a>
            ))}
          </nav>

          <nav aria-label="Company" className="space-y-1">
            <h4 className="mb-3 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/50">Company</h4>
            {[
              ["About us", "/about"],
              ["FAQ", "/faq"],
              ["Terms of use", "/terms"],
              ["Privacy policy", "/privacy"],
              ["Refund & cancellation", "/refund"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="block py-1 text-[0.88rem] font-semibold text-white/80 transition hover:text-[#ffc9b3]">
                {label}
              </a>
            ))}
          </nav>

          <div>
            <h4 className="mb-3 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/50">Contact &amp; delivery</h4>
            <a
              href="https://wa.me/918438765119"
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 py-1 text-[0.88rem] font-semibold text-white/80 transition hover:text-[#ffc9b3]"
            >
              <MessageCircle size={14} /> WhatsApp +91 84387 65119
            </a>
            <a href="mailto:warehouseretailingmart@gmail.com" className="flex items-center gap-2 py-1 text-[0.88rem] font-semibold text-white/80 transition hover:text-[#ffc9b3]">
              <Mail size={14} /> warehouseretailingmart@gmail.com
            </a>
            <p className="mt-3 flex items-start gap-2 text-[0.8rem] leading-relaxed text-white/60">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <span>
                Morning slots: 7–9 AM &amp; 9–11 AM
                <br />
                Hosur · up to 9 km road radius
                <br />
                Free delivery over ₹500 · COD available
                <br />
                📍 Shanthi Nagar, Hosur – 635 109
                {fssai && (
                  <>
                    <br />
                    FSSAI Lic. No. {fssai}
                  </>
                )}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-white/10 py-6 text-[0.75rem] font-semibold text-white/45 sm:flex-row">
          <span>© 2026 Rebesta Fresh · Fresh from farms, Hosur</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-leaf animate-pulse-dot" /> Stock updates live every morning
          </span>
        </div>
      </div>
    </footer>
  );
}
