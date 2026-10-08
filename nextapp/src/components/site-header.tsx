"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Home, MapPin, MessageCircle, Search, ShoppingBasket, Store, Activity, User, X } from "lucide-react";
import { useCartCount, useSavedLocation } from "@/lib/hooks";
import { locationLabel } from "@/lib/store";
import { LocationSheet } from "./location-sheet";

/* overlay  — the home hero variant: transparent until scrolled
   solid    — inner pages: sticky cream bar, optional search field */
export function SiteHeader({
  search = "",
  onSearch,
  variant = "overlay",
}: {
  search?: string;
  onSearch?: (q: string) => void;
  variant?: "overlay" | "solid";
}) {
  const count = useCartCount();
  const loc = useSavedLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (variant === "solid") return;
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  return (
    <>
      <header
        className={
          variant === "solid"
            ? "sticky top-0 z-50 border-b border-border/60 bg-cream/90 shadow-[0_4px_20px_rgba(7,64,21,0.05)] backdrop-blur-xl"
            : `fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
                scrolled ? "border-b border-border/70 bg-cream/85 shadow-[0_6px_24px_rgba(7,64,21,0.06)] backdrop-blur-xl" : "bg-transparent"
              }`
        }
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-4">
          <a href="/" className="flex shrink-0 items-center gap-2" aria-label="Rebesta Fresh home">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/brand/logo.png" alt="Rebesta Fresh" className="h-7 w-7 object-contain" />
            </span>
            <span className="hidden font-display text-[1.05rem] font-extrabold leading-none text-forest sm:block">
              Rebesta<span className="text-leaf"> Fresh</span>
            </span>
          </a>

          {onSearch && (
            <div className="relative hidden min-w-0 flex-1 md:block">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-leaf" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search fresh vegetables… (Tamil works too)"
                className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-9 text-sm font-semibold text-ink shadow-sm outline-none transition placeholder:font-medium placeholder:text-muted-foreground focus:border-leaf/60 focus:shadow-md"
              />
              {search && (
                <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink">
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="group flex max-w-[10.5rem] items-center gap-1.5 rounded-full border border-border/80 bg-white/80 py-2 pl-2.5 pr-3.5 text-left shadow-sm backdrop-blur transition hover:border-leaf/60 hover:shadow-md"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint text-leaf">
                <MapPin size={13} />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-wider text-muted-foreground">Delivering to</span>
                <span className="block truncate text-[0.78rem] font-extrabold text-forest">{locationLabel(loc) || "Set location"}</span>
              </span>
            </button>

            <a
              href="/account"
              aria-label="Your account"
              className="grid h-10 w-10 place-items-center rounded-full border border-border/80 bg-white/80 text-ink/80 shadow-sm backdrop-blur transition hover:border-leaf/60 hover:text-forest"
            >
              <User size={17} />
            </a>

            <a
              href="/cart"
              aria-label="Your basket"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-carrot to-[#d8431f] text-white shadow-[0_6px_16px_rgba(255,91,32,0.35)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <ShoppingBasket size={18} />
              <AnimatePresence mode="popLayout">
                {count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 600, damping: 22 }}
                    className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[0.66rem] font-extrabold text-carrot ring-2 ring-cream"
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
          <div className="px-4 pb-3 md:hidden">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-leaf" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search fresh vegetables… (Tamil works too)"
                className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-9 text-sm font-semibold text-ink shadow-sm outline-none transition placeholder:font-medium placeholder:text-muted-foreground focus:border-leaf/60"
              />
              {search && (
                <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* mobile quick nav */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-around rounded-3xl border border-border/70 bg-white/90 p-1.5 shadow-[0_10px_30px_rgba(7,64,21,0.16)] backdrop-blur-xl md:hidden"
      >
        {[
          { href: "/", label: "Home", icon: null },
          { href: "/shop", label: "Shop", icon: null },
          { href: "/track", label: "Track", icon: null },
          { href: "https://wa.me/918438765119", label: "WhatsApp", icon: null, external: true },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener" : undefined}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[0.62rem] font-extrabold text-ink/70 transition active:scale-95"
          >
            {item.label === "Home" && <span className="text-[1.05rem] leading-none">🏠</span>}
            {item.label === "Shop" && <span className="text-[1.05rem] leading-none">🧺</span>}
            {item.label === "Track" && <span className="text-[1.05rem] leading-none">🚚</span>}
            {item.label === "WhatsApp" && <span className="text-[1.05rem] leading-none">💬</span>}
            {item.label}
          </a>
        ))}
      </nav>

      <LocationSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
