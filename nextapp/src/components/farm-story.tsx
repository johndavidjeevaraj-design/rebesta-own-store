"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Farm-to-door — the Apple scroll story.
   A tall dark band; the panel sticks to the viewport while scrolling scrubs
   through five phases of the morning: picked → washed → packed → riding →
   delivered. Each phase crossfades the visual (Ken Burns drift) and swaps the
   copy. Built image-first: when real dawn footage arrives, drop a `video`
   path into a phase below and it renders as a muted loop automatically. */

type Phase = {
  image: string;
  video?: string; // future: "/assets/story/phase-1.mp4" — renders muted loop w/ poster
  step: string;
  title: string;
  text: string;
};

const PHASES: Phase[] = [
  {
    image: "/assets/products/baby-spinach-palak.jpg",
    step: "01",
    title: "Picked at first light",
    text: "Harvested from Hosur's farms before the sun is up — leaves still cool, still carrying the morning dew.",
  },
  {
    image: "/assets/products/heirloom-tomatoes.jpg",
    step: "02",
    title: "Washed, sorted, weighed",
    text: "Every crate is checked and packed the same morning. Nothing sits around, nothing waits for tomorrow.",
  },
  {
    image: "/assets/products/weekly-family-combo.jpg",
    step: "03",
    title: "Packed in your crate",
    text: "Your basket is assembled to order — the exact vegetables you picked, never pre-bagged, never mixed up.",
  },
  {
    image: "/assets/products/carrot-ooty.jpg",
    step: "04",
    title: "Riding out at sunrise",
    text: "Our riders leave at dawn while the city is still asleep, so freshness doesn't spend its day in traffic.",
  },
  {
    image: "/assets/products/mixed-greens-box.jpg",
    step: "05",
    title: "At your door by morning",
    text: "From farm to doorstep in hours, inside your two-hour slot. That's the whole story.",
  },
];

export default function FarmStory() {
  const root = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (reduced || !root.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const n = PHASES.length;
      const imgs = gsap.utils.toArray<HTMLElement>("[data-fs-img]");
      const texts = gsap.utils.toArray<HTMLElement>("[data-fs-text]");
      const fills = gsap.utils.toArray<HTMLElement>("[data-fs-fill]");
      const bar = root.current?.querySelector<HTMLElement>("[data-fs-bar]");

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      // phase 0 visual settles in while its text is already visible
      tl.fromTo(imgs[0], { scale: 1.12 }, { scale: 1, duration: 0.9 }, 0);

      PHASES.forEach((_, i) => {
        const t = i; // this phase's window starts at t
        if (i > 0) {
          tl.fromTo(imgs[i], { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.55 }, t);
          tl.to(imgs[i - 1], { opacity: 0, duration: 0.55 }, t);
        }
        if (i > 0) tl.fromTo(texts[i], { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.4 }, t + 0.08);
        if (i < n - 1) tl.to(texts[i], { opacity: 0, y: -18, duration: 0.32, ease: "power2.in" }, t + 0.66);
        if (fills[i]) tl.to(fills[i], { opacity: 1, duration: 0.2 }, t + 0.12);
      });

      if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: n, ease: "none" }, 0);
    }, root);

    /* content above this section (lazy images, client-rendered product
       grids) shifts layout AFTER the trigger positions are captured — keep
       the scrub window honest by refreshing whenever page height settles */
    let raf = 0;
    const debounced = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => ScrollTrigger.refresh()); };
    window.addEventListener("load", debounced);
    document.addEventListener("load", debounced, true);
    const ro = new ResizeObserver(debounced);
    ro.observe(document.body);
    const t1 = setTimeout(debounced, 350);
    const t2 = setTimeout(debounced, 1200);
    return () => {
      ctx.revert();
      window.removeEventListener("load", debounced);
      document.removeEventListener("load", debounced, true);
      ro.disconnect();
      clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf);
    };
  }, [reduced]);

  /* reduced motion: same story, told as a calm stacked column */
  if (reduced) {
    return (
      <section id="how" aria-label="How it works" className="bg-[#0b0d0c] py-20 text-white">
        <div className="mx-auto max-w-6xl space-y-16 px-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf-2">Farm to door</p>
          {PHASES.map((p) => (
            <div key={p.step} className="grid items-center gap-6 md:grid-cols-2">
              <img src={p.image} alt={p.title} loading="lazy" className="aspect-[4/3] w-full rounded-[24px] object-cover" />
              <div>
                <p className="text-[13px] font-semibold text-white/50">{p.step} / 0{PHASES.length}</p>
                <h2 className="mt-2 font-display text-[24px] font-semibold tracking-tight sm:text-[28px]">{p.title}</h2>
                <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-white/70">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="how"
      ref={root}
      aria-label="How it works — farm to door story"
      className="relative bg-[#0b0d0c]"
      style={{ height: `${PHASES.length * 85 + 15}vh` }}
    >
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1.12fr_1fr] md:gap-14">
          {/* visual — crossfading phases, video-ready */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] bg-[#151816] shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:aspect-[16/11]">
            {PHASES.map((p, i) =>
              p.video ? (
                <video
                  key={p.step}
                  data-fs-img
                  src={p.video}
                  poster={p.image}
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ opacity: i === 0 ? 1 : 0 }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.step}
                  data-fs-img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover will-change-transform"
                  style={{ opacity: i === 0 ? 1 : 0 }}
                />
              )
            )}
          </div>

          {/* copy — one phase at a time */}
          <div className="relative min-h-[240px] md:min-h-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf-2">Farm to door</p>
            {PHASES.map((p, i) => (
              <div key={p.step} data-fs-text className="absolute inset-x-0 top-8" style={{ opacity: i === 0 ? 1 : 0 }}>
                <p className="font-display text-[72px] font-bold leading-none text-white/[0.07]" aria-hidden>
                  {p.step}
                </p>
                <h2 className="-mt-6 font-display text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
                  {p.title}
                </h2>
                <p className="mt-4 max-w-md text-[15px] font-medium leading-relaxed text-white/70">{p.text}</p>
              </div>
            ))}

            {/* progress */}
            <div className="absolute inset-x-0 bottom-0">
              <div className="flex items-center gap-2">
                {PHASES.map((p, i) => (
                  <span key={p.step} className="relative h-[3px] w-8 overflow-hidden rounded-full bg-white/15">
                    <span data-fs-fill className="absolute inset-0 bg-leaf-2" style={{ opacity: i === 0 ? 1 : 0 }} />
                  </span>
                ))}
              </div>
              <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                <div data-fs-bar className="h-full w-full origin-left bg-leaf-2/70" style={{ transform: "scaleX(0)" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
