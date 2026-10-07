import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api, cartCount, CART_EVENT, getCartSnapshot, getLocSnapshot, getSavedLocation, LOCATION_EVENT, money, Product, saveCart, addToCart as storeAdd, setCartQty } from '../shared/store';
import { useToast } from '../components/Toaster';
import LocationSheet from '../components/LocationSheet';

/* ================= keys + constants (shared with the vanilla build) ================= */
const ADDR_KEY = 'rebesta_checkout_addr_v1';
const TIP_KEY = 'rebesta_checkout_tip_v1';
const COUPON_KEY = 'rebesta_checkout_coupon_v1';
const NOTES_KEY = 'rebesta_checkout_notes_v1';
const TIP_CHOICES = [0, 10, 20, 30];
const ADDON_RE = /coriander|curry|chilli|garlic|ginger|lemon|coconut|mint|amaranth|keerai|keera/i;
const ADD_TABS = [
  { id: 'popular', label: 'Popular', pick: (list: Product[]) => list.filter(p => p.featured) },
  { id: 'greens', label: 'Greens', pick: (list: Product[]) => list.filter(p => p.category === 'Leafy Greens') },
  { id: 'combos', label: 'Combos', pick: (list: Product[]) => list.filter(p => p.category === 'Combos & Kits') },
  { id: 'addons', label: 'Add-ons', pick: (list: Product[]) => list.filter(p => ADDON_RE.test(p.title) && p.category !== 'Combos & Kits') }
];
const PM_LABELS: Record<string, string> = { gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm UPI', upi: 'UPI · Card', cod: 'Cash on Delivery' };

interface Coupon { code: string; discountInr: number; minOrderInr?: number; type: string; value: number }
interface QuoteSlot { id: string; full: boolean }
interface Quote { eligible: boolean; deliveryFeeInr?: number; freeApplied?: boolean; distanceKm?: number; message?: string; slots?: QuoteSlot[] }
interface Customer { name?: string; phone?: string; email?: string }

function readPref<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return (v === null || v === undefined) ? fallback : v; } catch { return fallback; }
}
function writePref(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
function removePref(key: string) { try { localStorage.removeItem(key); } catch { /* private mode */ } }

/* ================= Cashfree hosted checkout (JS SDK, loaded on demand) ================= */
function loadCashfreeSdk(): Promise<void> {
  if ((window as any).Cashfree) return Promise.resolve();
  const urls = ['https://sdk.cashfree.com/js/v3/cashfree.js', 'https://js.cashfree.com/cashfree-js.js', 'https://js.cashfree.com/v2/cashfree.js'];
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) return reject(new Error('Could not load the payment page (script blocked). Check your network and try again.'));
      const script = document.createElement('script');
      script.src = urls[i++];
      script.onload = () => (window as any).Cashfree ? resolve() : tryNext();
      script.onerror = tryNext;
      document.head.appendChild(script);
    };
    tryNext();
  });
}
async function startCashfreeCheckout(payment: { sessionId: string; mode?: string }) {
  await loadCashfreeSdk();
  const mode = payment.mode === 'live' ? 'production' : 'sandbox';
  const Cashfree = (window as any).Cashfree;
  const cashfree = typeof Cashfree === 'function' ? Cashfree({ mode }) : await Cashfree.load({ mode });
  cashfree.checkout({ paymentSessionId: payment.sessionId, redirectTarget: '_self' });
}

/* vanilla-parity bottom-sheet timing: mount un-hidden, then add .open next frame;
   on close remove .open (CSS slides out) and hide after 340ms */
function useSheet() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const openSheet = () => { setMounted(true); requestAnimationFrame(() => setOpen(true)); };
  const closeSheet = () => { setOpen(false); setTimeout(() => setMounted(false), 340); };
  return { mounted, open, openSheet, closeSheet };
}

