"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/* Apple-style film band: full-bleed pure-black section with one rounded
   video card. Muted looping playback only while on screen; pauses
   off-screen to save data. Tap video = play/pause, corner icon = sound. */
export function FilmSection() {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.35 }
    );
    io.observe(v);
    return () => io.disconnect();
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
              src="/assets/brand/rebesta-film.mp4"
              poster="/assets/brand/rebesta-film-poster.jpg"
              muted
              loop
              playsInline
              preload="metadata"
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
