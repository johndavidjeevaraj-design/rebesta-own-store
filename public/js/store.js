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
    api,
    syncCartUI,
    toast,
    setBusy,
    flyToBasket,
    placeholderProducts
  };
})();
