"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, Mic, Search, ShoppingCart, User, ChevronDown, X } from "lucide-react";
import { useCartCount, useSavedLocation } from "@/lib/hooks";
import { LocationSheet } from "./location-sheet";

export function SiteHeader({ search = "", onSearch }: { search?: string; onSearch?: (q: string) => void }) {
  const loc = useSavedLocation();
  const count = useCartCount();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const recRef = useRef<any>(null);

  /* SpeechRecognition only exists in the browser — check post-mount so the
     prerendered HTML matches the first client render (no hydration mismatch) */
  useEffect(() => {
    setSpeechOk(Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !onSearch) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (ev: any) => {
      const alts = Array.from(ev.results[0]).map((r: any) => r.transcript.trim()).filter(Boolean);
      if (alts.length) onSearch(alts[0]);
    };
    rec.start();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-forest/95 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 px-4 py-2.5 md:grid-cols-[auto_1fr_auto]">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="-ml-3 flex items-center gap-2 rounded-2xl px-3 py-1.5 text-left transition hover:bg-white/5"
        >
          <MapPin size={17} className="shrink-0 text-leaf-2" />
          <span className="min-w-0">
            <span className="block text-[0.55rem] font-extrabold uppercase tracking-[0.14em] text-leaf-2/80">Deliver to</span>
            <span className="flex max-w-[180px] items-center gap-1 truncate text-sm font-semibold text-white/95">
              {loc?.label || "Set location"} <ChevronDown size={13} className="shrink-0 opacity-70" />
            </span>
          </span>
        </button>

        {onSearch && (
          <div className="order-3 relative col-span-2 md:order-none md:col-span-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search fresh vegetables… (Tamil works too)"
              className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-leaf-2/60 focus:bg-white/15 md:pr-9"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {search ? (
                <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="text-white/60 hover:text-white">
                  <X size={15} />
                </button>
              ) : (
                speechOk && (
                  <button
                    type="button"
                    onClick={startVoice}
                    aria-label="Search by voice"
                    title="Speak to search — Tamil or English"
                    className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                      listening ? "animate-pulse bg-carrot text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Mic size={15} />
                  </button>
                )
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <a
            href="/account"
            aria-label="Your account"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 transition hover:bg-white/20"
          >
            <User size={18} className="text-white" />
          </a>
          <a
            href="/cart"
            aria-label="Your basket"
            className="relative grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 transition hover:bg-white/20"
          >
            <ShoppingCart size={19} className="text-white" />
            <AnimatePresence mode="popLayout">
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.3, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 22 }}
                  className="absolute -right-1.5 -top-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-forest bg-carrot px-1 text-[0.62rem] font-extrabold text-white"
                >
                  {count > 99 ? "99+" : count}
                </motion.span>
              )}
            </AnimatePresence>
          </a>
        </div>
      </div>

      {sheetOpen && <LocationSheet onClose={() => setSheetOpen(false)} />}
    </header>
  );
}
