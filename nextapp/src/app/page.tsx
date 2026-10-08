"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import gsap from "gsap";
import { ArrowRight, BadgePercent, Package, Sparkles, Truck, IndianRupee, Leaf, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BottomNav } from "@/components/bottom-nav";
import { ProductCard } from "@/components/product-card";
import { api, money, Product, Settings } from "@/lib/store";
import { matchesQuery } from "@/lib/tamil";

const ESSENTIALS = ["tomato", "onion-big", "potato", "carrot-ooty", "green-chilli", "coriander-leaves", "garlic", "small-onion-shallot"];

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("featured");
  const [offersOnly, setOffersOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      api("/api/products").catch(() => ({ products: [] })),
      api("/api/settings").catch(() => ({})),
    ]).then(([p, s]) => {
      if (!live) return;
      setProducts((p as any).products || []);
      setSettings((s as Settings) || {});
    });
    return () => {
      live = false;
    };
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const live = products.filter((p) => p.active !== false);

  const filtered = useMemo(() => {
    const q = search.trim();
    let rows = live.filter(
      (p) =>
        (category === "All" || p.category === category) &&
        (!offersOnly || Number(p.compareAtInr) > Number(p.priceInr)) &&
        matchesQuery(p, q)
    );
    if (sort === "price-asc") rows = [...rows].sort((a, b) => a.priceInr - b.priceInr);
    else if (sort === "price-desc") rows = [...rows].sort((a, b) => b.priceInr - a.priceInr);
    else if (sort === "name") rows = [...rows].sort((a, b) => a.title.localeCompare(b.title));
    else rows = [...rows].sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0));
    return rows;
  }, [live, category, offersOnly, search, sort]);

  const shelves = useMemo(() => {
    const greens = live.filter((p) => p.category === "Leafy Greens");
    const boxes = live.filter((p) => ["Veg boxes", "Combos & Kits"].includes(p.category));
    const offers = live
      .filter((p) => Number(p.compareAtInr) > Number(p.priceInr))
      .sort((a, b) => Number(b.compareAtInr) - b.priceInr - (Number(a.compareAtInr) - a.priceInr));
    const essentials = ESSENTIALS.map((h) => live.find((p) => p.handle === h)).filter(Boolean) as Product[];
    return [
      { key: "greens", title: "Greens, picked this morning", link: "/shop", items: greens.slice(0, 10), total: greens.length, icon: Leaf, tint: "text-leaf bg-mint" },
      { key: "essentials", title: "Everyday kitchen staples", link: "/shop", items: essentials.slice(0, 8), total: essentials.length, icon: Package, tint: "text-leaf bg-mint" },
      { key: "boxes", title: "Weekly veg boxes", link: "/shop", items: boxes.slice(0, 5), total: boxes.length, icon: Sparkles, tint: "text-leaf bg-mint" },
      { key: "offers", title: "Today’s offers", link: "/shop", items: offers.slice(0, 8), total: offers.length, icon: BadgePercent, tint: "text-carrot bg-carrot/10" },
    ].filter((s) => s.items.length > 0);
  }, [live]);

  const featuredPick = live.find((p) => p.stock > 0 && p.featured) || live.find((p) => p.stock > 0);
  const minis = live.filter((p) => p.stock > 0 && p.handle !== featuredPick?.handle).slice(0, 2);
  const content = settings.content || {};
  const delivery = settings.delivery || {};

  /* ---- GSAP: hero entrance (copy) ---- */
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".hero-eyebrow", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1)
        .fromTo(".w-in", { yPercent: 112 }, { yPercent: 0, duration: 0.75, stagger: 0.06, ease: "power4.out" }, 0.18)
        .fromTo(".hero-sub", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55 }, 0.6)
        .fromTo(".hero-cta", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 }, 0.72)
        .fromTo(".hero-fact", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.06 }, 0.85);
    }, heroRef);
    return () => ctx.revert();
  }, []);

  /* ---- GSAP: hero cards pop in once products arrive + live count-up ---- */
  useEffect(() => {
    if (!live.length) return;
    const el = heroRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".hero-pop");
      if (cards.length) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 44, scale: 0.92 },
          { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.1, ease: "back.out(1.6)", delay: 0.1 }
        );
      }
      if (countRef.current) {
        const obj = { n: 0 };
        gsap.to(obj, {
          n: live.length,
          duration: 1.1,
          ease: "power2.out",
          onUpdate: () => {
            if (countRef.current) countRef.current.textContent = String(Math.round(obj.n));
          },
        });
      }
    }, heroRef);
    return () => ctx.revert();
  }, [live.length]);

  /* ---- subtle mouse parallax on the hero visual ---- */
  useEffect(() => {
    const el = visualRef.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const movers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
    const setters = movers.map((m) => ({
      x: gsap.quickTo(m, "x", { duration: 0.7, ease: "power3.out" }),
      y: gsap.quickTo(m, "y", { duration: 0.7, ease: "power3.out" }),
      depth: Number(m.dataset.depth) || 1,
    }));
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      setters.forEach((s) => {
        s.x(relX * 14 * s.depth);
        s.y(relY * 12 * s.depth);
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [live.length]);

  return (
    <div className="min-h-screen pb-14 md:pb-0">
      <SiteHeader search={search} onSearch={setSearch} />

      {/* HERO */}
      <section ref={heroRef} className="hero-mesh text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_0.9fr] md:py-16">
          <div>
            <span className="hero-eyebrow inline-flex items-center gap-1.5 rounded-full border border-leaf-2/40 bg-leaf-2/15 px-3 py-1 text-[0.7rem] font-extrabold tracking-wide text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-carrot animate-pulse-dot" />
              <Sparkles size={13} /> {content.homeBadge || "Fresh stock opens daily"}
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.06] tracking-tight md:text-5xl">
              {(content.homeTitle || "Fresh vegetables in Hosur").split(" ").map((word, i) => (
                <span key={i} className="w-mask">
                  <span className="w-in">{word}&nbsp;</span>
                </span>
              ))}
            </h1>
            <p className="hero-sub mt-3 max-w-md text-base text-white/75 md:text-lg">
              {content.homeSubtitle || "Fresh vegetables. Exact pin. Morning delivery."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <a
                href="#browse"
                className="hero-cta inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-leaf-2 to-leaf px-5 py-3 text-sm font-extrabold shadow-[0_10px_28px_rgba(15,170,70,0.4)] transition hover:brightness-110 active:scale-[0.98]"
              >
                Shop fresh now <ArrowRight size={16} />
              </a>
              <a
                href="#delivery"
                className="hero-cta inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-extrabold transition hover:bg-white/20"
              >
                {content.deliveryNoteButton || "Check my pin"}
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-2 text-[0.72rem] font-bold text-white/80">
              <span className="hero-fact rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                <b className="text-white">₹{Number(delivery.freeOverInr || 500).toLocaleString("en-IN")}+</b> free delivery
              </span>
              <span className="hero-fact rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                <b className="text-white">{delivery.maxRoadKm || 9} km</b> road-route service
              </span>
              <span className="hero-fact rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                <b className="text-white">
                  <span ref={countRef}>{live.length || ""}</span>
                </b>{" "}
                live products
              </span>
              <span className="hero-fact rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                <b className="text-white">COD</b> &amp; UPI available
              </span>
            </div>
          </div>

          <div ref={visualRef} className="relative">
            {featuredPick && (
              <a
                href={`/products/${encodeURIComponent(featuredPick.handle)}`}
                data-depth="0.5"
                className="hero-pop block rounded-3xl bg-white p-4 shadow-mid transition-transform hover:-translate-y-1"
              >
                <span className="inline-block rounded-full bg-carrot px-2.5 py-0.5 text-[0.62rem] font-extrabold text-white">Fresh pick</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={featuredPick.image} alt={featuredPick.title} className="mt-2 aspect-[5/3] w-full rounded-2xl object-cover" />
                <div className="mt-3">
                  <span className="rounded-full bg-mint px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-leaf">
                    {featuredPick.category}
                  </span>
                  <h3 className="mt-1.5 text-[1.02rem] font-extrabold leading-snug text-ink">{featuredPick.title}</h3>
                  <span className="text-sm font-extrabold text-forest">
                    {money(featuredPick.priceInr)} <span className="font-semibold text-muted">/ {featuredPick.unitLabel}</span>
                  </span>
                </div>
              </a>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {minis.map((p, i) => (
                <a
                  key={p.handle}
                  href={`/products/${encodeURIComponent(p.handle)}`}
                  data-depth={i === 0 ? "1.1" : "0.85"}
                  className="hero-pop rounded-2xl bg-white/95 p-2.5 shadow-soft transition-transform hover:-translate-y-0.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.title} className="aspect-square w-full rounded-xl object-cover" />
                  <h4 className="mt-1.5 truncate text-[0.78rem] font-bold text-ink">{p.title}</h4>
                  <span className="text-[0.78rem] font-extrabold text-forest">{money(p.priceInr)}</span>
                </a>
              ))}
            </div>
            <p className="hero-pop mt-3 text-center text-[0.68rem] font-semibold text-white/55">Live stock from today&rsquo;s catalogue</p>
          </div>
        </div>
      </section>

      {/* SHELVES */}
      <section className="mx-auto max-w-6xl space-y-12 px-4 pt-12" aria-label="Shop fresh vegetables">
        {shelves.map((shelf) => (
          <div key={shelf.key}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="flex items-center gap-2.5 font-display text-xl font-extrabold text-forest md:text-2xl">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${shelf.tint}`}>
                  <shelf.icon size={18} />
                </span>
                {shelf.title} <span className="text-sm font-bold text-muted">({shelf.total})</span>
              </h2>
              <a href={shelf.link} className="inline-flex items-center gap-1 text-[0.8rem] font-extrabold text-leaf transition-all hover:gap-2">
                View all <ArrowRight size={14} />
              </a>
            </div>
            <div className="rail-scroll -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
              {shelf.items.map((p, i) => (
                <div key={p.handle} className="w-[46%] shrink-0 sm:w-[30%] md:w-[22%] lg:w-[17%]">
                  <ProductCard product={p} index={i} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* WHOLE MARKET GRID */}
      <section id="browse" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold text-forest md:text-2xl">The whole market</h2>
          <p className="text-[0.78rem] font-bold text-muted">
            {filtered.length} product{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rail-scroll -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[0.78rem] font-extrabold transition ${
                category === cat ? "border-transparent bg-forest text-white" : "border-line bg-white text-ink-2 hover:border-leaf/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[0.78rem] font-bold text-ink-2">
            <input type="checkbox" checked={offersOnly} onChange={(e) => setOffersOnly(e.target.checked)} className="peer sr-only" />
            <span className="relative h-5.5 w-10 rounded-full bg-line-2 transition after:absolute after:top-0.5 after:left-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:transition peer-checked:bg-leaf peer-checked:after:left-[21px]" />
            Offers only
          </label>
          <div className="flex flex-wrap gap-1.5">
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
                  sort === key ? "border border-leaf/30 bg-mint text-leaf" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
            <p className="text-3xl">🧺</p>
            <p className="mt-3 font-extrabold text-ink">Nothing matches &ldquo;{search}&rdquo;</p>
            <p className="mt-1 text-sm text-muted">
              Try a Tamil name — like <i>keerai</i>, <i>murungakkai</i> or <i>avarakkai</i>
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(showAll ? filtered : filtered.slice(0, 15)).map((p, i) => (
              <ProductCard key={p.handle} product={p} index={i} />
            ))}
          </div>
        )}
        {!showAll && filtered.length > 15 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mx-auto mt-7 block rounded-2xl bg-gradient-to-br from-carrot to-[#d8431f] px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(255,91,32,0.35)] transition hover:brightness-110"
          >
            Show all {filtered.length} products
          </button>
        )}

        {/* delivery note */}
        <div id="delivery" className="mt-12 scroll-mt-20">
          <div className="flex flex-col justify-between gap-4 rounded-3xl bg-forest-2 p-6 text-white sm:flex-row sm:items-center">
            <div className="flex items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10">
                <Truck size={19} className="text-leaf-2" />
              </span>
              <div>
                <strong className="block text-[1rem] font-extrabold">{content.deliveryNoteTitle || "Delivery by real road distance"}</strong>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-white/70">
                  {content.deliveryNoteText || "Choose GPS or map pin at checkout. We confirm the rider route before the slot."}
                </p>
              </div>
            </div>
            <a
              href="/cart"
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-forest transition hover:bg-mint"
            >
              {content.deliveryNoteButton || "Check my pin"} <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="mx-auto max-w-6xl px-4 pt-16" aria-label="Why Rebesta Fresh">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: IndianRupee,
              title: "Fair, honest pricing",
              text: "Live market prices daily. No surge, no hidden fees — what you see is what you pay.",
            },
            {
              icon: ShieldCheck,
              title: "Farm-fresh quality",
              text: "Picked this morning, packed by hand, at your door before breakfast. Not warehouse-fresh.",
            },
            {
              icon: Truck,
              title: "Exact-pin delivery",
              text: "Real road distance pricing across 9 km of Hosur — with free delivery over ₹500.",
            },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-3xl border border-line bg-white p-6 shadow-soft"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-leaf">
                <item.icon size={19} />
              </span>
              <h3 className="mt-4 text-[1rem] font-extrabold text-forest">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2/80">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <SiteFooter />
      <BottomNav />
    </div>
  );
}
