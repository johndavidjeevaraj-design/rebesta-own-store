import { useEffect, useRef, useState } from 'react';
import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';
import { useToast } from '../components/Toaster';
import { addToCart, api, money, Product } from '../shared/store';

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

const STATUS_MAP: Record<string, [string, string]> = {
  PLACED: ['placed', 'orange'], CONFIRMED: ['confirmed', 'green'], PACKING: ['packing', 'orange'],
  OUT_FOR_DELIVERY: ['out for delivery', 'orange'], DELIVERED: ['delivered', 'green'], CANCELLED: ['cancelled', 'gray'],
  PENDING_PAYMENT: ['awaiting payment', 'orange'], PAYMENT_FAILED: ['payment failed', 'gray']
};
const statusChip = (status: string) => {
  const [label, color] = STATUS_MAP[status] || [String(status).toLowerCase().replaceAll('_', ' '), 'gray'];
  return <span className={`badge ${color}`}>{label}</span>;
};

export default function Track() {
  const toast = useToast();

  /* URL prefill (?phone= / ?order=) */
  const initial = new URLSearchParams(window.location.search);
  const [orderId, setOrderId] = useState((initial.get('order') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24));
  const [phone, setPhone] = useState((initial.get('phone') || '').replace(/\D/g, '').slice(-10));
  const [historyPhone, setHistoryPhone] = useState((initial.get('phone') || '').replace(/\D/g, '').slice(-10));

  const [result, setResult] = useState<TrackOrder | null>(null);
  const [resultPhone, setResultPhone] = useState('');
  const [trackMsg, setTrackMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryOrder[] | null>(null);
  const [historyMsg, setHistoryMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [reordering, setReordering] = useState(false);

  const partnerBoxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const trackMap = useRef<any>(null);
  const partnerMarker = useRef<any>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---------- live partner map (Leaflet, vendored at /assets/vendor/leaflet) ---------- */
  function renderPartnerLive(data: { deliveryPartner?: TrackOrder['deliveryPartner'] }, order: TrackOrder) {
    const box = partnerBoxRef.current;
    if (!box) return;
    const p = data.deliveryPartner;
    if (!p) {
      box.innerHTML = '';
      if (trackMap.current) { try { trackMap.current.remove(); } catch { /* already gone */ } trackMap.current = null; partnerMarker.current = null; }
      return;
    }
    const home = (p.pin && Number.isFinite(Number(p.pin.lat))) ? p.pin : (order.location && Number.isFinite(Number(order.location.lat)) ? order.location : null);
    const dist = (p.lat != null && home)
      ? 6371 * 2 * Math.asin(Math.sqrt(Math.sin(((p.lat as number) - home.lat) * Math.PI / 360) ** 2 + Math.cos(home.lat * Math.PI / 180) * Math.cos((p.lat as number) * Math.PI / 180) * Math.sin(((p.lng as number) - home.lng) * Math.PI / 360) ** 2))
      : null;
    const ago = p.updatedAt ? Math.max(0, Math.round((Date.now() - new Date(p.updatedAt).getTime()) / 60000)) : null;

    if (!box.querySelector('.partner-live')) {
      box.innerHTML = `<div class="partner-live"><div class="partner-map" data-partner-map></div><div class="partner-live-card"><span class="plc-emoji">🛵</span><div class="plc-body"><strong class="plc-title"></strong><small class="plc-sub"></small></div></div></div>`;
    }
    box.querySelector('.plc-title')!.textContent = `${p.name} is on the way to you!`;
    box.querySelector('.plc-sub')!.textContent = p.lat != null
      ? `${p.etaMinutes ? `arriving in ~${p.etaMinutes} min · ` : (dist != null ? `${dist.toFixed(1)} km away · ` : '')}location updated ${ago === 0 ? 'just now' : `${ago} min ago`}`
      : 'The shop will share live location while delivering';

    const mapEl = box.querySelector('[data-partner-map]') as HTMLElement | null;
    const L = (window as any).L;
    if (p.lat != null && mapEl && L) {
      if (!trackMap.current) {
        const map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        const pin = L.divIcon({ className: 'track-pin', html: '<span class="track-pin-home">🏠</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
        const rider = L.divIcon({ className: 'track-pin', html: '<span class="track-pin-rider">🛵</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
        if (home) L.marker([home.lat, home.lng], { icon: pin }).addTo(map);
        partnerMarker.current = L.marker([p.lat, p.lng], { icon: rider, zIndexOffset: 900 }).addTo(map);
        const pts: [number, number][] = [[Number(p.lat), Number(p.lng)]];
        if (home) pts.push([home.lat, home.lng]);
        map.fitBounds(L.latLngBounds(pts).pad(0.35));
        trackMap.current = map;
      } else {
        partnerMarker.current?.setLatLng([p.lat, p.lng]);
      }
    } else if (mapEl && !(window as any).L) {
      mapEl.style.display = 'none';
    }
  }

  /* polling while an order is shown */
  useEffect(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (!result || !resultPhone) return;
    const id = result.id;
    pollTimer.current = setInterval(async () => {
      try {
        const d2 = await api(`/api/orders/${encodeURIComponent(id)}?phone=${encodeURIComponent(resultPhone)}`);
        if (d2.order) setResult(prev => prev && prev.id === id ? { ...prev, deliveryPartner: d2.order.deliveryPartner } : prev);
        renderPartnerLive(d2, { ...result, deliveryPartner: d2.order.deliveryPartner });
      } catch { /* keep the last known position */ }
    }, 15000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, resultPhone]);

  /* paint the partner box whenever the order/partner changes */
  useEffect(() => {
    if (result) renderPartnerLive({ deliveryPartner: result.deliveryPartner }, result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.deliveryPartner?.lat, result?.deliveryPartner?.updatedAt]);

  /* ---------- track by id + phone ---------- */
  async function trackOrder(e?: React.FormEvent) {
    e?.preventDefault();
    const id = orderId.trim();
    const ph = phone.trim();
    if (!id || !ph) { toast('Enter your order ID and mobile number', 'error'); return; }
    setResult(null); setTrackMsg({ kind: 'info', text: 'Checking your order…' });
    setReviewStars(0); setReviewText(''); setReviewSent(false);
    try {
      const data = await api(`/api/orders/${encodeURIComponent(id)}?phone=${encodeURIComponent(ph)}`);
      if (data.phoneVerified === false) throw new Error('Mobile number does not match this order');
      setResult(data.order); setResultPhone(ph);
      setTrackMsg(null);
      setTimeout(() => renderPartnerLive(data, data.order), 50);
    } catch (err: any) {
      setResult(null);
      setTrackMsg({ kind: 'error', text: err?.message || 'Could not load this order' });
    }
  }

  async function sendReview() {
    if (!reviewStars) { toast('Tap the stars first — 1 to 5', 'error'); return; }
    try {
      await api('/api/reviews', { method: 'POST', body: JSON.stringify({ orderId: result!.id, phone: resultPhone, rating: reviewStars, text: reviewText }) });
      setReviewSent(true);
    } catch (err: any) {
      toast(err?.message || 'Could not send review', 'error');
    }
  }

  async function reorder() {
    if (!result || reordering) return;
    setReordering(true);
    try {
      const data = await api('/api/products');
      const byHandle = new Map<string, Product>(((data.products || []) as Product[]).map(p => [p.handle, p]));
      let added = 0, missed = 0;
      for (const item of result.items) {
        const product = byHandle.get(item.handle);
        if (product && product.active !== false && product.stock > 0) { addToCart(item.handle, item.qty); added++; }
        else missed++;
      }
      toast(added ? `${added} item${added === 1 ? '' : 's'} added to your basket${missed ? ` · ${missed} unavailable` : ''}` : 'These products are currently unavailable');
      if (added) window.location.href = '/cart';
      else setReordering(false);
    } catch (e: any) {
      toast(e?.message || 'Could not refill the basket', 'error');
      setReordering(false);
    }
  }

  /* ---------- order history by phone ---------- */
  async function loadHistory(e?: React.FormEvent) {
    e?.preventDefault();
    const ph = historyPhone.trim();
    if (ph.replace(/[^0-9]/g, '').length !== 10) { toast('Enter a valid 10-digit mobile number', 'error'); return; }
    setHistoryMsg({ kind: 'info', text: 'Loading your orders…' });
    setHistory(null);
    try {
      const data = await api('/api/orders/history?phone=' + encodeURIComponent(ph));
      if (!data.orders.length) { setHistoryMsg({ kind: 'info', text: 'No orders found for this number yet.' }); return; }
      setHistory(data.orders); setHistoryMsg(null);
    } catch (err: any) {
      setHistoryMsg({ kind: 'error', text: err?.message || 'Could not load orders' });
    }
  }

  function trackFromHistory(id: string, ph: string) {
    setOrderId(id); setPhone(ph);
    setTimeout(() => trackOrder(), 60);
    document.querySelector('[data-track-form]')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function cancelOrder(id: string, ph: string) {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return;
    try {
      await api(`/api/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ phone: ph }) });
      toast('Order cancelled');
      const data = await api('/api/orders/history?phone=' + encodeURIComponent(ph));
      setHistory(data.orders || []);
    } catch (err: any) {
      toast(err?.message || 'Could not cancel', 'error');
    }
  }

  return (
    <>
      <VanillaHeader />
      <main><section className="section"><div className="container" style={{ maxWidth: '730px' }}>
        <div className="shop-panel" style={{ padding: '32px' }}>
          <span className="eyebrow">Track order</span>
          <h1 className="section-title">Where is my delivery?</h1>
          <p className="section-subtitle" style={{ marginBottom: '22px' }}>Enter your Rebesta order ID and the mobile number used at checkout.</p>
          <form data-track-form className="form-grid" onSubmit={trackOrder}>
            <div className="field wide"><label htmlFor="orderId">Order ID</label><input id="orderId" name="orderId" required placeholder="RB-20260922-ABC123" value={orderId} onChange={e => setOrderId(e.target.value)} /></div>
            <div className="field wide"><label htmlFor="trackPhone">Mobile number</label><input id="trackPhone" name="phone" inputMode="tel" required placeholder="10-digit mobile used at checkout" value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <button className="button orange full" type="submit">Track order</button>
          </form>
          <div data-track-result style={{ marginTop: '20px' }}>
            {trackMsg && <div className={`alert ${trackMsg.kind}`}>{trackMsg.text}</div>}
            {result && (
              <>
                <div className="alert success"><strong>{result.id}</strong> is currently <strong>{result.status.replaceAll('_', ' ')}</strong>.</div>
                <div data-partner-live ref={partnerBoxRef} style={{ marginTop: '12px' }}></div>
                <div className="order-mini-list">
                  {result.items.map((i, idx) => (
                    <div className="order-mini" key={i.handle || idx}>
                      <img src={i.image} alt="" />
                      <div><strong>{i.title}</strong><br /><span>{i.qty} × {i.unitLabel}</span></div>
                    </div>
                  ))}
                </div>
                {result.deliveryPhoto && (
                  <div className="proof-box"><strong>📸 Delivery proof by your delivery partner</strong><img src={result.deliveryPhoto} alt="Delivery proof photo" loading="lazy" /></div>
                )}
                {result.status === 'DELIVERED' && !result.reviewed && !reviewSent && (
                  <div className="review-box" data-review-box>
                    <strong>⭐ How was your order?</strong>
                    <div className="star-row" data-star-row>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button type="button" key={n} className={`star-btn${n <= reviewStars ? ' on' : ''}`} data-star={n} aria-label={`${n} star`} onClick={() => setReviewStars(n)}>★</button>
                      ))}
                    </div>
                    <textarea className="review-text" data-review-text maxLength={400} placeholder="Tell others what you think (optional) — freshness, packing, delivery…" value={reviewText} onChange={e => setReviewText(e.target.value)}></textarea>
                    <button className="button primary full" type="button" data-review-send onClick={sendReview}>Send review</button>
                  </div>
                )}
                {(result.status === 'DELIVERED' && (result.reviewed || reviewSent)) && (
                  <div className="alert success">⭐ {result.reviewed ? 'Thanks for reviewing this order!' : 'Thank you! Your review will appear on the product page once approved.'}</div>
                )}
                {Number(result.discountInr) > 0 && <div className="summary-row coupon-applied-row"><span>Coupon {result.couponCode || ''}</span><strong>−{money(result.discountInr)}</strong></div>}
                <div className="summary-total"><span>Total</span><strong>{money(result.totalInr)}</strong></div>
                <button className="button primary" type="button" data-reorder style={{ marginTop: '14px' }} onClick={reorder} disabled={reordering}>{reordering ? 'Adding items…' : '🛒 Refill basket with this order'}</button>
              </>
            )}
          </div>
          <hr className="soft-divider" />
          <span className="eyebrow">Order history</span>
          <h2 className="section-title" style={{ fontSize: '1.3rem' }}>All my orders</h2>
          <p className="section-subtitle" style={{ marginBottom: '14px' }}>Enter just your mobile number to see every order, rewards and cancel options.</p>
          <form data-history-form className="form-grid" onSubmit={loadHistory}>
            <div className="field wide"><label htmlFor="historyPhone">Mobile number</label><input id="historyPhone" inputMode="tel" required placeholder="10-digit mobile" value={historyPhone} onChange={e => setHistoryPhone(e.target.value)} /></div>
            <button className="button primary full" type="submit">Show my orders</button>
          </form>
          <div data-history-result style={{ marginTop: '16px' }}>
            {historyMsg && <div className={`alert ${historyMsg.kind}`}>{historyMsg.text}</div>}
            {history && (
              <div className="history-list">
                {history.map(o => (
                  <div className="history-card" key={o.id}>
                    <div className="history-top"><strong>{o.id}</strong>{statusChip(o.status)}</div>
                    <div className="history-meta">{new Date(o.placedAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {o.itemCount} items · {money(o.totalInr)} · {o.paymentMethod === 'cod' ? 'COD' : 'Online'}</div>
                    {o.loyaltyCouponCode && <div className="reward-chip">🎁 Loyalty reward <strong>{o.loyaltyCouponCode}</strong> — ₹{o.loyaltyCouponValue} off your next order</div>}
                    {o.referralCouponCode && <div className="reward-chip">🤝 Referral reward <strong>{o.referralCouponCode}</strong></div>}
                    <div className="history-actions">
                      <button className="button ghost small" type="button" onClick={() => trackFromHistory(o.id, historyPhone)}>Track</button>
                      {o.cancellable && <button className="button danger small" type="button" onClick={() => cancelOrder(o.id, historyPhone)}>Cancel order</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter />
      <VanillaMobileCartBar />
    </>
  );
}
