"use client";

import { useEffect, useState } from "react";
import { MapPin, Mail, MessageCircle } from "lucide-react";
import { api, Settings } from "@/lib/store";

/* Apple-style footer: light gray, tiny quiet links, hairlines. */
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
    <footer className="mt-24 bg-[#f5f5f7] pb-24 text-ink md:pb-0">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <p className="text-[0.72rem] font-medium leading-relaxed text-muted-foreground">
          Handpicked vegetables from local farms, delivered fresh to your doorstep in Hosur every morning.
        </p>

        <div className="mt-4 border-t border-black/[0.08] pt-5">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <nav aria-label="Quick links">
              <h4 className="mb-2.5 text-[0.72rem] font-bold text-ink">Shop</h4>
              <div className="space-y-1.5">
                {[
                  ["Fresh stock", "/shop"],
                  ["Today's offers", "/offers"],
                  ["Greens & keerai", "/greens"],
                  ["Your basket", "/cart"],
                  ["Track order", "/track"],
                ].map(([label, href]) => (
                  <a key={href} href={href} className="block text-[0.72rem] font-medium text-muted-foreground transition hover:text-ink hover:underline">
                    {label}
                  </a>
                ))}
              </div>
            </nav>

            <nav aria-label="Company">
              <h4 className="mb-2.5 text-[0.72rem] font-bold text-ink">Company</h4>
              <div className="space-y-1.5">
                {[
                  ["About us", "/about"],
                  ["FAQ", "/faq"],
                  ["Terms of use", "/terms"],
                  ["Privacy policy", "/privacy"],
                  ["Refund & cancellation", "/refund"],
                  ["Delivery partners", "/partner"],
                ].map(([label, href]) => (
                  <a key={href} href={href} className="block text-[0.72rem] font-medium text-muted-foreground transition hover:text-ink hover:underline">
                    {label}
                  </a>
                ))}
              </div>
            </nav>

            <div>
              <h4 className="mb-2.5 text-[0.72rem] font-bold text-ink">Contact</h4>
              <div className="space-y-1.5">
                <a
                  href="https://wa.me/918438765119"
                  target="_blank"
                  rel="noopener"
                  className="block text-[0.72rem] font-medium text-muted-foreground transition hover:text-ink hover:underline"
                >
                  WhatsApp +91 84387 65119
                </a>
                <a href="mailto:warehouseretailingmart@gmail.com" className="block break-all text-[0.72rem] font-medium text-muted-foreground transition hover:text-ink hover:underline">
                  warehouseretailingmart@gmail.com
                </a>
              </div>
            </div>

            <div>
              <h4 className="mb-2.5 text-[0.72rem] font-bold text-ink">Delivery</h4>
              <p className="text-[0.72rem] font-medium leading-relaxed text-muted-foreground">
                Morning slots: 7–9 AM &amp; 9–11 AM
                <br />
                Hosur · up to 9 km road radius
                <br />
                Free delivery over ₹500 · COD available
                <br />
                Shanthi Nagar, Hosur – 635 109
                {fssai && (
                  <>
                    <br />
                    FSSAI Lic. No. {fssai}
                  </>
                )}
              </p>
              <p className="mt-3 flex items-center gap-1 text-[0.72rem] font-medium text-muted-foreground">
                <MapPin size={12} /> Exact-pin delivery, every morning
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-2 border-t border-black/[0.08] py-5 text-[0.72rem] font-medium text-muted-foreground sm:flex-row sm:items-center">
          <span>© 2026 Rebesta Fresh · Fresh from farms, Hosur</span>
          <span className="flex items-center gap-1.5">
            <Mail size={11} /> Stock updates live every morning
          </span>
        </div>
      </div>
    </footer>
  );
}
