import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { addToCart, money, Product, readCart, setCartQty } from '../shared/store';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CART_EVENT } from '../shared/store';

/* live per-card qty without re-rendering the world */
function useQty(handle: string) {
  const qty = useSyncExternalStore(
    cb => { window.addEventListener(CART_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(CART_EVENT, cb); window.removeEventListener('storage', cb); }; },
    () => readCart().find(l => l.handle === handle)?.qty || 0
  );
  return qty;
}

export default function ProductCard({ product, index = 0, toast }: { product: Product; index?: number; toast?: (t: string, k?: 'ok' | 'error') => void }) {
  const qty = useQty(product.handle);
  const [imgOk, setImgOk] = useState(true);
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.stock <= 10;
  const compare = Number(product.compareAtInr) > Number(product.priceInr) ? Number(product.compareAtInr) : 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '40px' }}
      transition={{ duration: 0.35, delay: Math.min(index % 10, 7) * 0.04, ease: 'easeOut' }}
      className="group relative flex flex-col rounded-2xl bg-white border border-line shadow-soft hover:shadow-mid hover:-translate-y-0.5 transition-shadow"
    >
      <a href={`/products/${encodeURIComponent(product.handle)}`} className="block relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-mint">
        {imgOk ? (
          <img src={product.image} alt={product.title} loading="lazy" onError={() => setImgOk(false)}
            className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-500" />
        ) : (
          <div className="h-full w-full grid place-items-center text-4xl">🥬</div>
        )}
        {compare > 0 && (
          <span className="absolute top-2 left-2 rounded-full bg-carrot px-2 py-0.5 text-[0.62rem] font-extrabold text-white">
            {Math.round((1 - Number(product.priceInr) / compare) * 100)}% OFF
          </span>
        )}
        {soldOut && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-extrabold text-ink">Sold out today</span>}
      </a>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <a href={`/products/${encodeURIComponent(product.handle)}`} className="text-[0.88rem] font-bold leading-snug text-ink hover:text-leaf line-clamp-2">{product.title}</a>
        <p className="text-[0.7rem] font-semibold text-muted">{product.unitLabel}{low && <span className="text-carrot"> · only {product.stock} left</span>}</p>
        <div className="mt-auto flex items-end justify-between pt-1.5">
          <div>
            <span className="text-[0.95rem] font-extrabold text-forest">{money(product.priceInr)}</span>
            {compare > 0 && <span className="ml-1.5 text-[0.72rem] font-semibold text-muted line-through">{money(compare)}</span>}
          </div>
          {soldOut ? (
            <span className="rounded-xl bg-line/60 px-3 py-2 text-[0.72rem] font-extrabold text-muted">ADD</span>
          ) : qty === 0 ? (
            <button type="button" onClick={() => { addToCart(product.handle, 1); toast?.(`${product.title.split(' (')[0]} added 🌿`); }}
              className="rounded-xl bg-gradient-to-br from-leaf to-[#0a6b2b] px-4 py-2 text-[0.72rem] font-extrabold tracking-wide text-white shadow-[0_6px_16px_rgba(13,135,54,0.35)] hover:brightness-110 active:scale-95 transition">
              ADD
            </button>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl bg-gradient-to-br from-leaf to-[#0a6b2b] px-1.5 py-1.5 text-white">
              <button type="button" onClick={() => setCartQty(product.handle, qty - 1)} aria-label="Remove one" className="grid place-items-center w-6 h-6 rounded-lg hover:bg-white/20 active:scale-90 transition"><Minus size={13} /></button>
              <span className="min-w-4 text-center text-[0.85rem] font-extrabold">{qty}</span>
              <button type="button" onClick={() => setCartQty(product.handle, qty + 1)} aria-label="Add one" className="grid place-items-center w-6 h-6 rounded-lg hover:bg-white/20 active:scale-90 transition"><Plus size={13} /></button>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
