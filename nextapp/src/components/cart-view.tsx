"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Home, Lock, MapPin, Plus, ReceiptText, Tag, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LocationSheet } from "@/components/location-sheet";
import { useToast } from "@/components/toaster";
import { useCartLines, useSavedLocation } from "@/lib/hooks";
import { addToCart, api, money, Product, saveCart, setCartQty } from "@/lib/store";

/* ================= keys + constants (identical to the old checkout) ================= */
const ADDR_KEY = "rebesta_checkout_addr_v1";
const TIP_KEY = "rebesta_checkout_tip_v1";
const COUPON_KEY = "rebesta_checkout_coupon_v1";
const NOTES_KEY = "rebesta_checkout_notes_v1";
const TIP_CHOICES = [0, 10, 20, 30];
const ADDON_RE = /coriander|curry|chilli|garlic|ginger|lemon|coconut|mint|amaranth|keerai|keera/i;
const ADD_TABS = [
  { id: "popular", label: "Popular", pick: (list: Product[]) => list.filter((p) => p.featured) },
  { id: "greens", label: "Greens", pick: (list: Product[]) => list.filter((p) => p.category === "Leafy Greens") },
  { id: "combos", label: "Combos", pick: (list: Product[]) => list.filter((p) => p.category === "Combos & Kits") },
  { id: "addons", label: "Add-ons", pick: (list: Product[]) => list.filter((p) => ADDON_RE.test(p.title) && p.category !== "Combos & Kits") },
];
const PM_LABELS: Record<string, string> = { gpay: "Google Pay", phonepe: "PhonePe", paytm: "Paytm UPI", upi: "UPI · Card", cod: "Cash on Delivery" };

interface Coupon {
  code: string;
  discountInr: number;
  minOrderInr?: number;
  type: string;
  value: number;
}
interface QuoteSlot {
  id: string;
  full: boolean;
}
interface Quote {
  eligible: boolean;
  deliveryFeeInr?: number;
  freeApplied?: boolean;
  distanceKm?: number;
  message?: string;
  slots?: QuoteSlot[];
}
interface Customer {
  name?: string;
  phone?: string;
  email?: string;
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}
function removePref(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

/* ================= Cashfree hosted checkout (JS SDK, loaded on demand) ================= */
function loadCashfreeSdk(): Promise<void> {
  if ((window as any).Cashfree) return Promise.resolve();
  const urls = ["https://sdk.cashfree.com/js/v3/cashfree.js", "https://js.cashfree.com/cashfree-js.js", "https://js.cashfree.com/v2/cashfree.js"];
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) return reject(new Error("Could not load the payment page (script blocked). Check your network and try again."));
      const script = document.createElement("script");
      script.src = urls[i++];
      script.onload = () => ((window as any).Cashfree ? resolve() : tryNext());
      script.onerror = tryNext;
      document.head.appendChild(script);
    };
    tryNext();
  });
}
async function startCashfreeCheckout(payment: { sessionId: string; mode?: string }) {
  await loadCashfreeSdk();
  const mode = payment.mode === "live" ? "production" : "sandbox";
  const Cashfree = (window as any).Cashfree;
  const cashfree = typeof Cashfree === "function" ? Cashfree({ mode }) : await Cashfree.load({ mode });
  cashfree.checkout({ paymentSessionId: payment.sessionId, redirectTarget: "_self" });
}

/* ================= bottom sheet (motion + portal) ================= */
function PortalSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-cream p-5 pb-8 shadow-mid"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line-2" aria-hidden="true" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-muted-foreground transition hover:text-ink"
            >
              <X size={16} />
            </button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ================= page ================= */
