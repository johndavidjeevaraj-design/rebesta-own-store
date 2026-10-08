"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  MapPin,
  ShoppingBasket,
  Sunrise,
  Leaf,
  BadgeIndianRupee,
  Truck,
  ChevronRight,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Hero } from "@/components/hero";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { LocationSheet } from "@/components/location-sheet";
import Reveal from "@/components/reveal";
import { api, Product, Settings } from "@/lib/store";

const CATEGORY_EMOJI: [RegExp, string][] = [
  [/leafy|greens|stem/i, "🥬"],
  [/herb/i, "🌿"],
  [/nightshade|tomato/i, "🍅"],
  [/root|potato|carrot/i, "🥕"],
  [/gourd|squash|melon/i, "🥒"],
  [/bean|legume|pod|peas/i, "🫛"],
  [/exotic|brassica|broccoli|cauli/i, "🥦"],
  [/mushroom/i, "🍄"],
  [/onion|allium|garlic/i, "🧅"],
  [/corn|specialty/i, "🌽"],
  [/fruit/i, "🍋"],
  [/combo|kit/i, "🧺"],
];
const emojiFor = (category: string) => {
  for (const [re, emoji] of CATEGORY_EMOJI) if (re.test(category)) return emoji;
  return "🥗";
};

const MARQUEE_ITEMS = [
  "Farm-fresh every morning",
  "Exact-pin delivery",
  "COD & UPI",
  "Free delivery over ₹500",
  "Real road distance pricing",
  "Hosur · up to 9 km",
];

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
    active.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [active]);

  const content = settings?.content;
  const freeOver = settings?.delivery?.freeOverInr ?? 500;

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <main>
        <Hero products={active} settings={settings} />

        {/* marquee */}
        <div className="overflow-hidden bg-gradient-to-r from-[#e94712] via-carrot to-carrot-2 py-3.5" aria-hidden>
          <div className="flex w-max animate-marquee gap-8">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} className="flex items-center gap-8 whitespace-nowrap text-[0.78rem] font-extrabold uppercase tracking-[0.18em] text-white/85">
                {item}
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              </span>
            ))}
          </div>
        </div>

        {/* categories */}
        {categories.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="cats-h">
            <Reveal>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 id="cats-h" className="font-display text-[1.7rem] font-extrabold leading-tight text-forest sm:text-[2rem]">
                    Shop by category
                  </h2>
                  <p className="mt-1 text-[0.92rem] font-semibold text-muted-foreground">{active.length} fresh items in stock today</p>
                </div>
                <a href="/shop" className="hidden shrink-0 items-center gap-1 text-[0.85rem] font-extrabold text-leaf transition hover:gap-2 sm:flex">
                  Full shop <ChevronRight size={15} />
                </a>
              </div>
            </Reveal>
            <Reveal stagger={0.05} className="rail mt-6 flex gap-3 overflow-x-auto pb-2">
              {categories.map(([cat, count]) => (
                <a
                  key={cat}
                  href="/shop"
                  className="group flex shrink-0 items-center gap-3 rounded-3xl border border-border/80 bg-white py-3 pl-3.5 pr-5 shadow-sm transition hover:-translate-y-1 hover:border-leaf/50 hover:shadow-lg"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-[1.35rem] transition group-hover:scale-110">
                    {emojiFor(cat)}
                  </span>
                  <span>
                    <span className="block text-[0.92rem] font-extrabold capitalize text-ink">{cat}</span>
                    <span className="block text-[0.72rem] font-bold text-muted-foreground">{count} items</span>
                  </span>
                </a>
              ))}
            </Reveal>
          </section>
        )}

        {/* featured */}
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="feat-h">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-leaf">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf animate-pulse-dot" /> Harvested today
                </span>
                <h2 id="feat-h" className="mt-3 font-display text-[1.7rem] font-extrabold leading-tight text-forest sm:text-[2rem]">
                  This morning&rsquo;s picks
                </h2>
              </div>
              <a href="/shop" className="hidden shrink-0 items-center gap-1 text-[0.85rem] font-extrabold text-leaf transition hover:gap-2 sm:flex">
                See everything <ChevronRight size={15} />
              </a>
            </div>
          </Reveal>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="h-full gap-0 rounded-3xl p-3">
                    <Skeleton className="aspect-square w-full rounded-2xl" />
                    <div className="space-y-2 px-1 pt-3 pb-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="mt-3 h-10 w-full rounded-full" />
                    </div>
                  </Card>
                ))
              : featured.map((p, i) => <ProductCard key={p.handle} product={p} index={i} />)}
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="mx-auto max-w-6xl px-4 pt-24" aria-labelledby="how-h">
          <Reveal className="mx-auto max-w-xl text-center">
            <h2 id="how-h" className="font-display text-[1.8rem] font-extrabold leading-tight text-forest sm:text-[2.2rem]">
              From farm to door in <span className="text-leaf">three steps</span>
            </h2>
          </Reveal>
          <Reveal stagger={0.12} className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: MapPin,
                step: "01",
                title: "Pin your door",
                text: "Set your exact location — we price delivery by real road distance, not circles on a map.",
              },
              {
                icon: ShoppingBasket,
                step: "02",
                title: "Fill your basket",
                text: "Pick from this morning's farm-fresh stock and pay by UPI or cash on delivery.",
              },
              {
                icon: Sunrise,
                step: "03",
                title: "Fresh by morning",
                text: "We harvest, pack and ride out at dawn. Your basket lands at your door in a 2-hour slot.",
              },
            ].map((s, i) => (
              <Card key={s.step} className="group relative gap-0 overflow-hidden rounded-3xl border-border/70 bg-white p-6 shadow-sm transition hover:-translate-y-1.5 hover:shadow-[0_22px_44px_rgba(7,64,21,0.13)]">
                <span className="absolute -right-2 -top-5 select-none font-display text-[5.5rem] font-extrabold leading-none text-forest/[0.06] transition group-hover:text-forest/10">
                  {s.step}
                </span>
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${i === 1 ? "bg-gradient-to-br from-carrot to-[#d8431f] text-white shadow-[0_10px_22px_rgba(255,91,32,0.3)]" : "bg-forest text-leaf-2 shadow-[0_10px_22px_rgba(7,64,21,0.3)]"}`}>
                  <s.icon size={21} />
                </span>
                <h3 className="mt-5 font-display text-[1.15rem] font-extrabold text-ink">{s.title}</h3>
                <p className="mt-2 text-[0.88rem] font-medium leading-relaxed text-muted-foreground">{s.text}</p>
              </Card>
            ))}
          </Reveal>
        </section>

        {/* delivery band */}
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="del-h">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-[#e3d8c1] bg-gradient-to-r from-[#fff5db] via-[#fffdf6] to-[#edf7eb] p-8 text-ink sm:p-12">
              <div className="pointer-events-none absolute -right-14 -top-14 h-64 w-64 rounded-full bg-leaf/15 blur-[80px]" />
              <div className="relative z-[2] flex flex-col items-start gap-8 sm:flex-row sm:items-center">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-leaf to-[#075c1f] text-white shadow-[0_14px_30px_rgba(13,135,54,0.25)]">
                  <Truck size={28} />
                </span>
                <div className="flex-1">
                  <h2 id="del-h" className="font-display text-[1.5rem] font-extrabold leading-tight sm:text-[1.9rem]">
                    {content?.deliveryNoteTitle || "Delivery by real road distance"}
                  </h2>
                  <p className="mt-2 max-w-xl text-[0.95rem] font-medium leading-relaxed text-muted-foreground">
                    {content?.deliveryNoteText ||
                      `Fair, transparent delivery fees based on the actual road distance to your pin — free over ₹${freeOver}.`}
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => setSheetOpen(true)}
                  className="h-12 shrink-0 rounded-full bg-gradient-to-br from-carrot to-[#d8431f] px-7 text-[0.92rem] font-extrabold text-white shadow-[0_10px_30px_rgba(255,91,32,0.35)] hover:brightness-110"
                >
                  {content?.deliveryNoteButton || "Check my pin"} <MapPin size={16} />
                </Button>
              </div>
            </div>
          </Reveal>
        </section>

        {/* trust */}
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="trust-h">
          <Reveal className="mx-auto max-w-xl text-center">
            <h2 id="trust-h" className="font-display text-[1.8rem] font-extrabold leading-tight text-forest sm:text-[2.2rem]">
              Why Hosur shops with us
            </h2>
          </Reveal>
          <Reveal stagger={0.12} className="mt-10 grid gap-4 md:grid-cols-3">
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
            ].map((t, i) => (
              <motion.div whileHover={{ y: -6 }} key={t.title}>
                <Card className="h-full gap-0 rounded-3xl border-border/70 bg-white p-7 shadow-sm">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${i === 1 ? "bg-[#fff0e9] text-carrot" : "bg-mint text-leaf"}`}>
                    <t.icon size={22} />
                  </span>
                  <h3 className="mt-5 font-display text-[1.15rem] font-extrabold text-ink">{t.title}</h3>
                  <p className="mt-2 text-[0.88rem] font-medium leading-relaxed text-muted-foreground">{t.text}</p>
                </Card>
              </motion.div>
            ))}
          </Reveal>
        </section>

        {/* final CTA */}
        <section className="mx-auto max-w-6xl px-4 pt-24">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[2rem] bg-forest-2 px-6 py-14 text-center text-white sm:py-20">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-0 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-carrot/15 blur-[100px]" />
              </div>
              <div className="relative z-[2]">
                <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-leaf-2">
                  <Store size={24} />
                </span>
                <h2 className="mt-6 font-display text-[2rem] font-extrabold leading-[1.02] sm:text-[3rem]">
                  Fresh is a habit.
                  <br />
                  <span className="text-carrot-2">Start yours tomorrow.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-md text-[0.95rem] font-medium text-white/70">
                  Order before 9 PM — your vegetables arrive with the morning dew, at your exact pin.
                </p>
                <Button asChild size="lg" className="mt-8 h-13 rounded-full bg-gradient-to-br from-carrot to-[#d8431f] px-9 py-6 text-[1rem] font-extrabold text-white shadow-[0_14px_36px_rgba(255,91,32,0.4)] hover:brightness-110">
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
