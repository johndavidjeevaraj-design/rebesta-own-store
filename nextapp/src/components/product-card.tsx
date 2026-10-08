"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Product, money, setCartQty } from "@/lib/store";
import { useCartQty } from "@/lib/hooks";
import { useToast } from "./toaster";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const qty = useCartQty(product.handle);
  const toast = useToast();
  const soldOut = !product.stock || product.stock <= 0;
  const compareAt = product.compareAtInr && product.compareAtInr > product.priceInr ? product.compareAtInr : null;
  const offPct = compareAt ? Math.round((1 - product.priceInr / compareAt) * 100) : 0;
  const saveInr = compareAt ? compareAt - product.priceInr : 0;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const add = () => {
    setCartQty(product.handle, Math.min(99, qty + 1));
    if (!qty) toast(`${product.title} added to basket`);
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
                <span className="rounded-full bg-carrot px-2 py-0.5 text-[0.62rem] font-extrabold text-white shadow-[0_2px_8px_rgba(255,91,32,0.4)]">{offPct}% OFF</span>
              )}
              {product.featured && !offPct && !soldOut && (
                <span className="rounded-full bg-carrot/15 px-2 py-0.5 text-[0.62rem] font-extrabold text-[#c8400f] backdrop-blur-sm">Bestseller</span>
              )}
            </div>
            {soldOut && (
              <div className="absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[2px]">
                <span className="rounded-full bg-ink px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-white">
                  Sold out today
                </span>
              </div>
            )}
          </div>
        </a>

        <div className="flex flex-1 flex-col px-0.5 pt-3">
          <a href={`/products/${product.handle}`} className="block">
            <h3 className="line-clamp-2 min-h-[2.35em] text-[0.92rem] font-bold leading-snug tracking-tight text-ink">{product.title}</h3>
            <p className="mt-0.5 text-[0.75rem] font-semibold text-muted-foreground">{product.unitLabel}</p>
          </a>

          <div className="mt-auto pt-2.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[1.15rem] font-extrabold tracking-tight text-carrot">{money(product.priceInr)}</span>
              {compareAt && <span className="text-[0.78rem] font-semibold text-muted-foreground line-through">{money(compareAt)}</span>}
            </div>
            {saveInr > 0 && (
              <p className="mt-0.5 text-[0.68rem] font-bold text-[#c8400f]">Save {money(saveInr)}</p>
            )}
          </div>
        </div>

        <div className="mt-2.5 px-0.5 pb-0.5">
          {soldOut ? (
            <span className="block w-full cursor-not-allowed rounded-full border border-line bg-[#f5f5f7] py-2.5 text-center text-[0.8rem] font-bold text-muted-foreground">
              Sold out
            </span>
          ) : qty > 0 ? (
            <div className="flex h-10 items-center justify-between rounded-full border-[1.5px] border-leaf bg-mint px-1">
              <button
                type="button"
                onClick={step}
                aria-label={`Remove one ${product.title}`}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-leaf shadow-[0_1px_4px_rgba(0,0,0,0.12)] transition hover:scale-105 active:scale-90"
              >
                <Minus size={14} strokeWidth={3} />
              </button>
              <motion.span
                key={qty}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="flex items-baseline gap-1 text-[0.95rem] font-extrabold tabular-nums text-ink"
              >
                {qty}
                <span className="text-[0.62rem] font-bold uppercase tracking-wide text-leaf">in basket</span>
              </motion.span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  add();
                }}
                aria-label={`Add one more ${product.title}`}
                className="grid h-8 w-8 place-items-center rounded-full bg-leaf text-white shadow-[0_2px_6px_rgba(13,135,54,0.35)] transition hover:scale-105 active:scale-90"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.preventDefault();
                add();
              }}
              className="flex h-10 w-full items-center justify-center gap-1 rounded-full bg-carrot text-[0.85rem] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(214,62,10,0.30)] transition hover:bg-[#ff6a35]"
            >
              <Plus size={15} strokeWidth={3} /> Add
            </motion.button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
