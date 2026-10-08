"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, MessageCircle, Repeat2, Ruler, Sparkles, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { api, money } from "@/lib/store";

interface OrderItem { handle: string; title: string; qty: number; unitLabel: string; image: string; lineTotalInr: number; priceInr: number }
interface Order {
  id: string; status: string; paymentStatus: string; paymentMethod: string;
  subtotalInr: number; discountInr: number; couponCode?: string; deliveryFeeInr: number; tipInr: number;
  distanceKm?: number; totalInr: number; items: OrderItem[]; slot?: { label: string }; deliveryDate?: { label: string };
  history: { status: string; at: string }[];
}

export function OrderSuccessView() {
  const params = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const id = params.get("id") || "";
  const phone = params.get("phone") || "";
  const whatsapp = params.get("whatsapp") || "";
  const paymentState = params.get("payment") || "";

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState<{ loyaltyEnabled: boolean; referralEnabled: boolean; referralBonusInr: number } | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) { setError("Order ID missing. Return to the basket and try again."); return; }
      try {
        const data = await api(`/api/orders/${encodeURIComponent(id)}${phone ? `?phone=${encodeURIComponent(phone)}` : ""}`);
        setOrder(data.order);
        /* remember for 'Repeat last order' on the empty basket page */
        const o = data.order as Order;
        try {
          if (Array.isArray(o.items) && o.items.length && o.paymentStatus !== "FAILED") {
            localStorage.setItem("rebesta_last_order", JSON.stringify({
              id: o.id, at: Date.now(),
              items: o.items.map((i) => ({ handle: i.handle, qty: Number(i.qty) || 1 })).filter((i: any) => i.handle),
            }));
          }
        } catch { /* silent */ }
        /* anonymous GA purchase event (no-ops unless GA is configured) */
        try {
          if (typeof (window as any).gtag === "function" && o.paymentStatus !== "FAILED") {
            const key = `ga-purchase-${o.id}`;
            let seen = false;
            try { seen = Boolean(sessionStorage.getItem(key)); sessionStorage.setItem(key, "1"); } catch { /* private mode */ }
            if (!seen) (window as any).gtag("event", "purchase", {
              transaction_id: o.id, value: Number(o.totalInr) || 0, currency: "INR",
              items: (o.items || []).map((i) => ({ item_id: i.handle || i.title, item_name: i.title, price: Number(i.lineTotalInr && i.qty ? i.lineTotalInr / i.qty : i.priceInr) || 0, quantity: Number(i.qty) || 1 })),
            });
          }
        } catch { /* never break the success page for analytics */ }
      } catch (e: any) {
        setError(e?.message || "Could not load this order");
      }
    })();
    api("/api/settings").then((s: any) => setRewards(s.rewards || null)).catch(() => {});
  }, []);

  const badge = (() => {
    if (paymentState === "paid" || (order && order.paymentStatus === "PAID")) return { text: "Payment verified", tone: "leaf" as const, title: "Payment received. Your vegetables are locked." };
    if (paymentState === "failed" || (order && order.paymentStatus === "FAILED")) return { text: "Payment not completed", tone: "orange" as const, title: "Payment was not completed." };
    if (order && order.paymentMethod === "online" && order.paymentStatus === "PENDING") return { text: "Payment pending", tone: "orange" as const, title: "We are waiting for payment verification." };
    return { text: "Order received", tone: "leaf" as const, title: "Your vegetables are locked." };
  })();

  const historyRows = order ? (order.history || []).slice(-5).reverse() : [];

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="pb-16">
        <section className="mx-auto max-w-xl px-4 pt-12 text-center sm:pt-16">
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-mint text-leaf"
          >
            <Check size={38} strokeWidth={3} />
          </motion.span>

          <span className={`mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${badge.tone === "leaf" ? "bg-mint text-leaf" : "bg-carrot/10 text-[#c8400f]"}`} data-status-badge>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.tone === "leaf" ? "bg-leaf" : "bg-carrot"}`} />
            {badge.text}
          </span>

          <h1 data-success-title className="mt-4 font-display text-[28px] font-semibold leading-[1.06] tracking-tight text-ink sm:text-[36px]">
            {badge.title}
          </h1>

          <p className="mt-4">
            <span data-order-id className="inline-block rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[13px] font-bold tabular-nums text-ink">
              {order ? order.id : "Loading order ID…"}
            </span>
          </p>
          <p data-order-copy className="mt-3 text-[14px] font-medium text-muted-foreground">
            {order ? `${money(order.totalInr)} · ${order.slot?.label || "Morning delivery"} · ${order.deliveryDate?.label || ""}` : "We are preparing the details…"}
          </p>

          <div className="success-actions mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            <Button asChild size="lg" className="fresh-grad h-12 rounded-full px-7 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] hover:brightness-[1.05]">
              <a href={whatsapp || `https://wa.me/918438765119?text=${encodeURIComponent("Hi! Confirming my order " + (order?.id || ""))}`} target="_blank" rel="noopener">
                <MessageCircle size={17} /> Confirm on WhatsApp
              </a>
            </Button>
            <a href="/track" className="text-[14px] font-semibold text-[#c8400f] transition hover:underline">Track order</a>
            <a href="/subscriptions" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#c8400f] transition hover:underline">
              <Repeat2 size={15} /> Make it weekly
            </a>
          </div>

          <div data-order-summary className="mt-10 text-left">
            {error && <div className="rounded-2xl bg-carrot/10 px-5 py-4 text-[14px] font-semibold text-[#c8400f]">{error}</div>}
            {!error && !order && <div className="rounded-2xl bg-[#f5f5f7] px-5 py-4 text-[14px] font-semibold text-muted-foreground">Loading your order…</div>}
            {order && (
              <>
                <Card className="gap-0 rounded-2xl border-line p-2 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
                  {order.items.map((item) => (
                    <div key={item.handle || item.title} className="flex items-center gap-4 px-3 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt={item.title} className="h-12 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-ink">{item.title}</p>
                        <p className="text-[13px] font-medium text-muted-foreground">{item.qty} × {item.unitLabel}</p>
                      </div>
                      <p className="text-[14px] font-bold tabular-nums text-ink">{money(item.lineTotalInr)}</p>
                    </div>
                  ))}
                </Card>

                <Card className="mt-3 gap-0 rounded-2xl border-line p-5 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between py-1 text-[13px] font-medium text-muted-foreground">
                    <span>Product amount</span><span className="tabular-nums">{money(order.subtotalInr)}</span>
                  </div>
                  {Number(order.discountInr) > 0 && (
                    <div className="flex items-center justify-between py-1 text-[13px] font-semibold text-leaf">
                      <span>Coupon {order.couponCode || ""}</span><span className="tabular-nums">−{money(order.discountInr)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-1 text-[13px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Ruler size={13} /> Delivery · {Number(order.distanceKm || 0).toFixed(2)} road km</span>
                    <span className="tabular-nums">{money(order.deliveryFeeInr)}</span>
                  </div>
                  {Number(order.tipInr) > 0 && (
                    <div className="flex items-center justify-between py-1 text-[13px] font-medium text-muted-foreground">
                      <span>Delivery tip</span><span className="tabular-nums">{money(order.tipInr)}</span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[15px] font-bold text-ink">
                    <span>Total</span><span className="tabular-nums">{money(order.totalInr)}</span>
                  </div>
                </Card>

                {/* timeline */}
                <div className="mt-3 rounded-2xl border border-line bg-white p-5">
                  {historyRows.map((row, idx) => (
                    <div key={row.at + row.status} className="flex items-start gap-3.5 py-2">
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${idx === 0 ? "bg-leaf text-white" : "bg-mint text-leaf"}`}>
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <div>
                        <p className="text-[13px] font-bold capitalize text-ink">{row.status.replaceAll("_", " ").toLowerCase()}</p>
                        <p className="text-[11px] font-medium text-muted-foreground">{new Date(row.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {rewards && (rewards.loyaltyEnabled || rewards.referralEnabled) && (
                  <div className="mt-3 grid gap-2.5 rounded-2xl bg-[#f5f5f7] p-5 text-[13px] font-medium leading-relaxed text-ink">
                    {rewards.loyaltyEnabled && (
                      <p className="flex items-start gap-2.5">
                        <Sparkles size={16} className="mt-0.5 shrink-0 text-gold" />
                        <span><strong>Earn a reward:</strong> once this order is delivered you get a LOY- coupon (about 2% back) on the <a href="/track" className="font-semibold text-[#c8400f] hover:underline">Track page</a></span>
                      </p>
                    )}
                    {rewards.referralEnabled && (() => {
                      const myPhone = (phone || "").replace(/\D/g, "").slice(-10);
                      const shareText = `I order fresh vegetables from Rebesta Fresh (Hosur) — morning delivery, exact weight, COD available.\n\nEnter my number ${myPhone} in "Referred by a friend" at checkout and we both get ₹${rewards.referralBonusInr || 50} off after your first delivery\nhttps://rebestafresh.in`;
                      return (
                        <p className="flex items-start gap-2.5">
                          <Users size={16} className="mt-0.5 shrink-0 text-leaf" />
                          <span>
                            <strong>Refer a friend:</strong> give them your mobile number to enter at checkout — you both get ₹{rewards.referralBonusInr || 50} after their first delivery
                            {myPhone && (
                              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener" className="ml-2 inline-flex items-center gap-1 rounded-full bg-leaf px-3.5 py-1.5 text-[13px] font-bold text-white hover:brightness-110">
                                <TrendingUp size={12} /> Share on WhatsApp
                              </a>
                            )}
                          </span>
                        </p>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
