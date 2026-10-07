import { useEffect, useState } from 'react';
import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';
import { api, money } from '../shared/store';

interface OrderItem { handle: string; title: string; qty: number; unitLabel: string; image: string; lineTotalInr: number; priceInr: number }
interface Order {
  id: string; status: string; paymentStatus: string; paymentMethod: string;
  subtotalInr: number; discountInr: number; couponCode?: string; deliveryFeeInr: number; tipInr: number;
  distanceKm?: number; totalInr: number; items: OrderItem[]; slot?: { label: string }; deliveryDate?: { label: string };
  history: { status: string; at: string }[];
}

export default function OrderSuccess() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || '';
  const phone = params.get('phone') || '';
  const whatsapp = params.get('whatsapp') || '';
  const paymentState = params.get('payment') || '';

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [rewards, setRewards] = useState<{ loyaltyEnabled: boolean; referralEnabled: boolean; referralBonusInr: number } | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) { setError('Order ID missing. Return to the basket and try again.'); return; }
      try {
        const data = await api(`/api/orders/${encodeURIComponent(id)}${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`);
        setOrder(data.order);
        /* remember for 'Repeat last order' on the empty basket page */
        const o = data.order as Order;
        try {
          if (Array.isArray(o.items) && o.items.length && o.paymentStatus !== 'FAILED') {
            localStorage.setItem('rebesta_last_order', JSON.stringify({
              id: o.id, at: Date.now(),
              items: o.items.map(i => ({ handle: i.handle, qty: Number(i.qty) || 1 })).filter((i: any) => i.handle)
            }));
          }
        } catch { /* silent */ }
        /* anonymous GA purchase event (no-ops unless GA is configured) */
        try {
          if (typeof (window as any).gtag === 'function' && o.paymentStatus !== 'FAILED') {
            const key = `ga-purchase-${o.id}`;
            let seen = false; try { seen = Boolean(sessionStorage.getItem(key)); sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
            if (!seen) (window as any).gtag('event', 'purchase', {
              transaction_id: o.id, value: Number(o.totalInr) || 0, currency: 'INR',
              items: (o.items || []).map(i => ({ item_id: i.handle || i.title, item_name: i.title, price: Number(i.lineTotalInr && i.qty ? i.lineTotalInr / i.qty : i.priceInr) || 0, quantity: Number(i.qty) || 1 }))
            });
          }
        } catch { /* never break the success page for analytics */ }
      } catch (e: any) {
        setError(e?.message || 'Could not load this order');
      }
    })();
    api('/api/settings').then((s: any) => setRewards(s.rewards || null)).catch(() => {});
  }, []);

  const badge = (() => {
    if (paymentState === 'paid' || (order && order.paymentStatus === 'PAID')) return { text: 'Payment verified', cls: 'badge green', title: 'Payment received. Your vegetables are locked.' };
    if (paymentState === 'failed' || (order && order.paymentStatus === 'FAILED')) return { text: 'Payment not completed', cls: 'badge orange', title: 'Payment was not completed.' };
    if (order && order.paymentMethod === 'online' && order.paymentStatus === 'PENDING') return { text: 'Payment pending', cls: 'badge orange', title: 'We are waiting for payment verification.' };
    return { text: 'Order received', cls: 'badge green', title: 'Your vegetables are locked.' };
  })();

  const historyRows = order ? (order.history || []).slice(-5).reverse() : [];

  return (
    <>
      <VanillaHeader help={{ text: 'Track order', href: '/track' }} />
      <main><section className="section"><div className="container">
        <div className="success-box">
          <div className="success-icon"><svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          <span className={badge.cls} data-status-badge>{badge.text}</span>
          <h1 data-success-title>{badge.title}</h1>
          <p className="section-subtitle" style={{ marginInline: 'auto' }}>
            <span className="order-id-box" data-order-id>{order ? order.id : 'Loading order ID…'}</span>
          </p>
          <p data-order-copy>{order ? `${money(order.totalInr)} · ${order.slot?.label || 'Morning delivery'} · ${order.deliveryDate?.label || ''}` : 'We are preparing the details…'}</p>
          <div className="success-actions">
            {whatsapp
              ? <a className="button orange" href={whatsapp} target="_blank" rel="noopener">Confirm on WhatsApp</a>
              : <a className="button orange" href={`https://wa.me/918438765119?text=${encodeURIComponent('Hi! Confirming my order ' + (order?.id || ''))}`} target="_blank" rel="noopener">Confirm on WhatsApp</a>}
            <a className="button ghost" href="/track">Track order</a>
            <a className="button ghost" href="/subscriptions">🔁 Manage weekly basket</a>
          </div>
          <div data-order-summary style={{ textAlign: 'left', marginTop: '28px' }}>
            {error && <div className="alert error">{error}</div>}
            {!error && !order && <div className="alert info">Loading your order…</div>}
            {order && (
              <>
                <div className="order-mini-list">
                  {order.items.map(item => (
                    <div className="order-mini" key={item.handle || item.title}>
                      <img src={item.image} alt={item.title} />
                      <div><strong>{item.title}</strong><br /><span>{item.qty} × {item.unitLabel}</span></div>
                      <div className="price">{money(item.lineTotalInr)}</div>
                    </div>
                  ))}
                </div>
                <div className="summary-row"><span>Product amount</span><strong>{money(order.subtotalInr)}</strong></div>
                {Number(order.discountInr) > 0 && <div className="summary-row coupon-applied-row"><span>Coupon {order.couponCode || ''}</span><strong>−{money(order.discountInr)}</strong></div>}
                <div className="summary-row"><span>Delivery ({Number(order.distanceKm || 0).toFixed(2)} road km)</span><strong>{money(order.deliveryFeeInr)}</strong></div>
                {Number(order.tipInr) > 0 && <div className="summary-row"><span>Delivery tip</span><strong>{money(order.tipInr)}</strong></div>}
                <div className="summary-total"><span>Total</span><strong>{money(order.totalInr)}</strong></div>
                <div className="track-list">
                  {historyRows.map(row => (
                    <div className="track-row" key={row.at + row.status}>
                      <span className="track-dot">✓</span>
                      <div><strong>{row.status.replaceAll('_', ' ')}</strong><br /><span>{new Date(row.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></div>
                    </div>
                  ))}
                </div>
                {rewards && (rewards.loyaltyEnabled || rewards.referralEnabled) && (
                  <div className="rewards-teaser">
                    {rewards.loyaltyEnabled && <div>🎁 <strong>Earn a reward:</strong> once this order is delivered you get a LOY- coupon (about 2% back) on the <a href="/track">Track page</a></div>}
                    {rewards.referralEnabled && (() => {
                      const myPhone = (phone || '').replace(/\D/g, '').slice(-10);
                      const shareText = `🥬 I order fresh vegetables from Rebesta Fresh (Hosur) — morning delivery, exact weight, COD available.\n\nEnter my number ${myPhone} in "Referred by a friend" at checkout and we both get ₹${rewards.referralBonusInr || 50} off after your first delivery 🎁\nhttps://rebestafresh.in`;
                      return (
                        <div>
                          🤝 <strong>Refer a friend:</strong> give them your mobile number to enter at checkout — you both get ₹{rewards.referralBonusInr || 50} after their first delivery
                          {myPhone && <a className="button primary small" style={{ marginLeft: '8px' }} href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener">Share on WhatsApp</a>}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
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
