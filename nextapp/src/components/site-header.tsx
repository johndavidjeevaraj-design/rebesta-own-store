"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, Search, ShoppingBasket, User, X } from "lucide-react";
import { useCartCount, useSavedLocation } from "@/lib/hooks";
import { locationLabel } from "@/lib/store";
import { LocationSheet } from "./location-sheet";

/* Apple-style glass nav — one bar everywhere: blurred white, hairline,
   12px links. `search` wires the live search field (shop pages). */
export function SiteHeader({
  search = "",
  onSearch,
}: {
  search?: string;
  onSearch?: (q: string) => void;
  variant?: "overlay" | "solid";
}) {
  const count = useCartCount();
  const loc = useSavedLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => document.documentElement.dataset.scrolled = String(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-black/[0.08] bg-[#fbfbfd]/80 shadow-[0_1px_0_rgba(0,0,0,0.02)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Rebesta Fresh home">
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-[10px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/brand/logo.png" alt="Rebesta Fresh" className="h-8 w-8 object-contain" />
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-ink">
              Rebesta<span className="text-leaf"> Fresh</span>
            </span>
          </a>

          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {[
              ["Shop", "/shop"],
              ["Offers", "/offers"],
              ["Greens", "/greens"],
              ["About", "/about"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-[13px] font-semibold text-ink/80 transition hover:text-ink">
                {label}
              </a>
            ))}
          </nav>

          {onSearch && (
            <div className="relative ml-auto hidden min-w-0 flex-1 max-w-xs lg:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search vegetables…"
                className="w-full rounded-full border border-transparent bg-black/[0.05] py-2 pl-9 pr-8 text-[13px] font-medium text-ink outline-none transition placeholder:text-muted-foreground focus:border-black/10 focus:bg-white"
              />
              {search && (
                <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <div className={`flex items-center gap-5 ${onSearch ? "ml-auto lg:ml-0" : "ml-auto"}`}>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="hidden max-w-[10rem] items-center gap-1.5 text-left sm:flex"
            >
              <MapPin size={13} className="shrink-0 text-leaf" />
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Delivering to</span>
                <span className="block truncate text-[13px] font-semibold text-ink">{locationLabel(loc) || "Set location"}</span>
              </span>
            </button>

            <a href="/account" aria-label="Your account" className="text-ink/80 transition hover:text-ink">
              <User size={18} strokeWidth={1.8} />
            </a>

            <a href="/cart" aria-label="Your basket" className="relative text-ink/80 transition hover:text-ink">
              <ShoppingBasket size={19} strokeWidth={1.8} />
              <AnimatePresence mode="popLayout">
                {count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 600, damping: 22 }}
                    className="carrot-grad absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white shadow-[0_2px_8px_rgba(232,71,12,0.4)]"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </a>
          </div>
        </div>

        {/* mobile search row */}
        {onSearch && (
          <div className="border-t border-black/[0.05] px-4 py-2 lg:hidden">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search vegetables… (Tamil works too)"
                className="w-full rounded-full border border-transparent bg-black/[0.05] py-2 pl-9 pr-8 text-[13px] font-medium text-ink outline-none transition placeholder:text-muted-foreground focus:border-black/10 focus:bg-white"
              />
              {search && (
                <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* mobile quick nav */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-around rounded-[22px] border border-black/[0.08] bg-[#fbfbfd]/85 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl md:hidden"
      >
        {[
          { href: "/", label: "Home" },
          { href: "/shop", label: "Shop" },
          { href: "/track", label: "Track" },
          { href: "https://wa.me/918438765119", label: "WhatsApp", external: true },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener" : undefined}
            className="flex-1 rounded-2xl py-2 text-center text-[11px] font-semibold text-ink/80 transition active:scale-95 active:text-ink"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {sheetOpen && <LocationSheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </>
  );
}
