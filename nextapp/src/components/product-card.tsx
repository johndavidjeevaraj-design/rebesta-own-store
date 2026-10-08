"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Product, money, setCartQty } from "@/lib/store";
import { useCartQty } from "@/lib/hooks";
import { useToast } from "./toaster";

/* fly-to-basket: a little photo of the veg flies from the card into the
   header basket icon — the classic delightful "it's in my basket" moment */
function flyToBasket(imgUrl: string, fromEl: HTMLElement | null) {
  if (typeof document === "undefined" || !fromEl) return;
  const cart = document.querySelector('a[href="/cart"]');
  if (!cart) return;
  const f = fromEl.getBoundingClientRect();
  const t = cart.getBoundingClientRect();
  if (!f.width || !t.width) return;
  const dot = document.createElement("img");
  dot.src = imgUrl;
  dot.alt = "";
  dot.style.cssText = `position:fixed;left:${f.left + f.width / 2 - 19}px;top:${f.top + f.height / 2 - 19}px;width:38px;height:38px;border-radius:9999px;object-fit:cover;z-index:9999;pointer-events:none;box-shadow:0 10px 24px rgba(0,0,0,0.28);transition:all .65s cubic-bezier(.22,1,.36,1);`;
  document.body.appendChild(dot);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dot.style.left = `${t.left + t.width / 2 - 9}px`;
      dot.style.top = `${t.top + t.height / 2 - 9}px`;
      dot.style.width = "18px";
      dot.style.height = "18px";
      dot.style.opacity = "0.35";
    });
  });
  setTimeout(() => dot.remove(), 720);
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const qty = useCartQty(product.handle);
  const toast = useToast();
  const soldOut = !product.stock || product.stock <= 0;
  const compareAt = product.compareAtInr && product.compareAtInr > product.priceInr ? product.compareAtInr : null;
  const offPct = compareAt ? Math.round((1 - product.priceInr / compareAt) * 100) : 0;
  const saveInr = compareAt ? compareAt - product.priceInr : 0;
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const add = () => {
    setCartQty(product.handle, Math.min(99, qty + 1));
    if (!qty) {
      toast(`${product.title} added to basket`);
      flyToBasket(product.image, btnRef.current);
    }
  };
  const step = (e: React.MouseEvent) => {
    e.preventDefault();
    setCartQty(product.handle, qty - 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5 }}
      className="h-full"
    >
      <Card
        className={`group relative flex h-full flex-col gap-0 rounded-[20px] border border-line bg-white p-3 shadow-[0_1px_5px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_14px_32px_rgba(0,0,0,0.10)] ${
          soldOut ? "opacity-75" : ""
        }`}
      >
        <a href={`/products/${product.handle}`} className="block">
          <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[#f5f5f7]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.07] ${soldOut ? "grayscale" : ""}`}
            />
            <div className="absolute left-2 top-2 flex flex-col gap-1">
              {offPct > 0 && !soldOut && (
                <span className="carrot-grad rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-[0_2px_8px_rgba(232,71,12,0.4)]">{offPct}% OFF</span>
              )}
              {product.featured && !offPct && !soldOut && (
                <span className="rounded-full bg-carrot/15 px-2 py-0.5 text-[10px] font-extrabold text-[#c8400f] backdrop-blur-sm">Bestseller</span>
              )}
            </div>
            {soldOut && (
              <div className="absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[2px]">
                <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Sold out today
                </span>
              </div>
            )}
          </div>
        </a>

        <div className="flex flex-1 flex-col px-0.5 pt-3">
          <a href={`/products/${product.handle}`} className="block">
            <h3 className="line-clamp-2 min-h-[2.35em] text-[14px] font-bold leading-snug tracking-tight text-ink">{product.title}</h3>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{product.unitLabel}</p>
          </a>

          <div className="mt-auto pt-2.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[15px] font-bold tracking-tight text-ink">{money(product.priceInr)}</span>
              {compareAt && <span className="text-[13px] font-semibold text-muted-foreground line-through">{money(compareAt)}</span>}
            </div>
            {saveInr > 0 && (
              <p className="mt-0.5 text-[11px] font-bold text-[#c8400f]">Save {money(saveInr)}</p>
            )}
          </div>
        </div>

        {/* add / stepper — one shape that morphs, never jumps */}
        <div className="mt-2.5 px-0.5 pb-0.5">
          {soldOut ? (
            <span className="block w-full cursor-not-allowed rounded-full border border-line bg-[#f5f5f7] py-2.5 text-center text-[13px] font-bold text-muted-foreground">
              Sold out
            </span>
          ) : (
            <div className="relative h-10">
              <AnimatePresence initial={false} mode="popLayout">
                {qty > 0 ? (
                  <motion.div
                    key="stepper"
                    layout
                    initial={{ opacity: 0, scale: 0.86 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.86 }}
                    transition={{ type: "spring", stiffness: 520, damping: 32 }}
                    className="carrot-grad absolute inset-0 flex items-center justify-between rounded-full px-1 text-white shadow-[0_6px_16px_rgba(232,71,12,0.35)]"
                  >
                    <button
                      type="button"
                      onClick={step}
                      aria-label={`Remove one ${product.title}`}
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/25 transition hover:bg-white/40 active:scale-90"
                    >
                      <Minus size={14} strokeWidth={3} />
                    </button>
                    <motion.span
                      key={qty}
                      initial={{ scale: 1.4 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 600, damping: 20 }}
                      className="flex items-baseline gap-1 whitespace-nowrap text-[15px] font-extrabold tabular-nums"
                    >
                      {qty}
                      <span className="hidden text-[10px] font-bold uppercase tracking-wider text-white/85 min-[420px]:inline">in basket</span>
                    </motion.span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        add();
                      }}
                      aria-label={`Add one more ${product.title}`}
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/25 transition hover:bg-white/40 active:scale-90"
                    >
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="add"
                    ref={btnRef}
                    layout
                    type="button"
                    initial={{ opacity: 0, scale: 0.86 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.86, rotate: -2 }}
                    whileTap={{ scale: 0.93 }}
                    transition={{ type: "spring", stiffness: 520, damping: 32 }}
                    onClick={(e) => {
                      e.preventDefault();
                      add();
                    }}
                    className="carrot-grad absolute inset-0 flex items-center justify-center gap-1 rounded-full text-[12px] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_16px_rgba(232,71,12,0.35)]"
                  >
                    <Plus size={15} strokeWidth={3} /> Add
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