export function CartView() {
  const toast = useToast();

  const lines = useCartLines();
  const loc = useSavedLocation();

  const [products, setProducts] = useState<Product[]>([]);
  const byHandle = useMemo(() => new Map(products.map((p) => [p.handle, p])), [products]);
  const [me, setMe] = useState<Customer | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [tip, setTip] = useState(0);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [addTab, setAddTab] = useState("popular");
  const [seg, setSeg] = useState<"delivery" | "tip" | "instructions">("delivery");
  const [payApp, setPayApp] = useState("cod");
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const meRef = useRef<Customer | null>(null);
  const [addrEditOpen, setAddrEditOpen] = useState(false);
  const [couponMoreOpen, setCouponMoreOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(true);
  const [addr1, setAddr1] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payLabel, setPayLabel] = useState("Pay ₹0");
  const [lastOrder, setLastOrder] = useState<{ items: { handle: string; qty: number }[]; at: number } | null>(null);
  const [locSheetOpen, setLocSheetOpen] = useState(false);

  const authFormRef = useRef<HTMLFormElement>(null);
  const authBound = useRef(false);
  const afterLoginRef = useRef<(() => void) | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otpSdkLoaded = useRef(false);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = useMemo(() => {
    let sum = 0;
    for (const item of lines) {
      const p = byHandle.get(item.handle);
      if (p) sum += p.priceInr * item.qty;
    }
    return sum;
  }, [lines, byHandle]);
  const savings = (coupon ? Number(coupon.discountInr || 0) : 0) + (quote?.freeApplied ? Number(quote.deliveryFeeInr || 0) : 0);
  const eligible = Boolean(quote?.eligible);
  const fee = eligible ? Number(quote?.deliveryFeeInr || 0) : null;
  const total = Math.max(0, Math.round(subtotal + (fee || 0) + tip - (coupon ? Number(coupon.discountInr || 0) : 0)));

  /* ---------- init ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [productsData, meData] = await Promise.all([api("/api/products"), api("/api/auth/me").catch(() => null)]);
        setProducts(productsData.products || []);
        setMe(meData?.customer || null);
        try {
          setOnlineEnabled(Boolean((await api("/api/settings"))?.payments?.onlineEnabled));
        } catch {
          /* settings optional */
        }
        try {
          setCoupons((await api("/api/coupon/list")).coupons || []);
        } catch {
          setCoupons([]);
        }
        try {
          setLastOrder(JSON.parse(localStorage.getItem("rebesta_last_order") || "null"));
        } catch {
          setLastOrder(null);
        }
        const savedAddr = readPref<{ line1?: string; pincode?: string } | null>(ADDR_KEY, null);
        if (savedAddr?.line1) setAddr1(String(savedAddr.line1).slice(0, 120));
        if (savedAddr?.pincode) setPin(String(savedAddr.pincode).slice(0, 6));
        setTip(Math.min(100, Math.max(0, Number(readPref(TIP_KEY, 0)) || 0)));
        setNotes(String(readPref(NOTES_KEY, "") || "").slice(0, 250));
      } catch (e: any) {
        toast(e?.message || "Could not load your basket", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onlineEnabled) setPayApp("upi");
  }, [onlineEnabled]);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    setPayLabel(`Pay ${money(total)}`);
  }, [total]);

  /* auto-open location sheet (same feel as the rest of the site) */
  useEffect(() => {
    if (products.length && !loc) {
      const t = setTimeout(() => setLocSheetOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, [products.length, loc]);

  /* saved coupon re-apply */
  useEffect(() => {
    const saved = readPref<{ code?: string } | null>(COUPON_KEY, null);
    if (saved?.code) applyCoupon(saved.code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  /* ---------- quote (debounced on cart / pin / location) ---------- */
  async function refreshQuote(): Promise<Quote | null> {
    if (!lines.length) {
      setQuote(null);
      return null;
    }
    const saved = (loc || null) as any;
    try {
      const data = await api("/api/quote", {
        method: "POST",
        body: JSON.stringify({
          items: lines,
          location: Number.isFinite(saved?.lat) ? { lat: saved.lat, lng: saved.lng } : {},
          address: { pincode: /^\d{6}$/.test(pin) ? pin : "" },
        }),
      });
      setQuote(data.quote || null);
      const q: Quote | null = data.quote || null;
      if (coupon && subtotal < Number(coupon.minOrderInr || 0)) {
        toast(`Coupon ${coupon.code} removed — basket is below ${money(Number(coupon.minOrderInr || 0))}`, "error");
        removeCoupon();
      }
      return q;
    } catch {
      setQuote(null);
      return null;
    }
  }
  function scheduleQuote() {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(refreshQuote, 280);
  }
  useEffect(() => {
    scheduleQuote();
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, pin, loc]);

  /* ---------- coupons ---------- */
  async function applyCoupon(code: string, quiet = false) {
    code = String(code || "").trim().toUpperCase();
    if (!code) return;
    if (!quiet) setCouponMsg({ text: "Checking…", error: false });
    try {
      const data = await api("/api/coupon/check", { method: "POST", body: JSON.stringify({ code, subtotalInr: subtotal }) });
      setCoupon(data.coupon);
      writePref(COUPON_KEY, { code: data.coupon.code });
      if (!quiet) toast(`Coupon ${data.coupon.code} applied — you save ${money(data.coupon.discountInr)} 🎉`);
      setCouponMsg(null);
    } catch (error: any) {
      if (!quiet) setCouponMsg({ text: error?.message || "That coupon is not valid", error: true });
      if (quiet) {
        setCoupon(null);
        removePref(COUPON_KEY);
      }
    }
  }
  function removeCoupon() {
    setCoupon(null);
    removePref(COUPON_KEY);
  }

  /* ---------- notes debounce ---------- */
  function onNotesChange(value: string) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => writePref(NOTES_KEY, value), 350);
  }

  /* ---------- payment method ---------- */
  function selectPayApp(app: string) {
    if (app !== "cod" && !onlineEnabled) {
      toast("Online payment setup is almost ready — please use Cash on Delivery today", "error");
      return;
    }
    setPayApp(app);
    setPmOpen(false);
  }

  /* ---------- login sheet: reuse the battle-tested /js/auth.js flow ---------- */
  function loadOtpSdk() {
    if (otpSdkLoaded.current || (window as any).initSendOTP) return;
    otpSdkLoaded.current = true;
    const config = {
      widgetId: "366a65687644323637363131",
      tokenAuth: "571380TgZrH8gvzsiK6aa8dedbP1",
      exposeMethods: true,
      captchaRenderId: "bp-captcha",
      success: (data: unknown) => {
        (window as any).__otpWidgetSuccess = data;
      },
      failure: (error: unknown) => {
        (window as any).__otpWidgetFailure = error;
      },
    };
    const urls = ["https://verify.msg91.com/otp-provider.js", "https://verify.phone91.com/otp-provider.js"];
    let i = 0;
    (function attempt() {
      const s = document.createElement("script");
      s.src = urls[i];
      s.async = true;
      s.dataset.otpSdk = "1";
      s.onload = () => {
        if (typeof (window as any).initSendOTP === "function") {
          try {
            (window as any).initSendOTP(config);
          } catch (e) {
            (window as any).__otpWidgetFailure = e;
          }
        }
      };
      s.onerror = () => {
        i += 1;
        if (i < urls.length) attempt();
      };
      document.head.appendChild(s);
    })();
  }
  function openAuthSheet(afterLogin?: () => void) {
    afterLoginRef.current = afterLogin || null;
    setAuthOpen(true);
    loadOtpSdk();
    const s = document.createElement("script");
    s.src = "/js/auth.js?v=20261008a";
    s.async = true;
    s.onload = () => {
      const RFSAuth = (window as any).RFSAuth;
      if (!RFSAuth || authBound.current || !authFormRef.current) return;
      authBound.current = true;
      RFSAuth.bindFlow(authFormRef.current, {
        onSuccess: async () => {
          let fresh: Customer | null = null;
          try {
            fresh = (await api("/api/auth/me")).customer || null;
          } catch {
            fresh = null;
          }
          setMe(fresh);
          meRef.current = fresh;
          setAuthOpen(false);
          toast(`Welcome, ${(fresh?.name || "friend").split(" ")[0]}! 🌿`);
          const next = afterLoginRef.current;
          afterLoginRef.current = null;
          if (typeof next === "function") next();
        },
      });
    };
    document.head.appendChild(s);
  }

  /* ---------- place order ---------- */
  async function placeOrder() {
    if (addr1.trim().length < 5) {
      setAddrEditOpen(true);
      toast("Enter your house / flat / street address", "error");
      document.getElementById("bpAddr1")?.focus();
      return;
    }
    if (!/^\d{6}$/.test(pin.trim())) {
      setAddrEditOpen(true);
      toast("Enter a 6-digit pincode", "error");
      document.getElementById("bpPin")?.focus();
      return;
    }
    const saved = loc as any;
    if (!saved) {
      toast("Pick your delivery area first", "error");
      setLocSheetOpen(true);
      return;
    }
    let currentQuote = quote || (await refreshQuote());
    if (!currentQuote?.eligible) {
      toast(currentQuote?.message || "We cannot deliver to this area yet", "error");
      return;
    }
    if (!meRef.current) {
      openAuthSheet(() => placeOrder());
      return;
    }
    const me = meRef.current;
    const slot = (currentQuote.slots || []).find((s) => !s.full);
    if (!slot) {
      toast("No delivery slots available right now — please try again in a few minutes", "error");
      return;
    }
    writePref(ADDR_KEY, { line1: addr1.trim(), pincode: pin.trim() });
    writePref(NOTES_KEY, notes.trim());
    if (coupon) writePref(COUPON_KEY, { code: coupon.code });
    else removePref(COUPON_KEY);
    writePref(TIP_KEY, tip);
    const orderItems = lines;
    const payload: Record<string, unknown> = {
      customer: { name: me.name || "", phone: me.phone || "", email: me.email || "" },
      address: { line1: addr1.trim(), area: saved.label || "", city: "Hosur", pincode: pin.trim() },
      notes: notes.trim(),
      items: orderItems,
      slotId: slot.id,
      paymentMethod: payApp === "cod" ? "cod" : "online",
      tipInr: Number(tip || 0),
    };
    if (coupon) payload.couponCode = coupon.code;
    if (Number.isFinite(saved.lat)) payload.location = { lat: saved.lat, lng: saved.lng };
    setPayBusy(true);
    setPayLabel("Placing order…");
    try {
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      saveCart([]);
      for (const key of [COUPON_KEY, TIP_KEY, NOTES_KEY]) removePref(key);
      try {
        localStorage.setItem("rebesta_last_order", JSON.stringify({ items: orderItems, at: Date.now() }));
      } catch {
        /* private mode */
      }
      if (order.payment && order.payment.type === "cashfree") {
        try {
          await startCashfreeCheckout(order.payment);
          setTimeout(() => {
            setPayBusy(false);
            setPayLabel(`Pay ${money(total)}`);
          }, 1500);
          return;
        } catch (error: any) {
          toast(error?.message || "Could not open the payment page", "error");
          await refreshQuote();
        }
      } else {
        window.location.href = `/order-success?id=${encodeURIComponent(order.orderId)}&phone=${encodeURIComponent(me.phone || "")}&whatsapp=${encodeURIComponent(order.whatsappUrl || "")}`;
      }
    } catch (error: any) {
      toast(error?.message || "Could not place this order", "error");
      await refreshQuote();
    } finally {
      setPayBusy(false);
      setPayLabel(`Pay ${money(total)}`);
    }
  }

  /* ---------- derived render data ---------- */
  const area = (loc && ((loc as any).label || (loc as any).area)) || "Hosur";
  const addrLine = addr1.trim() ? `Home | ${addr1.trim()}, ${area}${pin.trim() ? " " + pin.trim() : ""}` : "Home | Add delivery address";
  const couponDesc = (c: Coupon) => {
    const off = c.type === "percent" ? `${Number(c.value)}% off` : `${money(Number(c.value))} off`;
    return c.minOrderInr ? `${off} on orders above ${money(Number(c.minOrderInr))}` : `${off} on any order`;
  };
  const railPicks = useMemo(() => {
    const inCart = new Map(lines.map((i) => [i.handle, i.qty]));
    const pool = products.filter((p) => p.active !== false && Number(p.stock) > 0);
    const seen = new Set<string>();
    const tab = ADD_TABS.find((t) => t.id === addTab) || ADD_TABS[0];
    return { inCart, picks: tab.pick(pool).filter((p) => (seen.has(p.handle) ? false : seen.add(p.handle))).slice(0, 8) };
  }, [products, lines, addTab]);

  const repeatKnown = useMemo(() => {
    const last = lastOrder;
    const fresh = last && Array.isArray(last.items) && last.items.length && Date.now() - (last.at || 0) < 45 * 864e5;
    if (!fresh) return null;
    const known = last!.items.filter((i) => byHandle.has(i.handle));
    return known.length ? known : null;
  }, [lastOrder, byHandle]);

  const emptyPicks = products.filter((p) => p.featured && p.active !== false && p.stock > 0).slice(0, 4);

  /* stepper (items list + rail) */
  const Step = ({ handle, qty, small }: { handle: string; qty: number; small?: boolean }) => (
    <div className={`flex items-center gap-1.5 rounded-xl border border-leaf/40 bg-mint p-1 ${small ? "" : "shadow-sm"}`}>
      <button type="button" aria-label="Decrease" onClick={() => setCartQty(handle, qty - 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-leaf shadow-sm transition active:scale-90">
        −
      </button>
      <motion.span key={qty} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="min-w-5 text-center text-[13px] font-bold text-forest">
        {qty}
      </motion.span>
      <button type="button" aria-label="Increase" onClick={() => setCartQty(handle, qty + 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-leaf shadow-sm transition active:scale-90">
        +
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader variant="solid" />

      <main className="mx-auto max-w-[640px] px-4 pb-44 pt-6 md:pb-32">
        {/* ---------- empty state ---------- */}
        {lines.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid place-items-center rounded-3xl border border-dashed border-line-2 bg-white/60 py-14 text-center">
            <motion.p initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 18 }} className="text-muted-foreground/60"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h16l-1.5 10.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 9Z" stroke="currentColor" strokeWidth="1.2"/><path d="M8 9V7a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.2"/></svg></motion.p>
            <h1 className="mt-4 font-display text-2xl font-semibold text-forest">Your basket is empty</h1>
            <p className="mt-1 text-sm text-muted-foreground">Add fresh vegetables and they&rsquo;ll show up right here.</p>
            {repeatKnown && (
              <div className="mt-5 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => {
                    repeatKnown.forEach((item) => addToCart(item.handle, item.qty));
                    toast(`${repeatKnown.length} products from your last order added`);
                  }}
                  className="w-full rounded-2xl border-2 border-dashed border-leaf/50 bg-mint px-5 py-3 text-sm font-bold text-leaf transition hover:bg-leaf hover:text-white"
                >
                  🔁 Repeat last order
                </button>
                <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">Adds every product from your previous order in one tap.</p>
              </div>
            )}
            <a href="/shop" className="fresh-grad mt-5 rounded-full px-6 py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.10)] transition hover:brightness-110">
              Start shopping →
            </a>
            {emptyPicks.length > 0 && (
              <div className="mt-8 w-full px-6">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Top picks right now</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {emptyPicks.map((p, i) => (
                    <motion.a
                      key={p.handle}
                      href={`/products/${p.handle}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.06 }}
                      className="overflow-hidden rounded-2xl border border-line bg-white text-left shadow-sm transition hover:shadow-mid"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={p.title} loading="lazy" className="aspect-square w-full object-cover" />
                      <span className="block px-2.5 py-2">
                        <b className="block truncate text-[11px] font-bold text-ink">{p.title}</b>
                        <span className="text-[11px] font-bold text-ink">{money(p.priceInr)}</span>
                      </span>
                    </motion.a>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ---------- full basket ---------- */}
        {lines.length > 0 && (
          <>
            {/* items card */}
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-line bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <h1 className="font-display text-xl font-semibold text-forest">Your basket</h1>
                <motion.span key={count} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="rounded-full border border-leaf/20 bg-mint px-3 py-1 text-[11px] font-bold text-leaf">
                  {count} item{count === 1 ? "" : "s"}
                </motion.span>
              </div>

              {/* address */}
              <button
                type="button"
                onClick={() => {
                  setAddrEditOpen(!addrEditOpen);
                  if (!addrEditOpen && !addr1.trim()) setTimeout(() => document.getElementById("bpAddr1")?.focus(), 60);
                }}
                className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line bg-cream px-3.5 py-3 text-left transition hover:border-leaf/50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint text-leaf">
                  <Home size={16} />
                </span>
                <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${addr1.trim() ? "text-ink" : "text-muted-foreground"}`}>{addrLine}</span>
                <motion.span animate={{ rotate: addrEditOpen ? 90 : 0 }} className="text-muted-foreground">
                  <ChevronRight size={16} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {addrEditOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <input
                        id="bpAddr1"
                        autoComplete="street-address"
                        placeholder="House / flat / street"
                        value={addr1}
                        onChange={(e) => setAddr1(e.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-bold text-ink outline-none transition placeholder:font-semibold placeholder:text-muted-foreground focus:border-leaf/60"
                      />
                      <div className="mt-2.5 flex gap-2.5">
                        <input
                          id="bpPin"
                          inputMode="numeric"
                          maxLength={6}
                          autoComplete="postal-code"
                          placeholder="6-digit pincode"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          className="w-36 rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-bold text-ink outline-none transition placeholder:font-semibold placeholder:text-muted-foreground focus:border-leaf/60"
                        />
                        <button type="button" onClick={() => setLocSheetOpen(true)} className="flex-1 rounded-xl border border-dashed border-leaf/50 bg-mint px-3 py-3 text-[13px] font-bold text-leaf transition hover:bg-leaf hover:text-white">
                          📍 Change area — pick your locality
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {savings > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, height: 0 }}
                    animate={{ opacity: 1, scale: 1, height: "auto" }}
                    exit={{ opacity: 0, scale: 0.96, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-2xl bg-mint px-4 py-2.5 text-[13px] font-bold text-forest">
                      🎉 {money(savings)} saved! <span className="font-bold text-muted-foreground">On this order</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* items */}
              <div className="mt-4 grid gap-2">
                <AnimatePresence initial={false}>
                  {lines.map((item) => {
                    const p = byHandle.get(item.handle);
                    if (!p) return null;
                    const compare = Number(p.compareAtInr || 0) > Number(p.priceInr || 0) ? Number(p.compareAtInr) : 0;
                    return (
                      <motion.div
                        key={item.handle}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40, height: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="flex items-center gap-3 rounded-2xl border border-line/70 bg-cream/60 p-2.5"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl border border-line object-cover" />
                        <div className="min-w-0 flex-1">
                          <b className="block truncate text-[13px] font-bold text-ink">{p.title}</b>
                          <small className="text-[11px] font-semibold text-muted-foreground">{p.unitLabel || ""}</small>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-bold text-forest">
                            {money(p.priceInr)}
                            {compare ? (
                              <>
                                <s className="font-semibold text-muted-foreground">{money(compare)}</s>
                                <span className="rounded-full bg-carrot/10 px-1.5 py-0.5 text-[10px] font-bold text-[#c8400f]">
                                  {Math.round(((compare - p.priceInr) * 100) / compare)}% OFF
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <Step handle={item.handle} qty={item.qty} />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a href="/shop" className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-[11px] font-bold text-ink-2 transition hover:border-leaf/50">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-mint text-leaf">
                    <Plus size={12} />
                  </span>
                  Add Items
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSeg("instructions");
                    setTimeout(() => (document.querySelector("[data-bp-notes-input]") as HTMLTextAreaElement | null)?.focus(), 120);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-[11px] font-bold text-ink-2 transition hover:border-leaf/50"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-mint text-leaf">✎</span>
                  Delivery instructions
                </button>
              </div>
            </motion.section>

            {/* complete your basket */}
            {products.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="mt-4 rounded-3xl border border-line bg-white p-5 shadow-soft">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Complete your basket</h4>
                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                  {ADD_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAddTab(t.id)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${
                        t.id === addTab ? "bg-forest text-white shadow-mid" : "border border-line bg-white text-ink-2 hover:border-leaf/50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="rail -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
                  {railPicks.picks.map((p) => {
                    const qty = railPicks.inCart.get(p.handle) || 0;
                    const compare = Number(p.compareAtInr || 0) > Number(p.priceInr || 0) ? Number(p.compareAtInr) : 0;
                    return (
                      <div key={p.handle} className="w-32 shrink-0">
                        <div className="relative overflow-hidden rounded-2xl border border-line">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                          <div className="absolute bottom-1.5 right-1.5">
                            {qty ? (
                              <Step handle={p.handle} qty={qty} small />
                            ) : (
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.85 }}
                                aria-label={`Add ${p.title}`}
                                onClick={() => addToCart(p.handle, 1)}
                                className="grid h-8 w-8 place-items-center rounded-full bg-leaf text-white shadow-[0_4px_14px_rgba(0,0,0,0.10)]"
                              >
                                <Plus size={15} />
                              </motion.button>
                            )}
                          </div>
                        </div>
                        <b className="mt-1.5 block truncate text-[11px] font-bold text-ink">{p.title}</b>
                        <div className="text-[11px] font-bold text-forest">
                          {money(p.priceInr)}
                          {compare ? <s className="ml-1 font-semibold text-muted-foreground">{money(compare)}</s> : null} <small className="text-[12px] text-muted-foreground">· {p.unitLabel || ""}</small>
                        </div>
                      </div>
                    );
                  })}
                  {railPicks.picks.length === 0 && <p className="py-6 text-center text-[13px] font-semibold text-muted-foreground">Nothing here right now — check the other tabs!</p>}
                </div>
              </motion.section>
            )}

            {/* savings corner */}
            {coupons && coupons.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 rounded-3xl border border-line bg-white p-5 shadow-soft">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Savings corner</h4>
                {!coupon && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCouponMoreOpen(!couponMoreOpen)}
                      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-cream px-3.5 py-3 text-left transition hover:border-leaf/50"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-carrot/10 font-bold text-carrot">%</span>
                      <span className="flex-1 text-[13px] font-bold text-ink">Apply Coupon</span>
                      <motion.span animate={{ rotate: couponMoreOpen ? 90 : 0 }} className="text-muted-foreground">
                        <ChevronRight size={16} />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {couponMoreOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="grid gap-2 pt-3">
                            {coupons.map((c, i) => (
                              <motion.div
                                key={c.code}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-3 rounded-2xl border border-dashed border-leaf/40 bg-mint/60 px-3.5 py-2.5"
                              >
                                <Tag size={15} className="shrink-0 text-leaf" />
                                <div className="min-w-0 flex-1">
                                  <b className="block text-[13px] font-bold text-ink">{c.code}</b>
                                  <small className="text-[11px] font-semibold text-muted-foreground">{couponDesc(c)}</small>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => applyCoupon(c.code)}
                                  className="shrink-0 rounded-full bg-forest px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-white transition hover:bg-leaf"
                                >
                                  APPLY
                                </button>
                              </motion.div>
                            ))}
                            <div className="flex gap-2">
                              <input
                                placeholder="Enter coupon code"
                                maxLength={24}
                                autoComplete="off"
                                value={couponInput}
                                onChange={(e) => setCouponInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    applyCoupon(couponInput);
                                  }
                                }}
                                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-bold uppercase text-ink outline-none transition placeholder:font-semibold placeholder:normal-case placeholder:text-muted-foreground focus:border-leaf/60"
                              />
                              <button type="button" onClick={() => applyCoupon(couponInput)} className="carrot-grad shrink-0 rounded-xl px-4 py-2.5 text-[11px] font-bold text-white shadow-[0_4px_12px_rgba(232,71,12,0.3)]">
                                APPLY
                              </button>
                            </div>
                            <AnimatePresence>
                              {couponMsg && (
                                <motion.p
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0 }}
                                  className={`text-center text-[11px] font-bold ${couponMsg.error ? "text-[#c8400f]" : "text-muted-foreground"}`}
                                >
                                  {couponMsg.text}
                                </motion.p>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
                <AnimatePresence>
                  {coupon && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="mt-3 flex items-center gap-3 rounded-2xl border border-leaf/40 bg-mint px-3.5 py-3"
                    >
                      <span className="min-w-0 flex-1 text-[13px] font-bold text-forest">
                        🎟 {money(Number(coupon.discountInr) || 0)} saved with &lsquo;{coupon.code}&rsquo; <span className="ml-1 rounded-full bg-leaf px-2 py-0.5 text-[10px] font-bold text-white">✓ Applied</span>
                      </span>
                      <button type="button" aria-label="Remove coupon" onClick={removeCoupon} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-muted-foreground shadow-sm transition hover:text-carrot">
                        ✕
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            )}

            {/* segmented: delivery / tip / instructions */}
            <div className="mt-4 flex gap-1.5 rounded-2xl border border-line bg-white/70 p-1.5" role="tablist">
              {(
                [
                  ["delivery", "Delivery Type"],
                  ["tip", "Tip"],
                  ["instructions", "Instructions"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={seg === id}
                  onClick={() => setSeg(id)}
                  className={`relative flex-1 rounded-xl px-2 py-2.5 text-[11px] font-bold transition ${seg === id ? "text-white" : "text-muted-foreground hover:text-ink"}`}
                >
                  {seg === id && <motion.span layoutId="segPill" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-xl bg-forest" />}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mt-2 rounded-3xl border border-line bg-white p-5 shadow-soft">
              {seg === "delivery" && (
                <div>
                  <div className="flex items-center gap-3 rounded-2xl border border-leaf/40 bg-mint/60 px-3.5 py-3">
                    <span className="grid h-5 w-5 place-items-center rounded-full border-[5px] border-leaf bg-white" aria-hidden="true" />
                    <div className="flex-1">
                      <b className="block text-[13px] font-bold text-ink">Standard</b>
                      <small className="text-[11px] font-semibold text-muted-foreground">Minimal order grouping</small>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line bg-cream/60 px-3.5 py-3 opacity-70" aria-disabled="true">
                    <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-line-2 bg-white" aria-hidden="true" />
                    <div className="flex-1">
                      <b className="block text-[13px] font-bold text-ink">Drone delivery</b>
                      <small className="text-[11px] font-semibold text-muted-foreground">Hover-drop to your doorstep</small>
                    </div>
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">COMING SOON</span>
                  </div>
                  <motion.p key={JSON.stringify(quote)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3.5 flex items-center gap-1.5 text-[13px] font-bold text-ink-2">
                    <Truck13 />{" "}
                    {quote && !eligible
                      ? quote.message || "We cannot deliver to this area yet."
                      : eligible
                        ? quote!.freeApplied
                          ? `Free delivery applied · ${quote!.distanceKm ? quote!.distanceKm + " road km" : "Hosur"}`
                          : `Delivery ${money(Number(quote!.deliveryFeeInr || 0))} · ${quote!.distanceKm ? quote!.distanceKm + " road km from the hub" : "local morning delivery"}`
                        : "Set your delivery location to check availability."}
                  </motion.p>
                </div>
              )}
              {seg === "tip" && (
                <div>
                  <p className="text-[13px] font-semibold text-muted-foreground">100% of your tip goes to the delivery partner</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TIP_CHOICES.map((v) => (
                      <motion.button
                        key={v}
                        type="button"
                        whileTap={{ scale: 0.93 }}
                        onClick={() => {
                          setTip(v);
                          writePref(TIP_KEY, v);
                        }}
                        className={`rounded-2xl border px-5 py-2.5 text-[13px] font-bold transition ${
                          tip === v ? "carrot-grad border-transparent text-white shadow-[0_4px_12px_rgba(232,71,12,0.3)]" : "border-line bg-white text-ink-2 hover:border-leaf/50"
                        }`}
                      >
                        {v ? money(v) : "No tip"}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              {seg === "instructions" && (
                <textarea
                  data-bp-notes-input
                  maxLength={250}
                  rows={3}
                  placeholder="Gate code, nearby shop, call on arrival…"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  className="w-full resize-none rounded-2xl border border-line bg-cream/60 px-3.5 py-3 text-sm font-semibold text-ink outline-none transition placeholder:text-muted-foreground focus:border-leaf/60"
                />
              )}
            </motion.section>

            {/* bill */}
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-4 rounded-3xl border border-line bg-white shadow-soft">
              <button type="button" aria-expanded={billOpen} onClick={() => setBillOpen(!billOpen)} className="flex w-full items-center gap-3 px-5 py-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint text-leaf">
                  <ReceiptText size={16} />
                </span>
                <span className="flex-1 text-left text-[13px] font-bold uppercase tracking-wide text-muted-foreground">To Pay</span>
                {savings > 0 && <s className="text-[13px] font-bold text-muted-foreground">{money(total + savings)}</s>}
                <motion.strong layout className="text-lg font-bold text-forest">{money(total)}</motion.strong>
                <motion.span animate={{ rotate: billOpen ? 180 : 0 }} className="text-muted-foreground">
                  ▾
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {billOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="overflow-hidden">
                    <div className="border-t border-line/60 px-5 py-4">
                      {savings > 0 && <p className="mb-2 text-center text-[13px] font-bold text-leaf">{money(savings)} saved on the total!</p>}
                      <div className="grid gap-1.5 text-[13px] font-bold text-ink-2">
                        <div className="flex justify-between">
                          <span>Item Total</span>
                          <span>{money(subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            Delivery Fee{eligible && quote?.distanceKm ? <small className="ml-1 text-[12px] text-muted-foreground">| {Number(quote.distanceKm).toFixed(1)} kms</small> : null}
                          </span>
                          <span>{fee === null ? "—" : fee === 0 ? "FREE" : money(fee)}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-muted-foreground">Free delivery applicable on orders above {money(500)}</p>
                        <div className="flex justify-between">
                          <span>Delivery Tip</span>
                          {tip ? <span>{money(tip)}</span> : (
                            <button type="button" onClick={() => setSeg("tip")} className="text-[11px] font-bold text-carrot underline underline-offset-2">
                              Add tip
                            </button>
                          )}
                        </div>
                        <div className="mt-1 flex justify-between border-t border-dashed border-line pt-2.5 text-[14px] font-bold text-forest">
                          <span>To Pay</span>
                          <span>{money(total)}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          </>
        )}
      </main>

      {/* sticky pay bar */}
      <AnimatePresence>
        {lines.length > 0 && (
          <motion.div
            initial={{ y: 90 }}
            animate={{ y: 0 }}
            exit={{ y: 90 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="fixed inset-x-0 bottom-16 z-40 border-t border-line bg-white/95 shadow-[0_-8px_30px_rgba(7,64,21,0.12)] backdrop-blur-xl md:bottom-0"
          >
            <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => setPmOpen(true)} className="min-w-0 flex-1 text-left">
                <small className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pay using</small>
                <span className="flex items-center gap-1 truncate text-[13px] font-bold text-ink">
                  {PM_LABELS[payApp] || "Cash on Delivery"} <span className="text-muted-foreground">▾</span>
                </span>
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={!eligible || payBusy}
                onClick={placeOrder}
                className="fresh-grad shrink-0 rounded-full px-8 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] transition hover:brightness-[1.05] active:scale-[0.98] disabled:bg-line-2 disabled:bg-none disabled:text-muted-foreground disabled:shadow-none"
              >
                {payBusy ? payLabel : `Pay ${money(total)}`}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* payment options sheet */}
      <PortalSheet open={pmOpen} onClose={() => setPmOpen(false)} label="Payment options">
        <h3 className="font-display text-lg font-bold text-forest">Payment Options</h3>
        <p className="mt-0.5 text-[13px] font-bold text-muted-foreground">
          {count} item{count === 1 ? "" : "s"} · {money(total)}
        </p>
        <div className="mt-4 grid gap-2">
          {(
            [
              ["gpay", "Google Pay"],
              ["phonepe", "PhonePe"],
              ["paytm", "Paytm UPI"],
              ["upi", null],
              ["cod", null],
            ] as [string, string | null][]
          ).map(([app, label]) => (
            <button
              key={app}
              type="button"
              onClick={() => selectPayApp(app)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                payApp === app ? "border-leaf bg-mint shadow-sm" : "border-line bg-white hover:border-leaf/50"
              } ${app !== "cod" && !onlineEnabled ? " opacity-50" : ""}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${app === "cod" || app === "upi" ? "bg-mint text-leaf" : "bg-white"} `}>
                {app === "gpay" && <span className="font-display text-[14px] font-bold text-[#4285F4]">G</span>}
                {app === "phonepe" && <span className="font-display text-[14px] font-bold text-[#5F259F]">Pe</span>}
                {app === "paytm" && <span className="font-display text-[13px] font-bold text-[#20336B]">paytm</span>}
                {app === "upi" && <span className="text-[14px] font-bold text-leaf">₹</span>}
                {app === "cod" && <span className="text-lg">💵</span>}
              </span>
              {app === "upi" ? (
                <span className="min-w-0 flex-1">
                  <b className="block text-[13px] font-bold text-ink">All UPI Apps · Cards · Netbanking</b>
                  <small className="text-[11px] font-semibold text-muted-foreground">More options inside secure Cashfree checkout</small>
                </span>
              ) : app === "cod" ? (
                <span className="min-w-0 flex-1">
                  <b className="block text-[13px] font-bold text-ink">Cash on Delivery</b>
                  <small className="text-[11px] font-semibold text-muted-foreground">Pay when the vegetables reach your door</small>
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">{label}</span>
              )}
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${payApp === app ? "border-[5px] border-leaf" : "border-line-2"}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <Lock size={12} /> 100% secure payments · Powered by Cashfree
        </p>
      </PortalSheet>

      {/* phone login sheet — island bound by /js/auth.js (RFSAuth.bindFlow) */}
      <PortalSheet open={authOpen} onClose={() => setAuthOpen(false)} label="Login">
        <form className="auth-form" data-bp-flow noValidate ref={authFormRef}>
          <p className="cart-auth-note">Login to proceed — one quick SMS code 🔐</p>
          <div className="auth-step" data-step="number">
            <div className="fx-field fx-phone">
              <input id="bpPhone" data-flow-phone inputMode="tel" autoComplete="tel" placeholder=" " defaultValue="" />
              <label htmlFor="bpPhone">Mobile number</label>
              <span className="fx-prefix">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h3l2 4-2 2a12 12 0 0 0 5 5l2-2 4 2v3a2 2 0 0 1-2 2A16 16 0 0 1 2 8a2 2 0 0 1 2-2Z" fill="currentColor" />
                </svg>
                +91
              </span>
            </div>
            <div className="captcha-slot">
              <div id="bp-captcha" className="otp-captcha" />
            </div>
            <button className="btn-main" type="button" data-flow-send>
              <span className="btn-label">Send code by SMS</span>
            </button>
          </div>
          <div className="auth-step" data-step="code" hidden>
            <div className="sent-chip">
              <div>
                <b data-flow-sentto />
                <span>Code sent · valid 15 minutes</span>
              </div>
            </div>
            <div className="otp-boxes" data-flow-boxes />
            <p className="otp-hint">Enter the code from the SMS</p>
            <button className="btn-main" type="submit" data-flow-verify>
              <span className="btn-label">Verify &amp; continue</span>
            </button>
            <p className="otp-resend">
              Didn&rsquo;t get it? <a href="#" data-flow-resend>Resend code</a> · <a href="#" data-flow-change>Wrong number?</a>
            </p>
          </div>
          <div className="auth-step" data-step="name" hidden>
            <div className="sent-chip">
              <div>
                <b data-flow-newto />
                <span>Number verified! You&rsquo;re new here — one last thing.</span>
              </div>
            </div>
            <div className="fx-field">
              <input id="bpName" data-flow-name autoComplete="name" placeholder=" " defaultValue="" />
              <label htmlFor="bpName">What should we call you?</label>
            </div>
            <button className="btn-main" type="submit" data-flow-create>
              <span className="btn-label">Create my account</span>
            </button>
            <p className="otp-resend">
              <a href="#" data-flow-restart>← Use a different number</a>
            </p>
          </div>
          <p className="flow-error" data-flow-error hidden />
          <button type="button" onClick={() => setAuthOpen(false)} className="mt-4 w-full text-center text-[13px] font-bold text-muted-foreground transition hover:text-ink">
            ← Back to basket
          </button>
        </form>
      </PortalSheet>

      <SiteFooter />

      {locSheetOpen && <LocationSheet open={locSheetOpen} onOpenChange={setLocSheetOpen} />}
    </div>
  );
}

/* tiny truck icon for the fee line */
function Truck13() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-leaf">
      <path d="M2.5 6h11v9h-11zM13.5 9h4l3 3.2V15h-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="6.5" cy="17.5" r="1.8" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="17.5" r="1.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
