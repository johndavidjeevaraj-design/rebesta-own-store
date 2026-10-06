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

  /* ================= Cart sheet — place the order from any page (quick-commerce style) ================= */
  const CART_SHEET_ADDR_KEY = 'rebesta_checkout_addr_v1';
  const CART_SHEET_EXCLUDE = ['/checkout', '/login', '/account', '/admin'];
  let cartSheetEl = null;
  let cartProducts = null;
  let cartMe = null;
  let cartQuote = null;
  let cartSlotId = '';
  let cartQuoteTimer = null;

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
    const s0 = document.createElement('script');
    s0.dataset.otpSdk = '1';
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
      <div class="sheet-head"><h3>Your basket</h3><p data-cart-subtitle></p></div>
      <div class="cart-items" data-cart-items></div>
      <div class="cart-loc" data-cart-loc hidden></div>
      <div class="cart-slots" data-cart-slots hidden></div>
      <div class="cart-addr">
        <div class="fx-field cart-fx"><input id="cartAddr1" data-cart-addr1 autocomplete="street-address" placeholder=" "><label for="cartAddr1">House / flat / street</label></div>
        <div class="fx-field cart-fx cart-fx-pin"><input id="cartPin" data-cart-pin inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder=" "><label for="cartPin">Pincode</label></div>
      </div>
      <p class="cart-fee" data-cart-fee hidden></p>
      <div class="cart-bill" data-cart-bill hidden></div>
      <div class="cart-auth" data-cart-auth hidden></div>
      <button type="button" class="cart-place" data-cart-place>Place order</button>
      <p class="cart-note">Cash on delivery · fresh from the farm, tomorrow morning 🌿</p>`;
    document.body.append(back, sheet);
    cartSheetEl = { back, sheet };

    back.addEventListener('click', closeCartSheet);
    sheet.querySelector('[data-cart-close]').addEventListener('click', closeCartSheet);
    sheet.querySelector('[data-cart-loc]').addEventListener('click', () => {
      closeCartSheet();
      setTimeout(openLocationSheet, 260);
    });
    sheet.querySelector('[data-cart-items]').addEventListener('click', event => {
      const btn = event.target.closest('button[data-cs]');
      if (!btn) return;
      const qty = Number(btn.dataset.qty || '1');
      RFS.setQty(btn.dataset.handle, btn.dataset.cs === 'plus' ? qty + 1 : qty - 1);
    });
    sheet.querySelector('[data-cart-slots]').addEventListener('click', event => {
      const chip = event.target.closest('button[data-slot-id]');
      if (!chip || chip.disabled) return;
      cartSlotId = chip.dataset.slotId;
      sheet.querySelectorAll('[data-slot-id]').forEach(el => el.classList.toggle('on', el === chip));
    });
    sheet.querySelector('[data-cart-place]').addEventListener('click', placeFromCart);
    sheet.querySelector('[data-cart-pin]').addEventListener('change', () => scheduleCartQuote(true));
    window.addEventListener('rebesta:cart-changed', () => {
      if (cartSheetEl && !cartSheetEl.sheet.hidden) { renderCartItems(); scheduleCartQuote(true); }
    });
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
    renderCartItems();
    (async () => {
      await Promise.all([ensureCartMe(), ensureCartProducts()]);
      renderCartLoc();
      renderCartItems();
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

  function renderCartItems() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const box = sheet.querySelector('[data-cart-items]');
    const cart = readCart();
    const byHandle = new Map((cartProducts || []).map(p => [p.handle, p]));
    sheet.querySelector('[data-cart-subtitle]').textContent = cart.length
      ? `${cartCount()} item${cartCount() === 1 ? '' : 's'} · delivering in Hosur`
      : 'Fresh from the farm, every morning';
    if (!cart.length) {
      box.innerHTML = `<div class="cart-empty"><p>Your basket is empty.</p><a class="cart-shop-link" href="/shop">Browse fresh vegetables →</a></div>`;
      sheet.querySelector('[data-cart-bill]').hidden = true;
      sheet.querySelector('[data-cart-place]').hidden = true;
      sheet.querySelector('[data-cart-slots]').hidden = true;
      sheet.querySelector('[data-cart-loc]').hidden = true;
      return;
    }
    sheet.querySelector('[data-cart-place]').hidden = false;
    box.innerHTML = cart.map(item => {
      const p = byHandle.get(item.handle);
      if (!p) return '';
      return `<div class="cart-row">
        <img src="${p.image}" alt="" loading="lazy">
        <div class="cr-info"><div class="cr-name">${p.title}</div><div class="cr-unit">${p.unitLabel || ''} · ${money(p.priceInr)}</div></div>
        <div class="qty-stepper cart-qty"><button type="button" data-cs="minus" data-handle="${item.handle}" data-qty="${item.qty}">−</button><span>${item.qty}</span><button type="button" data-cs="plus" data-handle="${item.handle}" data-qty="${item.qty}">+</button></div>
        <div class="cr-price">${money(p.priceInr * item.qty)}</div>
      </div>`;
    }).join('');
  }

  function renderCartLoc() {
    if (!cartSheetEl) return;
    const row = cartSheetEl.sheet.querySelector('[data-cart-loc]');
    const loc = getSavedLocation();
    if (!loc) { row.hidden = true; return; }
    row.hidden = false;
    row.innerHTML = `<span>📍 Delivering to <b>${locationLabel(loc) || 'your area'}</b></span><span class="cart-loc-change">Change</span>`;
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
    if (!cart.length) return;
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
    renderCartQuote();
  }

  function renderCartQuote() {
    if (!cartSheetEl) return;
    const { sheet } = cartSheetEl;
    const feeEl = sheet.querySelector('[data-cart-fee]');
    const slotsEl = sheet.querySelector('[data-cart-slots]');
    const billEl = sheet.querySelector('[data-cart-bill]');
    const place = sheet.querySelector('[data-cart-place]');
    const subtotal = cartSubtotal(cartProducts || []);
    if (!cartQuote || !cartQuote.eligible) {
      feeEl.hidden = false;
      feeEl.textContent = (cartQuote && cartQuote.message) || 'Set your delivery location to check availability.';
      slotsEl.hidden = true; billEl.hidden = true;
      place.disabled = true;
      return;
    }
    const fee = Number(cartQuote.deliveryFeeInr || 0);
    feeEl.hidden = false;
    feeEl.textContent = cartQuote.freeApplied
      ? `Free delivery applied (basket over ${money(500)}) · ${cartQuote.distanceKm ? cartQuote.distanceKm + ' road km' : 'Hosur'}`
      : `Delivery ${money(fee)} · ${cartQuote.distanceKm ? cartQuote.distanceKm + ' road km from the hub' : 'local morning delivery'}`;
    const slots = cartQuote.slots || [];
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
    }
    const total = Math.max(0, Math.round(subtotal + fee));
    billEl.hidden = false;
    billEl.innerHTML = `<div><span>Item total</span><span>${money(subtotal)}</span></div>
      <div><span>Delivery</span><span>${fee === 0 ? 'FREE' : money(fee)}</span></div>
      <div class="cb-total"><span>Total to pay</span><span>${money(total)}</span></div>`;
    place.disabled = false;
    place.textContent = `Place order · ${money(total)}`;
  }

  function showCartAuth() {
    const { sheet } = cartSheetEl;
    const box = sheet.querySelector('[data-cart-auth]');
    const place = sheet.querySelector('[data-cart-place]');
    box.hidden = false;
    place.hidden = true;
    if (box.dataset.wired) return;
    box.dataset.wired = '1';
    box.innerHTML = AUTH_FORM_HTML;
    box.querySelector('[data-auth-cancel]').addEventListener('click', () => { box.hidden = true; place.hidden = false; });
    loadCartOtpSdk();
    const s = document.createElement('script');
    s.src = '/js/auth.js?v=20261005d'; s.async = true;
    s.onload = () => {
      if (!window.RFSAuth) return;
      window.RFSAuth.bindFlow(box.querySelector('[data-cart-flow]'), {
        onSuccess: async () => {
          cartMe = await ensureCartMe(true);
          box.hidden = true;
          place.hidden = false;
          toast(`Welcome, ${(cartMe?.name || 'friend').split(' ')[0]}! 🌿`);
          placeFromCart();
        }
      });
    };
    document.head.appendChild(s);
  }

  async function placeFromCart() {
    const { sheet } = cartSheetEl;
    const cart = readCart();
    if (!cart.length) return toast('Your basket is empty', 'error');
    const addr1 = sheet.querySelector('[data-cart-addr1]').value.trim();
    const pin = sheet.querySelector('[data-cart-pin]').value.trim();
    if (addr1.length < 5) { toast('Enter your house / flat / street address', 'error'); sheet.querySelector('[data-cart-addr1]').focus(); return; }
    if (!/^\d{6}$/.test(pin)) { toast('Enter a 6-digit pincode', 'error'); sheet.querySelector('[data-cart-pin]').focus(); return; }
    if (!cartQuote?.eligible) { toast('We cannot deliver to this area yet', 'error'); return; }
    if (!cartSlotId) { toast('Choose a delivery slot', 'error'); return; }
    const me = cartMe || await ensureCartMe();
    if (!me) return showCartAuth();
    try { localStorage.setItem(CART_SHEET_ADDR_KEY, JSON.stringify({ line1: addr1, pincode: pin })); } catch {}
    const loc = getSavedLocation() || {};
    const payload = {
      customer: { name: me.name, phone: me.phone },
      address: { line1: addr1, line2: '', area: locationLabel(loc) || 'Hosur', city: 'Hosur', pincode: pin },
      notes: '',
      items: cart,
      slotId: cartSlotId,
      paymentMethod: 'cod',
      location: Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng } : {}
    };
    const place = sheet.querySelector('[data-cart-place]');
    setBusy(place, true, 'Securing your order…');
    try {
      const order = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      saveCart([]);
      window.location.href = `/order-success?id=${encodeURIComponent(order.orderId)}&phone=${encodeURIComponent(me.phone)}&whatsapp=${encodeURIComponent(order.whatsappUrl || '')}`;
    } catch (error) {
      toast(error.message || 'Could not place the order — please try again', 'error');
      setBusy(place, false);
    }
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
