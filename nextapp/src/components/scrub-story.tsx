"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* The AirPods method — a frame-by-frame image sequence scrubbed by scroll.
   69 pre-rendered camera frames; a canvas paints the frame that matches a
   DAMPED scroll progress, so the motion is locked to the finger yet never
   stutters — there is no video decoder in the loop, just drawImage of an
   ahead-of-time rendered frame. Frames stream in serially as the section
   approaches; whatever has loaded is what paints (Apple does the same). */

const FRAMES = 69;
const frameUrl = (i: number) => `/assets/scrub/frame-${String(i + 1).padStart(3, "0")}.jpg`;

export default function ScrubStory() {
  const root = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (reduced || !root.current || !canvasRef.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const N = FRAMES;
    const imgs: (HTMLImageElement | undefined)[] = new Array(N);
    let loadedTo = -1; // highest contiguously loaded frame
    let target = 0; // scroll progress 0..1
    let paintedIdx = -1;
    let raf = 0;
    let preloading = false;

    const sizeCanvas = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      /* pixel budget ≈ 2.4MP: full retina on phones, capped on big desktop
         screens so each repaint stays cheap — no dropped frames, no shake */
      const dpr = Math.min(2, Math.sqrt(2_400_000 / (r.width * r.height)));
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = "#ffffff"; // white studio — never flash black on resize
        ctx.fillRect(0, 0, w, h);
      }
      return true;
    };

    const drawCover = (img: HTMLImageElement) => {
      const cw = canvas.width;
      const ch = canvas.height;
      const s = Math.max(cw / img.width, ch / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    };

    const ready = (i: number) => {
      const img = imgs[i];
      return !!img && img.complete && img.naturalWidth > 0;
    };

    const paint = (want: number) => {
      // the wanted frame if decoded, else the nearest one below it — but
      // never jump BACKWARD while streaming in (that reads as jiggling)
      let idx = -1;
      if (want < N && ready(want)) idx = want;
      else {
        const cap = Math.min(want, loadedTo);
        for (let k = cap; k >= 0; k--)
          if (ready(k)) { idx = k; break; }
        if (idx < paintedIdx && want > paintedIdx) idx = paintedIdx;
      }
      if (idx < 0 || idx === paintedIdx) return;
      drawCover(imgs[idx]!);
      paintedIdx = idx;
    };

    /* Apple's method, exactly: the frame IS the scroll position. No easing,
       no lag, no extra smoothing layer fighting the scroller — Lenis's
       physics provide all the butter, the canvas is locked to it 1:1. */
    const tick = () => {
      const want = Math.max(0, Math.min(N - 1, Math.round(target * (N - 1))));
      paint(want);
      raf = requestAnimationFrame(tick);
    };

    const loadFrame = (i: number) =>
      new Promise<void>((res) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => res();
        img.onerror = () => res();
        img.src = frameUrl(i);
        imgs[i] = img;
      });

    const preload = async () => {
      if (preloading) return;
      preloading = true;
      for (let i = 0; i < N; i++) {
        await loadFrame(i);
        loadedTo = i;
        if (i === 0) paint(0);
      }
    };

    /* stream the sequence only as the section approaches the viewport */
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          preload();
        }
      },
      { rootMargin: "1200px" }
    );
    io.observe(root.current);

    const ctxg = gsap.context(() => {
      sizeCanvas();
      ScrollTrigger.create({
        trigger: root.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          target = self.progress;
        },
      });
      /* caption rides the same window — locked tight to the scroll so it
         never shears against the canvas */
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.25 },
      });
      tl.fromTo(
        "[data-scrub-cap]",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
        0.26
      ).to("[data-scrub-cap]", { opacity: 0, y: -24, duration: 0.3, ease: "power1.in" }, 0.8);
    }, root);

    /* repaint the SAME frame synchronously on resize (mobile address-bar
       svh changes) — a cleared canvas frame would flash as jiggling */
    const ro = new ResizeObserver(() => {
      sizeCanvas();
      if (paintedIdx >= 0 && ready(paintedIdx)) drawCover(imgs[paintedIdx]!);
    });
    ro.observe(canvas);
    raf = requestAnimationFrame(tick);

    /* test hook (mirrors window.__lenis convention) */
    (window as any).__scrub = {
      get painted() {
        return paintedIdx;
      },
      get target() {
        return target;
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      ctxg.revert();
    };
  }, [reduced]);

  /* reduced motion: the story as one still, caption always readable */
  if (reduced) {
    return (
      <section aria-label="Vine ripened" className="relative bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frameUrl(Math.floor(FRAMES / 2))} alt="Vine-ripened tomatoes, picked this morning" className="mx-auto h-[60svh] w-auto max-w-full object-contain" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-leaf">Vine ripened</p>
          <h2 className="mx-auto mt-2 max-w-xl font-display text-[24px] font-semibold leading-tight tracking-tight text-[#1d1d1f] sm:text-[32px]">
            Red today. At your door tomorrow.
          </h2>
        </div>
      </section>
    );
  }

  return (
    <section ref={root} aria-label="Vine ripened — scroll to move the camera" className="relative h-[280vh] bg-white">
      <div className="sticky top-0 h-[100svh] overflow-hidden [transform:translateZ(0)] [backface-visibility:hidden]">
        {/* elliptical ground shadow — the product floats above it */}
        <div className="pointer-events-none absolute left-1/2 top-[58%] h-[9%] w-[52%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-2xl" />
        {/* the frame sequence, edges dissolving into the white void */}
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{
            maskImage: "radial-gradient(115% 88% at 50% 46%, black 52%, transparent 76%)",
            WebkitMaskImage: "radial-gradient(115% 88% at 50% 46%, black 52%, transparent 76%)",
          }}
        />
        {/* subtle studio spotlight behind the product */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(16,185,129,0.07)_0%,transparent_62%)]" />
        <div data-scrub-cap className="absolute inset-x-0 bottom-0 px-4 pb-14 text-center sm:pb-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-leaf">Vine ripened</p>
          <h2 className="mx-auto mt-3 max-w-xl font-display text-[28px] font-semibold leading-tight tracking-tight text-[#1d1d1f] sm:text-[40px]">
            Red today. At your door tomorrow.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[14px] font-medium leading-relaxed text-[#86868b]">
            Scroll moves the camera — slow and deliberate, the same way it was picked.
          </p>
        </div>
      </div>
    </section>
  );
}
