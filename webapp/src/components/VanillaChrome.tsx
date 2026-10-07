/* Vanilla-exact runtime chrome for the phase 4 pages (order-success, track, login, account).

   On the vanilla site /js/store.js rewrites the page chrome at runtime:
   - every .header-location label becomes the loc-chip ("Delivering to …", opens the location sheet)
   - .bn-item matching the current path gets .bn-active
   - a floating .mobile-cart-bar appears on non-/cart pages once the basket has items
   This module reproduces that POST-store.js state with the same classes and styles.css. */

import { useEffect, useRef, useState } from 'react';
import { useToast } from './Toaster';
import { api, CART_EVENT, getSavedLocation, LOC_AREAS, LOCATION_EVENT, money, Product, readCart, saveLocation } from '../shared/store';
import { useCartCount } from '../shared/hooks';

const ICONS = {
  user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" /><path d="M5.5 19.5c1.3-3 3.8-4.6 6.5-4.6s5.2 1.6 6.5 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  cart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 3h2.2l2.9 12.2a1.7 1.7 0 0 0 1.7 1.3h8.9a1.7 1.7 0 0 0 1.6-1.3L22 8H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9.6" cy="20.2" r="1.7" fill="currentColor" /><circle cx="17.8" cy="20.2" r="1.7" fill="currentColor" /></svg>,
  home: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  activity: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h4l2-5 3 10 2-5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  whatsapp: <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.3-3 .8.8-2.9-.3-.4A8 8 0 0 1 12 4Zm-2.9 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.6.1a6.7 6.7 0 0 1-3.3-2.8c-.2-.4 0-.6.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.3 0-.4 0-.6L9.4 8.6c-.2-.4-.2-.6-.3-.6Z" /></svg>
};

const locationLabel = (loc: { label?: string; source?: string } | null) =>
  loc ? (String(loc.label || '').trim() || (loc.source === 'area' ? 'Selected area' : 'Selected pin')) : '';

/* ---------------- header (runtime loc-chip state) ---------------- */
/* help omitted → no whatsapp-link (subscriptions page header has account + cart only) */

