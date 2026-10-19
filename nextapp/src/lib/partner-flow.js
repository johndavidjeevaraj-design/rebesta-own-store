/* Next-bundled Partner UI controller. The Vite bundle and /js/partner.js stay
   available as a rollback while the legacy frontend is retired in phases. */
export function bindPartnerPage(root) {
  let disposed = false;
  let toastTimer = null;
  let notifyTimer = null;
  let whatsappTimer = null;
  const abort = new AbortController();
  const $ = (id) => root.querySelector(`#${id}`);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
  const safeLink = (value) => {
    try {
      const url = new URL(String(value || ''), location.origin);
      return url.protocol === 'https:' || url.origin === location.origin ? url.href : '#';
    } catch { return '#'; }
  };
  const phoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(-10);
  const state = { token: localStorage.getItem('rebesta_partner_token') || '', partner: null, hub: null, orders: [], watchId: null, lastSentAt: 0, lastPos: null, refreshTimer: null, lastVersion: '', routeSeq: null, routeInfo: null, routeCleared: false, stats: null };

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Partner-Token': state.token, ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(message, kind = 'info') {
    if (disposed) return;
    const el = $('toast');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<div class="alert ${esc(kind)}" style="margin:0">${esc(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { if (!disposed) el.hidden = true; }, 3500);
  }

  const money = v => `₹${Number(v || 0) % 1 === 0 ? Number(v || 0) : Number(v || 0).toFixed(2)}`;

  function airKm(a, b) {
    if (!a || !b) return null;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  const etaMin = km => km == null ? null : Math.min(90, Math.max(3, Math.ceil((km * 1.25) / 18 * 60)));
  const rideLabel = order => {
    const from = state.lastPos || (state.hub && Number.isFinite(Number(state.hub.lat)) ? state.hub : null);
    const km = airKm(from, order.location);
    return km == null ? '' : ` · <span style="color:#1f7a3d;font-weight:700">≈${etaMin(km)} min ride</span>`;
  };

  function mapsLink(order) {
    const pin = order.location && Number.isFinite(Number(order.location.lat)) ? `${order.location.lat},${order.location.lng}` : null;
    if (pin) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pin)}&travelmode=two_wheeler`;
    const addr = [order.address?.line1, order.address?.area, order.address?.city, order.address?.pincode].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  }

  /* ---------- WhatsApp one-tap updates ---------- */

  function waLinkFor(order, event) {
    const phone = String(order.customer?.phone || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) return null;
    const first = String(order.customer?.name || '').split(' ')[0] || 'there';
    const link = `${location.origin}/track?id=${encodeURIComponent(order.id)}`;
    const texts = {
      OUT_FOR_DELIVERY: `🛵 Good news ${first}! Your Rebesta Fresh order ${order.id} is OUT FOR DELIVERY with ${state.partner?.name || 'our delivery partner'}.\nETA: about 20–30 minutes.\n\nLive tracking: ${link}`,
      DELIVERED: `🎉 Delivered! Your order ${order.id} was handed over. Enjoy your fresh vegetables, ${first}! 🥬\nOrder again anytime: ${location.origin}`
    };
    const text = texts[event];
    if (!text) return null;
    return `https://api.whatsapp.com/send/?phone=91${phone}&text=${encodeURIComponent(text)}`;
  }

  const waEventFor = order => order.status === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : null;

  function showWaNotify(order, event, label) {
    const url = waLinkFor(order, event);
    if (!url || disposed) return;
    const bar = $('waNotify');
    if (!bar) return;
    bar.hidden = false;
    bar.innerHTML = `<a class="wa-notify-btn" href="${esc(safeLink(url))}" target="_blank" rel="noopener">💬 ${esc(label)} — ${esc(order.customer?.name || 'customer')}</a>`;
    clearTimeout(notifyTimer);
    notifyTimer = window.setTimeout(() => { if (!disposed) bar.hidden = true; }, 90 * 1000);
    try { if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 40, 80]); } catch {}
  }

  /* ---------- render ---------- */

  function render() {
    if (disposed || !state.partner || !state.orders) return;
    const activeOrders = Array.isArray(state.orders.active) ? state.orders.active : [];
    const doneToday = Array.isArray(state.orders.doneToday) ? state.orders.doneToday : [];
    const stats = { todo: 0, out: 0, done: doneToday.length };
    for (const order of activeOrders) stats[order.status === 'OUT_FOR_DELIVERY' ? 'out' : 'todo'] += 1;

    $('hello').innerHTML = `
      <div class="order-card" style="margin-bottom:14px">
        <div class="oc-name">Vanakkam, ${esc(state.partner.name)} 👋 <span style="float:right;font-size:.72rem;color:#1f7a3d;font-weight:700">● live updates</span></div>
        <div style="font-size:.82rem;color:#6b7a66">Have a smooth morning — deliver fresh, collect smiles.</div>
      </div>`;
    const cashToday = doneToday.filter((order) => order.paymentMethod === 'cod');
    const cashSum = cashToday.reduce((sum, order) => sum + (Number(order.totalInr) || 0), 0);
    $('stats').innerHTML = `
      <div class="p-stat"><b>${stats.todo}</b><span>TO COLLECT</span></div>
      <div class="p-stat"><b>${stats.out}</b><span>ON THE ROAD</span></div>
      <div class="p-stat"><b>${stats.done}</b><span>DELIVERED</span></div>
      <div class="p-stat cash"><b>₹${cashSum}</b><span>CASH TODAY (${cashToday.length})</span></div>`;

    const ws = $('weekStats');
    if (state.stats && (Number(state.stats.delivered7d) > 0 || Number(state.stats.avgDeliverMin) > 0)) {
      ws.innerHTML = `<div class="week-strip">📈 This week: <strong>${Number(state.stats.delivered7d) || 0} deliveries</strong>${Number(state.stats.avgDeliverMin) ? ` · ⏱ avg <strong>${Number(state.stats.avgDeliverMin)} min</strong> per stop` : ''} · 🏆 total <strong>${Number(state.stats.deliveredTotal) || 0}</strong></div>`;
    } else {
      ws.innerHTML = '';
    }

    renderRoutePanel();
    const list = $('ordersList');
    if (!activeOrders.length) {
      list.innerHTML = '<div class="order-card"><div class="oc-name" style="text-align:center">📭 No orders assigned yet</div><div style="font-size:.82rem;color:#6b7a66;text-align:center">The shop owner assigns orders from the admin dashboard.</div></div>';
    } else {
      const active = [...activeOrders];
      if (state.routeSeq) active.sort((a, b) => (state.routeSeq.get(a.id) || 99) - (state.routeSeq.get(b.id) || 99));
      list.innerHTML = active.map((order) => {
        const out = order.status === 'OUT_FOR_DELIVERY';
        const cod = order.paymentMethod === 'cod' && order.paymentStatus !== 'PAID_CASH_ON_DELIVERY' && order.paymentStatus !== 'PAID_ONLINE';
        const orderId = esc(order.id);
        const phone = phoneDigits(order.customer?.phone);
        const items = (Array.isArray(order.items) ? order.items : []).map((item) => `${esc(item.title)} ×${Math.max(0, Number(item.qty) || 0)}`).join(' · ');
        const stopNo = state.routeSeq ? state.routeSeq.get(order.id) : null;
        const waUrl = waLinkFor(order, waEventFor(order));
        const navUrl = safeLink(mapsLink(order));
        return `
        <div class="order-card ${out ? 'out' : 'ready'}" data-order="${orderId}">
          <div class="oc-top">
            ${stopNo ? `<span class="stop-badge">${Number(stopNo)}</span>` : ''}
            <strong>${orderId}</strong>
            <span class="oc-slot">${esc(order.slot?.label || '')}</span>
            ${out ? '<span class="badge orange">ON THE ROAD</span>' : '<span class="badge green">READY</span>'}
            ${cod ? `<span class="oc-cod">COLLECT ${money(order.totalInr)}</span>` : `<span class="oc-cod" style="background:#eef5ea;color:#1f7a3d">PAID ${money(order.totalInr)}</span>`}
          </div>
          <div class="oc-name">${esc(order.customer?.name || '')}</div>
          <div class="oc-addr">📍 ${[order.address?.line1, order.address?.area, order.address?.city].filter(Boolean).map(esc).join(', ')}<br>
            <a href="tel:+91${phone}" style="color:#1f7a3d;font-weight:700">📞 +91 ${esc(phone)}</a>
          </div>
          <div class="oc-items">🧺 ${items}${rideLabel(order)}</div>
          <div class="oc-actions">
            <a class="button orange" style="display:flex;align-items:center;justify-content:center" href="${esc(navUrl)}" target="_blank" rel="noopener">📍 Navigate</a>
            <button class="button ghost" type="button" data-call="${esc(phone)}">📞 Call</button>
            ${waUrl ? `<a class="button wa-btn" style="display:flex;align-items:center;justify-content:center" href="${esc(safeLink(waUrl))}" target="_blank" rel="noopener">💬 Notify</a>` : ''}
            ${out
              ? `<button class="button primary wide" type="button" data-deliver="${orderId}">✅ Delivered</button>`
              : `<button class="button primary wide" type="button" data-collect="${orderId}">🛒 Collected from shop</button>`}
            ${out ? `<button class="button ghost wide" type="button" data-photo-order="${orderId}" style="font-size:.85rem">📸 Delivery photo (proof)</button>` : ''}
            <button class="button ghost wide" type="button" data-problem="${orderId}" style="font-size:.82rem">⚠️ Report a problem</button>
          </div>
        </div>`;
      }).join('');
    }

    $('doneTitle').hidden = !doneToday.length;
    $('doneList').innerHTML = doneToday.map((order) => `
      <div class="done-card"><span class="tick">✔</span><strong>${esc(order.id)}</strong>
        <span>${esc(order.customer?.name || '')}</span><span style="margin-left:auto;font-weight:800">${money(order.totalInr)}</span>
      </div>`).join('');
  }

  /* ---------- 🧭 smart route ---------- */

  function renderRoutePanel() {
    const title = $('routeTitle');
    const panel = $('routePanel');
    if (!title || !panel) return;
    const hasActive = state.orders?.active?.length > 0;
    title.hidden = !hasActive;
    if (!hasActive) { panel.innerHTML = ''; state.routeSeq = null; state.routeInfo = null; return; }

    if (!state.routeInfo) {
      const withPin = state.orders.active.filter((order) => order.location && Number.isFinite(Number(order.location.lat))).length;
      panel.innerHTML = withPin >= 2
        ? `<button class="route-btn" type="button" id="routeGo">🧭 Sort my route — shortest first</button>
           <div class="route-note">Auto-sorted by default — tap only if you cleared the order.</div>`
        : `<div class="route-note">Route sorting needs map pins on orders (at least 2).</div>`;
      return;
    }

    const info = state.routeInfo;
    const ordered = Array.isArray(info.ordered) ? info.ordered : [];
    const mapsUrl = safeLink(info.mapsUrl);
    panel.innerHTML = `
      <div class="route-summary">
        <strong>${Number(info.stops) || ordered.length} stops · ${Number(info.totalKm) || 0} km</strong>
        <span>${info.provider === 'osrm-road' ? 'road distances' : 'estimated distances'} · auto-sorted shortest first</span>
      </div>
      <div class="route-stops">
        ${ordered.map((stop) => `
          <div class="route-stop">
            <span class="route-num">${Number(stop.stopNumber) || ''}</span>
            <div><strong>${esc(stop.customer?.name || '')}</strong><br><small>${esc(stop.id)} · ${money(stop.totalInr)}</small></div>
            <span class="route-eta">≈ ${esc(stop.etaClock || '')}<br><small>+${Number(stop.legKm) || 0} km</small></span>
          </div>`).join('')}
      </div>
      ${mapsUrl !== '#' ? `<a class="route-maps" href="${esc(mapsUrl)}" target="_blank" rel="noopener">🧭 Open full route in Google Maps</a>` : ''}
      <div class="route-actions">
        <button class="route-clear" type="button" id="routeClear">✖ Clear order</button>
      </div>`;
  }

  /* Route is automatic: planned silently whenever orders load (≥2 stops with pins).
     Only a manual "Clear" pauses it for the session. */
  async function autoPlanRoute() {
    const withPin = state.orders?.active?.filter(o => o.location && Number.isFinite(Number(o.location.lat))) || [];
    if (disposed || state.routeCleared || withPin.length < 2) return;
    try {
      const data = await api('/api/partner/route');
      if (disposed || !data.route?.stops) return;
      state.routeInfo = data.route;
      state.routeSeq = new Map(data.route.ordered.map((s, i) => [s.id, i + 1]));
      render();
    } catch {}
  }

  async function optimizeRoute() {
    try {
      const data = await api('/api/partner/route');
      if (disposed) return;
      if (!data.route?.stops) return toast('No routable stops right now', 'error');
      state.routeCleared = false;
      state.routeInfo = data.route;
      state.routeSeq = new Map(data.route.ordered.map((s, i) => [s.id, i + 1]));
      render();
      toast(`🧭 Route sorted — ${data.route.stops} stops, ${data.route.totalKm} km`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  }

  /* ---------- actions ---------- */

  async function loadOrders() {
    const data = await api('/api/partner/orders');
    if (disposed) return;
    state.orders = {
      ...data,
      active: Array.isArray(data.active) ? data.active : [],
      doneToday: Array.isArray(data.doneToday) ? data.doneToday : [],
    };
    api('/api/partner/stats').then(d => {
      if (disposed) return;
      state.stats = d.stats;
      render();
    }).catch(() => {});
    autoPlanRoute();
    render();
  }

  /* 💬 Auto-WhatsApp: after Collected/Delivered, jump straight into WhatsApp with
     the message typed — the partner only taps Send. Toggle below the map button. */
  const autoWaOn = () => localStorage.getItem('rebesta_partner_autowa') !== 'off';

  function renderAutoWaToggle() {
    const note = $('trackNote');
    if (!note) return;
    let row = root.querySelector('#autoWaRow');
    if (!row) {
      row = document.createElement('button');
      row.id = 'autoWaRow';
      row.type = 'button';
      row.className = 'route-clear';
      row.style.cssText = 'width:100%;margin-top:8px;color:#1f7a3d;font-weight:800';
      row.addEventListener('click', () => {
        localStorage.setItem('rebesta_partner_autowa', autoWaOn() ? 'off' : 'on');
        renderAutoWaToggle();
        toast(autoWaOn() ? '💬 Auto WhatsApp ON — opens automatically after each status' : '💬 Auto WhatsApp OFF — green button instead', 'success');
      });
      note.insertAdjacentElement('afterend', row);
    }
    row.textContent = autoWaOn() ? '💬 Auto WhatsApp: ON (tap to turn off)' : '💬 Auto WhatsApp: OFF (tap to turn on)';
  }

  async function setStatus(orderId, status) {
    try {
      const data = await api(`/api/partner/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (disposed) return;
      toast(status === 'DELIVERED' ? '🎉 Marked delivered — great job!' : '🛵 Marked as on the road', 'success');
      if (data.whatsapp?.url) {
        if (autoWaOn()) {
          // WhatsApp opens with the message ready — the partner just taps Send
          showWaNotify(data.order, status, status === 'DELIVERED' ? 'Send "Delivered" WhatsApp' : 'Send "Out for delivery" WhatsApp');
          clearTimeout(whatsappTimer);
          whatsappTimer = window.setTimeout(() => {
            const target = safeLink(data.whatsapp.url);
            if (!disposed && target !== '#') location.href = target;
          }, 600);
        } else {
          showWaNotify(data.order, status, status === 'DELIVERED' ? 'Send "Delivered" WhatsApp' : 'Send "Out for delivery" WhatsApp');
        }
      }
      await loadOrders();
    } catch (error) { toast(error.message, 'error'); }
  }

  root.addEventListener('click', async (event) => {
    const target = event.target;
    const btn = target instanceof Element ? target.closest('button') : null;
    if (!btn || !root.contains(btn)) return;
    if (btn.id === 'routeGo') return optimizeRoute();
    if (btn.id === 'routeClear') { state.routeSeq = null; state.routeInfo = null; state.routeCleared = true; render(); return; }
    if (btn.dataset.photoOrder) {
      const input = root.querySelector('#deliveryPhotoInput');
      if (!input) return;
      input.dataset.order = btn.dataset.photoOrder;
      input.click();
      return;
    }
    if (btn.dataset.collect) return setStatus(btn.dataset.collect, 'OUT_FOR_DELIVERY');
    if (btn.dataset.deliver) return setStatus(btn.dataset.deliver, 'DELIVERED');
    if (btn.dataset.call) { location.href = 'tel:+91' + btn.dataset.call; return; }
    if (btn.dataset.problem) {
      const note = prompt('What happened? (the shop owner will see this)');
      if (!note) return;
      try {
        await api(`/api/partner/orders/${encodeURIComponent(btn.dataset.problem)}/problem`, { method: 'POST', body: JSON.stringify({ note }) });
        toast('⚠️ Reported to the shop owner', 'success');
        await loadOrders();
      } catch (error) { toast(error.message, 'error'); }
    }
  }, { signal: abort.signal });

  /* ---------- live tracking ---------- */

  function sendPosition(pos) {
    state.lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const now = Date.now();
    if (now - state.lastSentAt < 8000) return;
    state.lastSentAt = now;
    api('/api/partner/position', {
      method: 'POST',
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed })
    }).then(() => {
      if (!disposed && $('trackNote')) $('trackNote').textContent = `🔴 LIVE — last update ${new Date().toLocaleTimeString('en-IN')}`;
    }).catch(() => {
      if (!disposed && $('trackNote')) $('trackNote').textContent = '⚠️ Could not send location — will retry';
    });
  }

  function stopTracking() {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    const btn = $('trackToggle');
    btn.classList.remove('on');
    btn.textContent = '🛵 Start live tracking';
    $('trackNote').textContent = 'Owner sees your live location only while tracking is ON. Uses little battery.';
  }

  $('trackToggle').addEventListener('click', () => {
    if (state.watchId !== null) return stopTracking();
    if (!navigator.geolocation) return toast('Location not supported on this phone', 'error');
    const btn = $('trackToggle');
    btn.classList.add('on');
    btn.textContent = '⏸ Tracking is ON — tap to stop';
    state.lastSentAt = 0;
    state.watchId = navigator.geolocation.watchPosition(sendPosition, () => {
      toast('Allow location permission to share live position', 'error');
      stopTracking();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }, { signal: abort.signal });

  /* ---------- auth ---------- */

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('loginError');
    err.hidden = true;
    try {
      const data = await fetch('/api/partner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: $('pPhone').value.trim(), pin: $('pPin').value.trim() })
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'Sign-in failed');
        return data;
      });
      if (disposed) return;
      state.token = data.token;
      state.partner = data.partner;
      localStorage.setItem('rebesta_partner_token', data.token);
      enterApp();
    } catch (error) {
      if (disposed) return;
      err.textContent = error.message || 'Sign-in failed';
      err.hidden = false;
    }
  }, { signal: abort.signal });

  $('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('rebesta_partner_token');
    state.token = '';
    stopTracking();
    location.reload();
  }, { signal: abort.signal });

  async function pollVersion() {
    if (disposed || document.visibilityState !== 'visible' || !state.token) return;
    try {
      const data = await api('/api/partner/version');
      if (disposed || data.v === state.lastVersion) return;
      const first = !state.lastVersion;
      state.lastVersion = data.v;
      if (first) return;
      const before = new Set(state.orders.active.map(o => o.id).concat(state.orders.doneToday.map(o => o.id)));
      await loadOrders();
      if (disposed) return;
      const fresh = state.orders.active.filter(o => !before.has(o.id));
      if (fresh.length) {
        toast(`🆕 New order assigned! ${fresh[0].customer?.name || ''} · ${money(fresh[0].totalInr)}`, 'success');
        try { if (typeof navigator.vibrate === 'function') navigator.vibrate([120, 60, 120]); } catch {}
      }
    } catch {}
  }

  /* 📸 Delivery proof photo — snapped at the door, shown on the customer's tracking page */
  function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that photo'));
      reader.onload = async () => {
        try {
          const bitmap = await createImageBitmap(new Blob([reader.result]), { imageOrientation: 'from-image' });
          const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (!dataUrl || dataUrl.length < 100) throw new Error('Could not process that photo');
          resolve(dataUrl);
        } catch (error) { reject(error); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function uploadDeliveryPhoto(orderId, file) {
    try {
      toast('📦 Compressing photo…');
      const dataUrl = await compressImage(file, 1100, 0.8);
      await api(`/api/partner/orders/${encodeURIComponent(orderId)}/photo`, { method: 'POST', body: JSON.stringify({ imageDataUrl: dataUrl }) });
      if (disposed) return;
      toast('📸 Proof photo saved — customer sees it on tracking', 'success');
      await loadOrders();
    } catch (error) { toast(error.message, 'error'); }
  }

  function ensurePhotoInput() {
    let input = root.querySelector('#deliveryPhotoInput');
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'deliveryPhotoInput';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file && input.dataset.order) uploadDeliveryPhoto(input.dataset.order, file);
      input.value = '';
    });
    root.appendChild(input);
    return input;
  }

  function enterApp() {
    if (disposed) return;
    $('loginCard').hidden = true;
    $('mainCard').hidden = false;
    renderAutoWaToggle();
    ensurePhotoInput();
    loadOrders().catch(e => toast(e.message, 'error'));
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(pollVersion, 10000);
  }

  (async function init() {
    if (!state.token) { $('loginCard').hidden = false; return; }
    try {
      const data = await api('/api/partner/session');
      if (disposed) return;
      state.partner = data.partner;
      state.hub = data.hub;
      enterApp();
    } catch {
      if (disposed) return;
      state.token = '';
      localStorage.removeItem('rebesta_partner_token');
      $('loginCard').hidden = false;
    }
  })();

  return () => {
    disposed = true;
    abort.abort();
    clearInterval(state.refreshTimer);
    clearTimeout(toastTimer);
    clearTimeout(notifyTimer);
    clearTimeout(whatsappTimer);
    if (state.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    root.querySelector('#deliveryPhotoInput')?.remove();
  };
}
