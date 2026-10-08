"use client";

import { Home, Activity, MessageCircle } from "lucide-react";

export function BottomNav() {
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-white/70 transition hover:text-white";
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-forest/97 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        <a href="/" className={item}>
          <Home size={21} />
          <span className="text-[0.58rem] font-extrabold uppercase tracking-wide">Home</span>
        </a>
        <a href="/track" className={item}>
          <Activity size={21} />
          <span className="text-[0.58rem] font-extrabold uppercase tracking-wide">Track</span>
        </a>
        <a href="https://wa.me/918438765119" target="_blank" rel="noopener" className={item}>
          <MessageCircle size={21} />
          <span className="text-[0.58rem] font-extrabold uppercase tracking-wide">WhatsApp</span>
        </a>
      </div>
    </nav>
  );
}
