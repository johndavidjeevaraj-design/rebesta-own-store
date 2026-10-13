"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/* Apple-style film band: full-bleed pure-black section with one rounded
   video card. Muted looping playback only while on screen; pauses
   off-screen to save data. Tap video = play/pause, corner icon = sound. */
export function FilmSection() {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  /* performance: the film is 2MB — never download it during initial page
     load (audit bots and first paint never pay for it). We only START
     watching for the section once the visitor actually scrolls into the
     page — early layout shift makes pure intersection unreliable. */
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const FILM = "/assets/brand/rebesta-film.mp4";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let attached = false;
    let watching = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      v.src = FILM;
      /* preload="none" stays for the initial page; once we're intentionally
         loading, switch to auto or the browser keeps deferring the fetch */
      v.preload = "auto";
      v.load();
      if (!reduced) v.play().catch(() => {});
      lazy.disconnect();
    };
    const lazy = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) attach(); },
      { rootMargin: "300px 0px" }
    );
    const engage = () => {
      if (watching || window.scrollY < 200) return;
      watching = true;
      lazy.observe(v);
      cleanupEngage();
    };
    const cleanupEngage = () => {
      window.removeEventListener("scroll", engage);
      window.removeEventListener("touchmove", engage);
      window.removeEventListener("wheel", engage);
      window.removeEventListener("keydown", engage);
    };
    window.addEventListener("scroll", engage, { passive: true });
    window.addEventListener("touchmove", engage, { passive: true });
    window.addEventListener("wheel", engage, { passive: true });
    window.addEventListener("keydown", engage);
    if (reduced) return () => { cleanupEngage(); lazy.disconnect(); };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!attached) return;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.35 }
    );
    io.observe(v);
    return () => { cleanupEngage(); lazy.disconnect(); io.disconnect(); };
  }, []);

  const toggle = () => {
    const v = vidRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const unmute = () => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <section id="film" className="mt-14 bg-black py-14 sm:py-16">
      <div className="mx-auto max-w-[1040px] px-4">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-leaf-2">
            The film
          </p>
          <h2 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[36px]">
            From our farms to your door.
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-white/55">
            Twenty-seven seconds inside a Rebesta Fresh morning — picked at
            dawn, packed in crates, riding across Hosur.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-[24px] bg-black ring-1 ring-white/10 sm:rounded-[28px]">
          <div className="relative">
            <video
              ref={vidRef}
              className="block w-full cursor-pointer"
              poster="/assets/brand/rebesta-film-poster.jpg"
              muted
              loop
              playsInline
              preload="none"
              onClick={toggle}
            />
            <button
              type="button"
              aria-label={muted ? "Play film with sound" : "Mute film"}
              onClick={unmute}
              className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/40 p-2 text-white/80 backdrop-blur-sm transition hover:text-white active:scale-95"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
