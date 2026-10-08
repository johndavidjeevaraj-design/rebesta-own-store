"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, MapPin, Leaf, BadgeIndianRupee, Truck, ChevronRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Hero } from "@/components/hero";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { LocationSheet } from "@/components/location-sheet";
import Reveal from "@/components/reveal";
import FarmStory from "@/components/farm-story";
import { api, Product, Settings } from "@/lib/store";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      api("/api/products").catch(() => ({ products: [] })),
      api("/api/settings").catch(() => null),
    ]).then(([p, s]) => {
      if (!live) return;
      setProducts((p as any).products || []);
      setSettings(s as Settings | null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  const active = useMemo(() => products.filter((p) => p.active !== false), [products]);
  const featured = useMemo(
    () =>
      active
        .filter((p) => p.stock > 0)
        .sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0) || a.priceInr - b.priceInr)
        .slice(0, 8),
    [active]
  );
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    const img = new Map<string, string>();
    active.forEach((p) => {
      counts.set(p.category, (counts.get(p.category) || 0) + 1);
      if (!img.has(p.category)) img.set(p.category, p.image);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, count]) => ({ cat, count, image: img.get(cat) }));
  }, [active]);

  const content = settings?.content;
  const freeOver = settings?.delivery?.freeOverInr ?? 500;

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <main>
        <Hero products={active} settings={settings} />

        {/* categories — photography tiles, not icons */}
        {categories.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pt-20" aria-labelledby="cats-h">
            <Reveal>
              <div className="flex items-end justify-between gap-4">
                <h2 id="cats-h" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
                  Shop by category.
                </h2>
                <a href="/shop" className="hidden shrink-0 items-center gap-1 text-[14px] font-semibold text-[#c8400f] transition hover:gap-2 sm:flex">
                  Full shop <ChevronRight size={15} />
                </a>
              </div>
            </Reveal>
            <Reveal stagger={0.04} className="rail mt-8 flex gap-4 overflow-x-auto pb-2">
              {categories.map(({ cat, count, image }) => (
                <a
                  key={cat}
                  href="/shop"
                  className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-[24px] bg-[#f5f5f7] transition hover:shadow-[0_12px_36px_rgba(0,0,0,0.10)]"
                >
                  <span className="block aspect-[4/3] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                  </span>
                  <span className="flex flex-1 flex-col justify-between p-4">
                    <span className="text-[14px] font-bold capitalize tracking-tight text-ink">{cat}</span>
                    <span className="mt-1 text-[13px] font-medium text-muted-foreground">{count} items</span>
                  </span>
                </a>
              ))}
            </Reveal>
          </section>
        )}

        {/* featured */}
        <section className="mx-auto max-w-6xl px-4 pt-20" aria-labelledby="feat-h">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c8400f]">Harvested today</p>
                <h2 id="feat-h" className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
                  This morning&rsquo;s picks.
                </h2>
              </div>
              <a href="/shop" className="hidden shrink-0 items-center gap-1 text-[14px] font-semibold text-[#c8400f] transition hover:gap-2 sm:flex">
                See everything <ChevronRight size={15} />
              </a>
            </div>
          </Reveal>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="h-full gap-0 rounded-[20px] border border-line bg-white p-3 shadow-[0_1px_5px_rgba(0,0,0,0.05)]">
                    <Skeleton className="aspect-square w-full rounded-[14px]" />
                    <div className="space-y-2 px-1 pt-3 pb-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="mt-3 h-8 w-full rounded-full" />
                    </div>
                  </Card>
                ))
              : featured.map((p, i) => <ProductCard key={p.handle} product={p} index={i} />)}
          </div>
        </section>

        {/* farm-to-door — Apple-style pinned scroll story (video-ready) */}
        <FarmStory />

        {/* delivery band */}
        <section className="mt-24 bg-[#f5f5f7] py-20" aria-labelledby="del-h">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <div className="flex flex-col items-start gap-8 rounded-[32px] bg-white p-8 shadow-[0_8px_36px_rgba(0,0,0,0.06)] sm:p-12 sm:flex-row sm:items-center">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#f5f5f7] text-ink">
                  <Truck size={24} strokeWidth={1.8} />
                </span>
                <div className="flex-1">
                  <h2 id="del-h" className="font-display text-[21px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
                    {content?.deliveryNoteTitle || "Delivery by real road distance"}
                  </h2>
                  <p className="mt-2 max-w-xl text-[14px] font-medium leading-relaxed text-muted-foreground">
                    {content?.deliveryNoteText || `Fair, transparent delivery fees based on the actual road distance to your pin — free over ₹${freeOver}.`}
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => setSheetOpen(true)}
                  className="fresh-grad h-12 shrink-0 rounded-full px-7 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] hover:brightness-[1.05]"
                >
                  {content?.deliveryNoteButton || "Check my pin"} <MapPin size={16} />
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* trust */}
        <section className="mx-auto max-w-6xl px-4 pt-24" aria-labelledby="trust-h">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 id="trust-h" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
              Why Hosur shops with us.
            </h2>
          </Reveal>
          <Reveal stagger={0.1} className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: BadgeIndianRupee,
                title: "Fair, honest pricing",
                text: "No haggling, no vague rates. One clear price per kilo — same for everyone, every day.",
              },
              {
                icon: Leaf,
                title: "Farm-fresh, always",
                text: "We buy direct from local growers around Hosur every morning. Nothing sits in a warehouse.",
              },
              {
                icon: MapPin,
                title: "Exact-pin delivery",
                text: "We navigate to your actual doorstep pin — not just your street — in a morning slot you choose.",
              },
            ].map((t) => (
              <motion.div whileHover={{ y: -4 }} key={t.title}>
                <Card className="h-full gap-0 rounded-[28px] border-transparent bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition hover:shadow-[0_12px_36px_rgba(0,0,0,0.08)]">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f5f5f7] text-ink">
                    <t.icon size={20} strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-5 text-[15px] font-bold tracking-tight text-ink">{t.title}</h3>
                  <p className="mt-2 text-[14px] font-medium leading-relaxed text-muted-foreground">{t.text}</p>
                </Card>
              </motion.div>
            ))}
          </Reveal>
        </section>

        {/* final CTA — full-bleed deep green, Apple-black moment */}
        <section className="mt-24">
          <Reveal>
            <div className="grain relative overflow-hidden px-6 py-20 text-center text-white sm:py-28 fresh-grad">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-0 h-80 w-[44rem] -translate-x-1/2 rounded-full bg-white/25 blur-[120px]" />
              </div>
              <div className="relative z-[2]">
                <span className="inline-grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white">
                  <Store size={22} strokeWidth={1.8} />
                </span>
                <h2 className="mx-auto mt-7 max-w-3xl font-display text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[40px]">
                  Fresh is a habit.
                  <br />
                  Start yours tomorrow.
                </h2>
                <p className="mx-auto mt-5 max-w-md text-[14px] font-medium text-white/90">
                  Order before 9 PM — your vegetables arrive with the morning dew, at your exact pin.
                </p>
                <Button
                  asChild
                  size="lg"
                  className="mt-9 h-13 rounded-full bg-white px-9 py-6 text-[15px] font-bold text-[#075c23] shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition hover:scale-[1.03] active:scale-[0.98]"
                >
                  <a href="/shop">
                    Shop this morning&rsquo;s stock <ArrowRight size={18} />
                  </a>
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
      <LocationSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
