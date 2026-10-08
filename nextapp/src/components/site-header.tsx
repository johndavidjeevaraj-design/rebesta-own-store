"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, User, ShoppingBasket, Home, Activity, MessageCircle, Store } from "lucide-react";
import { useCartCount, useSavedLocation } from "@/lib/hooks";
import { locationLabel } from "@/lib/store";
import { LocationSheet } from "./location-sheet";

export function SiteHeader() {
  const count = useCartCount();
  const loc = useSavedLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "border-b border-border/70 bg-cream/85 shadow-[0_6px_24px_rgba(7,64,21,0.06)] backdrop-blur-xl" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <a href="/" className="flex items-center gap-2" aria-label="Rebesta Fresh home">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/brand/logo.png" alt="Rebesta Fresh" className="h-7 w-7 object-contain" />
            </span>
            <span className="hidden font-display text-[1.05rem] font-extrabold leading-none text-forest sm:block">
              Rebesta<span className="text-leaf"> Fresh</span>
            </span>
          </a>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {[
              ["Shop", "/shop"],
              ["Track order", "/track"],
              ["About", "/about"],
              ["FAQ", "/faq"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-3.5 py-2 text-[0.84rem] font-bold text-ink/75 transition hover:bg-white/70 hover:text-forest"
              >
                {label}
              </a>
            ))}
          </nav>

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
      </header>

      {/* mobile quick nav */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-around rounded-3xl border border-border/70 bg-white/90 p-1.5 shadow-[0_10px_30px_rgba(7,64,21,0.16)] backdrop-blur-xl md:hidden"
      >
        {[
          { href: "/", label: "Home", icon: Home },
          { href: "/shop", label: "Shop", icon: Store },
          { href: "/track", label: "Track", icon: Activity },
          { href: "https://wa.me/918438765119", label: "WhatsApp", icon: MessageCircle, external: true },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener" : undefined}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[0.62rem] font-extrabold text-ink/70 transition active:scale-95"
          >
            <item.icon size={19} />
            {item.label}
          </a>
        ))}
      </nav>

      <LocationSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