/* ================= page ================= */
export default function Cart() {
  const toast = useToast();

  /* live cart lines (shared localStorage) */
  const lines = useSyncExternalStore(
    cb => { window.addEventListener(CART_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(CART_EVENT, cb); window.removeEventListener('storage', cb); }; },
    getCartSnapshot
  );
  const loc = useSyncExternalStore(
    cb => { window.addEventListener(LOCATION_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(LOCATION_EVENT, cb); window.removeEventListener('storage', cb); }; },
    getLocSnapshot
  );

  const [products, setProducts] = useState<Product[]>([]);
  const byHandle = useMemo(() => new Map(products.map(p => [p.handle, p])), [products]);
  const [me, setMe] = useState<Customer | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [tip, setTip] = useState(0);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [addTab, setAddTab] = useState('popular');
  const [seg, setSeg] = useState('delivery');
  const [payApp, setPayApp] = useState('cod');
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const pm = useSheet();
  const auth = useSheet();
  const meRef = useRef<Customer | null>(null);
  const [addrEditOpen, setAddrEditOpen] = useState(false);
  const [couponMoreOpen, setCouponMoreOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(true);
  const [addr1, setAddr1] = useState('');
  const [pin, setPin] = useState('');
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payLabel, setPayLabel] = useState('Pay ₹0');
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
    for (const item of lines) { const p = byHandle.get(item.handle); if (p) sum += p.priceInr * item.qty; }
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
        const [productsData, meData] = await Promise.all([
          api('/api/products'),
          api('/api/auth/me').catch(() => null)
        ]);
        setProducts(productsData.products || []);
        setMe(meData?.customer || null);
        try { setOnlineEnabled(Boolean((await api('/api/settings'))?.payments?.onlineEnabled)); } catch { /* settings optional */ }
        try { setCoupons((await api('/api/coupon/list')).coupons || []); } catch { setCoupons([]); }
        try { setLastOrder(JSON.parse(localStorage.getItem('rebesta_last_order') || 'null')); } catch { setLastOrder(null); }
        const savedAddr = readPref<{ line1?: string; pincode?: string } | null>(ADDR_KEY, null);
        if (savedAddr?.line1) setAddr1(String(savedAddr.line1).slice(0, 120));
        if (savedAddr?.pincode) setPin(String(savedAddr.pincode).slice(0, 6));
        setTip(Math.min(100, Math.max(0, Number(readPref(TIP_KEY, 0)) || 0)));
        setNotes(String(readPref(NOTES_KEY, '') || '').slice(0, 250));
      } catch (e: any) {
        toast(e?.message || 'Could not load your basket', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (onlineEnabled) setPayApp('upi'); }, [onlineEnabled]);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => {
    document.body.classList.toggle('sheet-open', pm.open || auth.open || locSheetOpen);
    return () => document.body.classList.remove('sheet-open');
  }, [pm.open, auth.open, locSheetOpen]);

  /* auto-open location sheet (same feel as the rest of the site) */
  useEffect(() => {
    if (products.length && !getSavedLocation()) { const t = setTimeout(() => setLocSheetOpen(true), 900); return () => clearTimeout(t); }
  }, [products.length]);

  /* saved coupon re-apply */
  useEffect(() => {
    const saved = readPref<{ code?: string } | null>(COUPON_KEY, null);
    if (saved?.code) applyCoupon(saved.code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  /* ---------- quote (debounced on cart / pin / location) ---------- */
  async function refreshQuote(): Promise<Quote | null> {
    if (!lines.length) { setQuote(null); return null; }
    const saved = getSavedLocation() || {} as any;
    try {
      const data = await api('/api/quote', { method: 'POST', body: JSON.stringify({
        items: lines,
        location: Number.isFinite(saved.lat) ? { lat: saved.lat, lng: saved.lng } : {},
        address: { pincode: /^\d{6}$/.test(pin) ? pin : '' }
      }) });
      setQuote(data.quote || null);
      const q: Quote | null = data.quote || null;
      if (coupon && subtotal < Number(coupon.minOrderInr || 0)) {
        toast(`Coupon ${coupon.code} removed — basket is below ${money(Number(coupon.minOrderInr || 0))}`, 'error');
        removeCoupon();
      }
      return q;
    } catch { setQuote(null); return null; }
  }
  function scheduleQuote() {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(refreshQuote, 280);
  }
  useEffect(() => { scheduleQuote(); return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); }; }, [lines, pin, loc]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- coupons ---------- */
  async function applyCoupon(code: string, quiet = false) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    if (!quiet) setCouponMsg({ text: 'Checking…', error: false });
    try {
      const data = await api('/api/coupon/check', { method: 'POST', body: JSON.stringify({ code, subtotalInr: subtotal }) });
      setCoupon(data.coupon);
      writePref(COUPON_KEY, { code: data.coupon.code });
      if (!quiet) toast(`Coupon ${data.coupon.code} applied — you save ${money(data.coupon.discountInr)} 🎉`);
      setCouponMsg(null);
    } catch (error: any) {
      if (!quiet) setCouponMsg({ text: error?.message || 'That coupon is not valid', error: true });
      if (quiet) { setCoupon(null); removePref(COUPON_KEY); }
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

  /* ---------- payment method sheet ---------- */
  function selectPayApp(app: string) {
    if (app !== 'cod' && !onlineEnabled) { toast('Online payment setup is almost ready — please use Cash on Delivery today', 'error'); return; }
    setPayApp(app);
    pm.closeSheet();
  }

  /* ---------- login sheet: reuse the battle-tested /js/auth.js flow ---------- */
  function loadOtpSdk() {
    if (otpSdkLoaded.current || (window as any).initSendOTP) return;
    otpSdkLoaded.current = true;
    const config = {
      widgetId: '366a65687644323637363131',
      tokenAuth: '571380TgZrH8gvzsiK6aa8dedbP1',
      exposeMethods: true,
      captchaRenderId: 'bp-captcha',
      success: (data: unknown) => { (window as any).__otpWidgetSuccess = data; },
      failure: (error: unknown) => { (window as any).__otpWidgetFailure = error; }
    };
    const urls = ['https://verify.msg91.com/otp-provider.js', 'https://verify.phone91.com/otp-provider.js'];
    let i = 0;
    (function attempt() {
      const s = document.createElement('script');
      s.src = urls[i]; s.async = true; s.dataset.otpSdk = '1';
      s.onload = () => { if (typeof (window as any).initSendOTP === 'function') { try { (window as any).initSendOTP(config); } catch (e) { (window as any).__otpWidgetFailure = e; } } };
      s.onerror = () => { i += 1; if (i < urls.length) attempt(); };
      document.head.appendChild(s);
    })();
  }
  function openAuthSheet(afterLogin?: () => void) {
    afterLoginRef.current = afterLogin || null;
    auth.openSheet();
    loadOtpSdk();
    const s = document.createElement('script');
    s.src = '/js/auth.js?v=20261005d'; s.async = true;
    s.onload = () => {
      const RFSAuth = (window as any).RFSAuth;
      if (!RFSAuth || authBound.current || !authFormRef.current) return;
      authBound.current = true;
      RFSAuth.bindFlow(authFormRef.current, {
        onSuccess: async () => {
          let fresh: Customer | null = null;
          try { fresh = (await api('/api/auth/me')).customer || null; } catch { fresh = null; }
          setMe(fresh); meRef.current = fresh;
          auth.closeSheet();
          toast(`Welcome, ${(fresh?.name || 'friend').split(' ')[0]}! 🌿`);
          const next = afterLoginRef.current; afterLoginRef.current = null;
          if (typeof next === 'function') next();
        }
      });
    };
    document.head.appendChild(s);
  }

  /* ---------- place order ---------- */
  async function placeOrder() {
    if (addr1.trim().length < 5) { setAddrEditOpen(true); toast('Enter your house / flat / street address', 'error'); document.getElementById('bpAddr1')?.focus(); return; }
    if (!/^\d{6}$/.test(pin.trim())) { setAddrEditOpen(true); toast('Enter a 6-digit pincode', 'error'); document.getElementById('bpPin')?.focus(); return; }
    const saved = getSavedLocation();
    if (!saved) { toast('Pick your delivery area first', 'error'); setLocSheetOpen(true); return; }
    let currentQuote = quote || await refreshQuote();
    if (!currentQuote?.eligible) { toast(currentQuote?.message || 'We cannot deliver to this area yet', 'error'); return; }
    if (!meRef.current) { openAuthSheet(() => placeOrder()); return; }
    const me = meRef.current;
    const slot = (currentQuote.slots || []).find(s => !s.full);
    if (!slot) { toast('No delivery slots available right now — please try again in a few minutes', 'error'); return; }
    writePref(ADDR_KEY, { line1: addr1.trim(), pincode: pin.trim() });
    writePref(NOTES_KEY, notes.trim());
    if (coupon) writePref(COUPON_KEY, { code: coupon.code }); else removePref(COUPON_KEY);
    writePref(TIP_KEY, tip);
    const orderItems = lines;
    const payload: Record<string, unknown> = {
      customer: { name: me.name || '', phone: me.phone || '', email: me.email || '' },
      address: { line1: addr1.trim(), area: (saved as any).label || '', city: 'Hosur', pincode: pin.trim() },
      notes: notes.trim(),
      items: orderItems,
      slotId: slot.id,
      paymentMethod: payApp === 'cod' ? 'cod' : 'online',
      tipInr: Number(tip || 0)
    };
    if (coupon) payload.couponCode = coupon.code;
    if (Number.isFinite((saved as any).lat)) payload.location = { lat: (saved as any).lat, lng: (saved as any).lng };
    setPayBusy(true); setPayLabel('Placing order…');
    try {
      const order = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      saveCart([]);
      for (const key of [COUPON_KEY, TIP_KEY, NOTES_KEY]) removePref(key);
      try { localStorage.setItem('rebesta_last_order', JSON.stringify({ items: orderItems, at: Date.now() })); } catch { /* private mode */ }
      if (order.payment && order.payment.type === 'cashfree') {
        try {
          await startCashfreeCheckout(order.payment);
          setTimeout(() => { setPayBusy(false); setPayLabel(`Pay ${money(total)}`); }, 1500);
          return;
        } catch (error: any) {
          toast(error?.message || 'Could not open the payment page', 'error');
          await refreshQuote();
        }
      } else {
        window.location.href = `/order-success?id=${encodeURIComponent(order.orderId)}&phone=${encodeURIComponent(me.phone || '')}&whatsapp=${encodeURIComponent(order.whatsappUrl || '')}`;
      }
    } catch (error: any) {
      toast(error?.message || 'Could not place this order', 'error');
      await refreshQuote();
    } finally {
      setPayBusy(false); setPayLabel(`Pay ${money(total)}`);
    }
  }

  /* ---------- derived render data ---------- */
  const area = (loc && ((loc as any).label || (loc as any).area)) || 'Hosur';
  const addrLine = addr1.trim() ? `Home | ${addr1.trim()}, ${area}${pin.trim() ? ' ' + pin.trim() : ''}` : 'Home | Add delivery address';
  const couponDesc = (c: Coupon) => {
    const off = c.type === 'percent' ? `${Number(c.value)}% off` : `${money(Number(c.value))} off`;
    return c.minOrderInr ? `${off} on orders above ${money(Number(c.minOrderInr))}` : `${off} on any order`;
  };
  const railPicks = useMemo(() => {
    const inCart = new Map(lines.map(i => [i.handle, i.qty]));
    const pool = products.filter(p => p.active !== false && Number(p.stock) > 0);
    const seen = new Set<string>();
    const tab = ADD_TABS.find(t => t.id === addTab) || ADD_TABS[0];
    return { inCart, picks: tab.pick(pool).filter(p => (seen.has(p.handle) ? false : seen.add(p.handle))).slice(0, 8) };
  }, [products, lines, addTab]);

  const repeatKnown = useMemo(() => {
    const last = lastOrder;
    const fresh = last && Array.isArray(last.items) && last.items.length && Date.now() - (last.at || 0) < 45 * 864e5;
    if (!fresh) return null;
    const known = last!.items.filter(i => byHandle.has(i.handle));
    return known.length ? known : null;
  }, [lastOrder, byHandle]);

  const emptyPicks = products.filter(p => p.featured && p.active !== false && p.stock > 0).slice(0, 4);

  /* stepper button (items list + rail) */
  const Step = ({ handle, qty, floating }: { handle: string; qty: number; floating?: boolean }) => (
    <div className={`qty-stepper sw-step${floating ? ' sw-float-step' : ''}`}>
      <button type="button" data-cs="minus" data-handle={handle} data-qty={qty} onClick={() => setCartQty(handle, qty - 1)}>−</button>
      <span>{qty}</span>
      <button type="button" data-cs="plus" data-handle={handle} data-qty={qty} onClick={() => setCartQty(handle, qty + 1)}>+</button>
    </div>
  );

  return (
    <>
      <header className="site-header"><div className="container header-inner">
        <button type="button" className="header-location loc-chip-btn" title="Change delivery location" onClick={() => setLocSheetOpen(true)}>
          <span className="loc-chip-tx">
            <span className="loc-chip-lb">Delivering to</span>
            <strong><span data-loc-label>{loc?.label || 'Set location'}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></strong>
          </span>
        </button><span></span>
        <div className="header-actions">
          <a className="whatsapp-link" href="https://wa.me/918438765119">WhatsApp</a>
          <a className="hdr-icon account-link" href="/account" aria-label="Your account"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2"/><path d="M5.5 19.5c1.3-3 3.8-4.6 6.5-4.6s5.2 1.6 6.5 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></a>
          <a className="cart-link hdr-icon" href="/cart" aria-label="Your basket"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 3h2.2l2.9 12.2a1.7 1.7 0 0 0 1.7 1.3h8.9a1.7 1.7 0 0 0 1.6-1.3L22 8H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9.6" cy="20.2" r="1.7" fill="currentColor"/><circle cx="17.8" cy="20.2" r="1.7" fill="currentColor"/></svg><span className={`cart-count${count ? '' : ' zero'}`} data-cart-count>{count}</span></a>
        </div>
      </div></header>

      <main className="basket-main">
        <section className="sw-page">
          {/* empty state */}
          <div className="sw-card sw-empty" data-bp-empty hidden={lines.length > 0}>
            <div className="sw-empty-art">🥕</div>
            <h2>Your basket is empty</h2>
            <p>Add fresh vegetables and they'll show up right here.</p>
            {repeatKnown && (
              <div className="sw-repeat">
                <button className="sw-paybtn sw-paybtn-line" type="button" onClick={() => { repeatKnown.forEach(item => storeAdd(item.handle, item.qty)); toast(`${repeatKnown.length} products from your last order added`); }}>🔁 Repeat last order</button>
                <p>Adds every product from your previous order in one tap.</p>
              </div>
            )}
            <a className="sw-paybtn" href="/shop">Start shopping →</a>
            <div className="sw-empty-picks">
              <h3>Top picks right now</h3>
              <div className="sw-pick-grid" data-empty-picks-grid>
                {emptyPicks.map(p => (
                  <a className="sw-pick" key={p.handle} href={`/products/${p.handle}`}>
                    <img src={p.image} alt={p.title} loading="lazy" />
                    <b>{p.title}</b><span>{money(p.priceInr)}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* full basket */}
          <div data-bp-main hidden={lines.length === 0}>
            <div className="sw-card">
              <div className="sw-title-row"><h1 className="sw-title">Your basket</h1><span className="sw-count" data-bp-count>{count} item{count === 1 ? '' : 's'}</span></div>
              <button type="button" className={`sw-addr${addrEditOpen ? ' open' : ''}`} data-bp-addr-row onClick={() => { setAddrEditOpen(!addrEditOpen); if (!addrEditOpen && !addr1.trim()) setTimeout(() => document.getElementById('bpAddr1')?.focus(), 60); }}>
                <span className="sw-pin" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.7 3 9.8V21h5.9v-5.7h6.2V21H21V9.8L12 2.7Z"/></svg></span>
                <span className={`sw-addr-txt${addr1.trim() ? '' : ' is-empty'}`} data-bp-addr-line>{addrLine}</span>
                <span className="sw-chev" aria-hidden="true">›</span>
              </button>
              <div className="sw-addr-edit" data-bp-addr-edit hidden={!addrEditOpen}>
                <div className="fx-field bp-fx"><input id="bpAddr1" data-bp-addr1 autoComplete="street-address" placeholder=" " value={addr1} onChange={e => setAddr1(e.target.value)} /><label htmlFor="bpAddr1">House / flat / street</label></div>
                <div className="fx-field bp-fx bp-fx-pin"><input id="bpPin" data-bp-pin inputMode="numeric" maxLength={6} autoComplete="postal-code" placeholder=" " value={pin} onChange={e => setPin(e.target.value)} /><label htmlFor="bpPin">Pincode</label></div>
                <button type="button" className="sw-area-link" data-bp-area onClick={() => setLocSheetOpen(true)}>📍 Change area — pick your locality</button>
              </div>
              <div className="sw-saved-banner" data-bp-saved-banner hidden={!(savings > 0)}>🎉 <b data-bp-saved-banner-amt>{money(savings)} saved!</b> On this order</div>
              <div className="sw-items" data-bp-items>
                {lines.map(item => {
                  const p = byHandle.get(item.handle);
                  if (!p) return null;
                  const compare = Number(p.compareAtInr || 0) > Number(p.priceInr || 0) ? Number(p.compareAtInr) : 0;
                  return (
                    <div className="sw-item" key={item.handle}>
                      <img src={p.image} alt="" loading="lazy" />
                      <div className="sw-item-l"><b>{p.title}</b><small>{p.unitLabel || ''}</small>
                        <div className="sw-item-price-l">{money(p.priceInr)}{compare ? <> <s>{money(compare)}</s><span className="sw-off">{Math.round((compare - p.priceInr) * 100 / compare)}% OFF</span></> : null}</div>
                      </div>
                      <Step handle={item.handle} qty={item.qty} />
                    </div>
                  );
                })}
              </div>
              <div className="sw-chips">
                <button type="button" className="sw-chip" data-bp-addmore onClick={() => { window.location.href = '/shop'; }}>
                  <span className="sw-chip-ic" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg></span>
                  Add Items
                </button>
                <button type="button" className="sw-chip" data-bp-notes-toggle onClick={() => { setSeg('instructions'); setTimeout(() => (document.querySelector('[data-bp-notes-input]') as HTMLTextAreaElement | null)?.focus(), 60); }}>
                  <span className="sw-chip-ic" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19.5 8.5a2.12 2.12 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg></span>
                  Delivery instructions
                </button>
              </div>
            </div>

            <div className="sw-card" data-bp-complete hidden={!products.length}>
              <h4 className="sw-sec">COMPLETE YOUR BASKET</h4>
              <div className="sw-tabs" data-bp-tabs>
                {ADD_TABS.map(t => <button type="button" key={t.id} className={`sw-tab${t.id === addTab ? ' on' : ''}`} data-bp-tab={t.id} onClick={() => setAddTab(t.id)}>{t.label}</button>)}
              </div>
              <div className="sw-rail" data-bp-rail>
                {railPicks.picks.map(p => {
                  const qty = railPicks.inCart.get(p.handle) || 0;
                  const compare = Number(p.compareAtInr || 0) > Number(p.priceInr || 0) ? Number(p.compareAtInr) : 0;
                  return (
                    <div className="sw-pcard" key={p.handle}>
                      <div className="sw-pimg">
                        <img src={p.image} alt="" loading="lazy" />
                        {qty ? <Step handle={p.handle} qty={qty} floating /> : (
                          <button type="button" className="sw-add" data-cs-action="add" data-handle={p.handle} aria-label={`Add ${p.title}`} onClick={() => storeAdd(p.handle, 1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></svg></button>
                        )}
                      </div>
                      <div className="sw-pname">{p.title}</div>
                      <div className="sw-pprice">{money(p.priceInr)}{compare ? <> <s>{money(compare)}</s><span className="sw-off">{Math.round((compare - p.priceInr) * 100 / compare)}% OFF</span></> : null} <small>· {p.unitLabel || ''}</small></div>
                    </div>
                  );
                })}
                {railPicks.picks.length === 0 && <p className="sw-rail-empty">Nothing here right now — check the other tabs!</p>}
              </div>
            </div>

            <div className="sw-card" data-bp-savings hidden={!coupons || !coupons.length}>
              <h4 className="sw-sec">SAVINGS CORNER</h4>
              <button type="button" className="sw-coupon-row" data-bp-coupon-toggle hidden={Boolean(coupon)} onClick={() => setCouponMoreOpen(!couponMoreOpen)}>
                <span className="sw-pct" aria-hidden="true">%</span><span className="sw-opt-txt">Apply Coupon</span><span className="sw-chev" aria-hidden="true">›</span>
              </button>
              <div className="sw-coupon-more" data-bp-coupon-more hidden={!couponMoreOpen || Boolean(coupon)}>
                <div className="sw-coupon-cards" data-bp-coupon-cards>
                  {(coupons || []).map(c => {
                    const applied = coupon && coupon.code === c.code;
                    return (
                      <div className={`sw-crow${applied ? ' on' : ''}`} key={c.code}>
                        <span className="sw-pct" aria-hidden="true">%</span>
                        <div className="sw-crow-l"><b>{c.code}</b><small>{couponDesc(c)}</small></div>
                        {applied ? <span className="sw-capplied">✓ Applied</span> : <button type="button" className="sw-crow-apply" data-bp-apply-code={c.code} onClick={() => applyCoupon(c.code)}>APPLY</button>}
                      </div>
                    );
                  })}
                </div>
                <div className="sw-coupon-manual">
                  <input id="bpCouponInput" data-bp-coupon-input placeholder="Enter coupon code" maxLength={24} autoComplete="off" value={couponInput} onChange={e => setCouponInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(couponInput); } }} />
                  <button type="button" className="sw-apply" data-bp-coupon-apply-btn onClick={() => applyCoupon(couponInput)}>APPLY</button>
                </div>
                <p className="sw-coupon-msg" data-bp-coupon-msg hidden={!couponMsg}>{couponMsg?.text}</p>
              </div>
              <div className="sw-applied" data-bp-coupon-on hidden={!coupon}>
                {coupon && (
                  <>
                    <span>🎟 <b>{money(Number(coupon.discountInr) || 0)} saved</b> with '{coupon.code}' <span className="sw-capplied">✓ Applied</span></span>
                    <button type="button" className="sw-coupon-x" data-bp-coupon-x aria-label="Remove coupon" onClick={removeCoupon}>✕</button>
                  </>
                )}
              </div>
            </div>

            <div className="sw-seg" role="tablist">
              <button type="button" className={`sw-seg-btn${seg === 'delivery' ? ' on' : ''}`} data-bp-seg="delivery" onClick={() => setSeg('delivery')}>Delivery Type</button>
              <button type="button" className={`sw-seg-btn${seg === 'tip' ? ' on' : ''}`} data-bp-seg="tip" onClick={() => setSeg('tip')}>Tip</button>
              <button type="button" className={`sw-seg-btn${seg === 'instructions' ? ' on' : ''}`} data-bp-seg="instructions" onClick={() => setSeg('instructions')}>Instructions</button>
            </div>
            <div className="sw-card sw-segcard">
              <div className="sw-panel" data-bp-panel="delivery" hidden={seg !== 'delivery'}>
                <div className="sw-del on">
                  <span className="sw-radio on" aria-hidden="true"></span>
                  <div className="sw-del-l"><b>Standard</b><small>Minimal order grouping</small></div>
                </div>
                <div className="sw-del off" aria-disabled="true">
                  <span className="sw-radio" aria-hidden="true"></span>
                  <div className="sw-del-l"><b>Drone delivery</b><small>Hover-drop to your doorstep</small></div>
                  <span className="sw-soon">COMING SOON</span>
                </div>
                <p className="sw-fee" data-bp-fee>
                  {quote && !eligible ? (quote.message || 'We cannot deliver to this area yet.')
                    : eligible ? (quote!.freeApplied
                      ? `Free delivery applied · ${quote!.distanceKm ? quote!.distanceKm + ' road km' : 'Hosur'}`
                      : `Delivery ${money(Number(quote!.deliveryFeeInr || 0))} · ${quote!.distanceKm ? quote!.distanceKm + ' road km from the hub' : 'local morning delivery'}`)
                    : 'Set your delivery location to check availability.'}
                </p>
              </div>
              <div className="sw-panel" data-bp-panel="tip" hidden={seg !== 'tip'}>
                <p className="sw-tip-note">100% of your tip goes to the delivery partner</p>
                <div className="sw-tip-chips" data-bp-tips>
                  {TIP_CHOICES.map(v => (
                    <button type="button" key={v} className={`sw-tip-chip${tip === v ? ' on' : ''}`} data-tip={v} onClick={() => { setTip(v); writePref(TIP_KEY, v); }}>{v ? money(v) : 'No tip'}</button>
                  ))}
                </div>
              </div>
              <div className="sw-panel" data-bp-panel="instructions" hidden={seg !== 'instructions'}>
                <textarea className="sw-notes" data-bp-notes-input maxLength={250} rows={3} placeholder="Gate code, nearby shop, call on arrival…" value={notes} onChange={e => onNotesChange(e.target.value)}></textarea>
              </div>
            </div>

            <div className={`sw-card sw-bill${billOpen ? ' open' : ''}`} data-bp-bill hidden={lines.length === 0}>
              <button type="button" className="sw-bill-top" data-bp-bill-toggle aria-expanded={billOpen} onClick={() => setBillOpen(!billOpen)}>
                <span className="sw-bill-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 3h12v18l-2.5-1.6L13 21l-2-1.6L9 21l-2.5-1.6L6 21V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9.5 8h5M9.5 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span>
                <span className="sw-bill-toplabel">To Pay</span>
                <span className="sw-strike" data-bp-strike hidden={!(savings > 0)}>{savings > 0 ? money(total + savings) : ''}</span>
                <strong data-bp-pay-total>{money(total)}</strong>
                <span className="sw-chev" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
              </button>
              <div className="sw-bill-body" data-bp-bill-body>
                <p className="sw-bill-saved" data-bp-saved hidden={!(savings > 0)}>{savings > 0 ? `${money(savings)} saved on the total!` : ''}</p>
                <div data-bp-bill-rows>
                  <div className="sw-bill-row"><span>Item Total</span><span>{money(subtotal)}</span></div>
                  <div className="sw-bill-row"><span>Delivery Fee{eligible && quote?.distanceKm ? <> <small className="sw-km">| {Number(quote.distanceKm).toFixed(1)} kms</small></> : null}</span><span>{fee === null ? '—' : (fee === 0 ? 'FREE' : money(fee))}</span></div>
                  <p className="sw-free-note">Free delivery applicable on orders above {money(500)}</p>
                  <div className="sw-bill-row"><span>Delivery Tip</span>{tip ? <span>{money(tip)}</span> : <button type="button" className="sw-addtip" data-bp-gotip onClick={() => setSeg('tip')}>Add tip</button>}</div>
                  <div className="sw-bill-row sw-bill-final"><span>To Pay</span><span>{money(total)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* sticky pay bar (Swiggy style) */}
      <div className="sw-paybar" data-bp-paybar hidden={lines.length === 0}>
        <button type="button" className="sw-payusing" data-bp-pay-method onClick={pm.openSheet}>
          <small>PAY USING</small>
          <span className="sw-method"><span data-bp-pm-label>{PM_LABELS[payApp] || 'Cash on Delivery'}</span> <span className="sw-chev" aria-hidden="true">▾</span></span>
        </button>
        <button type="button" className="sw-paybtn" data-bp-pay disabled={!eligible || payBusy} onClick={placeOrder}>{payBusy ? payLabel : `Pay ${money(total)}`}</button>
      </div>

      {/* payment options sheet (Swiggy-style) */}
      <div className={`bottom-sheet sw-pm-sheet${pm.open ? ' open' : ''}`} data-bp-pm-sheet hidden={!pm.mounted} role="dialog" aria-modal="true" aria-label="Payment options">
        <div className="sheet-grab" aria-hidden="true"></div>
        <button type="button" className="sheet-close" data-bp-pm-close aria-label="Close" onClick={pm.closeSheet}>✕</button>
        <h3 className="sw-pm-title">Payment Options</h3>
        <p className="sw-pm-sub" data-bp-pm-sub>{count} item{count === 1 ? '' : 's'} · {money(total)}</p>
        <div className="sw-pm-list">
          {([['gpay', 'Google Pay'], ['phonepe', 'PhonePe'], ['paytm', 'Paytm UPI'], ['upi', null], ['cod', null]] as [string, string | null][]).map(([app, label]) => (
            <button key={app} type="button"
              className={`sw-pm-row${payApp === app ? ' on' : ''}${app !== 'cod' && !onlineEnabled ? ' off' : ''}`}
              data-pm={app === 'cod' ? 'cod' : 'online'} data-app={app}
              onClick={() => selectPayApp(app)}>
              {app === 'gpay' && <span className="sw-pm-ico sw-ico-app" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.6h11.9c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.9-9.1 6.9-15.8z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.2-5.4l-6.7-5.2C29.8 36.5 27.2 37.4 24 37.4c-5.7 0-10.6-3.8-12.3-9l-7 5.4C8 42.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4l-7-5.4C3.3 17.1 2.4 20.4 2.4 24s.9 6.9 2.3 9.8l7-5.4z"/><path fill="#EA4335" d="M24 10.6c3.3 0 5.6 1.4 6.9 2.6l6-5.9C34.1 4.5 30 2.4 24 2.4 15.4 2.4 8 6.3 4.7 14.2l7 5.4c1.7-5.2 6.6-9 12.3-9z"/></svg></span>}
              {app === 'phonepe' && <span className="sw-pm-ico sw-ico-app sw-ico-pp" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#5F259F"/><path d="M17 12h8.2c4.4 0 7.4 2.6 7.4 6.5 0 2.7-1.4 4.7-3.8 5.7l4.4 11.8h-5.5l-3.8-10.8h-2.1v10.8H17V12Zm5.5 4.4v4.6h2.2c1.7 0 2.7-.9 2.7-2.3s-1-2.3-2.7-2.3h-2.2Z" fill="#fff"/></svg></span>}
              {app === 'paytm' && <span className="sw-pm-ico sw-ico-app" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#fff" stroke="#e3e2e8"/><text x="24" y="30" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="13"><tspan fill="#20336B">pay</tspan><tspan fill="#00BAF2">tm</tspan></text></svg></span>}
              {app === 'upi' && <span className="sw-pm-ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 10c0-3.5 3.6-6 8-6s8 2.5 8 6-3.6 6-8 6h-1.2l-2.4 2.4H6v-2.6C4.7 14.7 4 12.5 4 10Z" stroke="#1B7A4B" strokeWidth="1.7" strokeLinejoin="round"/><path d="M12 7.4v5.2M9.8 8.9h3.1a1.4 1.4 0 0 1 0 2.8H9.8h3.4a1.4 1.4 0 0 1 0 2.8h-3.6" stroke="#1B7A4B" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
              {app === 'cod' && <span className="sw-pm-ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6.5" width="19" height="11" rx="2" stroke="#1B7A4B" strokeWidth="1.7"/><circle cx="12" cy="12" r="2.6" stroke="#1B7A4B" strokeWidth="1.7"/><path d="M6 9.5v5M18 9.5v5" stroke="#1B7A4B" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
              {app === 'gpay' || app === 'phonepe' || app === 'paytm' ? <span className="sw-pm-l"><b>{label}</b></span> : null}
              {app === 'upi' ? <span className="sw-pm-l"><b>All UPI Apps · Cards · Netbanking</b><small>More options inside secure Cashfree checkout</small></span> : null}
              {app === 'cod' ? <span className="sw-pm-l"><b>Cash on Delivery</b><small>Pay when the vegetables reach your door</small></span> : null}
              <span className="sw-radio" aria-hidden="true"></span>
            </button>
          ))}
        </div>
        <p className="sw-pm-note">🔒 100% secure payments · Powered by Cashfree</p>
      </div>
      <div className={`sheet-backdrop${pm.open ? ' open' : ''}`} data-bp-pm-backdrop hidden={!pm.mounted} onClick={pm.closeSheet}></div>

      {/* phone-number login sheet — static JSX island bound by /js/auth.js (RFSAuth.bindFlow) */}
      <div className={`bottom-sheet bp-auth-sheet${auth.open ? ' open' : ''}`} data-bp-auth-sheet hidden={!auth.mounted} role="dialog" aria-modal="true" aria-label="Login">
        <div className="sheet-grab" aria-hidden="true"></div>
        <button type="button" className="sheet-close" data-bp-auth-close aria-label="Close" onClick={auth.closeSheet}>✕</button>
        <form className="auth-form" data-bp-flow noValidate ref={authFormRef}>
          <p className="cart-auth-note">Login to proceed — one quick SMS code 🔐</p>
          <div className="auth-step" data-step="number">
            <div className="fx-field fx-phone"><input id="bpPhone" data-flow-phone inputMode="tel" autoComplete="tel" placeholder=" " defaultValue="" /><label htmlFor="bpPhone">Mobile number</label><span className="fx-prefix"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h3l2 4-2 2a12 12 0 0 0 5 5l2-2 4 2v3a2 2 0 0 1-2 2A16 16 0 0 1 2 8a2 2 0 0 1 2-2Z" fill="currentColor"/></svg>+91</span></div>
            <div className="captcha-slot"><div id="bp-captcha" className="otp-captcha"></div></div>
            <button className="btn-main" type="button" data-flow-send><span className="btn-label">Send code by SMS</span></button>
          </div>
          <div className="auth-step" data-step="code" hidden>
            <div className="sent-chip"><div><b data-flow-sentto></b><span>Code sent · valid 15 minutes</span></div></div>
            <div className="otp-boxes" data-flow-boxes></div>
            <p className="otp-hint">Enter the code from the SMS</p>
            <button className="btn-main" type="submit" data-flow-verify><span className="btn-label">Verify &amp; continue</span></button>
            <p className="otp-resend">Didn't get it? <a href="#" data-flow-resend>Resend code</a> · <a href="#" data-flow-change>Wrong number?</a></p>
          </div>
          <div className="auth-step" data-step="name" hidden>
            <div className="sent-chip"><div><b data-flow-newto></b><span>Number verified! You're new here — one last thing.</span></div></div>
            <div className="fx-field"><input id="bpName" data-flow-name autoComplete="name" placeholder=" " defaultValue="" /><label htmlFor="bpName">What should we call you?</label></div>
            <button className="btn-main" type="submit" data-flow-create><span className="btn-label">Create my account</span></button>
            <p className="otp-resend"><a href="#" data-flow-restart>← Use a different number</a></p>
          </div>
          <p className="flow-error" data-flow-error hidden></p>
          <button type="button" className="cart-auth-back" data-bp-auth-cancel onClick={auth.closeSheet}>← Back to basket</button>
        </form>
      </div>
      <div className="sheet-backdrop" data-bp-auth-backdrop hidden={!auth.open} onClick={auth.closeSheet}></div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        <a className="bn-item" href="/"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Home</span></a>
        <a className="bn-item" href="/track"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h4l2-5 3 10 2-5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span>Track</span></a>
        <a className="bn-item" href="https://wa.me/918438765119" target="_blank" rel="noopener"><svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.3-3 .8.8-2.9-.3-.4A8 8 0 0 1 12 4Zm-2.9 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.6.1a6.7 6.7 0 0 1-3.3-2.8c-.2-.4 0-.6.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.3 0-.4 0-.6L9.4 8.6c-.2-.4-.2-.6-.3-.6Z"/></svg><span>WhatsApp</span></a>
      </nav>

      <footer className="minimal-footer">
        <div className="container footer-rich">
          <div className="footer-brand">
            <a className="footer-logo" href="/" aria-label="Rebesta Fresh home"><img src="/assets/brand/logo.png" alt="Rebesta Fresh" /></a>
            <p>Handpicked vegetables from local farms, delivered fresh to your doorstep in Hosur every morning.</p>
          </div>
          <div className="footer-col">
            <h4>Quick links</h4>
            <a href="/#shop">Shop fresh stock</a>
            <a href="/cart">Your basket</a>
            <a href="/checkout">Checkout</a>
            <a href="/track">Track order</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="/about">About us</a>
            <a href="/faq">FAQ</a>
            <a href="/terms">Terms of use</a>
            <a href="/privacy">Privacy policy</a>
            <a href="/refund">Refund &amp; cancellation</a>
          </div>
          <div className="footer-col">
            <h4>Contact &amp; delivery</h4>
            <a href="https://wa.me/918438765119" target="_blank" rel="noopener">WhatsApp +91 84387 65119</a>
            <a href="mailto:warehouseretailingmart@gmail.com" data-temp-email>warehouseretailingmart@gmail.com</a>
            <p>Morning slots: 7–9 AM &amp; 9–11 AM<br />Hosur · up to 9 km road radius<br />Free delivery over ₹500 · COD available<br />📍 Shanthi Nagar, Hosur – 635 109<br /><span data-fssai></span></p>
          </div>
        </div>
        <div className="container minimal-footer-inner"><span>© 2026 Rebesta Fresh · Fresh from farms, Hosur</span></div>
      </footer>

      {locSheetOpen && <LocationSheet onClose={() => setLocSheetOpen(false)} onPicked={() => setLocSheetOpen(false)} />}
    </>
  );
}
