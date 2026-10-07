import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, MapPin, Minus, Plus, Star, Truck, X } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BottomNav from '../components/BottomNav';
import ProductCard from '../components/ProductCard';
import { useToast } from '../components/Toaster';
import { addToCart, api, CART_EVENT, money, Product, pushRecent, readCart } from '../shared/store';

interface Review { name: string; rating: number; text?: string }

export default function ProductPage() {
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [all, setAll] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [qty, setQty] = useState(1);
  const [zoom, setZoom] = useState(false);
  const [notFound, setNotFound] = useState('');
  const [panelVisible, setPanelVisible] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const handle = useMemo(() => decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || ''), []);

  /* live cart qty for this product */
  const inCart = useSyncExternalStore(
    cb => { window.addEventListener(CART_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(CART_EVENT, cb); window.removeEventListener('storage', cb); }; },
    () => (product ? readCart().find(l => l.handle === product.handle)?.qty || 0 : 0)
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await api(`/api/products/${encodeURIComponent(handle)}`);
        setProduct(data.product);
        pushRecent(handle);
        const list = await api('/api/products');
        setAll(((list.products || []) as Product[]).filter(p => p.active !== false));
        try {
          const rv = await api(`/api/reviews?product=${encodeURIComponent(handle)}`);
          setReviews(rv.reviews || []);
        } catch { /* reviews optional */ }
      } catch (e: any) {
        setNotFound(e?.message || 'Product not found');
      }
    })();
  }, [handle]);

  /* sticky add bar — shows when the purchase panel scrolls out of view */
  useEffect(() => {
    if (!panelRef.current || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(entries => setPanelVisible(entries[0].isIntersecting), { threshold: 0 });
    obs.observe(panelRef.current);
    return () => obs.disconnect();
  }, [product]);

  /* SEO — title, meta, OG, canonical, Product JSON-LD */
  useEffect(() => {
    if (!product) return;
    document.title = `${product.title} — Rebesta Fresh`;
    const setMeta = (selector: string, attr: string, value: string) => { const el = document.head.querySelector(selector); if (el) el.setAttribute(attr, value); };
    setMeta('meta[name="description"]', 'content', `${product.title} — ₹${product.priceInr} / ${product.unitLabel}. ${product.description || ''}`.slice(0, 300));
    setMeta('meta[property="og:title"]', 'content', `${product.title} — Rebesta Fresh`);
    setMeta('meta[property="og:description"]', 'content', `${product.title} at ₹${product.priceInr}/${product.unitLabel} — fresh from farms, delivered in Hosur.`);
    setMeta('meta[property="og:type"]', 'content', 'product');
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${location.origin}/products/${encodeURIComponent(product.handle)}`;
    document.getElementById('rfs-jsonld')?.remove();
    const script = document.createElement('script');
    script.id = 'rfs-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product',
      name: product.title, description: product.description,
      image: [new URL(product.image, location.origin).href],
      sku: product.sku, brand: { '@type': 'Brand', name: 'Rebesta Fresh' },
      offers: {
        '@type': 'Offer', priceCurrency: 'INR', price: product.priceInr,
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: canonical.href
      }
    });
    document.head.appendChild(script);
  }, [product]);

  const variants = useMemo(() => {
    if (!product) return [];
    const base = product.baseHandle || product.handle;
    return all.filter(p => (p.baseHandle || p.handle) === base).sort((a, b) => Number(a.weightGrams || 0) - Number(b.weightGrams || 0));
  }, [all, product]);

  const related = useMemo(() => {
    if (!product) return [];
    const others = all.filter(p => p.handle !== handle);
    const sameCategory = others.filter(p => p.category === product.category);
    const featured = others.filter(p => p.featured && p.category !== product.category);
    return [...sameCategory, ...featured].slice(0, 10);
  }, [all, product, handle]);

  const discount = product && Number(product.compareAtInr) > Number(product.priceInr) ? Math.round((1 - Number(product.priceInr) / Number(product.compareAtInr)) * 100) : 0;
  const available = product ? Math.max(0, Number(product.stock || 0) - inCart) : 0;
  const maxQty = product ? Math.min(50, product.stock) : 1;

  function addCurrent() {
    if (!product) return;
    if (qty > available) { toast(`Only ${available} more available today`, 'error'); return; }
    addToCart(product.handle, qty);
    toast(`${product.title} added to basket 🌿`);
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied — share it anywhere'); }
    catch { toast('Could not copy link on this browser', 'error'); }
  }

  if (notFound) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
            <p className="text-4xl">🥬</p>
            <h1 className="mt-3 font-display text-2xl font-extrabold text-forest">Product not found</h1>
            <p className="mt-1 text-sm text-muted">{notFound}</p>
            <a href="/shop" className="mt-6 rounded-2xl bg-gradient-to-br from-leaf to-[#0a6b2b] px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(13,135,54,0.35)]">Back to shop</a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <Header />

      <main className="mx-auto max-w-6xl px-4 pt-6">
        {!product ? (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="aspect-[4/3] rounded-3xl bg-white border border-line animate-pulse" />
            <div className="space-y-4">
              <div className="h-4 w-24 rounded bg-white animate-pulse" />
              <div className="h-9 w-3/4 rounded bg-white animate-pulse" />
              <div className="h-4 w-full rounded bg-white animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-white animate-pulse" />
              <div className="h-14 w-full rounded-2xl bg-white animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-8 md:grid-cols-2 md:items-start">
              {/* Media */}
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="relative">
                <button type="button" onClick={() => setZoom(true)} className="block w-full rounded-3xl overflow-hidden bg-mint border border-line" title="Click to enlarge" aria-label={`Enlarge image of ${product.title}`}>
                  <img src={product.image} alt={product.title} className="aspect-[4/3] w-full object-cover" decoding="async" />
                </button>
                {discount > 0 && (
                  <span className="absolute top-3 left-3 rounded-full bg-carrot px-2.5 py-0.5 text-[0.66rem] font-extrabold text-white">{discount}% off</span>
                )}
              </motion.div>

              {/* Copy */}
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
                <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-leaf">{product.category}</span>
                <h1 className="mt-1.5 font-display text-2xl md:text-[2rem] font-extrabold leading-tight text-forest">{product.title}</h1>
                {product.description && <p className="mt-2.5 text-sm leading-relaxed text-ink-2/85">{product.description}</p>}

                <div className="mt-4 flex items-end gap-2">
                  <strong className="text-2xl font-extrabold text-forest">{money(product.priceInr)}</strong>
                  {discount > 0 && <span className="text-sm font-semibold text-muted line-through">{money(Number(product.compareAtInr))}</span>}
                  <span className="text-sm font-semibold text-muted">/ {product.unitLabel}</span>
                </div>

                {variants.length > 1 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[0.72rem] font-extrabold uppercase tracking-wide text-muted">Size</span>
                    {variants.map(v => (
                      <a key={v.handle} href={`/products/${encodeURIComponent(v.handle)}`}
                        className={`rounded-full border px-3.5 py-1.5 text-[0.78rem] font-extrabold transition ${v.handle === product.handle ? 'border-leaf bg-mint text-leaf' : 'border-line bg-white text-ink hover:border-leaf/50'}`}>
                        {v.variantTitle || v.unitLabel}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-[0.7rem] font-bold">
                  <span className={`rounded-full px-2.5 py-1 ${product.stock > 10 ? 'bg-mint text-leaf' : product.stock > 0 ? 'bg-carrot/10 text-carrot' : 'bg-line/60 text-muted'}`}>
                    {product.stock > 10 ? 'In stock today' : product.stock > 0 ? `Only ${product.stock} left` : 'Sold out today'}
                  </span>
                  <span className="rounded-full bg-line/40 px-2.5 py-1 text-muted flex items-center gap-1"><Truck size={12} /> Tomorrow morning</span>
                  {product.sku && <span className="rounded-full bg-line/40 px-2.5 py-1 text-muted">{product.sku}</span>}
                </div>

                {product.stock > 0 && product.stock <= 5 && (
                  <p className="mt-3 rounded-xl bg-carrot/10 border border-carrot/25 px-3.5 py-2.5 text-[0.8rem] font-bold text-carrot">
                    🔥 Only {product.stock} left — selling fast today, order now!
                  </p>
                )}

                {/* Purchase panel */}
                <div ref={panelRef} className="mt-5 rounded-3xl border border-line bg-white p-4 shadow-soft">
                  <label className="text-[0.72rem] font-extrabold uppercase tracking-wide text-muted">Quantity</label>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-3 rounded-xl border border-line bg-cream px-2 py-1.5">
                      <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"
                        className="grid place-items-center w-8 h-8 rounded-lg bg-white border border-line text-ink disabled:opacity-40 hover:border-leaf/50 transition"><Minus size={14} /></button>
                      <span className="min-w-6 text-center text-[1rem] font-extrabold text-ink">{qty}</span>
                      <button type="button" onClick={() => setQty(q => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity"
                        className="grid place-items-center w-8 h-8 rounded-lg bg-white border border-line text-ink disabled:opacity-40 hover:border-leaf/50 transition"><Plus size={14} /></button>
                    </span>
                    <button type="button" onClick={addCurrent} disabled={product.stock <= 0}
                      className="flex-1 min-w-[180px] rounded-xl bg-gradient-to-br from-leaf to-[#0a6b2b] px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(13,135,54,0.35)] hover:brightness-110 active:scale-[0.98] transition disabled:from-line-2 disabled:to-line-2 disabled:text-muted disabled:shadow-none">
                      {product.stock <= 0 ? 'Sold out' : 'Add to basket'}
                    </button>
                  </div>
                  {inCart > 0 && <p className="mt-2.5 text-[0.72rem] font-bold text-leaf">{inCart} already in your basket</p>}
                </div>

                {/* Share */}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a href={`https://wa.me/?text=${encodeURIComponent(`${product.title} — ${money(product.priceInr)} / ${product.unitLabel} at Rebesta Fresh, Hosur\n${location.href}`)}`}
                    target="_blank" rel="noopener"
                    className="inline-flex items-center gap-2 rounded-xl border border-leaf/30 bg-mint px-4 py-2.5 text-[0.8rem] font-extrabold text-leaf hover:bg-leaf hover:text-white transition">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.3-3 .8.8-2.9-.3-.4A8 8 0 0 1 12 4Zm-2.9 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.6.1a6.7 6.7 0 0 1-3.3-2.8c-.2-.4 0-.6.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.3 0-.4 0-.6L9.4 8.6c-.2-.4-.2-.6-.3-.6Z"/></svg>
                    Share on WhatsApp
                  </a>
                  <button type="button" onClick={copyLink}
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[0.8rem] font-extrabold text-ink-2 hover:border-leaf/50 transition">
                    <Link2 size={14} /> Copy link
                  </button>
                </div>

                {/* Delivery proof */}
                <div className="mt-5 rounded-3xl bg-forest-2 p-5 text-white">
                  <h3 className="flex items-center gap-2 text-[0.95rem] font-extrabold"><MapPin size={15} className="text-leaf-2" /> Delivery checked by your exact pin</h3>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-white/70">Choose current GPS, a manual map pin or coordinates at checkout. We use the actual rider route within 9 road km.</p>
                </div>
              </motion.div>
            </div>

            {/* Reviews */}
            {reviews.length > 0 && (
              <section className="mt-14" aria-label="Customer reviews">
                <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-leaf">Customer reviews</span>
                <h2 className="mt-1 font-display text-xl md:text-2xl font-extrabold text-forest">
                  ⭐ {(Math.round((reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length) * 10) / 10).toFixed(1)} / 5
                  <span className="ml-2 text-sm font-bold text-muted">· {reviews.length} review{reviews.length > 1 ? 's' : ''} for {product.title}</span>
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {reviews.map((r, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: Math.min(i, 5) * 0.05 }}
                      className="rounded-2xl border border-line bg-white p-4 shadow-soft">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-[0.88rem] font-extrabold text-ink">{r.name}</strong>
                        <span className="flex items-center gap-0.5 text-gold text-[0.8rem]" aria-label={`${r.rating} of 5`}>
                          {Array.from({ length: 5 }).map((_, s) => <Star key={s} size={12} fill={s < Math.round(r.rating) ? 'currentColor' : 'none'} className={s < Math.round(r.rating) ? 'text-gold' : 'text-line-2'} />)}
                        </span>
                      </div>
                      {r.text && <p className="mt-1.5 text-[0.82rem] leading-relaxed text-ink-2/85">{r.text}</p>}
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Related */}
            {related.length > 0 && (
              <section className="mt-14" aria-label="More fresh picks">
                <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-leaf">Related</span>
                <h2 className="mt-1 font-display text-xl md:text-2xl font-extrabold text-forest">More fresh picks</h2>
                <div className="rail-scroll -mx-4 px-4 mt-4 flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible">
                  {related.map((p, i) => (
                    <div key={p.handle} className="w-[46%] sm:w-[30%] md:w-auto shrink-0">
                      <ProductCard product={p} index={i} toast={toast} />
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
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed bottom-16 md:bottom-5 inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-line bg-white/97 backdrop-blur p-2 pr-2.5 shadow-mid max-w-lg md:w-auto">
            <img src={product.image} alt="" className="w-11 h-11 rounded-xl object-cover" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[0.82rem] font-extrabold text-ink">{product.title}</strong>
              <span className="text-[0.72rem] font-bold text-forest">{money(product.priceInr)} / {product.unitLabel}{qty > 1 ? ` · qty ${qty}` : ''}</span>
            </span>
            <button type="button" onClick={addCurrent}
              className="shrink-0 rounded-xl bg-gradient-to-br from-carrot to-[#d8431f] px-4 py-2.5 text-[0.8rem] font-extrabold text-white shadow-[0_6px_16px_rgba(255,91,32,0.35)] hover:brightness-110 active:scale-95 transition">
              Add · {money(product.priceInr * qty)}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {zoom && product && (
          <motion.div role="dialog" aria-label="Product image preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setZoom(false)} className="fixed inset-0 z-[90] grid place-items-center bg-ink/85 backdrop-blur-sm p-6 cursor-zoom-out">
            <button type="button" onClick={() => setZoom(false)} aria-label="Close preview" className="absolute top-4 right-4 grid place-items-center w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"><X size={18} /></button>
            <motion.img src={product.image} alt={product.title} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="max-w-full max-h-[82vh] rounded-2xl object-contain shadow-mid" />
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
      <BottomNav />
    </div>
  );
}
