"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";
import { Product, Settings, money } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { AddButton } from "@/components/add-button";

/* Apple-style hero: white canvas, one huge quiet headline, a pill CTA,
   then the product photography does the talking. */
export function Hero({ products, settings }: { products: Product[]; settings: Settings | null }) {
  const root = useRef<HTMLDivElement>(null);

  const content = settings?.content;
  const badge = content?.homeBadge || "Fresh stock opens daily";
  const title = content?.homeTitle || "Fresh vegetables in Hosur";
  const subtitle = content?.homeSubtitle || "Hand-picked from farms around Hosur. Delivered to your exact pin, every morning.";
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
      tl.fromTo(".hero-eyebrow", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1)
        .fromTo(".w-in", { yPercent: 110 }, { yPercent: 0, duration: 0.85, stagger: 0.06, ease: "power4.out" }, 0.2)
        .fromTo(".hero-sub", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55 }, 0.7)
        .fromTo(".hero-cta", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 }, 0.85)
        .fromTo(".hero-stat", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06 }, 1.0)
        .fromTo(".hero-stage", { opacity: 0, y: 44, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: "power3.out" }, 0.55);
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="bg-white pb-4 pt-16 sm:pt-20">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <span className="hero-eyebrow text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{badge}</span>

        <h1 className="mx-auto mt-4 max-w-4xl font-display text-[clamp(1.875rem,4vw,2.5rem)] font-semibold leading-[1.02] text-ink">
          {title.split(" ").map((word, i) => (
            <span key={i} className="w-mask">
              <span className={`w-in${i === 0 ? " text-fresh-grad" : ""}`}>{word}&nbsp;</span>
            </span>
          ))}
        </h1>

        <p className="hero-sub mx-auto mt-5 max-w-xl text-[15px] font-medium leading-relaxed text-muted-foreground sm:text-[17px]">{subtitle}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
          <Button asChild size="lg" className="hero-cta carrot-grad h-11 rounded-full px-6 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(232,71,12,0.35)] hover:brightness-[1.05] active:scale-[0.98]">
            <a href="/shop">
              Shop fresh stock <ArrowRight size={17} />
            </a>
          </Button>
          <button
            type="button"
            className="hero-cta inline-flex items-center gap-1.5 text-[14px] font-semibold text-leaf transition hover:underline"
            onClick={() => {
              const lenis = (window as any).__lenis;
              if (lenis) lenis.scrollTo("#how", { offset: -70 });
              else document.querySelector("#how")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            How it works <ArrowRight size={15} />
          </button>
        </div>

        <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-y-8 border-t border-black/[0.08] pt-8 sm:grid-cols-4">
          {[
            { big: `${liveCount}+`, small: "items in stock today" },
            { big: `₹${freeOver}+`, small: "free delivery over" },
            { big: `${maxKm} km`, small: "real road distance" },
            { big: "7 AM", small: "morning slots" },
          ].map((s, i) => (
            <div key={i} className="hero-stat">
              <dt className="sr-only">{s.small}</dt>
              <dd className="text-[15px] font-semibold tracking-tight text-leaf">{s.big}</dd>
              <dd className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{s.small}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* product stage — same card language as the shop: badges, save
          pricing, fresh-grad add/stepper */}
      <div className="hero-stage mx-auto mt-14 max-w-6xl px-4">
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {hero && (() => {
            const compareAt = hero.compareAtInr && hero.compareAtInr > hero.priceInr ? hero.compareAtInr : null;
            const offPct = compareAt ? Math.round((1 - hero.priceInr / compareAt) * 100) : 0;
            const saveInr = compareAt ? compareAt - hero.priceInr : 0;
            return (
              <div className="group overflow-hidden rounded-[20px] border border-line bg-white p-3 shadow-[0_1px_5px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_14px_32px_rgba(0,0,0,0.10)]">
                <a href={`/products/${hero.handle}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] bg-[#f5f5f7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={hero.image} alt={hero.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    <div className="absolute left-2 top-2 flex flex-col gap-1">
                      {offPct > 0 && (
                        <span className="carrot-grad rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-[0_2px_8px_rgba(232,71,12,0.4)]">{offPct}% OFF</span>
                      )}
                      {hero.featured && !offPct && (
                        <span className="rounded-full bg-carrot/15 px-2 py-0.5 text-[10px] font-bold text-[#c8400f] backdrop-blur-sm">Bestseller</span>
                      )}
                    </div>
                  </div>
                </a>
                <div className="flex items-end justify-between gap-4 px-0.5 pb-0.5 pt-3">
                  <a href={`/products/${hero.handle}`} className="min-w-0">
                    <h3 className="truncate text-[16px] font-semibold tracking-tight text-ink">{hero.title}</h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{hero.unitLabel}</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-[16px] font-semibold tracking-tight text-ink">{money(hero.priceInr)}</span>
                      {compareAt && <span className="text-[13px] font-semibold text-muted-foreground line-through">{money(compareAt)}</span>}
                      {saveInr > 0 && <span className="text-[11px] font-bold text-[#c8400f]">Save {money(saveInr)}</span>}
                    </div>
                  </a>
                  <div className="w-[128px] shrink-0">
                    <AddButton product={hero} />
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="grid gap-4">
            {minis.map((p) => {
              const compareAt = p.compareAtInr && p.compareAtInr > p.priceInr ? p.compareAtInr : null;
              const offPct = compareAt ? Math.round((1 - p.priceInr / compareAt) * 100) : 0;
              const saveInr = compareAt ? compareAt - p.priceInr : 0;
              return (
                <div
                  key={p.handle}
                  className="group flex items-center gap-4 overflow-hidden rounded-[20px] border border-line bg-white p-3 shadow-[0_1px_5px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_14px_32px_rgba(0,0,0,0.10)]"
                >
                  <a href={`/products/${p.handle}`} className="relative block shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-[84px] w-[84px] rounded-[14px] object-cover transition-transform duration-500 group-hover:scale-[1.05] sm:h-[96px] sm:w-[96px]"
                    />
                    {offPct > 0 && (
                      <span className="carrot-grad absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow-[0_2px_8px_rgba(232,71,12,0.4)]">{offPct}% OFF</span>
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={`/products/${p.handle}`}>
                      <p className="truncate text-[14px] font-semibold tracking-tight text-ink">{p.title}</p>
                    </a>
                    <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{p.unitLabel}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-[14px] font-semibold tracking-tight text-ink">{money(p.priceInr)}</span>
                      {compareAt && <span className="text-[12px] font-semibold text-muted-foreground line-through">{money(compareAt)}</span>}
                      {saveInr > 0 && <span className="text-[10px] font-bold text-[#c8400f]">Save {money(saveInr)}</span>}
                    </div>
                  </div>
                  <div className="w-[92px] shrink-0">
                    <AddButton product={p} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
