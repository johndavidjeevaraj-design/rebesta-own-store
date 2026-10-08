"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ArrowRight, Sparkles, MapPin, Sunrise, BadgeIndianRupee, Truck } from "lucide-react";
import { Product, Settings, money } from "@/lib/store";
import { Button } from "@/components/ui/button";

/* circular rotating text badge */
function OrbitBadge() {
  return (
    <div className="animate-spin-slow absolute -left-8 top-2 z-20 hidden h-28 w-28 sm:block">
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-lg">
        <defs>
          <path id="circlePath" d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" />
        </defs>
        <circle cx="50" cy="50" r="50" className="fill-carrot" />
        <text className="fill-white text-[10.5px] font-extrabold uppercase" style={{ letterSpacing: "0.18em" }}>
          <textPath href="#circlePath">FRESH FROM FARM · EVERY MORNING ·</textPath>
        </text>
        <circle cx="50" cy="50" r="13" className="fill-forest-3" />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <Sunrise size={20} className="text-white" />
      </span>
    </div>
  );
}

export function Hero({ products, settings }: { products: Product[]; settings: Settings | null }) {
  const root = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);

  const content = settings?.content;
  const badge = content?.homeBadge || "Fresh stock opens daily";
  const title = content?.homeTitle || "Fresh vegetables in Hosur";
  const subtitle = content?.homeSubtitle || "Fresh vegetables. Exact pin. Morning delivery.";
  const freeOver = settings?.delivery?.freeOverInr ?? 500;
  const maxKm = settings?.delivery?.maxRoadKm ?? 9;
  const liveCount = products.filter((p) => p.active !== false && p.stock > 0).length;

  const cards = products.filter((p) => p.active !== false && p.stock > 0 && p.image).slice(0, 3);
  const hero = cards[0];
  const minis = cards.slice(1, 3);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".hero-eyebrow", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55 }, 0.15)
        .fromTo(".w-in", { yPercent: 110 }, { yPercent: 0, duration: 0.8, stagger: 0.07, ease: "power4.out" }, 0.25)
        .fromTo(".hero-sub", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, 0.75)
        .fromTo(".hero-cta", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.08 }, 0.9)
        .fromTo(".hero-stat", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.07 }, 1.05)
        .fromTo(".hero-glow", { opacity: 0 }, { opacity: 1, duration: 1.2 }, 0.3);
    }, root);
    return () => ctx.revert();
  }, []);

  /* floating cards entrance — runs once products have rendered */
  useEffect(() => {
    const el = root.current;
    if (!el || !products.length) return;
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".float-card");
      if (!cards.length) return;
      gsap.fromTo(
        cards,
        { opacity: 0, y: 60, scale: 0.85, rotate: -4 },
        { opacity: 1, y: 0, scale: 1, rotate: 0, duration: 0.85, stagger: 0.12, ease: "back.out(1.5)", delay: 0.15 }
      );
    }, root);
    return () => ctx.revert();
  }, [products.length]);

  /* mouse parallax on the floating stack */
  useEffect(() => {
    const el = floatRef.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const movers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
    const setters = movers.map((m) => ({
      x: gsap.quickTo(m, "x", { duration: 0.65, ease: "power3.out" }),
      y: gsap.quickTo(m, "y", { duration: 0.65, ease: "power3.out" }),
      depth: Number(m.dataset.depth) || 1,
    }));
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      setters.forEach((s) => {
        s.x(relX * 26 * s.depth);
        s.y(relY * 22 * s.depth);
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [products.length]);

  return (
    <section ref={root} className="grain relative overflow-hidden bg-forest-2 pb-16 pt-28 text-white lg:pb-24 lg:pt-36">
      {/* glows + watermark */}
      <div className="hero-glow pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-96 w-96 rounded-full bg-leaf/25 blur-[110px]" />
        <div className="absolute -right-16 bottom-0 h-[28rem] w-[28rem] rounded-full bg-carrot/20 blur-[120px]" />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 bottom-4 select-none font-display text-[9rem] font-extrabold leading-none text-white/[0.045] lg:text-[15rem]"
      >
        FRESH
      </span>

      <div className="relative z-[2] mx-auto grid max-w-6xl items-center gap-14 px-4 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <span className="hero-eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[0.72rem] font-extrabold tracking-wide text-gold backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-carrot animate-pulse-dot" />
            <Sparkles size={13} /> {badge}
          </span>

          <h1 className="mt-6 font-display text-[clamp(2.7rem,6.2vw,4.7rem)] font-extrabold leading-[0.98] tracking-tight">
            {title.split(" ").map((word, i) => (
              <span key={i} className="w-mask">
                <span className={`w-in ${/hosur/i.test(word) ? "text-carrot-2" : ""}`}>{word}&nbsp;</span>
              </span>
            ))}
          </h1>

          <p className="hero-sub mt-5 max-w-md text-[1.02rem] font-medium leading-relaxed text-white/70">{subtitle}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="hero-cta h-12 rounded-full bg-gradient-to-br from-carrot to-[#d8431f] px-7 text-[0.95rem] font-extrabold text-white shadow-[0_10px_30px_rgba(255,91,32,0.4)] hover:brightness-110">
              <a href="/shop">
                Shop fresh stock <ArrowRight size={17} />
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="hero-cta h-12 rounded-full border-white/25 bg-white/5 px-6 text-[0.9rem] font-extrabold text-white hover:bg-white/15 hover:text-white"
              onClick={() => {
                const lenis = (window as any).__lenis;
                if (lenis) lenis.scrollTo("#how", { offset: -70 });
                else document.querySelector("#how")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              How it works
            </Button>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
            {[
              { icon: BadgeIndianRupee, big: `₹${freeOver}+`, small: "free delivery over" },
              { icon: Truck, big: `${maxKm} km`, small: "real road distance" },
              { icon: Sunrise, big: "7 AM", small: "morning slots" },
              { icon: MapPin, big: `${liveCount}+`, small: "items in stock today" },
            ].map((s, i) => (
              <div key={i} className="hero-stat flex items-center gap-2.5">
                <span className={`grid h-9 w-9 place-items-center rounded-2xl ${i === 0 ? "bg-carrot/20 text-carrot-2" : "bg-white/10 text-leaf-2"}`}>
                  <s.icon size={16} />
                </span>
                <div>
                  <dt className="sr-only">{s.small}</dt>
                  <dd className="text-[1.05rem] font-extrabold leading-none">{s.big}</dd>
                  <dd className="mt-1 text-[0.68rem] font-bold uppercase tracking-wider text-white/50">{s.small}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        {/* floating product stack */}
        <div ref={floatRef} className="relative mx-auto w-full max-w-sm pb-10 pt-6 lg:max-w-none">
          <OrbitBadge />
          {hero && (
            <div data-depth="0.5" className="float-card relative z-10">
              <div className="animate-floaty rounded-[1.75rem] border border-white/40 bg-white p-4 shadow-[0_30px_70px_rgba(6,46,17,0.45)]">
                <div className="flex items-center gap-2 text-[0.66rem] font-extrabold uppercase tracking-[0.14em] text-leaf">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf animate-pulse-dot" /> Today&rsquo;s bestseller
                </div>
                <a href={`/products/${hero.handle}`} className="mt-3 block overflow-hidden rounded-2xl bg-mint">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={hero.image} alt={hero.title} className="aspect-[5/4] w-full object-cover" />
                </a>
                <div className="mt-3 flex items-end justify-between px-1 pb-1">
                  <div>
                    <p className="text-[1.05rem] font-extrabold leading-tight text-ink">{hero.title}</p>
                    <p className="text-[0.72rem] font-bold text-muted-foreground">{hero.unitLabel}</p>
                  </div>
                  <p className="text-[1.15rem] font-extrabold text-forest">{money(hero.priceInr)}</p>
                </div>
              </div>
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-5">
            {minis.map((p, i) => (
              <div
                key={p.handle}
                data-depth={i === 0 ? "1.2" : "0.9"}
                className="float-card"
                style={{ transform: `translateY(${i === 1 ? "-1.25rem" : "0"})` }}
              >
                <a
                  href={`/products/${p.handle}`}
                  className="block rounded-[1.4rem] border border-white/20 bg-white/10 p-3 backdrop-blur-md transition hover:bg-white/20"
                >
                  <div className="overflow-hidden rounded-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt={p.title} className="aspect-square w-full object-cover" />
                  </div>
                  <p className="mt-2.5 truncate text-[0.85rem] font-extrabold text-white">{p.title}</p>
                  <p className="text-[0.78rem] font-extrabold text-leaf-2">{money(p.priceInr)}</p>
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
