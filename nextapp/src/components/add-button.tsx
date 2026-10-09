"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { Product, setCartQty } from "@/lib/store";
import { useCartQty } from "@/lib/hooks";
import { useToast } from "./toaster";

/* fly-to-basket: a little photo of the veg flies into the header basket */
export function flyToBasket(imgUrl: string, fromEl: HTMLElement | null) {
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

/* the fresh-grad Add pill that morphs into a qty stepper — the single
   add-to-basket control shared by the hero stage (same behaviour as the
   shop cards: one shape that morphs, never jumps) */
export function AddButton({ product, className = "" }: { product: Product; className?: string }) {
  const qty = useCartQty(product.handle);
  const toast = useToast();
  const soldOut = !product.stock || product.stock <= 0;
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const add = () => {
    setCartQty(product.handle, Math.min(99, qty + 1));
    if (!qty) {
      toast(`${product.title} added to basket`);
      flyToBasket(product.image, btnRef.current);
    }
  };

  if (soldOut) {
    return (
      <span className={`block w-full cursor-not-allowed rounded-full border border-line bg-[#f5f5f7] py-2.5 text-center text-[13px] font-bold text-muted-foreground ${className}`}>
        Sold out
      </span>
    );
  }

  return (
    <div className={`relative h-10 ${className}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {qty > 0 ? (
          <motion.div
            key="stepper"
            layout
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.86 }}
            transition={{ type: "spring", stiffness: 520, damping: 32 }}
            className="fresh-grad absolute inset-0 flex items-center justify-between rounded-full px-1 text-white shadow-[0_6px_16px_rgba(11,124,49,0.35)]"
          >
            <button
              type="button"
              onClick={() => setCartQty(product.handle, qty - 1)}
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
              className="flex items-baseline gap-1 whitespace-nowrap text-[15px] font-bold tabular-nums"
            >
              {qty}
              <span className="hidden text-[10px] font-bold uppercase tracking-wider text-white/85 min-[420px]:inline">in basket</span>
            </motion.span>
            <button
              type="button"
              onClick={add}
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
            onClick={add}
            className="fresh-grad absolute inset-0 flex items-center justify-center gap-1 rounded-full text-[12px] font-bold uppercase tracking-wide text-white shadow-[0_6px_16px_rgba(11,124,49,0.35)]"
          >
            <Plus size={15} strokeWidth={3} /> Add
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
