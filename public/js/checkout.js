(() => {
  /* ============ 🔁 Weekly-order offer card wiring ============ */
  const subCard = document.querySelector('[data-sub-card]');
  if (subCard) {
    const subCheck = subCard.querySelector('[data-subscribe]');
    const select = subCard.querySelector('[data-subscribe-day]');
    const pills = [...subCard.querySelectorAll('[data-sub-day]')];
    const syncPills = () => pills.forEach(p => p.classList.toggle('on', p.dataset.subDay === select.value));
    pills.forEach(p => p.addEventListener('click', () => { select.value = p.dataset.subDay; syncPills(); }));
    select.addEventListener('change', syncPills);
    subCheck.addEventListener('change', () => subCard.classList.toggle('active', subCheck.checked));
    syncPills();
  }
  const state = { products: [], byHandle: new Map(), settings: null, quote: null, coords: null, map: null, marker: null, coupon: null };
  const $ = selector => document.querySelector(selector);

  const nodes = {
    miniList: $('[data-order-mini-list]'),
    summary: $('[data-checkout-summary]'),
    pinStatus: $('[data-pin-status]'),
    quoteBox: $('[data-quote-result]'),
    slots: $('[data-slots]'),
    placeOrder: $('[data-place-order]'),
    paymentList: $('[data-payment-list]'),
    gps: $('[data-use-gps]'),
    manualPin: $('[data-manual-pin]'),
    mapShell: $('[data-map-shell]'),
    lat: $('[name="latitude"]'),
    lng: $('[name="longitude"]'),
    applyCoords: $('[data-apply-coords]'),
    calculate: $('[data-calculate-route]')
  };

  function formData() {
    const fd = new FormData($('[data-checkout-form]'));
    return {
      customer: { name: String(fd.get('name') || '').trim(), phone: String(fd.get('phone') || '').trim(), email: String(fd.get('email') || '').trim() },
      address: {
        line1: String(fd.get('address1') || '').trim(),
        line2: String(fd.get('address2') || '').trim(),
        area: String(fd.get('area') || '').trim(),
        city: String(fd.get('city') || 'Hosur').trim(),
        pincode: String(fd.get('pincode') || '').trim()
      },
      notes: String(fd.get('notes') || '').trim()
    };
  }

  function items() {
    return RFS.readCart().filter(item => state.byHandle.has(item.handle));
  }

  function lines() {
    return items().map(item => ({ ...item, product: state.byHandle.get(item.handle) }));
  }

  function subtotal() {
    return lines().reduce((sum, item) => sum + item.product.priceInr * item.qty, 0);
  }

  function setPinStatus(message, type = '') {
    nodes.pinStatus.className = `pin-status ${type}`.trim();
    nodes.pinStatus.textContent = message;
  }

  function coordinatesReady() {
    return state.coords && Number.isFinite(Number(state.coords.lat)) && Number.isFinite(Number(state.coords.lng));
  }

  function setCoordinates(lat, lng, label = 'Selected map pin', source = 'map') {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setPinStatus('Enter valid latitude and longitude values.', 'error');
      return false;
    }
    state.coords = { lat: latitude, lng: longitude, label, source };
    state.quote = null;
    nodes.lat.value = latitude.toFixed(6);
    nodes.lng.value = longitude.toFixed(6);
    RFS.saveLocation({ ...state.coords, savedAt: new Date().toISOString() });
    setPinStatus(`Exact pin locked: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} · ${label}`, 'success');
    updateMarker();
    quoteDelivery(true);
    return true;
  }

  function updateMarker() {
    if (!state.map || !window.L || !coordinatesReady()) return;
    const point = [state.coords.lat, state.coords.lng];
    if (!state.marker) {
      state.marker = L.marker(point, { draggable: true }).addTo(state.map);
      state.marker.on('dragend', () => {
        const p = state.marker.getLatLng();
        setCoordinates(p.lat, p.lng, 'Dragged map pin', 'map');
      });
    } else state.marker.setLatLng(point);
    state.map.setView(point, Math.max(state.map.getZoom(), 16));
  }

  function initMap() {
    nodes.mapShell.classList.add('active');
    if (!window.L) {
      setPinStatus('Map library did not load in this preview. GPS and manual latitude/longitude still work.', 'error');
      return;
    }
    if (state.map) return;
    const hub = state.settings?.delivery || { hubLat: 12.728582, hubLng: 77.824784 };
    const start = coordinatesReady() ? [state.coords.lat, state.coords.lng] : [hub.hubLat, hub.hubLng];
    state.map = L.map('pinMap').setView(start, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
    state.map.on('click', event => {
      setCoordinates(event.latlng.lat, event.latlng.lng, 'Manual map pin', 'map');
      quoteDelivery(true);
    });
    if (coordinatesReady()) updateMarker();
  }

  async function reverseLocate(lat, lng) {
    try {
      const data = await RFS.api(`/api/location/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      return data.location?.label || 'Current GPS pin';
    } catch { return 'Current GPS pin'; }
  }

  function renderBasket() {
    const rows = lines();
    nodes.miniList.innerHTML = '';
    for (const row of rows) {
      const div = document.createElement('div');
      div.className = 'order-mini';
      const img = document.createElement('img'); img.src = row.product.image; img.alt = row.product.title;
      const body = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = row.product.title;
      const meta = document.createElement('span'); meta.textContent = `${row.qty} × ${row.product.unitLabel}`;
      body.append(title, document.createElement('br'), meta);
      const price = document.createElement('div'); price.className = 'price'; price.textContent = RFS.money(row.product.priceInr * row.qty);
      div.append(img, body, price);
      nodes.miniList.appendChild(div);
    }
    if (!rows.length) nodes.miniList.innerHTML = '<div class="alert error">Your basket is empty. Add vegetables before checkout.</div>';
  }

  function renderSummary() {
    const products = subtotal();
    if (state.coupon && products < Number(state.coupon.minOrderInr || 0)) {
      state.coupon = null;
      RFS.toast('Coupon removed — basket is below the minimum order', 'error');
    }
    const fee = state.quote?.eligible ? Number(state.quote.deliveryFeeInr || 0) : null;
    const discount = state.coupon ? Number(state.coupon.discountInr || 0) : 0;
    const total = Math.max(0, products + (fee || 0) - discount);
    nodes.summary.innerHTML = '';
    const h2 = document.createElement('h2'); h2.textContent = 'Order summary';
    nodes.summary.appendChild(h2);

    const stages = [
      { label: 'Basket', done: items().length > 0, number: 1 },
      { label: 'Pin', done: coordinatesReady(), number: 2 },
      { label: 'Route', done: Boolean(state.quote?.eligible), number: 3 },
      { label: 'Slot', done: Boolean(selectedSlot()), number: 4 }
    ];
    const firstOpen = stages.find(stage => !stage.done);
    const progress = document.createElement('div');
    progress.className = 'checkout-progress';
    for (const stage of stages) {
      const item = document.createElement('span');
      item.className = `checkout-step ${stage.done ? 'complete' : ''} ${(!stage.done && firstOpen === stage) ? 'active' : ''}`.trim();
      item.innerHTML = `<span class="dot">${stage.done ? '✓' : stage.number}</span><span>${stage.label}</span>`;
      progress.appendChild(item);
    }
    nodes.summary.appendChild(progress);
    const rows = [
      ['Subtotal', RFS.money(products)],
      ['Delivery fee', fee === null ? 'Calculate exact pin first' : RFS.money(fee)],
      ['Road distance', state.quote ? `${state.quote.distanceKm.toFixed(2)} km` : 'Not calculated'],
      ['Delivery limit', state.settings?.delivery?.maxRoadKm ? `${state.settings.delivery.maxRoadKm} road km` : '9 road km']
    ];
    for (const [label, value] of rows) {
      const div = document.createElement('div'); div.className = 'summary-row';
      div.innerHTML = '<span></span><strong></strong>';
      div.querySelector('span').textContent = label;
      div.querySelector('strong').textContent = value;
      nodes.summary.appendChild(div);
    }
    if (state.coupon) {
      const couponRow = document.createElement('div');
      couponRow.className = 'summary-row coupon-applied-row';
      couponRow.innerHTML = '<span></span><strong></strong>';
      couponRow.querySelector('span').textContent = `Coupon ${state.coupon.code}`;
      couponRow.querySelector('strong').textContent = `−${RFS.money(discount)}`;
      nodes.summary.appendChild(couponRow);
    }
    const couponBox = document.createElement('div');
    couponBox.className = 'coupon-box';
    if (state.coupon) {
      couponBox.innerHTML = `<div class="coupon-applied"><span>🎟 <strong></strong> applied</span><button type="button" class="remove-link" data-coupon-remove>Remove</button></div>`;
      couponBox.querySelector('strong').textContent = state.coupon.code;
      couponBox.querySelector('[data-coupon-remove]').addEventListener('click', () => {
        state.coupon = null;
        renderSummary();
        RFS.toast('Coupon removed');
      });
    } else {
      couponBox.innerHTML = `<label for="couponInput">Have a coupon code?</label><div class="coupon-row"><input id="couponInput" data-coupon-input placeholder="e.g. WELCOME50" maxlength="24" autocomplete="off"><button type="button" class="button ghost small" data-apply-coupon>Apply</button></div><div class="coupon-msg" data-coupon-msg></div>${window.__RFS_SETTINGS?.rewards?.referralEnabled ? `<label for="referralInput" style="margin-top:12px">Referred by a friend? (optional)</label><div class="coupon-row"><input id="referralInput" data-referral-input inputmode="tel" placeholder="Friend's 10-digit mobile" maxlength="10" autocomplete="off"></div><div class="coupon-msg" data-referral-msg>Your friend gets ₹${window.__RFS_SETTINGS.rewards.referralBonusInr || 50} after your first delivery — and so do you.</div>` : ''}`;
      const input = couponBox.querySelector('[data-coupon-input]');
      const msg = couponBox.querySelector('[data-coupon-msg]');
      const apply = async () => {
        const code = input.value.trim();
        if (!code) { msg.textContent = 'Enter a code first'; msg.className = 'coupon-msg error'; return; }
        msg.textContent = 'Checking…'; msg.className = 'coupon-msg';
        try {
          const data = await RFS.api('/api/coupon/check', { method: 'POST', body: JSON.stringify({ code, subtotalInr: products }) });
          state.coupon = data.coupon;
          RFS.toast(`Coupon ${data.coupon.code} applied — you save ${RFS.money(data.coupon.discountInr)}`);
          renderSummary();
        } catch (error) {
          msg.textContent = error.message; msg.className = 'coupon-msg error';
        }
      };
      couponBox.querySelector('[data-apply-coupon]').addEventListener('click', apply);
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } });
    }
    nodes.summary.appendChild(couponBox);
    const totalRow = document.createElement('div'); totalRow.className = 'summary-total';
    totalRow.innerHTML = '<span>Total to pay</span><strong></strong>';
    totalRow.querySelector('strong').textContent = RFS.money(total);
    const note = document.createElement('p'); note.className = 'summary-note';
    note.textContent = state.quote?.freeApplied
      ? 'Free delivery applied because your basket is ₹500 or more.'
      : 'Your final total is recalculated safely by the server before the order is saved.';
    nodes.summary.append(totalRow, note);
    nodes.placeOrder.disabled = !items().length || !state.quote?.eligible || !selectedSlot();
  }

  function renderQuote() {
    nodes.quoteBox.innerHTML = '';
    nodes.slots.innerHTML = '';
    if (!state.quote) {
      renderSummary();
      return;
    }
    const alert = document.createElement('div');
    alert.className = `alert ${state.quote.eligible ? 'success' : 'error'}`;
    alert.textContent = state.quote.message;
    const facts = document.createElement('div');
    facts.className = 'route-facts';
    const factsList = [
      `${state.quote.distanceKm.toFixed(2)} road km`,
      state.quote.deliveryTier?.label || 'Outside tier',
      state.quote.freeApplied ? 'Free delivery' : `Fee ₹${state.quote.deliveryFeeInr}`,
      state.quote.provider || 'Driving route'
    ];
    for (const fact of factsList) {
      const badge = document.createElement('span'); badge.className = state.quote.eligible ? 'badge green' : 'badge orange'; badge.textContent = fact; facts.appendChild(badge);
    }
    nodes.quoteBox.append(alert, facts);
    if (state.quote.eligible) {
      let firstSelectable = null;
      for (const slot of state.quote.slots || []) {
        const label = document.createElement('label');
        const full = Boolean(slot.full);
        label.className = `option-card${full ? ' disabled' : ''}`;
        label.innerHTML = '<input type="radio" name="slotId"><div><strong></strong><span></span></div>';
        const radio = label.querySelector('input');
        radio.value = slot.id;
        radio.name = 'deliverySlot';
        radio.disabled = full;
        label.querySelector('strong').textContent = slot.label;
        const left = Number(slot.remaining ?? slot.capacity ?? '');
        label.querySelector('span').textContent = full
          ? `${slot.dateLabel || ''} · Full — pick the other slot 🌕`
          : `${slot.dateLabel || state.quote.deliveryDate.label || ''} · Local morning delivery${Number.isFinite(left) && left <= 8 ? ` · ${left} left` : ''}`;
        radio.addEventListener('change', () => {
          document.querySelectorAll('[data-slots] .option-card').forEach(el => el.classList.toggle('checked', el.querySelector('input').checked));
          renderSummary();
        });
        label.addEventListener('click', () => { if (!full) { radio.checked = true; radio.dispatchEvent(new Event('change')); } });
        nodes.slots.appendChild(label);
        if (!full && !firstSelectable) firstSelectable = radio;
        if (!nodes.slots.querySelector('input:checked') && !full) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
      }
      if (!nodes.slots.querySelector('input:checked') && firstSelectable) {
        firstSelectable.checked = true;
        firstSelectable.dispatchEvent(new Event('change'));
      }
      const subscribeDay = document.querySelector('[data-subscribe-day]');
      if (subscribeDay && !subscribeDay.dataset.preset) {
        const isoWeekday = new Date(`${state.quote.deliveryDate.iso}T00:00:00Z`).getUTCDay();
        subscribeDay.value = String(isoWeekday);
        subscribeDay.dataset.preset = '1';
        subscribeDay.dispatchEvent(new Event('change'));
      }
    }
    renderSummary();
  }

  function selectedSlot() {
    return document.querySelector('[data-slots] input[name="deliverySlot"]:checked')?.value || '';
  }

  async function quoteDelivery(toastErrors = false) {
    if (!items().length) throw new Error('Your basket is empty');
    try {
      const payload = formData();
      if (coordinatesReady()) payload.location = state.coords;
      const data = await RFS.api('/api/quote', { method: 'POST', body: JSON.stringify({ items: items(), address: payload.address, location: payload.location || {} }) });
      state.quote = data.quote;
      renderQuote();
      if (toastErrors) RFS.toast(state.quote.eligible ? 'Road-route delivery calculated' : 'This location is outside delivery radius', state.quote.eligible ? 'success' : 'error');
    } catch (error) {
      state.quote = null;
      nodes.quoteBox.innerHTML = `<div class="alert error">${error.message}</div>`;
      nodes.slots.innerHTML = '';
      renderSummary();
      if (toastErrors) RFS.toast(error.message, 'error');
    }
  }

  function renderPayments() {
    const online = Boolean(state.settings?.payments?.onlineEnabled);
    nodes.paymentList.innerHTML = '';
    const options = [
      { id: 'cod', title: 'Cash on Delivery', desc: 'Pay when the vegetables reach your door.', enabled: true },
      { id: 'online', title: 'UPI / Cards / Netbanking', desc: online ? 'Pay securely through PayU.' : 'PayU hosted checkout will unlock once live merchant keys are configured.', enabled: online }
    ];
    for (const option of options) {
      const label = document.createElement('label');
      label.className = `option-card ${option.enabled ? '' : 'disabled'}`;
      label.innerHTML = '<input type="radio" name="paymentMethod"><div><strong></strong><span></span></div>';
      const input = label.querySelector('input');
      input.value = option.id; input.disabled = !option.enabled;
      label.querySelector('strong').textContent = option.title;
      label.querySelector('span').textContent = option.desc;
      if (option.id === 'cod') input.checked = true;
      if (input.disabled) label.addEventListener('click', event => { event.preventDefault(); RFS.toast('PayU merchant setup is pending', 'error'); });
      nodes.paymentList.appendChild(label);
    }
  }

  async function applySavedLocation() {
    const saved = RFS.getSavedLocation();
    if (!saved) return;
    state.coords = { lat: Number(saved.lat), lng: Number(saved.lng), label: saved.label || 'Saved map pin', source: saved.source || 'saved' };
    nodes.lat.value = state.coords.lat.toFixed(6);
    nodes.lng.value = state.coords.lng.toFixed(6);
    setPinStatus(`Saved pin loaded: ${state.coords.lat.toFixed(6)}, ${state.coords.lng.toFixed(6)}. Re-check route below.`, 'success');
  }

  nodes.gps.addEventListener('click', () => {
    if (!navigator.geolocation) return setPinStatus('This device/browser does not support GPS location. Use manual pin selection.', 'error');
    RFS.setBusy(nodes.gps, true, 'Finding you…');
    setPinStatus('Requesting your current GPS location…');
    navigator.geolocation.getCurrentPosition(async position => {
      RFS.setBusy(nodes.gps, false);
      const label = await reverseLocate(position.coords.latitude, position.coords.longitude);
      setCoordinates(position.coords.latitude, position.coords.longitude, label, 'gps');
    }, error => {
      RFS.setBusy(nodes.gps, false);
      const message = error.code === 1
        ? 'Location permission was denied. Please use manual map-pin selection.'
        : 'Could not get GPS location. Please use manual map-pin selection.';
      setPinStatus(message, 'error');
      RFS.toast(message, 'error');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });

  nodes.manualPin.addEventListener('click', initMap);
  nodes.applyCoords.addEventListener('click', () => setCoordinates(nodes.lat.value, nodes.lng.value, 'Manual coordinate pin', 'manual'));
  nodes.calculate.addEventListener('click', () => quoteDelivery(true));

  $('[data-checkout-form]').addEventListener('submit', async event => {
    event.preventDefault();
    if (window.__RFS_MAINTENANCE) return RFS.toast(window.__RFS_SETTINGS?.maintenance?.message || 'We are briefly paused — please try again soon.', 'error');
    if (!items().length) return RFS.toast('Your basket is empty', 'error');
    if (!state.quote?.eligible) {
      await quoteDelivery(true);
      if (!state.quote?.eligible) return;
    }
    const slot = selectedSlot();
    const payment = document.querySelector('[data-payment-list] input[name="paymentMethod"]:checked')?.value || 'cod';
    const payload = formData();
    if (coordinatesReady()) payload.location = state.coords;
    payload.items = items();
    payload.slotId = slot;
    payload.paymentMethod = payment;
    if (state.coupon) payload.couponCode = state.coupon.code;
    const referralInput = document.querySelector('[data-referral-input]');
    if (referralInput && referralInput.value.trim()) payload.referredBy = referralInput.value.trim();
    RFS.setBusy(nodes.placeOrder, true, 'Securing your order…');
    try {
      const order = await RFS.api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      RFS.saveCart([]);
      // 🔁 optional weekly subscription from this order
      const subscribeBox = document.querySelector('[data-subscribe]');
      if (subscribeBox?.checked) {
        const weekday = Number(document.querySelector('[data-subscribe-day]')?.value);
        try {
          await RFS.api('/api/subscriptions', { method: 'POST', body: JSON.stringify({ orderId: order.orderId, phone: payload.customer.phone, weekday }) });
        } catch (error) {
          RFS.toast(`Subscription could not be set: ${error.message}`, 'error');
        }
      }
      if (order.payu?.action) {
        const paymentForm = document.createElement('form');
        paymentForm.method = order.payu.method || 'POST';
        paymentForm.action = order.payu.action;
        paymentForm.style.display = 'none';
        Object.entries(order.payu.fields || {}).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.name = name;
          input.value = value;
          paymentForm.appendChild(input);
        });
        document.body.appendChild(paymentForm);
        paymentForm.submit();
        return;
      }
      window.location.href = `/order-success?id=${encodeURIComponent(order.orderId)}&phone=${encodeURIComponent(payload.customer.phone)}&whatsapp=${encodeURIComponent(order.whatsappUrl)}`;
    } catch (error) {
      RFS.toast(error.message, 'error');
      await quoteDelivery(false);
    } finally {
      RFS.setBusy(nodes.placeOrder, false);
    }
  });

  async function init() {
    try {
      const [products, settings] = await Promise.all([RFS.api('/api/products'), RFS.api('/api/settings')]);
      state.products = products.products;
      state.byHandle = new Map(products.products.map(p => [p.handle, p]));
      state.settings = settings;
      await applySavedLocation();
      renderBasket();
      renderPayments();
      renderSummary();
      RFS.syncCartUI(products.products);
      if (coordinatesReady()) await quoteDelivery(false);
    } catch (error) {
      RFS.toast(error.message, 'error');
      nodes.quoteBox.innerHTML = `<div class="alert error">${error.message}</div>`;
    }
  }

  window.addEventListener('rebesta:cart-changed', () => { renderBasket(); renderSummary(); });
  init();
})();
