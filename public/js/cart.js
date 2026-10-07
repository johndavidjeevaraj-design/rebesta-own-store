/* Rebesta Fresh — basket PAGE, exact Swiggy cart layout. White cards on soft gray, mint savings banner,
   segmented Delivery Type | Tip | Instructions, bill with struck total, PAY USING + Pay bar. */
(() => {
  const $ = sel => document.querySelector(sel);
  const ADDR_KEY = 'rebesta_checkout_addr_v1';
  const TIP_KEY = 'rebesta_checkout_tip_v1';
  const COUPON_KEY = 'rebesta_checkout_coupon_v1';
  const NOTES_KEY = 'rebesta_checkout_notes_v1';
  const TIP_CHOICES = [0, 10, 20, 30];
  const ADDON_RE = /coriander|curry|chilli|garlic|ginger|lemon|coconut|mint|amaranth|keerai|keera/i;
  const ADD_TABS = [
    { id: 'popular', label: 'Popular', pick: list => list.filter(p => p.featured) },
    { id: 'greens', label: 'Greens', pick: list => list.filter(p => p.category === 'Leafy Greens') },
    { id: 'combos', label: 'Combos', pick: list => list.filter(p => p.category === 'Combos & Kits') },
    { id: 'addons', label: 'Add-ons', pick: list => list.filter(p => ADDON_RE.test(p.title) && p.category !== 'Combos & Kits') }
  ];

  const state = {
    products: [], byHandle: new Map(), me: null, quote: null,
    tip: 0, coupon: null, coupons: null, addTab: 'popular', seg: 'delivery', quoteTimer: null, notesTimer: null,
    payMethod: 'cod', onlineEnabled: false
  };

  const money = v => RFS.money(v);
  const items = () => RFS.readCart();
  const subtotal = () => {
    let sum = 0;
    for (const item of items()) { const p = state.byHandle.get(item.handle); if (p) sum += p.priceInr * item.qty; }
    return sum;
  };
  const savingsNow = () => (state.coupon ? Number(state.coupon.discountInr || 0) : 0) + (state.quote?.freeApplied ? Number(state.quote.deliveryFeeInr || 0) : 0);
  function readPref(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return (v === null || v === undefined) ? fallback : v; } catch { return fallback; }
  }
  function writePref(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

  /* ---------- segmented control ---------- */
  function setSeg(id) {
    state.seg = id;
    document.querySelectorAll('[data-bp-seg]').forEach(b => b.classList.toggle('on', b.dataset.bpSeg === id));
    document.querySelectorAll('.sw-panel').forEach(p => { p.hidden = p.dataset.bpPanel !== id; });
  }

  /* ---------- renderers ---------- */
  function renderHero() {
    const count = RFS.cartCount();
    $('[data-bp-count]').textContent = `${count} item${count === 1 ? '' : 's'}`;
    const saved = savingsNow();
    $('[data-bp-saved-banner]').hidden = !(saved > 0);
    if (saved > 0) $('[data-bp-saved-banner-amt]').textContent = `${money(saved)} saved!`;
  }

  function renderEmpty(hasItems) {
    $('[data-bp-empty]').hidden = hasItems;
    $('[data-bp-main]').hidden = !hasItems;
    $('[data-bp-paybar]').hidden = !hasItems;
    if (!hasItems) { renderRepeatOrder(); renderEmptyPicks(); }
  }

  function renderItems() {
    const box = $('[data-bp-items]');
    const cart = items();
    renderHero();
    renderEmpty(cart.length > 0);
    if (!cart.length) return;
    box.innerHTML = cart.map(item => {
      const p = state.byHandle.get(item.handle);
      if (!p) return '';
      const compare = Number(p.compareAtInr || 0) > Number(p.priceInr || 0) ? Number(p.compareAtInr) : 0;
      return `<div class="sw-item">
        <img src="${p.image}" alt="" loading="lazy">
        <div class="sw-item-l"><b>${p.title}</b><small>${p.unitLabel || ''}</small>
          <div class="sw-item-price-l">${money(p.priceInr)}${compare ? ` <s>${money(compare)}</s><span class="sw-off">${Math.round((compare - p.priceInr) * 100 / compare)}% OFF</span>` : ''}</div>
        </div>
        <div class="qty-stepper sw-step"><button type="button" data-cs="minus" data-handle="${item.handle}" data-qty="${item.qty}">−</button><span>${item.qty}</span><button type="button" data-cs="plus" data-handle="${item.handle}" data-qty="${item.qty}">+</button></div>
      </div>`;
    }).join('');
  }

  function renderAddr() {
    const addr1 = $('[data-bp-addr1]')?.value.trim() || readPref(ADDR_KEY, {}).line1 || '';
    const pin = $('[data-bp-pin]')?.value.trim() || readPref(ADDR_KEY, {}).pincode || '';
    const loc = RFS.getSavedLocation();
    const area = (loc && (loc.label || loc.area)) || 'Hosur';
    const line = $('[data-bp-addr-line]');
    if (addr1) line.textContent = `Home | ${addr1}, ${area}${pin ? ' ' + pin : ''}`;
    else { line.textContent = 'Home | Add delivery address'; line.classList.add('is-empty'); }
    if (addr1) line.classList.remove('is-empty');
  }

  function renderRail() {
    const wrap = $('[data-bp-complete]');
    if (!state.products.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('[data-bp-tabs]').innerHTML = ADD_TABS.map(t =>
      `<button type="button" class="sw-tab${t.id === state.addTab ? ' on' : ''}" data-bp-tab="${t.id}">${t.label}</button>`).join('');
    const inCart = new Map(items().map(i => [i.handle, i.qty]));
    const pool = state.products.filter(p => p.active !== false && Number(p.stock) > 0);
    const seen = new Set();
    const tab = ADD_TABS.find(t => t.id === state.addTab) || ADD_TABS[0];
    const picks = tab.pick(pool).filter(p => (seen.has(p.handle) ? false : seen.add(p.handle))).slice(0, 8);
    $('[data-bp-rail]').innerHTML = picks.map(p => {
      const qty = inCart.get(p.handle) || 0;
      const compare = Number(p.compareAtInr || 0) > Number(p.priceInr || 0) ? Number(p.compareAtInr) : 0;
      return `<div class="sw-pcard">
        <div class="sw-pimg"><img src="${p.image}" alt="" loading="lazy">
        ${qty
          ? `<div class="qty-stepper sw-step sw-float-step"><button type="button" data-cs="minus" data-handle="${p.handle}" data-qty="${qty}">−</button><span>${qty}</span><button type="button" data-cs="plus" data-handle="${p.handle}" data-qty="${qty}">+</button></div>`
          : `<button type="button" class="sw-add" data-cs-action="add" data-handle="${p.handle}" aria-label="Add ${p.title}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>`}
        </div>
        <div class="sw-pname">${p.title}</div>
        <div class="sw-pprice">${money(p.priceInr)}${compare ? ` <s>${money(compare)}</s><span class="sw-off">${Math.round((compare - p.priceInr) * 100 / compare)}% OFF</span>` : ''} <small>· ${p.unitLabel || ''}</small></div>
      </div>`;
    }).join('') || '<p class="sw-rail-empty">Nothing here right now — check the other tabs!</p>';
  }

  const couponDesc = c => {
    const off = c.type === 'percent' ? `${Number(c.value)}% off` : `${money(Number(c.value))} off`;
    return c.minOrderInr ? `${off} on orders above ${money(Number(c.minOrderInr))}` : `${off} on any order`;
  };

  function renderSavings() {
    const wrap = $('[data-bp-savings]');
    if (!state.coupons || !state.coupons.length) { wrap.hidden = true; }
    else {
      wrap.hidden = false;
      $('[data-bp-coupon-cards]').innerHTML = state.coupons.map(c => {
        const applied = state.coupon && state.coupon.code === c.code;
        return `<div class="sw-crow${applied ? ' on' : ''}">
          <span class="sw-pct" aria-hidden="true">%</span>
          <div class="sw-crow-l"><b>${c.code}</b><small>${couponDesc(c)}</small></div>
          ${applied ? '<span class="sw-capplied">✓ Applied</span>' : `<button type="button" class="sw-crow-apply" data-bp-apply-code="${c.code}">APPLY</button>`}
        </div>`;
      }).join('');
    }
    const on = $('[data-bp-coupon-on]');
    const toggleRow = $('[data-bp-coupon-toggle]');
    if (state.coupon) {
      on.hidden = false; toggleRow.hidden = true;
      on.innerHTML = `<span>🎟 <b>${money(Number(state.coupon.discountInr) || 0)} saved</b> with '${state.coupon.code}' <span class="sw-capplied">✓ Applied</span></span><button type="button" class="sw-coupon-x" data-bp-coupon-x aria-label="Remove coupon">✕</button>`;
    } else {
      on.hidden = true; toggleRow.hidden = false;
    }
  }

  function renderTips() {
    $('[data-bp-tips]').innerHTML = TIP_CHOICES.map(v =>
      `<button type="button" class="sw-tip-chip${state.tip === v ? ' on' : ''}" data-tip="${v}">${v ? money(v) : 'No tip'}</button>`).join('');
  }

  function renderBill() {
    const billEl = $('[data-bp-bill]');
    if (!items().length) { billEl.hidden = true; return; }
    billEl.hidden = false;
    const sub = subtotal();
    const discount = state.coupon ? Number(state.coupon.discountInr || 0) : 0;
    const eligible = Boolean(state.quote?.eligible);
    const fee = eligible ? Number(state.quote.deliveryFeeInr || 0) : null;
    const total = Math.max(0, Math.round(sub + (fee || 0) + state.tip - discount));
    const saved = savingsNow();
    $('[data-bp-strike]').hidden = !(saved > 0);
    if (saved > 0) $('[data-bp-strike]').textContent = money(total + saved);
    $('[data-bp-pay-total]').textContent = money(total);
    const savedLine = $('[data-bp-saved]');
    savedLine.hidden = !(saved > 0);
    if (saved > 0) savedLine.textContent = `${money(saved)} saved on the total!`;
    const kms = eligible && state.quote?.distanceKm ? `${Number(state.quote.distanceKm).toFixed(1)} kms` : '';
    $('[data-bp-bill-rows]').innerHTML = `
      <div class="sw-bill-row"><span>Item Total</span><span>${money(sub)}</span></div>
      <div class="sw-bill-row"><span>Delivery Fee${kms ? ` <small class="sw-km">| ${kms}</small>` : ''}</span><span>${fee === null ? '—' : (fee === 0 ? 'FREE' : money(fee))}</span></div>
      <p class="sw-free-note">Free delivery applicable on orders above ${money(500)}</p>
      <div class="sw-bill-row"><span>Delivery Tip</span>${state.tip ? `<span>${money(state.tip)}</span>` : '<button type="button" class="sw-addtip" data-bp-gotip>Add tip</button>'}</div>
      <div class="sw-bill-row sw-bill-final"><span>To Pay</span><span>${money(total)}</span></div>`;
    const pay = $('[data-bp-pay]');
    pay.textContent = `Pay ${money(total)}`;
    pay.disabled = !eligible;
    renderPaybar();
  }

  function renderPaybar() {
    $('[data-bp-pm-label]').textContent = state.payMethod === 'online' ? 'UPI' : 'Cash on Delivery';
    const sub = $('[data-bp-pm-sub]');
    if (sub) {
      const units = items().reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
      sub.textContent = `${units} item${units === 1 ? '' : 's'} · ${$('[data-bp-pay-total]').textContent}`;
    }
    document.querySelectorAll('.sw-pm-row[data-pm]').forEach(row => {
      const on = row.dataset.pm === state.payMethod;
      row.classList.toggle('on', on);
    });
  }

  /* ---------- payment options sheet (Swiggy-style) ---------- */
  function openPmSheet() {
    const sheet = $('[data-bp-pm-sheet]');
    sheet.hidden = false;
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.setAttribute('data-bp-pm-backdrop', '');
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); });
    document.body.classList.add('sheet-open');
  }

  function closePmSheet() {
    const sheet = $('[data-bp-pm-sheet]');
    const backdrop = document.querySelector('[data-bp-pm-backdrop]');
    sheet.classList.remove('open');
    if (backdrop) { backdrop.classList.remove('open'); backdrop.remove(); }
    document.body.classList.remove('sheet-open');
    setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 340);
  }

  function renderQuote() {
    const feeEl = $('[data-bp-fee]');
    const eligible = Boolean(state.quote?.eligible);
    feeEl.hidden = false;
    if (state.quote && !eligible) feeEl.textContent = state.quote.message || 'We cannot deliver to this area yet.';
    else if (eligible) feeEl.textContent = state.quote.freeApplied
      ? `Free delivery applied · ${state.quote.distanceKm ? state.quote.distanceKm + ' road km' : 'Hosur'}`
      : `Delivery ${money(Number(state.quote.deliveryFeeInr || 0))} · ${state.quote.distanceKm ? state.quote.distanceKm + ' road km from the hub' : 'local morning delivery'}`;
    else feeEl.textContent = 'Set your delivery location to check availability.';
    renderBill();
  }

  function renderAll() { renderItems(); renderAddr(); renderRail(); renderSavings(); renderTips(); renderQuote(); }

  /* ---------- quote ---------- */
  function scheduleQuote() {
    clearTimeout(state.quoteTimer);
    state.quoteTimer = setTimeout(refreshQuote, 280);
  }
  async function refreshQuote() {
    if (!items().length) { state.quote = null; return; }
    const loc = RFS.getSavedLocation() || {};
    const pin = $('[data-bp-pin]').value.trim();
    try {
      state.quote = (await RFS.api('/api/quote', { method: 'POST', body: JSON.stringify({
        items: items(),
        location: Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng } : {},
        address: { pincode: /^\d{6}$/.test(pin) ? pin : '' }
      }) })).quote || null;
    } catch { state.quote = null; }
    if (state.coupon && subtotal() < Number(state.coupon.minOrderInr || 0)) {
      RFS.toast(`Coupon ${state.coupon.code} removed — basket is below ${money(Number(state.coupon.minOrderInr || 0))}`, 'error');
      removeCoupon();
      return;
    }
    renderQuote();
    renderHero();
  }

  /* ---------- coupons ---------- */
  async function applyCoupon(code, quiet = false) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    const msg = $('[data-bp-coupon-msg]');
    if (msg && !quiet) { msg.hidden = false; msg.textContent = 'Checking…'; msg.className = 'sw-coupon-msg'; }
    try {
      const data = await RFS.api('/api/coupon/check', { method: 'POST', body: JSON.stringify({ code, subtotalInr: subtotal() }) });
      state.coupon = data.coupon;
      writePref(COUPON_KEY, { code: state.coupon.code });
      if (!quiet) RFS.toast(`Coupon ${state.coupon.code} applied — you save ${money(state.coupon.discountInr)} 🎉`);
      if (msg) msg.hidden = true;
    } catch (error) {
      if (!quiet && msg) { msg.hidden = false; msg.textContent = error.message || 'That coupon is not valid'; msg.className = 'sw-coupon-msg error'; }
      if (quiet) { state.coupon = null; try { localStorage.removeItem(COUPON_KEY); } catch {} }
    }
    renderSavings();
    renderQuote();
    renderHero();
  }
  function removeCoupon() {
    state.coupon = null;
    try { localStorage.removeItem(COUPON_KEY); } catch {}
    renderSavings();
    renderQuote();
    renderHero();
  }

  /* ---------- login sheet (phone-number OTP) ---------- */
  function loadOtpSdk() {
    if (document.querySelector('script[data-otp-sdk]') || typeof window.initSendOTP === 'function') return;
    const config = {
      widgetId: '366a65687644323637363131',
      tokenAuth: '571380TgZrH8gvzsiK6aa8dedbP1',
      exposeMethods: true,
      captchaRenderId: 'bp-captcha',
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
  function openAuthSheet(afterLogin) {
    const sheet = $('[data-bp-auth-sheet]');
    const back = $('[data-bp-auth-backdrop]');
    sheet.hidden = false; back.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    loadOtpSdk();
    const s = document.createElement('script');
    s.src = '/js/auth.js?v=20261005d'; s.async = true;
    s.onload = () => {
      if (!window.RFSAuth || sheet.dataset.wired) return;
      sheet.dataset.wired = '1';
      window.RFSAuth.bindFlow(sheet.querySelector('[data-bp-flow]'), {
        onSuccess: async () => {
          try { state.me = (await RFS.api('/api/auth/me')).customer || null; } catch { state.me = null; }
          closeAuthSheet();
          RFS.toast(`Welcome, ${(state.me?.name || 'friend').split(' ')[0]}! 🌿`);
          if (typeof afterLogin === 'function') afterLogin();
        }
      });
    };
    document.head.appendChild(s);
  }
  function closeAuthSheet() {
    const sheet = $('[data-bp-auth-sheet]');
    sheet.classList.remove('open');
    $('[data-bp-auth-backdrop]').hidden = true;
    document.body.classList.remove('sheet-open');
    setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 340);
  }

  /* ---------- Cashfree hosted checkout (JS SDK, loaded on demand) ---------- */
  function loadCashfreeSdk() {
    if (window.Cashfree) return Promise.resolve();
    const urls = ['https://js.cashfree.com/cashfree-js.js', 'https://js.cashfree.com/v2/cashfree.js'];
    return new Promise((resolve, reject) => {
      let i = 0;
      const tryNext = () => {
        if (i >= urls.length) return reject(new Error('Could not load the payment page (script blocked). Check your network and try again.'));
        const script = document.createElement('script');
        script.src = urls[i++];
        script.onload = () => window.Cashfree ? resolve() : tryNext();
        script.onerror = tryNext;
        document.head.appendChild(script);
      };
      tryNext();
    });
  }

  async function startCashfreeCheckout(payment) {
    try {
      await loadCashfreeSdk();
      const mode = payment.mode === 'live' ? 'production' : 'sandbox';
      const cashfree = typeof window.Cashfree === 'function'
        ? window.Cashfree({ mode })
        : await window.Cashfree.load({ mode });
      cashfree.checkout({ paymentSessionId: payment.sessionId, redirectTarget: '_self' });
      /* if the SDK fails silently, the callback/verify still protects us */
      setTimeout(() => RFS.setBusy($('[data-bp-pay]'), false), 1500);
    } catch (error) {
      RFS.toast(error.message || 'Could not open the payment page', 'error');
      RFS.setBusy($('[data-bp-pay]'), false);
      await refreshQuote();
    }
  }

  /* ---------- place order ---------- */
  async function placeOrder() {
    const addr1El = $('[data-bp-addr1]');
    const pinEl = $('[data-bp-pin]');
    const edit = $('[data-bp-addr-edit]');
    const addr1 = addr1El.value.trim();
    const pin = pinEl.value.trim();
    if (addr1.length < 5) { edit.hidden = false; RFS.toast('Enter your house / flat / street address', 'error'); addr1El.focus(); return; }
    if (!/^\d{6}$/.test(pin)) { edit.hidden = false; RFS.toast('Enter a 6-digit pincode', 'error'); pinEl.focus(); return; }
    if (!RFS.getSavedLocation()) { RFS.toast('Pick your delivery area first', 'error'); RFS.openLocationSheet(); return; }
    if (!state.quote) await refreshQuote();
    if (!state.quote?.eligible) { RFS.toast(state.quote?.message || 'We cannot deliver to this area yet', 'error'); return; }
    if (!state.me) { openAuthSheet(() => { placeOrder(); }); return; }
    const slot = (state.quote.slots || []).find(s => !s.full);
    if (!slot) { RFS.toast('No delivery slots available right now — please try again in a few minutes', 'error'); return; }
    writePref(ADDR_KEY, { line1: addr1, pincode: pin });
    writePref(NOTES_KEY, $('[data-bp-notes-input]').value.trim());
    if (state.coupon) writePref(COUPON_KEY, { code: state.coupon.code });
    else { try { localStorage.removeItem(COUPON_KEY); } catch {} }
    writePref(TIP_KEY, state.tip);
    const saved = RFS.getSavedLocation() || {};
    const orderItems = items();
    const payload = {
      customer: { name: state.me.name || '', phone: state.me.phone || '', email: state.me.email || '' },
      address: { line1: addr1, area: saved.label || '', city: 'Hosur', pincode: pin },
      notes: $('[data-bp-notes-input]').value.trim(),
      items: orderItems,
      slotId: slot.id,
      paymentMethod: state.payMethod,
      tipInr: Number(state.tip || 0)
    };
    if (state.coupon) payload.couponCode = state.coupon.code;
    if (Number.isFinite(saved.lat)) payload.location = { lat: saved.lat, lng: saved.lng };
    const pay = $('[data-bp-pay]');
    RFS.setBusy(pay, true, 'Placing order…');
    try {
      const order = await RFS.api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      RFS.saveCart([]);
      for (const key of [COUPON_KEY, TIP_KEY, NOTES_KEY]) { try { localStorage.removeItem(key); } catch {} }
      try { localStorage.setItem('rebesta_last_order', JSON.stringify({ items: orderItems, at: Date.now() })); } catch {}
      if (order.payment && order.payment.type === 'cashfree') {
        await startCashfreeCheckout(order.payment);
        return;
      }
      window.location.href = `/order-success?id=${encodeURIComponent(order.orderId)}&phone=${encodeURIComponent(payload.customer.phone)}&whatsapp=${encodeURIComponent(order.whatsappUrl || '')}`;
    } catch (error) {
      RFS.toast(error.message || 'Could not place this order', 'error');
      await refreshQuote();
    } finally {
      RFS.setBusy(pay, false);
    }
  }

  /* ---------- empty-state helpers ---------- */
  function renderRepeatOrder() {
    const host = $('[data-repeat-order]');
    if (!host) return;
    let last = null;
    try { last = JSON.parse(localStorage.getItem('rebesta_last_order') || 'null'); } catch {}
    const fresh = last && Array.isArray(last.items) && last.items.length && Date.now() - (last.at || 0) < 45 * 864e5;
    if (!fresh) { host.hidden = true; return; }
    const known = last.items.filter(i => state.byHandle.has(i.handle));
    if (!known.length) { host.hidden = true; return; }
    host.hidden = false;
    host.querySelector('button').onclick = () => {
      for (const item of known) RFS.addItem(item.handle, item.qty);
      RFS.toast(`${known.length} products from your last order added`, 'success');
      renderAll(); scheduleQuote();
    };
  }
  function renderEmptyPicks() {
    const grid = $('[data-empty-picks-grid]');
    if (!grid || !state.products.length) return;
    const picks = state.products.filter(p => p.featured && p.active !== false && p.stock > 0).slice(0, 4);
    grid.innerHTML = picks.map(p => `<a class="sw-pick" href="/product/${p.handle}">
      <img src="${p.image}" alt="${p.title}" loading="lazy">
      <b>${p.title}</b><span>${money(p.priceInr)}</span></a>`).join('');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', event => {
    const step = event.target.closest('button[data-cs], button[data-cs-action]');
    if (step) {
      if (step.dataset.csAction === 'add') RFS.addItem(step.dataset.handle, 1);
      else { const qty = Number(step.dataset.qty || '1'); RFS.setQty(step.dataset.handle, step.dataset.cs === 'plus' ? qty + 1 : qty - 1); }
      return;
    }
    const tab = event.target.closest('button[data-bp-tab]');
    if (tab) { state.addTab = tab.dataset.bpTab; renderRail(); return; }
    const applyBtn = event.target.closest('button[data-bp-apply-code]');
    if (applyBtn) { applyCoupon(applyBtn.dataset.bpApplyCode); return; }
    if (event.target.closest('[data-bp-coupon-x]')) { removeCoupon(); return; }
    const tip = event.target.closest('button[data-tip]');
    if (tip) { state.tip = Number(tip.dataset.tip) || 0; writePref(TIP_KEY, state.tip); renderTips(); renderBill(); return; }
    if (event.target.closest('[data-bp-gotip]')) { setSeg('tip'); return; }
    const seg = event.target.closest('button[data-bp-seg]');
    if (seg) { setSeg(seg.dataset.bpSeg); return; }
  });

  $('[data-bp-addr-row]').addEventListener('click', () => {
    const edit = $('[data-bp-addr-edit]');
    edit.hidden = !edit.hidden;
    $('[data-bp-addr-row]').classList.toggle('open', !edit.hidden);
    if (!edit.hidden && !$('[data-bp-addr1]').value.trim()) $('[data-bp-addr1]').focus();
  });
  $('[data-bp-area]').addEventListener('click', () => RFS.openLocationSheet());
  $('[data-bp-addmore]').addEventListener('click', () => { window.location.href = '/shop'; });
  $('[data-bp-bill-toggle]')?.addEventListener('click', () => {
    const bill = $('[data-bp-bill]');
    if (!bill) return;
    bill.classList.toggle('open');
    $('[data-bp-bill-toggle]')?.setAttribute('aria-expanded', String(bill.classList.contains('open')));
  });
  $('[data-bp-notes-toggle]').addEventListener('click', () => { setSeg('instructions'); $('[data-bp-notes-input]')?.focus(); });
  $('[data-bp-notes-input]').addEventListener('input', event => {
    clearTimeout(state.notesTimer);
    const value = event.target.value;
    state.notesTimer = setTimeout(() => {
      writePref(NOTES_KEY, value);
      const hint = $('[data-bp-notes-hint]');
      if (hint) hint.textContent = value ? `“${value.slice(0, 18)}${value.length > 18 ? '…' : ''}”` : '';
    }, 350);
  });
  $('[data-bp-coupon-toggle]').addEventListener('click', () => {
    const more = $('[data-bp-coupon-more]');
    more.hidden = !more.hidden;
  });
  $('[data-bp-coupon-apply-btn]').addEventListener('click', () => applyCoupon($('[data-bp-coupon-input]').value));
  $('[data-bp-coupon-input]').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applyCoupon(event.target.value); } });
  $('[data-bp-pay-method]').addEventListener('click', openPmSheet);
  $('[data-bp-pm-close]').addEventListener('click', closePmSheet);
  document.querySelectorAll('.sw-pm-row[data-pm]').forEach(row => {
    row.addEventListener('click', () => {
      if (row.classList.contains('off')) { RFS.toast('Online payment setup is almost ready — please use Cash on Delivery today', 'error'); return; }
      state.payMethod = row.dataset.pm === 'online' ? 'online' : 'cod';
      renderPaybar();
      closePmSheet();
    });
  });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-bp-pm-backdrop]')) closePmSheet();
  });
  $('[data-bp-pay]').addEventListener('click', placeOrder);
  $('[data-bp-pin]').addEventListener('change', () => { scheduleQuote(); });
  $('[data-bp-addr1]').addEventListener('input', renderAddr);
  $('[data-bp-pin]').addEventListener('input', renderAddr);
  $('[data-bp-auth-close]').addEventListener('click', closeAuthSheet);
  $('[data-bp-auth-backdrop]').addEventListener('click', closeAuthSheet);
  $('[data-bp-auth-cancel]').addEventListener('click', closeAuthSheet);

  window.addEventListener('rebesta:cart-changed', () => { renderAll(); scheduleQuote(); });
  window.addEventListener('rebesta:location-changed', () => { renderAddr(); scheduleQuote(); });

  /* ---------- init ---------- */
  (async function init() {
    try {
      const [products, me] = await Promise.all([
        RFS.api('/api/products'),
        RFS.api('/api/auth/me').catch(() => null)
      ]);
      state.products = products.products || [];
      state.byHandle = new Map(state.products.map(p => [p.handle, p]));
      state.me = me?.customer || null;
      try { state.onlineEnabled = Boolean((await RFS.api('/api/settings'))?.payments?.onlineEnabled); } catch {}
      if (!state.onlineEnabled) document.querySelector('.sw-pm-row[data-pm="online"]')?.classList.add('off');
      else state.payMethod = 'online'; // Swiggy-style: prefer UPI when it is available
      try { state.coupons = (await RFS.api('/api/coupon/list')).coupons || []; } catch { state.coupons = []; }
      const savedAddr = readPref(ADDR_KEY, null);
      if (savedAddr?.line1) $('[data-bp-addr1]').value = String(savedAddr.line1).slice(0, 120);
      if (savedAddr?.pincode) $('[data-bp-pin]').value = String(savedAddr.pincode).slice(0, 6);
      state.tip = Math.min(100, Math.max(0, Number(readPref(TIP_KEY, 0)) || 0));
      const notes = String(readPref(NOTES_KEY, '') || '');
      if (notes) $('[data-bp-notes-input]').value = notes.slice(0, 250);
      const hint = $('[data-bp-notes-hint]');
      if (hint && notes) hint.textContent = `“${notes.slice(0, 18)}${notes.length > 18 ? '…' : ''}”`;
      const savedCoupon = readPref(COUPON_KEY, null);
      renderAll();
      setSeg('delivery');
      RFS.syncCartUI(state.products);
      if (savedCoupon?.code) await applyCoupon(savedCoupon.code, true);
      scheduleQuote();
      if (!RFS.getSavedLocation()) setTimeout(() => RFS.openLocationSheet(), 900);
    } catch (error) {
      RFS.toast(error.message || 'Could not load your basket', 'error');
    }
  })();
})();
