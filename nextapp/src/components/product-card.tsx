"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { Minus, Plus, ShoppingBasket } from "lucide-react";
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
      whileHover={{ y: -6 }}
      className="h-full"
    >
      <Card
        className={`group relative h-full gap-0 overflow-hidden rounded-[24px] border-transparent bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.09)] ${
          soldOut ? "opacity-70" : ""
        }`}
      >
        <a href={`/products/${product.handle}`} className="block">
          <div className="relative aspect-square overflow-hidden rounded-[18px] bg-[#f5f5f7]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05] ${soldOut ? "grayscale" : ""}`}
            />
            <div className="absolute left-2 top-2 flex flex-col gap-1">
              {offPct > 0 && !soldOut && (
                <span className="rounded-full bg-carrot px-2 py-0.5 text-[0.62rem] font-bold text-white">{offPct}% OFF</span>
              )}
              {product.featured && !offPct && !soldOut && (
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-[0.62rem] font-bold text-ink backdrop-blur">Bestseller</span>
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

          <div className="px-1 pb-1 pt-3">
            <h3 className="truncate text-[0.95rem] font-bold leading-tight tracking-tight text-ink">{product.title}</h3>
            <p className="mt-0.5 text-[0.74rem] font-medium text-muted-foreground">{product.unitLabel}</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[1.05rem] font-extrabold tracking-tight text-ink">{money(product.priceInr)}</span>
              {compareAt && <span className="text-[0.78rem] font-medium text-muted-foreground line-through">{money(compareAt)}</span>}
            </div>
          </div>
        </a>

        <div className="mt-2.5 px-1 pb-1">
          {soldOut ? (
            <span className="block w-full cursor-not-allowed rounded-full border border-border bg-cream py-2 text-center text-[0.78rem] font-extrabold text-muted-foreground">
              Sold out
            </span>
          ) : qty > 0 ? (
            <div className="flex h-10 items-center justify-between rounded-full bg-leaf text-white shadow-inner">
              <button
                type="button"
                onClick={step}
                aria-label={`Remove one ${product.title}`}
                className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15 active:scale-90"
              >
                <Minus size={15} />
              </button>
              <motion.span key={qty} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="text-[0.9rem] font-extrabold tabular-nums">
                {qty} in basket
              </motion.span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  add();
                }}
                aria-label={`Add one more ${product.title}`}
                className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/15 active:scale-90"
              >
                <Plus size={15} />
              </button>
            </div>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={(e) => {
                e.preventDefault();
                add();
              }}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-leaf text-[0.8rem] font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,0.10)] transition hover:brightness-110"
            >
              <ShoppingBasket size={14} /> Add
            </motion.button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
