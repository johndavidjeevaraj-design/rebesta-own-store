"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link2, MapPin, Star, Truck, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { LikeButton } from "@/components/like-button";
import { useToast } from "@/components/toaster";
import { useVariantQty } from "@/lib/hooks";
import { addToCart, api, money, Product, pushRecent, defaultVariant, lineVariantId } from "@/lib/store";

/* pack per-unit math — honest hints only; "Best value" shows only when a pack is genuinely cheaper per unit */
function unitPrice(v: { label: string; priceInr: number }): number {
  const m = String(v.label || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kg|g|bunch)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const price = Number(v.priceInr) || 0;
  if (!n || !price) return 0;
  if (m[2] === "kg") return price / (n * 10); // ₹ per 100 g
  if (m[2] === "g") return price / (n / 100); // ₹ per 100 g
  return price / n; // ₹ per bunch
}

function perUnitLabel(v: { label: string; priceInr: number }): string {
  const u = unitPrice(v);
  if (!u) return "";
  return `${money(u)} / ${/bunch/i.test(String(v.label)) ? "bunch" : "100 g"}`;
}

interface Review {
  name: string;
  rating: number;
  text?: string;
}

export function ProductView({ handle }: { handle: string }) {
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [all, setAll] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [zoom, setZoom] = useState(false);
  const [notFound, setNotFound] = useState("");
  const [panelVisible, setPanelVisible] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  /* pack sizes (250 g / 500 g / 1 kg / bunches) — state must sit above its first use */
  const [packId, setPackId] = useState("");
  function selectedPack(p: Product | null) {
    if (!p) return { id: "", label: "", priceInr: 0 } as any;
    return p.variants?.find((v) => v.id === packId) || defaultVariant(p);
  }
  const hasPacks = Boolean(product && product.variants && product.variants.length > 1);
  const pack = selectedPack(product);

  /* live cart qty for this product */
  const inCart = useVariantQty(product || ({ handle } as Product), selectedPack(product).id);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/products/${encodeURIComponent(handle)}`);
        if (cancelled) return;
        setProduct(data.product);
        pushRecent(handle);
        const list = await api("/api/products");
        if (cancelled) return;
        setAll(((list.products || []) as Product[]).filter((p) => p.active !== false));
        try {
          const rv = await api(`/api/reviews?product=${encodeURIComponent(handle)}`);
          if (!cancelled) setReviews(rv.reviews || []);
        } catch {
          /* reviews optional */
        }
      } catch (e: any) {
        if (!cancelled) setNotFound(e?.message || "Product not found");
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  /* Live product metadata keeps the generic Next fallback as useful as a
     statically generated product page, including title, canonical and JSON-LD. */
  useEffect(() => {
    if (!product) return;
    const title = `${product.title} — Rebesta Fresh`;
    const description = `${product.title} — ₹${product.priceInr} / ${product.unitLabel}. ${product.description || ""}`.slice(0, 300);
    const imageUrl = new URL(product.image, location.origin).href;
    const canonicalUrl = `${location.origin}/products/${encodeURIComponent(product.handle)}`;
    document.title = title;
    const setMeta = (selector: string, content: string) => {
      document.head.querySelector(selector)?.setAttribute("content", content);
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', `${product.title} at ₹${product.priceInr}/${product.unitLabel} — fresh from farms, delivered in Hosur.`);
    setMeta('meta[property="og:type"]', "product");
    setMeta('meta[property="og:image"]', imageUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:image"]', imageUrl);
    document.getElementById("rfs-jsonld")?.remove();
    const script = document.createElement("script");
    script.id = "rfs-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: product.description,
      image: [imageUrl],
      sku: product.sku,
      brand: { "@type": "Brand", name: "Rebesta Fresh" },
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        price: product.priceInr,
        availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: canonicalUrl,
      },
    });
    document.head.appendChild(script);
    return () => document.getElementById("rfs-jsonld")?.remove();
  }, [product]);

  /* sticky add bar — shows when the purchase panel scrolls out of view */
  useEffect(() => {
    if (!panelRef.current || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((entries) => setPanelVisible(entries[0].isIntersecting), { threshold: 0 });
    obs.observe(panelRef.current);
    return () => obs.disconnect();
  }, [product]);

  const variants = useMemo(() => {
    if (!product) return [];
    const base = product.baseHandle || product.handle;
    return all.filter((p) => (p.baseHandle || p.handle) === base).sort((a, b) => Number(a.weightGrams || 0) - Number(b.weightGrams || 0));
  }, [all, product]);

  const related = useMemo(() => {
    if (!product) return [];
    const others = all.filter((p) => p.handle !== handle);
    const sameCategory = others.filter((p) => p.category === product.category);
    const featured = others.filter((p) => p.featured && p.category !== product.category);
    return [...sameCategory, ...featured].slice(0, 10);
  }, [all, product, handle]);

  const discount = product && Number(product.compareAtInr) > Number(product.priceInr) ? Math.round((1 - Number(product.priceInr) / Number(product.compareAtInr)) * 100) : 0;
  const bestValue = useMemo(() => {
    const vs = (product?.variants || []).map((v) => ({ v, u: unitPrice(v) })).filter((x) => x.u > 0);
    if (vs.length < 2) return null;
    const min = Math.min(...vs.map((x) => x.u));
    const winners = vs.filter((x) => x.u <= min + 1e-9);
    return winners.length === 1 ? winners[0].v : null; // ties (linear pricing) → no badge
  }, [product]);
  const available = product ? Math.max(0, Number(product.stock || 0) - inCart) : 0;

  function addCurrent() {
    if (!product) return;
    if (available < 1) {
      toast(`Only ${product.stock} available today`, "error");
      return;
    }
    addToCart(product.handle, 1, pack.id);
    toast(`${product.title} — ${pack.label} added to basket 🌿`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied — share it anywhere");
    } catch {
      toast("Could not copy link on this browser", "error");
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-cream pb-20 md:pb-0">
        <SiteHeader variant="solid" />
        <main className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
            <p className="text-4xl">🥬</p>
            <h1 className="mt-3 font-display text-2xl font-semibold text-forest">Product not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">{notFound}</p>
            <a href="/shop" className="fresh-grad mt-6 rounded-full px-5 py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.10)]">
              Back to shop
            </a>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-20 md:pb-0">
      <SiteHeader variant="solid" />

      <main className="mx-auto max-w-6xl px-4 pt-6">
        {!product ? (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="aspect-[4/3] animate-pulse rounded-3xl border border-line bg-white" />
            <div className="space-y-4">
              <div className="h-4 w-24 animate-pulse rounded bg-white" />
              <div className="h-9 w-3/4 animate-pulse rounded bg-white" />
              <div className="h-4 w-full animate-pulse rounded bg-white" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white" />
              <div className="h-14 w-full animate-pulse rounded-2xl bg-white" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-8 md:grid-cols-2 md:items-start">
              {/* Media — dark cinematic frame, same DNA as the farm story */}
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="relative">
                <motion.button
                  type="button"
                  onClick={() => setZoom(true)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="block w-full overflow-hidden rounded-[28px] bg-[#0b0d0c] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
                  title="Click to enlarge"
                  aria-label={`Enlarge image of ${product.title}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <motion.img
                    src={product.image}
                    alt={product.title}
                    initial={{ scale: 1.08 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 1.2, ease: [0.33, 0.66, 0.33, 1] }}
                    className="aspect-[4/3] w-full object-cover"
                    decoding="async"
                  />
                </motion.button>
                <LikeButton handle={product.handle} size={38} className="right-3 top-3" />
                {discount > 0 && (
                  <motion.span
                    initial={{ scale: 0, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.25 }}
                    className="absolute left-3 top-3 rounded-full bg-carrot px-2.5 py-0.5 text-[11px] font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.10)]"
                  >
                    {discount}% off
                  </motion.span>
                )}
              </motion.div>

              {/* Copy */}
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-leaf">{product.category}</span>
                <h1 className="mt-1.5 font-display text-2xl font-semibold leading-tight text-forest md:text-[28px]">{product.title}</h1>
                {product.description && <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-2/85">{product.description}</p>}

                {!hasPacks && (
                  <div className="mt-4 flex items-end gap-2">
                    <strong className="text-[24px] font-semibold tracking-tight text-ink">{money(pack.priceInr)}</strong>
                    {discount > 0 && <span className="text-sm font-semibold text-muted-foreground line-through">{money(Number(product.compareAtInr))}</span>}
                    <span className="text-sm font-semibold text-muted-foreground">/ {pack.label}</span>
                  </div>
                )}

                {hasPacks && (
                  <div className="mt-5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Choose pack size</span>
                    <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-cream p-1">
                      {product.variants!.map((v) => {
                        const on = v.id === pack.id;
                        const per = perUnitLabel(v);
                        return (
                          <motion.button
                            key={v.id}
                            type="button"
                            onClick={() => setPackId(v.id)}
                            aria-pressed={on}
                            whileTap={{ scale: 0.97 }}
                            className="relative flex flex-col items-center rounded-xl px-1 py-2.5 transition hover:bg-white/60"
                          >
                            {on && (
                              <motion.span
                                layoutId="pack-pill"
                                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                                className="absolute inset-0 rounded-xl bg-white shadow-[0_3px_12px_rgba(20,32,24,0.10)]"
                              />
                            )}
                            {bestValue?.id === v.id && (
                              <span className="absolute -top-2.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-carrot px-2 py-px text-[9px] font-bold uppercase tracking-[0.08em] text-white shadow-sm">Best value</span>
                            )}
                            <span className={`relative z-10 text-[13px] font-bold leading-tight ${on ? "text-forest" : "text-ink"}`}>{v.label}</span>
                            <span className="relative z-10 mt-0.5 text-[13px] font-bold tabular-nums leading-tight text-ink">{money(v.priceInr)}</span>
                            {per && <span className={`relative z-10 mt-0.5 text-[10px] font-semibold tabular-nums leading-tight ${on ? "text-leaf/80" : "text-muted-foreground/80"}`}>{per}</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {variants.length > 1 && !hasPacks && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Size</span>
                    {variants.map((v) => (
                      <a
                        key={v.handle}
                        href={`/products/${encodeURIComponent(v.handle)}`}
                        className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition ${
                          v.handle === product.handle ? "border-leaf bg-mint text-leaf" : "border-line bg-white text-ink hover:border-leaf/50"
                        }`}
                      >
                        {v.variantTitle || v.unitLabel}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className={`rounded-full px-2.5 py-1 ${product.stock > 10 ? "bg-mint text-leaf" : product.stock > 0 ? "bg-carrot/10 text-[#c8400f]" : "bg-black/[0.06] text-muted-foreground"}`}>
                    {product.stock > 10 ? "In stock today" : product.stock > 0 ? `Only ${product.stock} left` : "Sold out today"}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-black/[0.05] px-2.5 py-1 text-muted-foreground">
                    <Truck size={12} /> Tomorrow morning
                  </span>
                  {product.sku && <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-muted-foreground">{product.sku}</span>}
                </div>

                {product.stock > 0 && product.stock <= 5 && (
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 rounded-xl border border-carrot/25 bg-carrot/10 px-3.5 py-2.5 text-[13px] font-bold text-[#c8400f]"
                  >
                    Only {product.stock} left today — order now.
                  </motion.p>
                )}

                {/* Purchase panel — pack sizes carry the quantity story, so one clean CTA */}
                <div ref={panelRef} className="mt-5 rounded-3xl border border-line bg-white p-4 shadow-soft">
                  <motion.button
                    type="button"
                    onClick={addCurrent}
                    disabled={product.stock <= 0}
                    whileTap={{ scale: 0.98 }}
                    className="fresh-grad w-full rounded-full px-5 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] transition hover:brightness-[1.05] active:scale-[0.98] disabled:bg-line-2 disabled:text-muted-foreground disabled:shadow-none disabled:bg-none"
                  >
                    {product.stock <= 0 ? "Sold out" : `Add to basket · ${money(pack.priceInr)}`}
                  </motion.button>
                </div>

                {/* Share */}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${product.title} — ${money(product.priceInr)} / ${product.unitLabel} at Rebesta Fresh, Hosur\n${location.href}`)}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-2 rounded-xl border border-leaf/30 bg-mint px-4 py-2.5 text-[13px] font-bold text-leaf transition hover:bg-leaf hover:text-white"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.3-3 .8.8-2.9-.3-.4A8 8 0 0 1 12 4Zm-2.9 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.6.1a6.7 6.7 0 0 1-3.3-2.8c-.2-.4 0-.6.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.3 0-.4 0-.6L9.4 8.6c-.2-.4-.2-.6-.3-.6Z" />
                    </svg>
                    Share on WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px] font-bold text-ink-2 transition hover:border-leaf/50"
                  >
                    <Link2 size={14} /> Copy link
                  </button>
                </div>

                {/* Delivery proof */}
                <div className="mt-5 rounded-3xl bg-forest-2 p-5 text-white">
                  <h3 className="flex items-center gap-2 text-[14px] font-bold">
                    <MapPin size={15} className="text-leaf-2" /> Delivery checked by your exact pin
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
                    Choose current GPS, a manual map pin or coordinates at checkout. We use the actual rider route within 9 road km.
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Reviews */}
            {reviews.length > 0 && (
              <section className="mt-14" aria-label="Customer reviews">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c8400f]">Customer reviews</span>
                <h2 className="mt-1 font-display text-xl font-semibold text-forest md:text-2xl">
                  ⭐ {(Math.round((reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length) * 10) / 10).toFixed(1)} / 5
                  <span className="ml-2 text-sm font-bold text-muted-foreground">
                    · {reviews.length} review{reviews.length > 1 ? "s" : ""} for {product.title}
                  </span>
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {reviews.map((r, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: Math.min(i, 5) * 0.05 }}
                      className="rounded-2xl border border-line bg-white p-4 shadow-soft"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-[13px] font-bold text-ink">{r.name}</strong>
                        <span className="flex items-center gap-0.5 text-gold text-[13px]" aria-label={`${r.rating} of 5`}>
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star key={s} size={12} fill={s < Math.round(r.rating) ? "currentColor" : "none"} className={s < Math.round(r.rating) ? "text-gold" : "text-line-2"} />
                          ))}
                        </span>
                      </div>
                      {r.text && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2/85">{r.text}</p>}
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Related */}
            {related.length > 0 && (
              <section className="mt-14" aria-label="More fresh picks">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c8400f]">Related</span>
                <h2 className="mt-1 font-display text-xl font-semibold text-forest md:text-2xl">More fresh picks</h2>
                <div className="rail -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-5 md:overflow-visible">
                  {related.map((p, i) => (
                    <div key={p.handle} className="w-[46%] shrink-0 sm:w-[30%] md:w-auto">
                      <ProductCard product={p} index={i} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Sticky add bar */}
      <AnimatePresence>
        {product && product.stock > 0 && !panelVisible && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-3 bottom-16 z-40 flex max-w-lg items-center gap-3 rounded-2xl border border-line bg-white/95 p-2 pr-2.5 shadow-mid backdrop-blur md:bottom-5 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-auto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.image} alt="" className="h-11 w-11 rounded-xl object-cover" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px] font-bold text-ink">{product.title}</strong>
              <span className="text-[11px] font-bold text-forest">
                {money(pack.priceInr)}
                {!hasPacks && ` / ${pack.label}`}
              </span>
            </span>
            <motion.button
              type="button"
              onClick={addCurrent}
              whileTap={{ scale: 0.95 }}
              className="shrink-0 rounded-xl bg-carrot px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.10)] transition hover:brightness-110"
            >
              Add · {money(pack.priceInr)}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {zoom && product && (
          <motion.div
            role="dialog"
            aria-label="Product image preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoom(false)}
            className="fixed inset-0 z-[90] grid cursor-zoom-out place-items-center bg-ink/85 p-6 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => setZoom(false)}
              aria-label="Close preview"
              className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={18} />
            </button>
            <motion.img
              src={product.image}
              alt={product.title}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-mid"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SiteFooter />
    </div>
  );
}