export function VanillaHeader({ help, showAccount = true }: { help?: { text: string; href: string }; showAccount?: boolean }) {
  const count = useCartCount();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loc, setLoc] = useState(getSavedLocation());
  const badgeRef = useRef<HTMLSpanElement>(null);
  const prevCount = useRef(count);

  useEffect(() => {
    const upd = () => setLoc(getSavedLocation());
    window.addEventListener(LOCATION_EVENT, upd);
    window.addEventListener('storage', upd);
    return () => { window.removeEventListener(LOCATION_EVENT, upd); window.removeEventListener('storage', upd); };
  }, []);

  /* badge pop pulse on count change (store.js syncCartUI) */
  useEffect(() => {
    if (prevCount.current !== count && badgeRef.current) {
      const el = badgeRef.current;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    prevCount.current = count;
  }, [count]);

  return (
    <>
      <header className="site-header"><div className="container header-inner">
        <button type="button" className="header-location loc-chip-btn" title="Change delivery location" data-loc-wired="1" onClick={() => setSheetOpen(true)}>
          <span className="loc-chip-tx">
            <span className="loc-chip-lb">Delivering to</span>
            <strong><span data-loc-label>{locationLabel(loc) || 'Set location'}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></strong>
          </span>
        </button><span></span>
        <div className="header-actions">
          {help && <a className="whatsapp-link" href={help.href}>{help.text}</a>}
          {showAccount && <a className="hdr-icon account-link" href="/account" aria-label="Your account">{ICONS.user}</a>}
          <a className="cart-link hdr-icon" href="/cart" aria-label="Your basket">{ICONS.cart}<span ref={badgeRef} className={`cart-count${count ? '' : ' zero'}`} data-cart-count>{count}</span></a>
        </div>
      </div></header>
      {sheetOpen && <VanillaLocSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/* ---------------- location sheet (store.js buildLocationSheet, verbatim) ---------------- */

function VanillaLocSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);      /* 'open' class after rAF, like store.js */
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: string } | null>(null);
  const dragY = useRef<number | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setOpen(true));
    document.body.classList.add('sheet-open');
    return () => { document.body.classList.remove('sheet-open'); };
  }, []);

  const close = () => { setOpen(false); onClose(); };

  const choose = (location: { lat: number; lng: number; label: string; source: string }) => {
    saveLocation({ ...location, savedAt: new Date().toISOString() } as any);
    toast(`Delivering to ${locationLabel(location)}`);
    close();
  };

  const useGps = () => {
    if (!navigator.geolocation) { setStatus({ text: 'This browser does not support GPS — pick your area below instead.', type: 'error' }); return; }
    setStatus({ text: 'Finding your location…', type: '' });
    navigator.geolocation.getCurrentPosition(async position => {
      let label = 'Your location';
      try {
        const data: any = await api(`/api/location/reverse?lat=${encodeURIComponent(position.coords.latitude)}&lng=${encodeURIComponent(position.coords.longitude)}`);
        label = data.location?.label || label;
      } catch { }
      choose({ lat: position.coords.latitude, lng: position.coords.longitude, label, source: 'gps' });
    }, error => {
      setStatus({
        text: error.code === 1
          ? 'Location permission denied — pick your area below instead.'
          : 'Could not get GPS — pick your area below instead.',
        type: 'error'
      });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  };

  const dragProps = {
    onTouchStart: (e: React.TouchEvent) => { dragY.current = e.touches[0].clientY; },
    onTouchMove: (e: React.TouchEvent) => {
      if (dragY.current == null) return;
      const y = e.touches[0].clientY;
      if (y - dragY.current < -26) { setExpanded(true); dragY.current = null; }
      else if (y - dragY.current > 34) { setExpanded(false); dragY.current = null; }
    },
    onTouchEnd: () => { dragY.current = null; }
  };

  return (
    <>
      <div className="sheet-backdrop" data-loc-backdrop onClick={close} />
      <div className={`bottom-sheet${expanded ? ' expanded' : ''}${open ? ' open' : ''}`} data-loc-sheet role="dialog" aria-modal="true" aria-label="Choose delivery location">
        <div className="sheet-grab" aria-hidden="true" {...dragProps} />
        <div className="sheet-head" {...dragProps}>
          <h3>What&rsquo;s your location?</h3>
        </div>
        <button type="button" className="loc-gps" data-loc-gps onClick={useGps}>
          <span className="loc-gps-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.4" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
          <span className="loc-gps-tx"><strong>Use my current location</strong></span>
        </button>
        {status && <p className={`loc-status${status.type ? ' ' + status.type : ''}`} data-loc-status role="status">{status.text}</p>}
        <button type="button" className="loc-more-hint" data-loc-expand onClick={() => setExpanded(!expanded)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 15 6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>More options</button>
        <div className="loc-more" data-loc-more><div className="loc-more-in">
          <div className="loc-or" aria-hidden="true"><span>OR</span></div>
          <div className="loc-areas">
            <p className="loc-areas-title">Popular areas in Hosur</p>
            <div className="loc-chips">{LOC_AREAS.map(a => <button type="button" key={a.name} className="loc-chip" data-lat={a.lat} data-lng={a.lng} onClick={() => choose({ lat: a.lat, lng: a.lng, label: a.name, source: 'area' })}>{a.name}</button>)}</div>
          </div>
          <button type="button" className="loc-skip" data-loc-skip onClick={() => { try { localStorage.setItem('rebesta_loc_dismissed_v1', '1'); } catch { } close(); }}>Just browsing — I&rsquo;ll set it later</button>
        </div></div>
      </div>
    </>
  );
}

/* ---------------- bottom nav ---------------- */

export function VanillaBottomNav() {
  const here = location.pathname.replace(/\/+$/, '') || '/';
  return (
    <nav className="bottom-nav" aria-label="Quick navigation">
      <a className={`bn-item${here === '/' ? ' bn-active' : ''}`} href="/">{ICONS.home}<span>Home</span></a>
      <a className={`bn-item${here === '/track' ? ' bn-active' : ''}`} href="/track">{ICONS.activity}<span>Track</span></a>
      <a className="bn-item" href="https://wa.me/918438765119" target="_blank" rel="noopener">{ICONS.whatsapp}<span>WhatsApp</span></a>
    </nav>
  );
}

/* ---------------- footer: rich (track / order-success / info pages) or minimal (login / account / subscriptions) ----------------
   fssai: info pages fill the footer FSSAI line from /api/settings (vanilla inline script) */

export function VanillaFooter({ minimal = false, fssai = false }: { minimal?: boolean; fssai?: boolean }) {
  const [lic, setLic] = useState('');
  useEffect(() => {
    if (!fssai) return;
    let live = true;
    api('/api/settings').then((d: any) => { if (live && d?.business?.fssai) setLic('FSSAI Lic. No. ' + d.business.fssai); }).catch(() => { });
    return () => { live = false; };
  }, [fssai]);
  return (
    <footer className="minimal-footer">
      {!minimal && (
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
            <p>Morning slots: 7–9 AM &amp; 9–11 AM<br />Hosur · up to 9 km road radius<br />Free delivery over ₹500 · COD available<br />📍 Shanthi Nagar, Hosur – 635 109<br /><span data-fssai>{lic}</span></p>
          </div>
        </div>
      )}
      <div className="container minimal-footer-inner"><span>© 2026 Rebesta Fresh · Fresh from farms, Hosur</span></div>
    </footer>
  );
}

/* ---------------- floating basket bar (store.js initBasketRouting, non-/cart pages) ---------------- */

export function VanillaMobileCartBar() {
  const count = useCartCount();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let live = true;
    const compute = async () => {
      if (!readCart().length) { if (live) setTotal(0); return; }
      try {
        const data: any = await api('/api/products');
        if (!live) return;
        const map = new Map<string, Product>((data.products || []).map((p: Product) => [p.handle, p]));
        setTotal(readCart().reduce((sum, l) => sum + Number(map.get(l.handle)?.priceInr || 0) * l.qty, 0));
      } catch { }
    };
    compute();
    window.addEventListener(CART_EVENT, compute);
    return () => { live = false; window.removeEventListener(CART_EVENT, compute); };
  }, []);

  if (count <= 0) return null;
  return (
    <button type="button" className="mobile-cart-bar has-cart" data-mobile-cart onClick={() => { window.location.href = '/cart'; }}>
      <span className="mcb-info"><strong data-mobile-cart-text>{count} item{count === 1 ? '' : 's'} · {money(total)}</strong><small data-mobile-cart-sub>Ready for tomorrow morning</small></span>
      <span className="mcb-cta">View basket →</span>
    </button>
  );
}

/* live cart count for the header badge (shared localStorage) */
export { useCartCount } from '../shared/hooks';
