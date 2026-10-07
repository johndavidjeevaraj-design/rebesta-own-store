import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BadgePercent, Package, Sparkles, Truck, IndianRupee, Leaf, ShieldCheck } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ProductCard from '../components/ProductCard';
import { useToast } from '../components/Toaster';
import { api, money, Product, Settings } from '../shared/store';
import { matchesQuery } from '../shared/tamil';

const ESSENTIALS = ['tomato', 'onion-big', 'potato', 'carrot-ooty', 'green-chilli', 'coriander-leaves', 'garlic', 'small-onion-shallot'];

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name';

export default function Home() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState<SortKey>('featured');
  const [offersOnly, setOffersOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api('/api/products').then(d => setProducts(d.products || [])).catch(() => toast('Could not load products', 'error'));
    api('/api/settings').then(setSettings).catch(() => {});
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.category)))], [products]);
  const live = products.filter(p => p.active !== false);

  const filtered = useMemo(() => {
    const q = search.trim();
    let rows = live.filter(p =>
      (category === 'All' || p.category === category) &&
      (!offersOnly || Number(p.compareAtInr) > Number(p.priceInr)) &&
      matchesQuery(p, q)
    );
    if (sort === 'price-asc') rows = [...rows].sort((a, b) => a.priceInr - b.priceInr);
    else if (sort === 'price-desc') rows = [...rows].sort((a, b) => b.priceInr - a.priceInr);
    else if (sort === 'name') rows = [...rows].sort((a, b) => a.title.localeCompare(b.title));
    else rows = [...rows].sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0));
    return rows;
  }, [live, category, offersOnly, search, sort]);

  const shelves = useMemo(() => {
    const greens = live.filter(p => p.category === 'Leafy Greens');
    const boxes = live.filter(p => ['Veg boxes', 'Combos & Kits'].includes(p.category));
    const offers = live.filter(p => Number(p.compareAtInr) > Number(p.priceInr)).sort((a, b) => (Number(b.compareAtInr) - b.priceInr) - (Number(a.compareAtInr) - a.priceInr));
    const essentials = ESSENTIALS.map(h => live.find(p => p.handle === h)).filter(Boolean) as Product[];
    return [
      { key: 'greens', title: 'Greens, picked this morning', link: '/shop', items: greens.slice(0, 10), total: greens.length, icon: Leaf, tint: 'text-leaf bg-mint' },
      { key: 'essentials', title: 'Everyday kitchen staples', link: '/shop', items: essentials.slice(0, 8), total: essentials.length, icon: Package, tint: 'text-leaf bg-mint' },
      { key: 'boxes', title: 'Weekly veg boxes', link: '/shop', items: boxes.slice(0, 5), total: boxes.length, icon: Sparkles, tint: 'text-leaf bg-mint' },
      { key: 'offers', title: 'Today’s offers', link: '/shop', items: offers.slice(0, 8), total: offers.length, icon: BadgePercent, tint: 'text-carrot bg-carrot/10' }
    ].filter(s => s.items.length > 0);
  }, [live]);

  const featuredPick = live.find(p => p.stock > 0 && p.featured) || live.find(p => p.stock > 0);
  const minis = live.filter(p => p.stock > 0 && p.handle !== featuredPick?.handle).slice(0, 2);
  const content = settings.content || {};
  const delivery = settings.delivery || {};

  return (
    <div className="min-h-screen">
      <Header search={search} onSearch={setSearch} />

      {/* HERO */}
      <section className="hero-mesh text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16 grid gap-10 md:grid-cols-[1.1fr_0.9fr] items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-leaf-2/40 bg-leaf-2/15 px-3 py-1 text-[0.7rem] font-extrabold tracking-wide text-gold">
              <Sparkles size={13} /> {content.homeBadge || 'Fresh stock opens daily'}
            </span>
            <h1 className="mt-4 font-display text-4xl md:text-5xl font-extrabold leading-[1.06] tracking-tight">
              {content.homeTitle || 'Fresh vegetables in Hosur'}
            </h1>
            <p className="mt-3 text-base md:text-lg text-white/75 max-w-md">
              {content.homeSubtitle || 'Fresh vegetables. Exact pin. Morning delivery.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <a href="#browse" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-leaf-2 to-leaf px-5 py-3 text-sm font-extrabold shadow-[0_10px_28px_rgba(15,170,70,0.4)] hover:brightness-110 active:scale-[0.98] transition">
                Shop fresh now <ArrowRight size={16} />
              </a>
              <a href="#delivery" className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-extrabold hover:bg-white/20 transition">
                {content.deliveryNoteButton || 'Check my pin'}
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-2 text-[0.72rem] font-bold text-white/80">
              <span className="rounded-full bg-white/10 px-3 py-1.5 border border-white/10"><b className="text-white">₹{Number(delivery.freeOverInr || 500).toLocaleString('en-IN')}+</b> free delivery</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 border border-white/10"><b className="text-white">{delivery.maxRoadKm || 9} km</b> road-route service</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 border border-white/10"><b className="text-white">{live.length}</b> live products</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 border border-white/10"><b className="text-white">COD</b> &amp; UPI available</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55, delay: 0.15, ease: 'easeOut' }} className="relative">
            {featuredPick && (
              <a href={`/products/${encodeURIComponent(featuredPick.handle)}`}
                className="block rounded-3xl bg-white p-4 shadow-mid hover:-translate-y-1 transition-transform">
                <span className="inline-block rounded-full bg-carrot px-2.5 py-0.5 text-[0.62rem] font-extrabold text-white">Fresh pick</span>
                <img src={featuredPick.image} alt={featuredPick.title} className="mt-2 aspect-[5/3] w-full rounded-2xl object-cover" />
                <div className="mt-3">
                  <span className="rounded-full bg-mint px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-leaf">{featuredPick.category}</span>
                  <h3 className="mt-1.5 text-[1.02rem] font-extrabold leading-snug text-ink">{featuredPick.title}</h3>
                  <span className="text-sm font-extrabold text-forest">{money(featuredPick.priceInr)} <span className="text-muted font-semibold">/ {featuredPick.unitLabel}</span></span>
                </div>
              </a>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {minis.map(p => (
                <a key={p.handle} href={`/products/${encodeURIComponent(p.handle)}`} className="rounded-2xl bg-white/95 p-2.5 shadow-soft hover:-translate-y-0.5 transition-transform">
                  <img src={p.image} alt={p.title} className="aspect-square w-full rounded-xl object-cover" />
                  <h4 className="mt-1.5 text-[0.78rem] font-bold text-ink truncate">{p.title}</h4>
                  <span className="text-[0.78rem] font-extrabold text-forest">{money(p.priceInr)}</span>
                </a>
              ))}
            </div>
            <p className="mt-3 text-center text-[0.68rem] font-semibold text-white/55">Live stock from today's catalogue</p>
          </motion.div>
        </div>
      </section>

      {/* SHELVES */}
      <section className="mx-auto max-w-6xl px-4 pt-12 space-y-12" aria-label="Shop fresh vegetables">
        {shelves.map(shelf => (
          <div key={shelf.key}>
            <div className="flex items-end justify-between gap-3 mb-4">
              <h2 className="flex items-center gap-2.5 font-display text-xl md:text-2xl font-extrabold text-forest">
                <span className={`grid place-items-center w-9 h-9 rounded-xl ${shelf.tint}`}><shelf.icon size={18} /></span>
                {shelf.title} <span className="text-sm font-bold text-muted">({shelf.total})</span>
              </h2>
              <a href={shelf.link} className="inline-flex items-center gap-1 text-[0.8rem] font-extrabold text-leaf hover:gap-2 transition-all">View all <ArrowRight size={14} /></a>
            </div>
            <div className="rail-scroll -mx-4 px-4 flex gap-4 overflow-x-auto pb-2">
              {shelf.items.map((p, i) => (
                <div key={p.handle} className="w-[46%] sm:w-[30%] md:w-[22%] lg:w-[17%] shrink-0">
                  <ProductCard product={p} index={i} toast={toast} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* WHOLE MARKET GRID */}
      <section id="browse" className="mx-auto max-w-6xl px-4 pt-14 scroll-mt-20">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl md:text-2xl font-extrabold text-forest">The whole market</h2>
          <p className="text-[0.78rem] font-bold text-muted">{filtered.length} product{filtered.length === 1 ? '' : 's'}</p>
        </div>

        <div className="rail-scroll mt-4 -mx-4 px-4 flex gap-2 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button key={cat} type="button" onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[0.78rem] font-extrabold transition ${category === cat ? 'border-transparent bg-forest text-white' : 'border-line bg-white text-ink-2 hover:border-leaf/50'}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[0.78rem] font-bold text-ink-2 select-none">
            <input type="checkbox" checked={offersOnly} onChange={e => setOffersOnly(e.target.checked)} className="peer sr-only" />
            <span className="relative h-5.5 w-10 rounded-full bg-line-2 transition peer-checked:bg-leaf after:absolute after:top-0.5 after:left-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:transition peer-checked:after:left-[21px]" />
            Offers only
          </label>
          <div className="flex flex-wrap gap-1.5">
            {([['featured', 'Featured'], ['price-asc', 'Price: low → high'], ['price-desc', 'Price: high → low'], ['name', 'A–Z']] as [SortKey, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setSort(key)}
                className={`rounded-full px-3 py-1.5 text-[0.72rem] font-extrabold transition ${sort === key ? 'bg-mint text-leaf border border-leaf/30' : 'text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-16 text-center">
            <p className="text-3xl">🧺</p>
            <p className="mt-3 font-extrabold text-ink">Nothing matches "{search}"</p>
            <p className="mt-1 text-sm text-muted">Try a Tamil name — like <i>keerai</i>, <i>murungakkai</i> or <i>avarakkai</i></p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(showAll ? filtered : filtered.slice(0, 15)).map((p, i) => <ProductCard key={p.handle} product={p} index={i} toast={toast} />)}
          </div>
        )}
        {!showAll && filtered.length > 15 && (
          <button type="button" onClick={() => setShowAll(true)}
            className="mx-auto mt-7 block rounded-2xl bg-gradient-to-br from-carrot to-[#d8431f] px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(255,91,32,0.35)] hover:brightness-110 transition">
            Show all {filtered.length} products
          </button>
        )}

        {/* delivery note */}
        <div id="delivery" className="mt-12 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between rounded-3xl bg-forest-2 p-6 text-white">
            <div className="flex items-start gap-3.5">
              <span className="grid place-items-center w-11 h-11 shrink-0 rounded-2xl bg-white/10"><Truck size={19} className="text-leaf-2" /></span>
              <div>
                <strong className="block text-[1rem] font-extrabold">{content.deliveryNoteTitle || 'Delivery by real road distance'}</strong>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-white/70">{content.deliveryNoteText || 'Choose GPS or map pin at checkout. We confirm the rider route before the slot.'}</p>
              </div>
            </div>
            <a href="/cart" className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-forest hover:bg-mint transition">
              {content.deliveryNoteButton || 'Check my pin'} <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="mx-auto max-w-6xl px-4 pt-16" aria-label="Why Rebesta Fresh">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: IndianRupee, title: 'Fair, honest pricing', text: 'Live market prices daily. No surge, no hidden fees — what you see is what you pay.' },
            { icon: ShieldCheck, title: 'Farm-fresh quality', text: 'Picked this morning, packed by hand, at your door before breakfast. Not warehouse-fresh.' },
            { icon: Truck, title: 'Exact-pin delivery', text: 'Real road distance pricing across 9 km of Hosur — with free delivery over ₹500.' }
          ].map((item, i) => (
            <motion.div key={item.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-3xl border border-line bg-white p-6 shadow-soft">
              <span className="grid place-items-center w-11 h-11 rounded-2xl bg-mint text-leaf"><item.icon size={19} /></span>
              <h3 className="mt-4 text-[1rem] font-extrabold text-forest">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2/80">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
