"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Bike, CalendarDays, Camera, CheckCircle2, Clock, Home, MapPin, Package,
  RefreshCcw, Repeat2, Search, Star, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { api, addToCart, money, Product } from "@/lib/store";
import { useToast } from "@/components/toaster";

interface TrackItem { handle: string; title: string; qty: number; unitLabel: string; image: string }
interface TrackOrder {
  id: string; status: string; items: TrackItem[]; totalInr: number; discountInr: number; couponCode?: string;
  reviewed?: boolean; deliveryPhoto?: string; location?: { lat: number; lng: number };
  deliveryPartner?: { name: string; lat?: number | null; lng?: number | null; pin?: { lat: number; lng: number } | null; etaMinutes?: number; updatedAt?: string } | null;
}
interface HistoryOrder {
  id: string; status: string; placedAt: string; itemCount: number; totalInr: number; paymentMethod: string;
  cancellable?: boolean; loyaltyCouponCode?: string; loyaltyCouponValue?: number; referralCouponCode?: string; slot?: { label: string };
}

const STATUS_LABEL: Record<string, string> = {
  PLACED: "Placed", CONFIRMED: "Confirmed", PACKING: "Packing",
  OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled",
  PENDING_PAYMENT: "Awaiting payment", PAYMENT_FAILED: "Payment failed",
};
const statusTone = (status: string) =>
  /deliver|confirm/.test(status) ? "leaf" : /cancel|fail/.test(status) ? "gray" : "orange";

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        tone === "leaf" ? "bg-mint text-leaf" : tone === "orange" ? "bg-carrot/10 text-[#c8400f]" : "bg-black/[0.06] text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "leaf" ? "bg-leaf" : tone === "orange" ? "bg-carrot" : "bg-muted-foreground"}`} />
      {STATUS_LABEL[status] || String(status).toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

/* ---------- Leaflet (vendored) loader ---------- */
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve) => {
    if (!document.querySelector("link[data-leaflet-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/assets/vendor/leaflet/leaflet.css";
      link.dataset.leafletCss = "1";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "/assets/vendor/leaflet/leaflet.js";
    s.dataset.leafletJs = "1";
    s.onload = () => resolve((window as any).L || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return leafletPromise;
}

const HOME_PIN = `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#0d8736"/><path d="M17 9.5 9.5 16h2.2v7.5h4v-4.6h2.6v4.6h4V16h2.2L17 9.5Z" fill="#fff"/></svg>`;
const RIDER_PIN = `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#1d1d1f"/><circle cx="11" cy="21.5" r="2.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="23.5" cy="21.5" r="2.6" fill="none" stroke="#fff" stroke-width="2"/><path d="M11 21.5h6l2.6-6.4h2.3M17.6 15.1l-2.1 4.2h4.2" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

export function TrackView() {
  const toast = useToast();

  const initial = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [orderId, setOrderId] = useState((initial?.get("id") || initial?.get("order") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 24));
  const [phone, setPhone] = useState((initial?.get("phone") || "").replace(/\D/g, "").slice(-10));
  const [historyPhone, setHistoryPhone] = useState((initial?.get("phone") || "").replace(/\D/g, "").slice(-10));

  const [result, setResult] = useState<TrackOrder | null>(null);
  const [resultPhone, setResultPhone] = useState("");
  const [trackMsg, setTrackMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryOrder[] | null>(null);
  const [historyMsg, setHistoryMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSent, setReviewSent] = useState(false);
  const [reordering, setReordering] = useState(false);

  const mapHostRef = useRef<HTMLDivElement>(null);
  const trackMap = useRef<any>(null);
  const partnerMarker = useRef<any>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---------- live partner map ---------- */
  const renderPartnerLive = useCallback((data: { deliveryPartner?: TrackOrder["deliveryPartner"] }, order: TrackOrder) => {
    const host = mapHostRef.current;
    if (!host) return;
    const p = data.deliveryPartner;
    if (!p) {
      host.hidden = true;
      if (trackMap.current) { try { trackMap.current.remove(); } catch { /* gone */ } trackMap.current = null; partnerMarker.current = null; }
      return;
    }
    host.hidden = false;
    const home = p.pin && Number.isFinite(Number(p.pin.lat)) ? p.pin : order.location && Number.isFinite(Number(order.location.lat)) ? order.location : null;
    const dist = p.lat != null && home
      ? 6371 * 2 * Math.asin(Math.sqrt(Math.sin(((p.lat as number) - home.lat) * Math.PI / 360) ** 2 + Math.cos(home.lat * Math.PI / 180) * Math.cos((p.lat as number) * Math.PI / 180) * Math.sin(((p.lng as number) - home.lng) * Math.PI / 360) ** 2))
      : null;
    const ago = p.updatedAt ? Math.max(0, Math.round((Date.now() - new Date(p.updatedAt).getTime()) / 60000)) : null;

    const sub = host.querySelector("[data-live-sub]") as HTMLElement | null;
    if (sub) {
      sub.textContent = p.lat != null
        ? `${p.etaMinutes ? `Arriving in ~${p.etaMinutes} min · ` : dist != null ? `${dist.toFixed(1)} km away · ` : ""}location updated ${ago === 0 ? "just now" : `${ago} min ago`}`
        : "The shop will share live location while delivering";
    }

    const L = (window as any).L;
    const mapEl = host.querySelector("[data-leaflet-map]") as HTMLElement | null;
    if (p.lat == null || !L || !mapEl) return;
    if (!trackMap.current) {
      const map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const pin = L.divIcon({ className: "", html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))">${HOME_PIN}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      const rider = L.divIcon({ className: "", html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))">${RIDER_PIN}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      if (home) L.marker([home.lat, home.lng], { icon: pin }).addTo(map);
      partnerMarker.current = L.marker([p.lat, p.lng], { icon: rider, zIndexOffset: 900 }).addTo(map);
      const pts: [number, number][] = [[Number(p.lat), Number(p.lng)]];
      if (home) pts.push([home.lat, home.lng]);
      map.fitBounds(L.latLngBounds(pts).pad(0.35));
      trackMap.current = map;
    } else {
      partnerMarker.current?.setLatLng([p.lat, p.lng]);
    }
  }, []);

  /* polling while an order is shown */
  useEffect(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (!result || !resultPhone) return;
    const id = result.id;
    const tick = async () => {
      try {
        const d2 = await api(`/api/orders/${encodeURIComponent(id)}?phone=${encodeURIComponent(resultPhone)}`);
        if (d2.order) setResult((prev) => (prev && prev.id === id ? { ...prev, deliveryPartner: d2.order.deliveryPartner } : prev));
        renderPartnerLive(d2, { ...result, deliveryPartner: d2.order.deliveryPartner });
      } catch { /* keep last known position */ }
    };
    pollTimer.current = setInterval(tick, 15000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, resultPhone]);

  /* paint the live box whenever the partner changes */
  useEffect(() => {
    if (result) {
      loadLeaflet().then(() => renderPartnerLive({ deliveryPartner: result.deliveryPartner }, result));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.deliveryPartner?.lat, result?.deliveryPartner?.updatedAt]);

  useEffect(() => () => { if (trackMap.current) { try { trackMap.current.remove(); } catch { /* gone */ } } }, []);

  /* ---------- track by id + phone ---------- */
  async function trackOrder(e?: React.FormEvent) {
    e?.preventDefault();
    const id = orderId.trim();
    const ph = phone.trim();
    if (!id || !ph) { toast("Enter your order ID and mobile number", "error"); return; }
    setResult(null);
    setTrackMsg({ kind: "info", text: "Checking your order…" });
    setReviewStars(0); setReviewText(""); setReviewSent(false);
    try {
      const data = await api(`/api/orders/${encodeURIComponent(id)}?phone=${encodeURIComponent(ph)}`);
      if (data.phoneVerified === false) throw new Error("Mobile number does not match this order");
      setResult(data.order); setResultPhone(ph);
      setTrackMsg(null);
      loadLeaflet().then(() => setTimeout(() => renderPartnerLive(data, data.order), 50));
    } catch (err: any) {
      setResult(null);
      setTrackMsg({ kind: "error", text: err?.message || "Could not load this order" });
    }
  }

  async function sendReview() {
    if (!reviewStars) { toast("Tap the stars first — 1 to 5", "error"); return; }
    try {
      await api("/api/reviews", { method: "POST", body: JSON.stringify({ orderId: result!.id, phone: resultPhone, rating: reviewStars, text: reviewText }) });
      setReviewSent(true);
    } catch (err: any) {
      toast(err?.message || "Could not send review", "error");
    }
  }

  async function reorder() {
    if (!result || reordering) return;
    setReordering(true);
    try {
      const data = await api("/api/products");
      const byHandle = new Map<string, Product>(((data.products || []) as Product[]).map((p) => [p.handle, p]));
      let added = 0, missed = 0;
      for (const item of result.items) {
        const product = byHandle.get(item.handle);
        if (product && product.active !== false && product.stock > 0) { addToCart(item.handle, item.qty); added++; }
        else missed++;
      }
      toast(added ? `${added} item${added === 1 ? "" : "s"} added to your basket${missed ? ` · ${missed} unavailable` : ""}` : "These products are currently unavailable");
      if (added) window.location.href = "/cart";
      else setReordering(false);
    } catch (e: any) {
      toast(e?.message || "Could not refill the basket", "error");
      setReordering(false);
    }
  }

  /* ---------- order history by phone ---------- */
  async function loadHistory(e?: React.FormEvent) {
    e?.preventDefault();
    const ph = historyPhone.trim();
    if (ph.replace(/[^0-9]/g, "").length !== 10) { toast("Enter a valid 10-digit mobile number", "error"); return; }
    setHistoryMsg({ kind: "info", text: "Loading your orders…" });
    setHistory(null);
    try {
      const data = await api("/api/orders/history?phone=" + encodeURIComponent(ph));
      if (!data.orders.length) { setHistoryMsg({ kind: "info", text: "No orders found for this number yet." }); return; }
      setHistory(data.orders); setHistoryMsg(null);
    } catch (err: any) {
      setHistoryMsg({ kind: "error", text: err?.message || "Could not load orders" });
    }
  }

  function trackFromHistory(id: string, ph: string) {
    setOrderId(id); setPhone(ph);
    setTimeout(() => trackOrder(), 60);
    document.querySelector("[data-track-form]")?.scrollIntoView({ behavior: "smooth" });
  }

  async function cancelOrder(id: string, ph: string) {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    try {
      await api(`/api/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ phone: ph }) });
      toast("Order cancelled");
      const data = await api("/api/orders/history?phone=" + encodeURIComponent(ph));
      setHistory(data.orders || []);
    } catch (err: any) {
      toast(err?.message || "Could not cancel", "error");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="pb-20">
        <section className="mx-auto max-w-2xl px-4 pt-14 sm:pt-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c8400f]">Track order</p>
          <h1 className="mt-3 font-display text-[32px] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-[40px]">Where&rsquo;s my delivery?</h1>
          <p className="mt-3 text-[14px] font-medium text-muted-foreground">Enter your Rebesta order ID and the mobile number used at checkout.</p>

          <form data-track-form onSubmit={trackOrder} className="mt-8 grid gap-3 sm:grid-cols-[1.2fr_1fr_auto]">
            <Input
              id="orderId" required placeholder="RB-20260922-ABC123" value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="h-12 rounded-xl border-line-2 bg-white text-[14px] font-medium placeholder:text-[#8e8e93] focus-visible:ring-2 focus-visible:ring-ink/20"
            />
            <Input
              id="trackPhone" required inputMode="tel" placeholder="10-digit mobile" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12 rounded-xl border-line-2 bg-white text-[14px] font-medium placeholder:text-[#8e8e93] focus-visible:ring-2 focus-visible:ring-ink/20"
            />
            <Button type="submit" className="fresh-grad h-12 rounded-xl px-6 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(11,124,49,0.3)] hover:brightness-[1.05] active:scale-[0.98]">
              <Search size={16} /> Track
            </Button>
          </form>

          <div className="mt-6">
            {trackMsg && (
              <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3.5 text-[14px] font-semibold ${trackMsg.kind === "error" ? "bg-carrot/10 text-[#c8400f]" : "bg-[#f5f5f7] text-muted-foreground"}`}>
                {trackMsg.kind === "error" ? <TriangleAlert size={16} /> : <Clock size={16} />}
                {trackMsg.text}
              </div>
            )}

            {result && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mint px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold tabular-nums text-leaf">{result.id}</p>
                    <p className="mt-0.5 text-[14px] font-semibold text-ink">{STATUS_LABEL[result.status] || result.status.replaceAll("_", " ")}</p>
                  </div>
                  <StatusChip status={result.status} />
                </div>

                {/* live partner map */}
                <div ref={mapHostRef} hidden className="mt-4 overflow-hidden rounded-2xl border border-line">
                  <div className="flex items-center gap-3 border-b border-line bg-white px-5 py-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white"><Bike size={17} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold text-ink">{result.deliveryPartner?.name} is on the way to you</p>
                      <p data-live-sub className="truncate text-[13px] font-medium text-muted-foreground" />
                    </div>
                  </div>
                  <div data-leaflet-map className="h-64 w-full" />
                </div>

                {/* items */}
                <Card className="mt-4 gap-0 rounded-2xl border-line p-2 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
                  {result.items.map((i, idx) => (
                    <div key={i.handle || idx} className="flex items-center gap-4 rounded-xl px-3 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-ink">{i.title}</p>
                        <p className="text-[13px] font-medium text-muted-foreground">{i.qty} × {i.unitLabel}</p>
                      </div>
                    </div>
                  ))}
                </Card>

                {result.deliveryPhoto && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-line">
                    <p className="flex items-center gap-2 bg-white px-5 py-3 text-[13px] font-bold text-ink"><Camera size={15} className="text-leaf" /> Delivery proof by your delivery partner</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={result.deliveryPhoto} alt="Delivery proof photo" loading="lazy" className="w-full object-cover" />
                  </div>
                )}

                {result.status === "DELIVERED" && !result.reviewed && !reviewSent && (
                  <Card className="mt-4 gap-0 rounded-2xl border-line bg-[#f5f5f7] p-6 shadow-none">
                    <p className="flex items-center gap-2 text-[14px] font-bold text-ink"><Star size={17} className="fill-gold text-gold" /> How was your order?</p>
                    <div className="mt-4 flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n} type="button" aria-label={`${n} star`} onClick={() => setReviewStars(n)}
                          className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-90 ${n <= reviewStars ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]" : "hover:bg-black/[0.04]"}`}
                        >
                          <Star size={20} className={n <= reviewStars ? "fill-gold text-gold" : "text-line-2"} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      maxLength={400} value={reviewText} onChange={(e) => setReviewText(e.target.value)}
                      placeholder="Tell others what you think (optional) — freshness, packing, delivery…"
                      className="mt-4 min-h-24 w-full resize-none rounded-xl border border-transparent bg-white p-4 text-[14px] font-medium text-ink outline-none transition placeholder:text-[#8e8e93] focus:border-black/10"
                    />
                    <Button onClick={sendReview} className="mt-3 h-11 w-full rounded-full bg-leaf text-[14px] font-bold text-white hover:brightness-110">Send review</Button>
                  </Card>
                )}
                {result.status === "DELIVERED" && (result.reviewed || reviewSent) && (
                  <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-mint px-5 py-4 text-[14px] font-semibold text-leaf">
                    <CheckCircle2 size={17} /> {result.reviewed ? "Thanks for reviewing this order!" : "Thank you! Your review will appear on the product page once approved."}
                  </div>
                )}

                <Card className="mt-4 gap-0 rounded-2xl border-line p-5 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
                  {Number(result.discountInr) > 0 && (
                    <div className="flex items-center justify-between pb-2 text-[13px] font-semibold text-muted-foreground">
                      <span>Coupon {result.couponCode || ""}</span>
                      <span className="text-leaf">−{money(result.discountInr)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[15px] font-extrabold text-ink">
                    <span>Total</span><span className="tabular-nums">{money(result.totalInr)}</span>
                  </div>
                  <Button
                    onClick={reorder} disabled={reordering}
                    className="mt-4 h-11 w-full rounded-full bg-leaf text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
                  >
                    <Repeat2 size={16} /> {reordering ? "Adding items…" : "Refill basket with this order"}
                  </Button>
                </Card>
              </motion.div>
            )}
          </div>

          {/* order history */}
          <div className="mt-16 rounded-[28px] bg-[#f5f5f7] p-6 sm:p-9">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Order history</p>
            <h2 className="mt-2 font-display text-[21px] font-extrabold tracking-tight text-ink">All my orders</h2>
            <p className="mt-2 text-[14px] font-medium text-muted-foreground">Enter just your mobile number to see every order, rewards and cancel options.</p>
            <form data-history-form onSubmit={loadHistory} className="mt-5 flex gap-3">
              <Input
                id="historyPhone" inputMode="tel" required placeholder="10-digit mobile" value={historyPhone}
                onChange={(e) => setHistoryPhone(e.target.value)}
                className="h-12 flex-1 rounded-xl border-transparent bg-white text-[14px] font-medium placeholder:text-[#8e8e93] focus-visible:border-black/10 focus-visible:ring-0"
              />
              <Button type="submit" className="fresh-grad h-12 rounded-xl px-6 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(11,124,49,0.3)] hover:brightness-[1.05]">Show</Button>
            </form>
            <div className="mt-5">
              {historyMsg && (
                <div className={`rounded-2xl px-4 py-3.5 text-[13px] font-semibold ${historyMsg.kind === "error" ? "bg-carrot/10 text-[#c8400f]" : "bg-white text-muted-foreground"}`}>{historyMsg.text}</div>
              )}
              {history && (
                <div className="grid gap-3">
                  {history.map((o) => (
                    <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-bold tabular-nums text-muted-foreground">{o.id}</p>
                        <StatusChip status={o.status} />
                      </div>
                      <p className="mt-2.5 text-[14px] font-bold text-ink">
                        {money(o.totalInr)} <span className="font-medium text-muted-foreground">· {o.itemCount} items</span>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                        <CalendarDays size={13} />
                        {new Date(o.placedAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                        {o.slot?.label ? ` · ${o.slot.label}` : ""} · {o.paymentMethod === "cod" ? "COD" : "Online"}
                      </p>
                      {o.loyaltyCouponCode && (
                        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-mint px-3.5 py-2.5 text-[13px] font-semibold text-leaf">
                          <Star size={13} /> Loyalty reward <strong className="tabular-nums">{o.loyaltyCouponCode}</strong> — ₹{o.loyaltyCouponValue} off your next order
                        </p>
                      )}
                      {o.referralCouponCode && (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-mint px-3.5 py-2.5 text-[13px] font-semibold text-leaf">
                          <Package size={13} /> Referral reward <strong className="tabular-nums">{o.referralCouponCode}</strong>
                        </p>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button variant="ghost" onClick={() => trackFromHistory(o.id, historyPhone)} className="h-9 rounded-full border border-line-2 bg-white px-5 text-[13px] font-bold text-ink hover:bg-[#f5f5f7]">Track</Button>
                        {o.cancellable && (
                          <Button variant="ghost" onClick={() => cancelOrder(o.id, historyPhone)} className="h-9 rounded-full px-5 text-[13px] font-bold text-[#c8400f] hover:bg-carrot/10">Cancel order</Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="mt-10 flex items-center justify-center gap-2 text-center text-[13px] font-medium text-muted-foreground">
            <MapPin size={13} /> Track any order without signing in — orders stay linked to your number.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
