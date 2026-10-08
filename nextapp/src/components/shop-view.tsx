"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { History, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { api, Product, Settings, readRecent } from "@/lib/store";
import { matchesQuery } from "@/lib/tamil";

/* One view, three shops: /shop (everything), /offers (deals), /greens (keerai & leafy). */
export type ShopMode = "shop" | "offers" | "greens";

const MODES: Record<ShopMode, { offersOnly?: boolean; category?: string; heading: string; countWord: string }> = {
  shop: { heading: "All products", countWord: "product" },
  offers: { offersOnly: true, heading: "Today’s offers", countWord: "offer" },
  greens: { category: "Leafy Greens", heading: "Greens & keerai", countWord: "green" },
};

type SortKey = "featured" | "price-asc" | "price-desc" | "name";
const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  featured: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.title.localeCompare(b.title),
  "price-asc": (a, b) => a.priceInr - b.priceInr || a.title.localeCompare(b.title),
  "price-desc": (a, b) => b.priceInr - a.priceInr || a.title.localeCompare(b.title),
  name: (a, b) => a.title.localeCompare(b.title),
};

export function ShopView({ mode }: { mode: ShopMode }) {
  const conf = MODES[mode];
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(conf.category || "All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");
  const [offersOnly, setOffersOnly] = useState(Boolean(conf.offersOnly));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [data] = await Promise.all([api("/api/products"), api("/api/settings").catch(() => ({}))]);
        if (!live) return;
        setProducts((data as any).products || []);
        setCategories((data as any).categories || []);
        setLoaded(true);
      } catch (e: any) {
        if (live) setError(e?.message || "Could not load products");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const live = useMemo(() => products.filter((p) => p.active !== false), [products]);

  const filtered = useMemo(() => {
    const q = search.trim();
    let rows = live.filter(
      (p) =>
        (activeCategory === "All" || p.category === activeCategory) &&
        (!offersOnly || Number(p.compareAtInr) > Number(p.priceInr)) &&
        matchesQuery(p, q)
    );
    return rows.slice().sort(SORTERS[sort] || SORTERS.featured);
  }, [live, activeCategory, offersOnly, search, sort]);

  const recent = useMemo(() => {
    const list = readRecent()
      .map((h) => live.find((p) => p.handle === h))
      .filter((p): p is Product => Boolean(p && p.stock > 0))
      .slice(0, 8);
    return list;
  }, [live, loaded]);

  const categoryImage = (category: string) =>
    category === "All"
      ? (live.find((p) => p.featured) || live[0])?.image || "/assets/brand/basket.jpg"
      : live.find((p) => p.category === category)?.image || "/assets/brand/basket.jpg";

  const countOf = (category: string) => (category === "All" ? live.length : live.filter((p) => p.category === category).length);

  return (
    <div className="min-h-screen bg-cream pb-20 md:pb-0">
      <SiteHeader search={search} onSearch={setSearch} variant="solid" />

      <main className="mx-auto max-w-6xl px-4 pt-8">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-leaf">
                Shop fresh
              </span>
              <h1 className="font-display text-2xl font-extrabold text-forest md:text-3xl">{conf.heading}</h1>
            </div>
            <motion.span
              key={`${filtered.length}-${search}-${activeCategory}-${offersOnly}`}
              initial={{ scale: 1.12, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="rounded-full border border-leaf/20 bg-mint px-3 py-1.5 text-[0.75rem] font-extrabold text-leaf"
            >
              {loaded ? `${filtered.length} ${conf.countWord}${filtered.length === 1 ? "" : "s"}` : "Loading…"}
            </motion.span>
          </div>
        </motion.div>

        {error ? (
          <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
            <p className="text-3xl">🥕</p>
            <p className="mt-3 font-extrabold text-ink">Could not load products</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            {/* Your last looks */}
            {recent.length >= 2 && (
              <motion.section
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
                className="mt-8"
                aria-label="Your last looks"
              >
                <h2 className="flex items-center gap-2 text-[1.05rem] font-extrabold text-forest">
                  <History size={17} className="text-leaf" /> Your last looks
                </h2>
                <div className="rail -mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-2">
                  {recent.map((p, i) => (
                    <div key={p.handle} className="w-[46%] shrink-0 sm:w-[30%] md:w-[22%] lg:w-[17%]">
                      <ProductCard product={p} index={i} />
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Category pills */}
            <div className="rail sticky top-14 z-30 -mx-4 mt-6 flex gap-2 overflow-x-auto border-b border-line/60 bg-cream/95 px-4 py-2.5 backdrop-blur">
              {["All", ...categories].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 transition ${
                    activeCategory === cat
                      ? "carrot-grad border-transparent text-white shadow-[0_6px_16px_rgba(232,71,12,0.3)]"
                      : "border-line bg-white text-ink hover:border-leaf/50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={categoryImage(cat)} alt="" loading="lazy" className="h-8 w-8 rounded-full border border-white/60 object-cover" />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-[0.78rem] font-extrabold">{cat}</span>
                    <span className={`text-[0.6rem] font-bold ${activeCategory === cat ? "text-white/85" : "text-muted-foreground"}`}>{countOf(cat)}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Filter bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[0.78rem] font-bold text-ink-2">
                <input type="checkbox" checked={offersOnly} onChange={(e) => setOffersOnly(e.target.checked)} className="peer sr-only" />
                <span className="relative h-5.5 w-10 rounded-full bg-line-2 transition after:absolute after:top-0.5 after:left-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:transition peer-checked:bg-leaf peer-checked:after:left-[21px]" />
                Offers only
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-muted-foreground" aria-hidden="true" />
                {(
                  [
                    ["featured", "Featured"],
                    ["price-asc", "Price: low → high"],
                    ["price-desc", "Price: high → low"],
                    ["name", "A–Z"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={`rounded-full px-3 py-1.5 text-[0.72rem] font-extrabold transition ${
                      sort === key ? "border border-leaf/30 bg-mint text-leaf" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid — no cap on the shop page: the whole market, every product */}
            {!loaded ? (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl border border-line bg-white" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
                <p className="text-2xl text-muted-foreground/60"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h16l-1.5 10.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 9Z" stroke="currentColor" strokeWidth="1.4"/><path d="M8 9V7a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.4"/></svg></p>
                <p className="mt-3 font-extrabold text-ink">No products found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try another vegetable, leaf, or combo — Tamil works too (<i>keerai</i>, <i>murungakkai</i>…)
                </p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {filtered.map((p, i) => (
                  <ProductCard key={p.handle} product={p} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
