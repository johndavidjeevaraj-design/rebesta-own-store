"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, Clock3, CreditCard, MessageCircle, Repeat2, Ruler, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { api, money } from "@/lib/store";
import { startCashfreeDropin, startUpiApp, startUpiQr } from "@/lib/cashfree-client";

interface OrderItem { handle: string; title: string; qty: number; unitLabel: string; image: string; lineTotalInr: number; priceInr: number }
interface Order {
  id: string; status: string; paymentStatus: string; paymentMethod: string;
  subtotalInr: number; discountInr: number; couponCode?: string; deliveryFeeInr: number; tipInr: number;
  distanceKm?: number; totalInr: number; items: OrderItem[]; slot?: { label: string }; deliveryDate?: { label: string };
  history: { status: string; at: string }[];
}

function isConfirmedOrder(order: Pick<Order, "paymentMethod" | "paymentStatus">) {
  const method = String(order.paymentMethod || "").toLowerCase();
  const payment = String(order.paymentStatus || "").toUpperCase();
  return method === "cod" || (method === "online" && ["PAID", "PAID_ONLINE"].includes(payment));
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
  const [retryPay, setRetryPay] = useState<{ sessionId: string; mode?: string; orderId: string; amount: number } | null>(null);
  /* Swiggy-style retry, all inside our site: UPI first (QR on desktop, direct
     app launch on mobile) — the Cashfree drop-in loads ONLY for card/netbanking,
     so its redirecting UPI widget is never in play. */
  const [isDesktop, setIsDesktop] = useState(true);
  const [retryMode, setRetryMode] = useState<"choose" | "upi-qr" | "upi-app" | "card">("choose");
  const [retryLaunchedApp, setRetryLaunchedApp] = useState("");
  const [upiCheckNow, setUpiCheckNow] = useState(0);
  const [upiNote, setUpiNote] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasTouch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
    setIsDesktop(!hasTouch);
  }, []);

  /* poll Cashfree while a UPI retry is showing — on success just reload:
     this page already renders the paid state */
  useEffect(() => {
    if (!retryPay || (retryMode !== "upi-qr" && retryMode !== "upi-app")) return;
    let stopped = false;
    const check = async () => {
      try {
        const d: any = await api(`/api/orders/${encodeURIComponent(retryPay.orderId)}/verify-payment`);
        if (d?.paid && !stopped) { stopped = true; window.location.reload(); }
      } catch { /* next tick */ }
    };
    const t = setInterval(() => { if (!stopped) check(); }, 4000);
    return () => { stopped = true; clearInterval(t); };
  }, [retryPay, retryMode, upiCheckNow]);

  /* draw the retry QR once that mode is chosen */
  useEffect(() => {
    if (!retryPay || retryMode !== "upi-qr") return;
    let dead = false;
    (async () => {
      try { await startUpiQr({ orderId: retryPay.orderId, host: "#cf-qr-retry" }); }
      catch (e: any) { if (!dead) setUpiNote(e?.message || "Could not create the QR — try card payment."); }
    })();
    return () => { dead = true; };
  }, [retryPay, retryMode]);

  async function retryUpiApp(app: string) {
    if (!retryPay) return;
    setRetryLaunchedApp(app);
    setUpiNote("");
    setRetryMode("upi-app");
    try { await startUpiApp({ orderId: retryPay.orderId, app }); }
    catch (e: any) { setUpiNote(e?.message || "Could not start the payment — please try again."); }
  }
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
          if (Array.isArray(o.items) && o.items.length && isConfirmedOrder(o)) {
            localStorage.setItem("rebesta_last_order", JSON.stringify({
              id: o.id, at: Date.now(),
              items: o.items.map((i) => ({ handle: i.handle, qty: Number(i.qty) || 1 })).filter((i: any) => i.handle),
            }));
          }
        } catch { /* silent */ }
        /* anonymous GA purchase event (no-ops unless GA is configured) */
        try {
          if (typeof (window as any).gtag === "function" && isConfirmedOrder(o)) {
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

  /* retry payment — the Cashfree drop-in mounts ONLY when card is chosen */
  useEffect(() => {
    if (!retryPay || retryMode !== "card") return;
    let dead = false;
    (async () => {
      try {
        await startCashfreeDropin("#cf-dropin", retryPay);
      } catch {
        if (!dead) setRetryPay(null);
      }
    })();
    return () => { dead = true; };
  }, [retryPay, retryMode]);

  async function completePaymentNow() {
    try {
      const d: any = await api(`/api/orders/${encodeURIComponent(order?.id || id)}/pay`, { method: "POST" });
      if (d?.payment?.sessionId) {
        setRetryPay({ sessionId: d.payment.sessionId, mode: d.payment.mode, orderId: order?.id || id, amount: Number(order?.totalInr || 0) });
      }
    } catch (e: any) {
      setError(e?.message || "Could not start payment — please try again.");
    }
  }

  const badge = (() => {
    if (paymentState === "paid" || (order && ["PAID", "PAID_ONLINE"].includes(String(order.paymentStatus || "").toUpperCase()))) return { text: "Payment verified", tone: "leaf" as const, title: "Payment received. Your vegetables are locked." };
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
            className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${badge.tone === "orange" ? "bg-carrot/10 text-[#c8400f]" : "bg-mint text-leaf"}`}
          >
            {badge.tone === "orange" ? (
              paymentState === "failed" || order?.paymentStatus === "FAILED" ? <AlertTriangle size={36} strokeWidth={2.6} /> : <Clock3 size={36} strokeWidth={2.6} />
            ) : (
              <Check size={38} strokeWidth={3} />
            )}
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
            {badge.tone === "orange" && order?.paymentMethod === "online" && (
              <Button
                size="lg"
                onClick={completePaymentNow}
                className="h-12 rounded-full bg-carrot px-7 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(232,71,12,0.3)] hover:brightness-[1.05]"
              >
                <CreditCard size={17} /> Complete payment
              </Button>
            )}
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
      {/* retry-payment checkout — full-screen, in-site, same premium chrome */}
      {retryPay && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-white">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/brand/logo-orange-leaf.png" alt="Rebesta Fresh" className="h-9 w-9 rounded-[10px] object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold tracking-tight text-ink">Complete your payment</p>
              <p className="truncate text-[12px] font-semibold text-muted-foreground">{retryPay.orderId} · {money(retryPay.amount)}</p>
            </div>
            <button
              type="button"
              aria-label="Close checkout"
              onClick={() => { setRetryPay(null); window.location.reload(); }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-white text-muted-foreground transition hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
            {retryMode === "choose" && (
              <>
                <div>
                  <p className="text-[17px] font-bold tracking-tight text-ink">
                    {isDesktop ? "Scan & Pay with any UPI app" : "Pay instantly with UPI"}
                  </p>
                  <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] font-semibold leading-relaxed text-muted-foreground">
                    {isDesktop ? "Google Pay · PhonePe · Paytm · BHIM — we confirm automatically once you pay." : "Pick your app — it opens with the amount prefilled. We confirm automatically once you pay."}
                  </p>
                </div>
                {isDesktop ? (
                  <button
                    type="button"
                    onClick={() => setRetryMode("upi-qr")}
                    className="fresh-grad rounded-full px-8 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] transition hover:brightness-[1.05]"
                  >
                    Show the QR · Pay {money(retryPay.amount)}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {[["gpay", "Google Pay"], ["phonepe", "PhonePe"], ["paytm", "Paytm UPI"]].map(([app, label]) => (
                      <button
                        key={app}
                        type="button"
                        onClick={() => retryUpiApp(app)}
                        className="rounded-full border border-line bg-white px-5 py-3 text-[13px] font-bold text-ink transition hover:border-leaf/50"
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => retryUpiApp("default")}
                      className="rounded-full border border-line bg-white px-5 py-3 text-[13px] font-bold text-ink transition hover:border-leaf/50"
                    >
                      Other UPI Apps
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setRetryMode("card")}
                  className="rounded-full bg-mint px-6 py-3 text-[13px] font-bold text-forest transition hover:brightness-95"
                >
                  Pay by card / netbanking
                </button>
              </>
            )}
            {retryMode === "upi-qr" && (
              <>
                <p className="text-[17px] font-bold tracking-tight text-ink">Scan the QR with any UPI app</p>
                <div id="cf-qr-retry" className="mx-auto grid w-fit place-items-center rounded-2xl border border-line bg-white p-4 shadow-sm [&_img]:[image-rendering:pixelated]" />
                <div className="flex items-center gap-2 text-[12px] font-bold text-leaf">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-leaf" />
                  Waiting for payment…
                </div>
                {upiNote && <p className="max-w-[320px] text-[13px] font-semibold text-carrot">{upiNote}</p>}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={() => setUpiCheckNow(Date.now())} className="rounded-full border border-line bg-white px-4 py-2.5 text-[13px] font-bold text-ink transition hover:border-leaf/50">
                    I've paid — check now
                  </button>
                  <button type="button" onClick={() => setRetryMode("card")} className="rounded-full bg-mint px-4 py-2.5 text-[13px] font-bold text-forest transition hover:brightness-95">
                    Pay by card / netbanking
                  </button>
                </div>
              </>
            )}
            {retryMode === "upi-app" && retryLaunchedApp && (
              <>
                <div>
                  <p className="text-[17px] font-bold tracking-tight text-ink">Complete the payment in your UPI app</p>
                  <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] font-semibold leading-relaxed text-muted-foreground">
                    The app is opening with ₹{Math.round(retryPay.amount)} prefilled. Pay there, then come back — we'll confirm automatically.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold text-leaf">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-leaf" />
                  Waiting for payment…
                </div>
                {upiNote && <p className="max-w-[320px] text-[13px] font-semibold text-carrot">{upiNote}</p>}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={() => setUpiCheckNow(Date.now())} className="rounded-full border border-line bg-white px-4 py-2.5 text-[13px] font-bold text-ink transition hover:border-leaf/50">
                    I've paid — check now
                  </button>
                  <button type="button" onClick={() => setRetryMode("choose")} className="rounded-full border border-line bg-white px-4 py-2.5 text-[13px] font-bold text-ink transition hover:border-leaf/50">
                    Open a different UPI app
                  </button>
                  <button type="button" onClick={() => setRetryMode("card")} className="rounded-full bg-mint px-4 py-2.5 text-[13px] font-bold text-forest transition hover:brightness-95">
                    Pay by card / netbanking
                  </button>
                </div>
              </>
            )}
            {retryMode === "upi-app" && !retryLaunchedApp && null}
            {retryMode === "card" && <div id="cf-dropin" className="min-h-0 w-full flex-1" />}
          </div>
          <p className="border-t border-line bg-white px-4 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">
            Payments secured by Cashfree · UPI · Cards · Netbanking · Wallets
          </p>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
