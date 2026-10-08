"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface Toast { id: number; text: string; kind: "ok" | "error" }
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* Swiggy-style bottom toast — slides up from the bottom edge, out of the
          way of the content you're browsing */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 460, damping: 30 }}
              className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full px-5 py-3 text-[15px] font-semibold text-white shadow-mid ${
                t.kind === "error" ? "bg-destructive" : "bg-ink/95 backdrop-blur-md"
              }`}
            >
              {t.kind === "error" ? <AlertCircle size={17} className="shrink-0" /> : <CheckCircle2 size={17} className="shrink-0 text-leaf-2" />}
              <span className="truncate">{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
