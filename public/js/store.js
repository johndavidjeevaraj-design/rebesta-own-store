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

  /* ================= Cart sheet — your basket, order from any page (Swiggy-style) ================= */
  const CART_SHEET_ADDR_KEY = 'rebesta_checkout_addr_v1';
  const CART_SHEET_TIP_KEY = 'rebesta_checkout_tip_v1';
  const CART_SHEET_COUPON_KEY = 'rebesta_checkout_coupon_v1';
  const CART_SHEET_NOTES_KEY = 'rebesta_checkout_notes_v1';
  const CART_SHEET_EXCLUDE = ['/checkout', '/login', '/account', '/admin'];
  const CART_TIP_CHOICES = [0, 10, 20, 30];
  const CART_ADDON_RE = /coriander|curry|chilli|garlic|ginger|lemon|coconut|mint|amaranth|keerai|keera/i;
  const CART_ADD_TABS = [
    { id: 'popular', label: 'Popular', pick: list => list.filter(p => p.featured) },
    { id: 'greens', label: 'Greens', pick: list => list.filter(p => p.category === 'Leafy Greens') },
    { id: 'combos', label: 'Combos', pick: list => list.filter(p => p.category === 'Combos & Kits') },
    { id: 'addons', label: 'Add-ons', pick: list => list.filter(p => CART_ADDON_RE.test(p.title) && p.category !== 'Combos & Kits') }
  ];
  let cartSheetEl = null;
  let cartProducts = null;
  let cartMe = null;
  let cartQuote = null;
  let cartSlotId = '';
  let cartQuoteTimer = null;
  let cartTip = 0;
  let cartCoupon = null;
  let cartCoupons = null;
  let cartAddTab = 'popular';
  let cartNotesTimer = null;

  async function ensureCartProducts() {
    if (cartProducts) return cartProducts;
    try { cartProducts = (await api('/api/products')).products || []; } catch { cartProducts = []; }
    return cartProducts;
  }
  async function ensureCartMe(force = false) {
    if (cartMe && !force) return cartMe;
    try { cartMe = (await api('/api/auth/me')).customer || null; } catch { cartMe = null; }
    return cartMe;
  }
  function savedCartAddr() {
    try { return JSON.parse(localStorage.getItem(CART_SHEET_ADDR_KEY) || '{}') || {}; } catch { return {}; }
  }
  function readCartPref(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return (value === null || value === undefined) ? fallback : value;
    } catch { return fallback; }
  }
  function writeCartPref(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  const AUTH_FORM_HTML = `
    <form class="auth-form" data-cart-flow novalidate>
      <p class="cart-auth-note">Login to proceed — one quick SMS code 🔐</p>
      <div class="auth-step" data-step="number">
        <div class="fx-field fx-phone"><input id="cartPhone" data-flow-phone inputmode="tel" autocomplete="tel" placeholder=" "><label for="cartPhone">Mobile number</label><span class="fx-prefix"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h3l2 4-2 2a12 12 0 0 0 5 5l2-2 4 2v3a2 2 0 0 1-2 2A16 16 0 0 1 2 8a2 2 0 0 1 2-2Z" fill="currentColor"/></svg>+91</span></div>
        <div class="captcha-slot"><div id="cart-captcha" class="otp-captcha"></div></div>
        <button class="btn-main" type="button" data-flow-send><span class="btn-label">Send code by SMS</span></button>
      </div>
      <div class="auth-step" data-step="code" hidden>
        <div class="sent-chip"><div><b data-flow-sentto></b><span>Code sent · valid 15 minutes</span></div></div>
        <div class="otp-boxes" data-flow-boxes></div>
        <p class="otp-hint">Enter the code from the SMS</p>
        <button class="btn-main" type="submit" data-flow-verify><span class="btn-label">Verify &amp; continue</span></button>
        <p class="otp-resend">Didn't get it? <a href="#" data-flow-resend>Resend code</a> · <a href="#" data-flow-change>Wrong number?</a></p>
      </div>
      <div class="auth-step" data-step="name" hidden>
        <div class="sent-chip"><div><b data-flow-newto></b><span>Number verified! You're new here — one last thing.</span></div></div>
        <div class="fx-field"><input id="cartName" data-flow-name autocomplete="name" placeholder=" "><label for="cartName">What should we call you?</label></div>
        <button class="btn-main" type="submit" data-flow-create><span class="btn-label">Create my account</span></button>
        <p class="otp-resend"><a href="#" data-flow-restart>← Use a different number</a></p>
      </div>
      <p class="flow-error" data-flow-error hidden></p>
      <button type="button" class="cart-auth-back" data-auth-cancel>← Back to basket</button>
    </form>`;

  function loadCartOtpSdk() {
    if (document.querySelector('script[data-otp-sdk]') || typeof window.initSendOTP === 'function') return;
    const config = {
      widgetId: '366a65687644323637363131',
      tokenAuth: '571380TgZrH8gvzsiK6aa8dedbP1',
      exposeMethods: true,
      captchaRenderId: 'cart-captcha',
      success: data => { window.__otpWidgetSuccess = data; },
      failure: error => { window.__otpWidgetFailure = error; }
    };
    const urls = ['https://verify.msg91.com/otp-provider.js', 'https://verify.phone91.com/otp-provider.js'];
    let i = 0;
    (function attempt() {
      const s = document.createElement('script');
      s.src = urls[i]; s.async = true; s.dataset.otpSdk = '1';
      s.onload = () => { if (typeof window.initSendOTP === 'function') { try { window.initSendOTP(config); } catch (e) { window.__otpWidgetFailure = e; } } };
      s.onerror = () => { i += 1; if (i < urls.length) attempt(); };
      document.head.appendChild(s);
    })();
  }

  function buildCartSheet() {
    if (cartSheetEl) return;
    const back = document.createElement('div');
    back.className = 'sheet-backdrop'; back.dataset.cartBackdrop = ''; back.hidden = true;
    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet cart-sheet'; sheet.dataset.cartSheet = '';
    sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Your basket');
    sheet.innerHTML = `
      <div class="sheet-grab" aria-hidden="true"></div>
      <button type="button" class="sheet-close" data-cart-close aria-label="Close">✕</button>
      <div class="cs-head"><h3>Your basket</h3><p data-cs-subtitle></p></div>
      <div class="cs-scroll">
        <button type="button" class="cs-card cs-addr-row" data-cs-addr-row>
          <span class="cs-addr-pin" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" stroke="currentColor" stroke-width="2"/></svg></span>
          <span class="cs-addr-text"><b data-cs-addr-line>Add delivery address</b><small data-cs-addr-sub>Hosur</small></span>
          <span class="cs-arrow" aria-hidden="true">›</span>
        </button>
        <div class="cs-card cs-addr-edit" data-cs-addr-edit hidden>
          <div class="fx-field cart-fx"><input id="cartAddr1" data-cart-addr1 autocomplete="street-address" placeholder=" "><label for="cartAddr1">House / flat / street</label></div>
          <div class="fx-field cart-fx cart-fx-pin"><input id="cartPin" data-cart-pin inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder=" "><label for="cartPin">Pincode</label></div>
          <button type="button" class="cs-area-link" data-cs-area>📍 Change area — pick your locality</button>
        </div>
        <div class="cs-card cs-items" data-cart-items></div>
        <div class="cs-card cs-misc">
          <button type="button" class="cs-misc-row" data-cs-addmore><span>➕ Add more items</span><span class="cs-arrow" aria-hidden="true">›</span></button>
          <button type="button" class="cs-misc-row" data-cs-notes-toggle><span>✍️ Delivery instructions</span><span class="cs-notes-hint" data-cs-notes-hint></span></button>
          <div class="cs-notes" data-cs-notes hidden><textarea data-cs-notes-input maxlength="250" rows="2" placeholder="Gate code, nearby shop, call on arrival…"></textarea></div>
        </div>
        <div class="cs-complete" data-cs-complete hidden>
          <h4>Complete your basket</h4>
          <div class="cs-tabs" data-cs-tabs></div>
          <div class="cs-rail" data-cs-rail></div>
        </div>
        <div class="cs-savings" data-cs-savings hidden>
          <h4>🎁 Savings corner</h4>
          <div class="cs-coupon-cards" data-cs-coupon-cards></div>
        </div>
        <div class="cs-card cs-coupon-apply" data-cs-coupon-apply>
          <div class="cs-coupon-on" data-cs-coupon-on hidden></div>
          <div class="cs-coupon-form" data-cs-coupon-form>
            <label for="cartCouponInput">Apply coupon</label>
            <div class="cs-coupon-row"><input id="cartCouponInput" data-cs-coupon-input placeholder="Enter coupon code" maxlength="24" autocomplete="off"><button type="button" class="cs-coupon-btn" data-cs-coupon-apply-btn>Apply</button></div>
            <p class="cs-coupon-msg" data-cs-coupon-msg hidden></p>
          </div>
        </div>
        <div class="cs-card cs-delivery" data-cs-delivery>
          <h4>Delivery</h4>
          <div class="cs-del-row on"><span class="cs-del-dot" aria-hidden="true"></span><div class="cs-del-txt"><b>Standard</b><small>Fresh at your door, tomorrow morning</small></div></div>
          <div class="cs-slots" data-cart-slots hidden></div>
          <div class="cs-del-row off"><span class="cs-del-drone" aria-hidden="true">🛸</span><div class="cs-del-txt"><b>Drone delivery</b><small>Hover-drop in 15 minutes</small></div><span class="cs-soon">COMING SOON</span></div>
          <p class="cs-fee" data-cart-fee hidden></p>
        </div>
        <div class="cs-card cs-tip" data-cs-tip>
          <h4>Delivery tip</h4>
          <p class="cs-tip-sub">100% of it goes to your delivery partner</p>
          <div class="cs-tip-chips" data-cs-tips></div>
        </div>
        <div class="cs-card cs-bill" data-cart-bill hidden><h4>To pay</h4><div data-cs-bill-rows></div></div>
      </div>
      <div class="cart-auth" data-cart-auth hidden></div>
      <div class="cs-paybar" data-cs-paybar>
        <div class="cs-pay-total"><span>To pay</span><strong data-cs-pay-total>₹0</strong></div>
        <button type="button" class="cs-upi" data-cs-upi>UPI <span class="cs-arrow" aria-hidden="true">›</span></button>
        <button type="button" class="cs-pay-btn" data-cs-pay>PAY</button>
      </div>`;
    document.body.append(back, sheet);
    cartSheetEl = { back, sheet };

    back.addEventListener('click', closeCartSheet);
    sheet.querySelector('[data-cart-close]').addEventListener('click', closeCartSheet);
    sheet.querySelector('[data-cs-addr-row]').addEventListener('click', () => {
      const edit = sheet.querySelector('[data-cs-addr-edit]');
      edit.hidden = !edit.hidden;
      if (!edit.hidden && !sheet.querySelector('[data-cart-addr1]').value.trim()) sheet.querySelector('[data-cart-addr1]').focus();
    });
    sheet.querySelector('[data-cs-area]').addEventListener('click', () => {
      closeCartSheet();
      setTimeout(openLocationSheet, 260);
    });
    sheet.querySelector('[data-cs-addmore]').addEventListener('click', () => {
      const path = location.pathname.replace(/\/+$/, '') || '/';
      closeCartSheet();
      if (!['/', '/shop'].includes(path)) setTimeout(() => { window.location.href = '/shop'; }, 240);
    });
    sheet.querySelector('[data-cs-notes-toggle]').addEventListener('click', () => {
      const box = sheet.querySelector('[data-cs-notes]');
      box.hidden = !box.hidden;
      if (!box.hidden) box.querySelector('[data-cs-notes-input]').focus();
    });
    sheet.querySelector('[data-cs-notes-input]').addEventListener('input', event => {
      clearTimeout(cartNotesTimer);
      const value = event.target.value;
      cartNotesTimer = setTimeout(() => {
        writeCartPref(CART_SHEET_NOTES_KEY, value);
        const hint = sheet.querySelector('[data-cs-notes-hint]');
        if (hint) hint.textContent = value ? `“${value.slice(0, 18)}${value.length > 18 ? '…' : ''}”` : '';
      }, 350);
    });
    sheet.querySelector('[data-cs-tabs]').addEventListener('click', event => {
      const tab = event.target.closest('button[data-cs-tab]');
      if (!tab) return;
      cartAddTab = tab.dataset.csTab;
      renderCartRail();
    });
    sheet.querySelector('[data-cart-items]').addEventListener('click', handleCartStepperClick);
    sheet.querySelector('[data-cs-rail]').addEventListener('click', handleCartStepperClick);
    sheet.querySelector('[data-cs-coupon-cards]').addEventListener('click', event => {
      const btn = event.target.closest('button[data-cs-apply-code]');
      if (btn) applyCartCoupon(btn.dataset.csApplyCode);
    });
    sheet.querySelector('[data-cs-coupon-apply-btn]').addEventListener('click', () => {
      applyCartCoupon(sheet.querySelector('[data-cs-coupon-input]').value);
    });
    sheet.querySelector('[data-cs-coupon-input]').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); applyCartCoupon(event.target.value); }
    });
    sheet.querySelector('[data-cs-coupon-on]').addEventListener('click', event => {
      if (event.target.closest('[data-cs-coupon-x]')) removeCartCoupon();
    });
    sheet.querySelector('[data-cart-slots]').addEventListener('click', event => {
      const chip = event.target.closest('button[data-slot-id]');
      if (!chip || chip.disabled) return;
      cartSlotId = chip.dataset.slotId;
      sheet.querySelectorAll('[data-slot-id]').forEach(el => el.classList.toggle('on', el === chip));
      renderCartQuote();
    });
    sheet.querySelector('[data-cs-tips]').addEventListener('click', event => {
      const chip = event.target.closest('button[data-tip]');
      if (!chip) return;
      cartTip = Number(chip.dataset.tip) || 0;
      writeCartPref(CART_SHEET_TIP_KEY, cartTip);
      renderCartTips();
      renderCartQuote();
    });
    sheet.querySelector('[data-cs-pay]').addEventListener('click', proceedFromCart);
    sheet.querySelector('[data-cs-upi]').addEventListener('click', proceedFromCart);
    sheet.querySelector('[data-cart-pin]').addEventListener('change', () => scheduleCartQuote(true));
    sheet.querySelector('[data-cart-addr1]').addEventListener('input', renderCartAddrRow);
    sheet.querySelector('[data-cart-pin]').addEventListener('input', renderCartAddrRow);
    window.addEventListener('rebesta:cart-changed', () => {
      if (cartSheetEl && !cartSheetEl.sheet.hidden) {
        renderCartItems();
        renderCartRail();
        renderCartSavings();
        scheduleCartQuote(true);
      }
    });
  }

  function handleCartStepperClick(event) {
    const btn = event.target.closest('button[data-cs], button[data-cs-action]');
    if (!btn) return;
    if (btn.dataset.csAction === 'add') { RFS.addItem(btn.dataset.handle, 1); return; }
    const qty = Number(btn.dataset.qty || '1');
    RFS.setQty(btn.dataset.handle, btn.dataset.cs === 'plus' ? qty + 1 : qty - 1);
  }

  function openCartSheet() {
    buildCartSheet();
    const { back, sheet } = cartSheetEl;
    sheet.classList.remove('expanded');
    back.hidden = false; sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    const saved = savedCartAddr();
    if (saved.line1) sheet.querySelector('[data-cart-addr1]').value = saved.line1;
    if (saved.pincode) sheet.querySelector('[data-cart-pin]').value = saved.pincode;
    cartTip = Math.min(100, Math.max(0, Number(readCartPref(CART_SHEET_TIP_KEY, 0)) || 0));
    const notes = String(readCartPref(CART_SHEET_NOTES_KEY, '') || '');
    const notesInput = sheet.querySelector('[data-cs-notes-input]');
    if (notesInput) notesInput.value = notes.slice(0, 250);
    const hint = sheet.querySelector('[data-cs-notes-hint]');
    if (hint) hint.textContent = notes ? `“${notes.slice(0, 18)}${notes.length > 18 ? '…' : ''}”` : '';
    renderCartItems();
    renderCartAddrRow();
    renderCartTips();
    renderCartSavings();
    (async () => {
      await Promise.all([ensureCartMe(), ensureCartProducts()]);
      try { cartCoupons = (await api('/api/coupon/list')).coupons || []; } catch { cartCoupons = []; }
      const savedCoupon = readCartPref(CART_SHEET_COUPON_KEY, null);
      if (savedCoupon?.code && !cartCoupon) await applyCartCoupon(savedCoupon.code, true);
      renderCartItems();
      renderCartAddrRow();
      renderCartRail();
      renderCartSavings();
      scheduleCartQuote(true);
    })();
  }

  function closeCartSheet() {
    if (!cartSheetEl) return;
    const { back, sheet } = cartSheetEl;
    sheet.classList.remove('open');
    back.hidden = true;
    document.body.classList.remove('sheet-open');
    setTimeout(() => { if (cartSheetEl && !cartSheetEl.sheet.classList.contains('open')) cartSheetEl.sheet.hidden = true; }, 340);
  }

  function syncCartSections(hasItems) {
    const { sheet } = cartSheetEl;
    for (const sel of ['[data-cs-addr-row]', '[data-cs-delivery]', '[data-cs-tip]', '[data-cart-bill]', '[data-cs-coupon-apply]', '[data-cs-paybar]']) {
      const el = sheet.querySelector(sel);
      if (el) el.hidden = !hasItems;
    }
    if (!hasItems) {
      sheet.querySelector('[data-cs-addr-edit]').hidden = true;
      sheet.querySelector('[data-cs-notes]').hidden = true;
    }
  }

  function renderCartItems() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const box = sheet.querySelector('[data-cart-items]');
    const cart = readCart();
    const byHandle = new Map((cartProducts || []).map(p => [p.handle, p]));
    const loc = getSavedLocation();
    const area = locationLabel(loc) || 'Hosur';
    sheet.querySelector('[data-cs-subtitle]').textContent = cart.length
      ? `${cartCount()} item${cartCount() === 1 ? '' : 's'} · delivering to ${area}`
      : 'Fresh from the farm, every morning';
    syncCartSections(cart.length > 0);
    if (!cart.length) {
      box.innerHTML = `<div class="cs-empty"><p>Your basket is empty 🧺</p><a class="cs-shop-link" href="/shop">Browse fresh vegetables →</a></div>`;
      return;
    }
    box.innerHTML = cart.map(item => {
      const p = byHandle.get(item.handle);
      if (!p) return '';
      return `<div class="cs-row">
        <img src="${p.image}" alt="" loading="lazy">
        <div class="cr-info"><div class="cr-name">${p.title}</div><div class="cr-unit">${p.unitLabel || ''} · ${money(p.priceInr)}</div></div>
        <div class="qty-stepper cart-qty"><button type="button" data-cs="minus" data-handle="${item.handle}" data-qty="${item.qty}">−</button><span>${item.qty}</span><button type="button" data-cs="plus" data-handle="${item.handle}" data-qty="${item.qty}">+</button></div>
        <div class="cr-price">${money(p.priceInr * item.qty)}</div>
      </div>`;
    }).join('');
  }

  function renderCartAddrRow() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const line = sheet.querySelector('[data-cs-addr-line]');
    const sub = sheet.querySelector('[data-cs-addr-sub]');
    const addr1 = sheet.querySelector('[data-cart-addr1]')?.value.trim() || savedCartAddr().line1 || '';
    const pin = sheet.querySelector('[data-cart-pin]')?.value.trim() || savedCartAddr().pincode || '';
    const loc = getSavedLocation();
    const area = locationLabel(loc) || 'Hosur';
    line.textContent = addr1 || 'Add delivery address';
    line.classList.toggle('is-empty', !addr1);
    sub.textContent = `${area}${pin ? ' · ' + pin : ''}`;
  }

  function renderCartRail() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const complete = sheet.querySelector('[data-cs-complete]');
    const tabsEl = sheet.querySelector('[data-cs-tabs]');
    const rail = sheet.querySelector('[data-cs-rail]');
    if (!cartProducts || !cartProducts.length) { complete.hidden = true; return; }
    complete.hidden = false;
    tabsEl.innerHTML = CART_ADD_TABS.map(t =>
      `<button type="button" class="cs-tab${t.id === cartAddTab ? ' on' : ''}" data-cs-tab="${t.id}">${t.label}</button>`).join('');
    const cart = readCart();
    const inCart = new Map(cart.map(item => [item.handle, item.qty]));
    const pool = cartProducts.filter(p => p.active !== false && Number(p.stock) > 0);
    const seen = new Set();
    const tab = CART_ADD_TABS.find(t => t.id === cartAddTab) || CART_ADD_TABS[0];
    const picks = tab.pick(pool).filter(p => (seen.has(p.handle) ? false : seen.add(p.handle))).slice(0, 8);
    rail.innerHTML = picks.map(p => {
      const qty = inCart.get(p.handle) || 0;
      return `<div class="cs-pcard">
        <img src="${p.image}" alt="" loading="lazy">
        <div class="cs-pname">${p.title}</div>
        <div class="cs-pprice">${money(p.priceInr)} <small>· ${p.unitLabel || ''}</small></div>
        ${qty
          ? `<div class="qty-stepper cart-qty cs-mini-step"><button type="button" data-cs="minus" data-handle="${p.handle}" data-qty="${qty}">−</button><span>${qty}</span><button type="button" data-cs="plus" data-handle="${p.handle}" data-qty="${qty}">+</button></div>`
          : `<button type="button" class="cs-add" data-cs-action="add" data-handle="${p.handle}">ADD</button>`}
      </div>`;
    }).join('') || '<p class="cs-rail-empty">Nothing here right now — check the other tabs!</p>';
  }

  function couponDesc(coupon) {
    const off = coupon.type === 'percent' ? `${Number(coupon.value)}% off` : `${money(Number(coupon.value))} off`;
    return coupon.minOrderInr ? `${off} on orders above ${money(Number(coupon.minOrderInr))}` : `${off} on any order`;
  }

  function renderCartSavings() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const savings = sheet.querySelector('[data-cs-savings]');
    if (!cartCoupons || !cartCoupons.length) { savings.hidden = true; }
    else {
      savings.hidden = false;
      sheet.querySelector('[data-cs-coupon-cards]').innerHTML = cartCoupons.map(c => {
        const applied = cartCoupon && cartCoupon.code === c.code;
        return `<div class="cs-ccard${applied ? ' on' : ''}">
          <div class="cs-ccode">${c.code}</div>
          <div class="cs-cdesc">${couponDesc(c)}</div>
          ${applied ? '<span class="cs-capplied">✓ APPLIED</span>' : `<button type="button" class="cs-cbtn" data-cs-apply-code="${c.code}">APPLY</button>`}
        </div>`;
      }).join('');
    }
    const on = sheet.querySelector('[data-cs-coupon-on]');
    const form = sheet.querySelector('[data-cs-coupon-form]');
    if (cartCoupon) {
      on.hidden = false; form.hidden = true;
      on.innerHTML = `<span>🎟 <b>${cartCoupon.code}</b> · −${money(Number(cartCoupon.discountInr) || 0)}</span><button type="button" class="cs-coupon-x" data-cs-coupon-x aria-label="Remove coupon">✕</button>`;
    } else {
      on.hidden = true; form.hidden = false;
    }
  }

  async function applyCartCoupon(code, quiet = false) {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    const msg = sheet.querySelector('[data-cs-coupon-msg]');
    if (msg && !quiet) { msg.hidden = false; msg.textContent = 'Checking…'; msg.className = 'cs-coupon-msg'; }
    try {
      const subtotal = cartSubtotal(cartProducts || []);
      const data = await api('/api/coupon/check', { method: 'POST', body: JSON.stringify({ code, subtotalInr: subtotal }) });
      cartCoupon = data.coupon;
      writeCartPref(CART_SHEET_COUPON_KEY, { code: cartCoupon.code });
      if (!quiet) toast(`Coupon ${cartCoupon.code} applied — you save ${money(cartCoupon.discountInr)} 🎉`);
      if (msg) msg.hidden = true;
    } catch (error) {
      if (!quiet && msg) { msg.hidden = false; msg.textContent = error.message || 'That coupon is not valid'; msg.className = 'cs-coupon-msg error'; }
      if (quiet) { cartCoupon = null; try { localStorage.removeItem(CART_SHEET_COUPON_KEY); } catch {} }
    }
    renderCartSavings();
    renderCartQuote();
  }

  function removeCartCoupon() {
    cartCoupon = null;
    try { localStorage.removeItem(CART_SHEET_COUPON_KEY); } catch {}
    renderCartSavings();
    renderCartQuote();
  }

  function renderCartTips() {
    if (!cartSheetEl) return;
    cartSheetEl.sheet.querySelector('[data-cs-tips]').innerHTML = CART_TIP_CHOICES.map(value =>
      `<button type="button" class="cs-tip-chip${cartTip === value ? ' on' : ''}" data-tip="${value}">${value ? money(value) : 'No tip'}</button>`).join('');
  }

  function scheduleCartQuote(force = false) {
    if (!cartSheetEl || cartSheetEl.sheet.hidden) return;
    clearTimeout(cartQuoteTimer);
    cartQuoteTimer = setTimeout(() => refreshCartQuote(force), 260);
  }

  async function refreshCartQuote() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const cart = readCart();
    if (!cart.length) { cartQuote = null; return; }
    const loc = getSavedLocation() || {};
    const pin = sheet.querySelector('[data-cart-pin]').value.trim();
    const feeEl = sheet.querySelector('[data-cart-fee]');
    feeEl.hidden = false; feeEl.textContent = 'Checking delivery to your area…';
    try {
      cartQuote = (await api('/api/quote', { method: 'POST', body: JSON.stringify({
        items: cart,
        location: Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng } : {},
        address: { pincode: /^\d{6}$/.test(pin) ? pin : '' }
      }) })).quote || null;
    } catch { cartQuote = null; }
    if (cartCoupon && cartProducts && cartSubtotal(cartProducts) < Number(cartCoupon.minOrderInr || 0)) {
      toast(`Coupon ${cartCoupon.code} removed — basket is below ${money(Number(cartCoupon.minOrderInr || 0))}`, 'error');
      removeCartCoupon();
      return;
    }
    renderCartQuote();
  }

  function renderCartQuote() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const feeEl = sheet.querySelector('[data-cart-fee]');
    const slotsEl = sheet.querySelector('[data-cart-slots]');
    const billEl = sheet.querySelector('[data-cart-bill]');
    const billRows = sheet.querySelector('[data-cs-bill-rows]');
    const payTotal = sheet.querySelector('[data-cs-pay-total]');
    const pay = sheet.querySelector('[data-cs-pay]');
    const subtotal = cartSubtotal(cartProducts || []);
    const discount = cartCoupon ? Number(cartCoupon.discountInr || 0) : 0;
    const eligible = Boolean(cartQuote?.eligible);
    const fee = eligible ? Number(cartQuote.deliveryFeeInr || 0) : null;
    const total = Math.max(0, Math.round(subtotal + (fee || 0) + cartTip - discount));

    if (cartQuote && !eligible) {
      feeEl.hidden = false;
      feeEl.textContent = cartQuote.message || 'We cannot deliver to this area yet.';
    } else if (eligible) {
      feeEl.hidden = false;
      feeEl.textContent = cartQuote.freeApplied
        ? `Free delivery applied (basket over ${money(500)}) · ${cartQuote.distanceKm ? cartQuote.distanceKm + ' road km' : 'Hosur'}`
        : `Delivery ${money(fee)} · ${cartQuote.distanceKm ? cartQuote.distanceKm + ' road km from the hub' : 'local morning delivery'}`;
    } else {
      feeEl.hidden = false;
      feeEl.textContent = 'Set your delivery location to check availability.';
    }

    const slots = eligible ? (cartQuote.slots || []) : [];
    slotsEl.hidden = !slots.length;
    if (slots.length) {
      slotsEl.innerHTML = slots.map(slot => {
        const full = Boolean(slot.full);
        const left = Number(slot.remaining ?? slot.capacity ?? NaN);
        return `<button type="button" class="cart-slot${slot.id === cartSlotId ? ' on' : ''}" data-slot-id="${slot.id}" ${full ? 'disabled' : ''}>
          <span>${slot.label}</span><span class="cs-left">${full ? 'Full' : (Number.isFinite(left) && left <= 8 ? left + ' left' : (slot.dateLabel || ''))}</span>
        </button>`;
      }).join('');
      if (!slots.some(s => s.id === cartSlotId)) {
        const first = slots.find(s => !s.full);
        if (first) { cartSlotId = first.id; slotsEl.querySelector(`[data-slot-id="${first.id}"]`)?.classList.add('on'); }
      }
    } else {
      cartSlotId = '';
    }

    if (readCart().length) {
      billEl.hidden = false;
      billRows.innerHTML = `
        <div class="cs-bill-row"><span>Item total</span><span>${money(subtotal)}</span></div>
        <div class="cs-bill-row"><span>Delivery fee</span><span>${fee === null ? '—' : (fee === 0 ? 'FREE' : money(fee))}</span></div>
        <div class="cs-bill-row"><span>Delivery tip</span><span>${money(cartTip)}</span></div>
        ${discount ? `<div class="cs-bill-row cs-bill-green"><span>Coupon ${cartCoupon.code}</span><span>−${money(discount)}</span></div>` : ''}
        <div class="cs-bill-total"><span>To pay</span><span>${money(total)}</span></div>`;
      payTotal.textContent = money(total);
    } else {
      billEl.hidden = true;
    }
    pay.disabled = !eligible || !cartSlotId;
  }

  function showCartAuth() {
    const { sheet } = cartSheetEl;
    const box = sheet.querySelector('[data-cart-auth]');
    const paybar = sheet.querySelector('[data-cs-paybar]');
    box.hidden = false;
    paybar.hidden = true;
    if (box.dataset.wired) return;
    box.dataset.wired = '1';
    box.innerHTML = AUTH_FORM_HTML;
    box.querySelector('[data-auth-cancel]').addEventListener('click', () => { box.hidden = true; paybar.hidden = false; });
    loadCartOtpSdk();
    const s = document.createElement('script');
    s.src = '/js/auth.js?v=20261005d'; s.async = true;
    s.onload = () => {
      if (!window.RFSAuth) return;
      window.RFSAuth.bindFlow(box.querySelector('[data-cart-flow]'), {
        onSuccess: async () => {
          cartMe = await ensureCartMe(true);
          box.hidden = true;
          paybar.hidden = false;
          toast(`Welcome, ${(cartMe?.name || 'friend').split(' ')[0]}! 🌿`);
          proceedFromCart();
        }
      });
    };
    document.head.appendChild(s);
  }

  async function proceedFromCart() {
    const { sheet } = cartSheetEl;
    const cart = readCart();
    if (!cart.length) return toast('Your basket is empty', 'error');
    const edit = sheet.querySelector('[data-cs-addr-edit]');
    const addr1El = sheet.querySelector('[data-cart-addr1]');
    const pinEl = sheet.querySelector('[data-cart-pin]');
    const addr1 = addr1El.value.trim();
    const pin = pinEl.value.trim();
    if (addr1.length < 5) { edit.hidden = false; toast('Enter your house / flat / street address', 'error'); addr1El.focus(); return; }
    if (!/^\d{6}$/.test(pin)) { edit.hidden = false; toast('Enter a 6-digit pincode', 'error'); pinEl.focus(); return; }
    if (!getSavedLocation()) { toast('Pick your delivery area first', 'error'); closeCartSheet(); setTimeout(openLocationSheet, 260); return; }
    if (!cartQuote) await refreshCartQuote();
    if (!cartQuote?.eligible) { toast(cartQuote?.message || 'We cannot deliver to this area yet', 'error'); return; }
    if (!cartSlotId) { toast('Choose a delivery slot', 'error'); return; }
    const me = cartMe || await ensureCartMe();
    if (!me) return showCartAuth();
    writeCartPref(CART_SHEET_ADDR_KEY, { line1: addr1, pincode: pin });
    writeCartPref(CART_SHEET_NOTES_KEY, sheet.querySelector('[data-cs-notes-input]').value.trim());
    if (cartCoupon) writeCartPref(CART_SHEET_COUPON_KEY, { code: cartCoupon.code });
    else { try { localStorage.removeItem(CART_SHEET_COUPON_KEY); } catch {} }
    writeCartPref(CART_SHEET_TIP_KEY, cartTip);
    const pay = sheet.querySelector('[data-cs-pay]');
    setBusy(pay, true, 'Opening payment…');
    window.location.href = '/checkout';
  }

  function initCartSheetTriggers() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (CART_SHEET_EXCLUDE.includes(path)) return;
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a.cart-link');
      if (!link) return;
      event.preventDefault();
      openCartSheet();
    });
    if (!document.querySelector('[data-mobile-cart]')) {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'mobile-cart-bar';
      bar.dataset.mobileCart = '';
      bar.innerHTML = `<span class="mcb-info"><strong data-mobile-cart-text>0 items</strong><small data-mobile-cart-sub>Ready for tomorrow morning</small></span><span class="mcb-cta">View basket →</span>`;
      bar.addEventListener('click', openCartSheet);
      document.body.appendChild(bar);
      if (readCart().length) {
        ensureCartProducts().then(products => syncCartUI(products));
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initLocationExperience(); initBottomNav(); initCartSheetTriggers(); syncCartUI(); });
  else { initLocationExperience(); initBottomNav(); initCartSheetTriggers(); syncCartUI(); }

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
    openCartSheet,
    closeCartSheet,
    api,
    syncCartUI,
    toast,
    setBusy,
    flyToBasket,
    placeholderProducts
  };
})();
