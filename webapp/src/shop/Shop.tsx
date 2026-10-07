import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { History, SlidersHorizontal } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BottomNav from '../components/BottomNav';
import ProductCard from '../components/ProductCard';
import { useToast } from '../components/Toaster';
import { api, Product, readRecent, Settings } from '../shared/store';
import { matchesQuery } from '../shared/tamil';

/* One page, three shops: /shop (everything), /offers (deals only), /greens (keerai & leafy greens). */
const PAGE_MODE = (() => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/offers') return { offersOnly: true, heading: 'Today’s offers', title: 'Today’s Offers — Fresh Vegetable Deals in Hosur | Rebesta Fresh', canonical: '/offers', countWord: 'offer' };
  if (path === '/greens') return { category: 'Leafy Greens', heading: 'Greens & keerai', title: 'Fresh Greens & Keerai Delivered in Hosur | Rebesta Fresh', canonical: '/greens', countWord: 'green' };
  return { heading: 'All products', title: null as string | null, canonical: '/shop', countWord: 'product' };
})();

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name';
const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  featured: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.title.localeCompare(b.title),
  'price-asc': (a, b) => a.priceInr - b.priceInr || a.title.localeCompare(b.title),
  'price-desc': (a, b) => b.priceInr - a.priceInr || a.title.localeCompare(b.title),
  name: (a, b) => a.title.localeCompare(b.title)
};

export default function Shop() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [activeCategory, setActiveCategory] = useState<string>(PAGE_MODE.category || 'All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('featured');
  const [offersOnly, setOffersOnly] = useState(Boolean(PAGE_MODE.offersOnly));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [data, settings] = await Promise.all([api('/api/products'), api('/api/settings')]);
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setSettings(settings);
        setLoaded(true);
      } catch (e: any) {
        setError(e?.message || 'Could not load products');
      }
    })();
  }, []);

  useEffect(() => {
    if (PAGE_MODE.title) document.title = PAGE_MODE.title;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', `https://rebestafresh.in${PAGE_MODE.canonical}`);
    const business = settings.business || {};
    if (business.name && !PAGE_MODE.title) document.title = `${business.name} — All Fresh Products, Delivered in Hosur`;
  }, [settings]);

  const live = useMemo(() => products.filter(p => p.active !== false), [products]);

  const filtered = useMemo(() => {
    const q = search.trim();
    let rows = live.filter(p =>
      (activeCategory === 'All' || p.category === activeCategory) &&
      (!offersOnly || Number(p.compareAtInr) > Number(p.priceInr)) &&
      matchesQuery(p, q)
    );
    return rows.slice().sort(SORTERS[sort] || SORTERS.featured);
  }, [live, activeCategory, offersOnly, search, sort]);

  const recent = useMemo(() => {
    const list = readRecent().map(h => live.find(p => p.handle === h)).filter((p): p is Product => Boolean(p && p.stock > 0)).slice(0, 8);
    return list;
  }, [live, loaded]);

  const categoryImage = (category: string) =>
    category === 'All'
      ? (live.find(p => p.featured) || live[0])?.image || '/assets/brand/basket.jpg'
      : live.find(p => p.category === category)?.image || '/assets/brand/basket.jpg';

  const countOf = (category: string) => category === 'All' ? live.length : live.filter(p => p.category === category).length;

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <Header search={search} onSearch={setSearch} />

      <main className="mx-auto max-w-6xl px-4 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-leaf">Shop fresh</span>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-forest">{PAGE_MODE.heading}</h1>
          </div>
          <motion.span key={`${filtered.length}-${search}-${activeCategory}-${offersOnly}`} initial={{ scale: 1.12, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}
            className="rounded-full bg-mint px-3 py-1.5 text-[0.75rem] font-extrabold text-leaf border border-leaf/20">
            {loaded ? `${filtered.length} ${PAGE_MODE.countWord}${filtered.length === 1 ? '' : 's'}` : 'Loading…'}
          </motion.span>
        </div>

        {error ? (
          <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
            <p className="text-3xl">🥕</p>
            <p className="mt-3 font-extrabold text-ink">Could not load products</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
        ) : (
          <>
            {/* Your last looks */}
            {recent.length >= 2 && (
              <section className="mt-8" aria-label="Your last looks">
                <h2 className="flex items-center gap-2 text-[1.05rem] font-extrabold text-forest"><History size={17} className="text-leaf" /> Your last looks</h2>
                <div className="rail-scroll -mx-4 px-4 mt-3 flex gap-4 overflow-x-auto pb-2">
                  {recent.map((p, i) => (
                    <div key={p.handle} className="w-[46%] sm:w-[30%] md:w-[22%] lg:w-[17%] shrink-0">
                      <ProductCard product={p} index={i} toast={toast} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Category pills */}
            <div className="rail-scroll sticky top-[64px] md:top-[68px] z-30 -mx-4 px-4 mt-6 py-2.5 flex gap-2 overflow-x-auto bg-cream/95 backdrop-blur border-b border-line/60">
              {['All', ...categories].map(cat => (
                <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 transition ${activeCategory === cat ? 'border-transparent bg-forest text-white shadow-mid' : 'border-line bg-white text-ink hover:border-leaf/50'}`}>
                  <img src={categoryImage(cat)} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover border border-white/60" />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-[0.78rem] font-extrabold">{cat}</span>
                    <span className={`text-[0.6rem] font-bold ${activeCategory === cat ? 'text-white/70' : 'text-muted'}`}>{countOf(cat)}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Filter bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[0.78rem] font-bold text-ink-2 select-none">
                <input type="checkbox" checked={offersOnly} onChange={e => setOffersOnly(e.target.checked)} className="peer sr-only" />
                <span className="relative h-5.5 w-10 rounded-full bg-line-2 transition peer-checked:bg-leaf after:absolute after:top-0.5 after:left-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:transition peer-checked:after:left-[21px]" />
                Offers only
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-muted" aria-hidden="true" />
                {([['featured', 'Featured'], ['price-asc', 'Price: low → high'], ['price-desc', 'Price: high → low'], ['name', 'A–Z']] as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setSort(key)}
                    className={`rounded-full px-3 py-1.5 text-[0.72rem] font-extrabold transition ${sort === key ? 'bg-mint text-leaf border border-leaf/30' : 'text-muted hover:text-ink'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid — no cap on the shop page: the whole market, every product */}
            {!loaded ? (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-white border border-line animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
                <p className="text-3xl">🧺</p>
                <p className="mt-3 font-extrabold text-ink">No products found</p>
                <p className="mt-1 text-sm text-muted">Try another vegetable, leaf, or combo — Tamil works too (<i>keerai</i>, <i>murungakkai</i>…)</p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {filtered.map((p, i) => <ProductCard key={p.handle} product={p} index={i} toast={toast} />)}
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
