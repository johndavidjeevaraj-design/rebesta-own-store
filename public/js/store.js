(() => {
  const CART_KEY = 'rebesta_own_cart_v1';
  const LOCATION_KEY = 'rebesta_own_location_v1';

  const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: Number(value) % 1 ? 2 : 0
  }).format(Number(value || 0));

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(cart)) return [];
      return cart
        .map(item => ({ handle: String(item.handle || ''), qty: Number.parseInt(item.qty, 10) }))
        .filter(item => item.handle && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 50);
    } catch { return []; }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('rebesta:cart-changed', { detail: readCart() }));
  }

  function cartCount() {
    return readCart().reduce((sum, item) => sum + item.qty, 0);
  }

  function cartSubtotal(productRows = []) {
    const byHandle = new Map(productRows.map(product => [product.handle, product]));
    return readCart().reduce((sum, item) => sum + (Number(byHandle.get(item.handle)?.priceInr || 0) * item.qty), 0);
  }

  function addItem(handle, qty = 1, silent = false) {
    const cart = readCart();
    const row = cart.find(item => item.handle === handle);
    const quantity = Math.min(50, Math.max(1, Number.parseInt(qty, 10) || 1));
    if (row) row.qty = Math.min(50, row.qty + quantity);
    else cart.push({ handle, qty: quantity });
    saveCart(cart);
    if (!silent) toast(`${quantity > 1 ? quantity + ' items' : 'Item'} added to your basket`);
  }

  function setQty(handle, qty) {
    let cart = readCart();
    const desired = Number.parseInt(qty, 10);
    if (!Number.isInteger(desired) || desired <= 0) cart = cart.filter(item => item.handle !== handle);
    else {
      const row = cart.find(item => item.handle === handle);
      if (row) row.qty = Math.min(50, desired);
      else cart.push({ handle, qty: Math.min(50, desired) });
    }
    saveCart(cart);
  }

  function removeItem(handle) {
    saveCart(readCart().filter(item => item.handle !== handle));
  }

  function getSavedLocation() {
    try { return JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null'); } catch { return null; }
  }

  function saveLocation(location) {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function syncCartUI(products = []) {
    const count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = count;
      el.classList.toggle('zero', count === 0);
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    });
    document.querySelectorAll('[data-mobile-cart]').forEach(bar => {
      bar.classList.toggle('has-cart', count > 0);
      const total = cartSubtotal(products);
      const text = `${count} item${count === 1 ? '' : 's'} · ${money(total)}`;
      const sub = 'Ready for tomorrow morning';
      const strong = bar.querySelector('[data-mobile-cart-text]');
      const small = bar.querySelector('[data-mobile-cart-sub]');
      if (strong) strong.textContent = text;
      if (small) small.textContent = sub;
    });
  }

  function toast(message, type = 'success') {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    region.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity .2s ease';
      setTimeout(() => node.remove(), 220);
    }, 2600);
  }

  function setBusy(button, busy, textWhenBusy = 'Working…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = textWhenBusy;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function flyToBasket(source) {
    try {
      const target = document.querySelector('.cart-link');
      const image = source?.matches?.('img') ? source : source?.querySelector?.('img');
      if (!target || !image || !image.src) return;
      const from = image.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const ghost = image.cloneNode();
      ghost.className = 'fly-cart-image';
      Object.assign(ghost.style, {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        opacity: '.95'
      });
      document.body.appendChild(ghost);
      const x = to.left + to.width / 2 - from.left - from.width / 2;
      const y = to.top + to.height / 2 - from.top - from.height / 2;
      requestAnimationFrame(() => {
        ghost.style.transform = `translate3d(${x}px,${y}px,0) scale(.09) rotate(-10deg)`;
        ghost.style.opacity = '0';
      });
      ghost.addEventListener('transitionend', () => ghost.remove(), { once: true });
    } catch {}
  }

  function placeholderProducts(count = 8) {
    const array = Array.from({ length: count }, () => {
      const el = document.createElement('div');
      el.className = 'skeleton';
      return el;
    });
    return array;
  }

  function setupScrollProgress() {
    const bar = document.createElement('span');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.prepend(bar);
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const progress = Math.max(0, Math.min(1, scrollY / max));
      bar.style.setProperty('--scroll-progress', progress.toFixed(3));
    };
    const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener('scroll', requestUpdate, { passive: true });
    addEventListener('resize', requestUpdate, { passive: true });
    update();
  }
  setupScrollProgress();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // Global bootstrap: Google Analytics + maintenance banner (not on admin)
  fetch('/api/settings').then(r => r.json()).then(settings => {
    window.__RFS_SETTINGS = settings;
    if (settings.maintenance?.enabled && !location.pathname.startsWith('/admin')) {
      window.__RFS_MAINTENANCE = true;
      const banner = document.createElement('div');
      banner.className = 'maint-banner';
      banner.innerHTML = `<strong>⛔ Temporarily paused</strong><span>${settings.maintenance.message || 'Orders resume shortly.'}</span>`;
      document.body.appendChild(banner);
    }
    const fssai = settings.business?.fssai;
    if (fssai) document.querySelectorAll('[data-fssai]').forEach(el => { el.textContent = 'FSSAI Lic. No. ' + fssai; });
    const gaId = settings.integrations?.gaId;
    if (gaId && /^[G]-[A-Z0-9]{6,12}$/.test(gaId)) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', gaId);
    }
  }).catch(() => {});

  /* ---------- delivery location (quick-commerce style: ask once, shop anywhere) ---------- */
  const LOC_AREAS = [
    { name: 'Hosur town / Bus stand', lat: 12.7409, lng: 77.8253 },
    { name: 'Mathigiri', lat: 12.7180, lng: 77.7900 },
    { name: 'Maharaja Nagar', lat: 12.7330, lng: 77.8100 },
    { name: 'Zuzuvadi', lat: 12.7620, lng: 77.8060 },
    { name: 'SIPCOT Phase 1', lat: 12.7760, lng: 77.8170 },
    { name: 'Rayakottai Road', lat: 12.7550, lng: 77.7800 },
    { name: 'Thally Road', lat: 12.7050, lng: 77.8300 },
    { name: 'Belagondapalli', lat: 12.7160, lng: 77.8520 }
  ];
  const LOC_DISMISS_KEY = 'rebesta_loc_dismissed_v1';
  const NO_SHEET_PATHS = ['/checkout', '/login', '/account', '/order-success', '/track', '/admin'];

  const svgPin = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21c5-3.6 8-7.7 8-11.6C20 5.9 16.4 3 12 3S4 5.9 4 9.4C4 13.3 7 17.4 12 21Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.6" r="2.3" stroke="currentColor" stroke-width="2"/></svg>';
  const svgChevron = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function locationLabel(loc) {
    if (!loc) return null;
    const label = String(loc.label || '').trim();
    return label || (loc.source === 'area' ? 'Selected area' : 'Selected pin');
  }

  let locSheetEl = null;
  function buildLocationSheet() {
    if (locSheetEl) return;
    const back = document.createElement('div');
    back.className = 'sheet-backdrop'; back.dataset.locBackdrop = ''; back.hidden = true;
    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet'; sheet.dataset.locSheet = '';
    sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Choose delivery location');
    sheet.innerHTML = `
      <div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-head">
        <h3>What’s your location?</h3>
      </div>
      <button type="button" class="loc-gps" data-loc-gps>
        <span class="loc-gps-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <span class="loc-gps-tx"><strong>Use my current location</strong></span>
      </button>
      <p class="loc-status" data-loc-status hidden role="status"></p>
      <button type="button" class="loc-more-hint" data-loc-expand><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>More options</button>
      <div class="loc-more" data-loc-more><div class="loc-more-in">
        <div class="loc-or" aria-hidden="true"><span>OR</span></div>
        <div class="loc-areas">
          <p class="loc-areas-title">Popular areas in Hosur</p>
          <div class="loc-chips">${LOC_AREAS.map(a =>
            `<button type="button" class="loc-chip" data-lat="${a.lat}" data-lng="${a.lng}">${a.name}</button>`).join('')}</div>
        </div>
        <button type="button" class="loc-skip" data-loc-skip>Just browsing — I’ll set it later</button>
      </div></div>`;
    document.body.append(back, sheet);
    locSheetEl = { back, sheet };

    back.addEventListener('click', closeLocationSheet);
    sheet.querySelector('[data-loc-skip]').addEventListener('click', () => {
      try { localStorage.setItem(LOC_DISMISS_KEY, '1'); } catch {}
      closeLocationSheet();
    });

    const setExpanded = on => sheet.classList.toggle('expanded', on);
    sheet.querySelectorAll('[data-loc-expand]').forEach(el => el.addEventListener('click', () => setExpanded(!sheet.classList.contains('expanded'))));
    let dragY = null;
    const dragStart = e => { dragY = (e.touches && e.touches[0] ? e.touches[0] : e).clientY; };
    const dragMove = e => {
      if (dragY == null) return;
      const y = (e.touches && e.touches[0] ? e.touches[0] : e).clientY;
      if (y - dragY < -26) { setExpanded(true); dragY = null; }
      else if (y - dragY > 34) { setExpanded(false); dragY = null; }
    };
    const dragEnd = () => { dragY = null; };
    [sheet.querySelector('.sheet-grab'), sheet.querySelector('.sheet-head')].forEach(zone => {
      if (!zone) return;
      zone.addEventListener('touchstart', dragStart, { passive: true });
      zone.addEventListener('touchmove', dragMove, { passive: true });
      zone.addEventListener('touchend', dragEnd);
    });

    const status = sheet.querySelector('[data-loc-status]');
    const say = (message, type) => { status.hidden = false; status.textContent = message; status.className = `loc-status ${type || ''}`.trim(); };

    function choose(location) {
      saveLocation({ ...location, savedAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('rebesta:location-changed', { detail: location }));
      closeLocationSheet();
      toast(`Delivering to ${locationLabel(location)}`, 'success');
    }

    sheet.querySelectorAll('.loc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        choose({ lat: Number(chip.dataset.lat), lng: Number(chip.dataset.lng), label: chip.textContent.trim(), source: 'area' });
      });
    });

    sheet.querySelector('[data-loc-gps]').addEventListener('click', () => {
      if (!navigator.geolocation) return say('This browser does not support GPS — pick your area below instead.', 'error');
      say('Finding your location…');
      navigator.geolocation.getCurrentPosition(async position => {
        let label = 'Your location';
        try {
          const data = await api(`/api/location/reverse?lat=${encodeURIComponent(position.coords.latitude)}&lng=${encodeURIComponent(position.coords.longitude)}`);
          label = data.location?.label || label;
        } catch {}
        choose({ lat: position.coords.latitude, lng: position.coords.longitude, label, source: 'gps' });
      }, error => {
        say(error.code === 1
          ? 'Location permission denied — pick your area below instead.'
          : 'Could not get GPS — pick your area below instead.', 'error');
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }

  function openLocationSheet() {
    buildLocationSheet();
    if (!locSheetEl) return;
    locSheetEl.sheet.classList.remove('expanded');
    locSheetEl.back.hidden = false;
    locSheetEl.sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => locSheetEl.sheet.classList.add('open'));
  }
  function closeLocationSheet() {
    if (!locSheetEl) return;
    locSheetEl.sheet.classList.remove('open');
    locSheetEl.back.hidden = true;
    document.body.classList.remove('sheet-open');
    setTimeout(() => { if (locSheetEl && !locSheetEl.sheet.classList.contains('open')) locSheetEl.sheet.hidden = true; }, 340);
  }

  function updateHeaderLocation() {
    document.querySelectorAll('.header-location').forEach(el => {
      if (el.dataset.locWired) {
        const label = el.querySelector('[data-loc-label]');
        if (label) label.textContent = locationLabel(getSavedLocation()) || 'Set location';
        return;
      }
      el.dataset.locWired = '1';
      el.classList.add('loc-chip-btn');
      el.title = 'Change delivery location';
      el.innerHTML = `<span class="loc-chip-tx"><span class="loc-chip-lb">Delivering to</span><strong><span data-loc-label>${locationLabel(getSavedLocation()) || 'Set location'}</span>${svgChevron}</strong></span>`;
      el.addEventListener('click', () => openLocationSheet());
    });
  }

  function initBottomNav() {
    const here = location.pathname.replace(/\/+$/, '') || '/';
    document.querySelectorAll('.bn-item').forEach(a => {
      try { if (new URL(a.href, location.origin).pathname === here) a.classList.add('bn-active'); } catch {}
    });
  }

  function initLocationExperience() {
    updateHeaderLocation();
    window.addEventListener('rebesta:location-changed', updateHeaderLocation);
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (NO_SHEET_PATHS.includes(path)) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(LOC_DISMISS_KEY) === '1'; } catch {}
    if (!getSavedLocation() && !dismissed) setTimeout(openLocationSheet, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initLocationExperience(); initBottomNav(); });
  else { initLocationExperience(); initBottomNav(); }

  window.RFS = {
    CART_KEY,
    LOCATION_KEY,
    money,
    readCart,
    saveCart,
    cartCount,
    cartSubtotal,
    addItem,
    setQty,
    removeItem,
    getSavedLocation,
    saveLocation,
    openLocationSheet,
    closeLocationSheet,
    api,
    syncCartUI,
    toast,
    setBusy,
    flyToBasket,
    placeholderProducts
  };
})();
