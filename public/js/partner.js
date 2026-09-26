/* Rebesta Fresh — Delivery Partner app */
(() => {
  const $ = id => document.getElementById(id);
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
    const el = $('toast');
    el.hidden = false;
    el.innerHTML = `<div class="alert ${kind}" style="margin:0">${message}</div>`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3500);
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
    if (!url) return;
    const bar = $('waNotify');
    bar.hidden = false;
    bar.innerHTML = `<a class="wa-notify-btn" href="${url}" target="_blank" rel="noopener">💬 ${label} — ${order.customer?.name || 'customer'}</a>`;
    clearTimeout(showWaNotify._t);
    showWaNotify._t = setTimeout(() => { bar.hidden = true; }, 90 * 1000);
    try { navigator.vibrate && navigator.vibrate([80, 40, 80]); } catch {}
  }

  /* ---------- render ---------- */

  function render() {
    const stats = { todo: 0, out: 0, done: 0 };
    for (const o of state.orders.active) stats[o.status === 'OUT_FOR_DELIVERY' ? 'out' : 'todo']++;
    const doneToday = state.orders.doneToday || [];
    stats.done = doneToday.length;

    $('hello').innerHTML = `
      <div class="order-card" style="margin-bottom:14px">
        <div class="oc-name">Vanakkam, ${state.partner.name} 👋 <span style="float:right;font-size:.72rem;color:#1f7a3d;font-weight:700">● live updates</span></div>
        <div style="font-size:.82rem;color:#6b7a66">Have a smooth morning — deliver fresh, collect smiles.</div>
      </div>`;
    $('stats').innerHTML = `
      <div class="p-stat"><b>${stats.todo}</b><span>TO COLLECT</span></div>
      <div class="p-stat"><b>${stats.out}</b><span>ON THE ROAD</span></div>
      <div class="p-stat"><b>${stats.done}</b><span>DELIVERED</span></div>`;

    /* 📈 own scorecard strip */
    const ws = $('weekStats');
    if (state.stats && (state.stats.delivered7d > 0 || state.stats.avgDeliverMin)) {
      ws.innerHTML = `<div class="week-strip">📈 This week: <strong>${state.stats.delivered7d} deliveries</strong>${state.stats.avgDeliverMin ? ` · ⏱ avg <strong>${state.stats.avgDeliverMin} min</strong> per stop` : ''} · 🏆 total <strong>${state.stats.deliveredTotal}</strong></div>`;
    } else {
      ws.innerHTML = '';
    }

    renderRoutePanel();

    const list = $('ordersList');
    if (!state.orders.active.length) {
      list.innerHTML = '<div class="order-card"><div class="oc-name" style="text-align:center">📭 No orders assigned yet</div><div style="font-size:.82rem;color:#6b7a66;text-align:center">The shop owner assigns orders from the admin dashboard.</div></div>';
    } else {
      const active = [...state.orders.active];
      if (state.routeSeq) {
        active.sort((a, b) => (state.routeSeq.get(a.id) || 99) - (state.routeSeq.get(b.id) || 99));
      }
      list.innerHTML = active.map(order => {
        const out = order.status === 'OUT_FOR_DELIVERY';
        const cod = order.paymentMethod === 'cod' && order.paymentStatus !== 'PAID_CASH_ON_DELIVERY' && order.paymentStatus !== 'PAID_ONLINE';
        const items = (order.items || []).map(i => `${i.title} ×${i.qty}`).join(' · ');
        const stopNo = state.routeSeq ? state.routeSeq.get(order.id) : null;
        const waUrl = waLinkFor(order, waEventFor(order));
        return `
        <div class="order-card ${out ? 'out' : 'ready'}" data-order="${order.id}">
          <div class="oc-top">
            ${stopNo ? `<span class="stop-badge">${stopNo}</span>` : ''}
            <strong>${order.id}</strong>
            <span class="oc-slot">${order.slot?.label || ''}</span>
            ${out ? '<span class="badge orange">ON THE ROAD</span>' : '<span class="badge green">READY</span>'}
            ${cod ? `<span class="oc-cod">COLLECT ${money(order.totalInr)}</span>` : `<span class="oc-cod" style="background:#eef5ea;color:#1f7a3d">PAID ${money(order.totalInr)}</span>`}
          </div>
          <div class="oc-name">${order.customer?.name || ''}</div>
          <div class="oc-addr">📍 ${[order.address?.line1, order.address?.area, order.address?.city].filter(Boolean).join(', ')}<br>
            <a href="tel:+91${order.customer?.phone || ''}" style="color:#1f7a3d;font-weight:700">📞 +91 ${order.customer?.phone || ''}</a>
          </div>
          <div class="oc-items">🧺 ${items}${rideLabel(order)}</div>
          <div class="oc-actions">
            <a class="button orange" style="display:flex;align-items:center;justify-content:center" href="${mapsLink(order)}" target="_blank" rel="noopener">📍 Navigate</a>
            <button class="button ghost" type="button" data-call="${order.customer?.phone || ''}">📞 Call</button>
            ${waUrl ? `<a class="button wa-btn" style="display:flex;align-items:center;justify-content:center" href="${waUrl}" target="_blank" rel="noopener">💬 Notify</a>` : ''}
            ${out
              ? '<button class="button primary wide" type="button" data-deliver="' + order.id + '">✅ Delivered</button>'
              : '<button class="button primary wide" type="button" data-collect="' + order.id + '">🛒 Collected from shop</button>'}
            <button class="button ghost wide" type="button" data-problem="' + order.id + '" style="font-size:.82rem">⚠️ Report a problem</button>
          </div>
        </div>`;
      }).join('');
    }

    const doneList = $('doneList');
    $('doneTitle').hidden = !doneToday.length;
    doneList.innerHTML = doneToday.map(o => `
      <div class="done-card"><span class="tick">✔</span><strong>${o.id}</strong>
        <span>${o.customer?.name || ''}</span><span style="margin-left:auto;font-weight:800">${money(o.totalInr)}</span>
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
      const withPin = state.orders.active.filter(o => o.location && Number.isFinite(Number(o.location.lat))).length;
      panel.innerHTML = withPin >= 2
        ? `<button class="route-btn" type="button" id="routeGo">🧭 Sort my route — shortest first</button>
           <div class="route-note">Auto-sorted by default — tap only if you cleared the order.</div>`
        : `<div class="route-note">Route sorting needs map pins on orders (at least 2).</div>`;
      return;
    }

    const info = state.routeInfo;
    panel.innerHTML = `
      <div class="route-summary">
        <strong>${info.stops} stops · ${info.totalKm} km</strong>
        <span>${info.provider === 'osrm-road' ? 'road distances' : 'estimated distances'} · auto-sorted shortest first</span>
      </div>
      <div class="route-stops">
        ${info.ordered.map(s => `
          <div class="route-stop">
            <span class="route-num">${s.stopNumber}</span>
            <div><strong>${s.customer?.name || ''}</strong><br><small>${s.id} · ${money(s.totalInr)}</small></div>
            <span class="route-eta">≈ ${s.etaClock}<br><small>+${s.legKm} km</small></span>
          </div>`).join('')}
      </div>
      <a class="route-maps" href="${info.mapsUrl}" target="_blank" rel="noopener">🧭 Open full route in Google Maps</a>
      <div class="route-actions">
        <button class="route-clear" type="button" id="routeClear">✖ Clear order</button>
      </div>`;
  }

  /* Route is automatic: planned silently whenever orders load (≥2 stops with pins).
     Only a manual "Clear" pauses it for the session. */
  async function autoPlanRoute() {
    const withPin = state.orders?.active?.filter(o => o.location && Number.isFinite(Number(o.location.lat))) || [];
    if (state.routeCleared || withPin.length < 2) return;
    try {
      const data = await api('/api/partner/route');
      if (!data.route?.stops) return;
      state.routeInfo = data.route;
      state.routeSeq = new Map(data.route.ordered.map((s, i) => [s.id, i + 1]));
      render();
    } catch {}
  }

  async function optimizeRoute() {
    try {
      const data = await api('/api/partner/route');
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
    state.orders = data;
    api('/api/partner/stats').then(d => { state.stats = d.stats; render(); }).catch(() => {});
    autoPlanRoute();
    render();
  }

  /* 💬 Auto-WhatsApp: after Collected/Delivered, jump straight into WhatsApp with
     the message typed — the partner only taps Send. Toggle below the map button. */
  const autoWaOn = () => localStorage.getItem('rebesta_partner_autowa') !== 'off';

  function renderAutoWaToggle() {
    const note = $('trackNote');
    if (!note) return;
    let row = document.getElementById('autoWaRow');
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
      toast(status === 'DELIVERED' ? '🎉 Marked delivered — great job!' : '🛵 Marked as on the road', 'success');
      if (data.whatsapp?.url) {
        if (autoWaOn()) {
          // WhatsApp opens with the message ready — the partner just taps Send
          showWaNotify(data.order, status, status === 'DELIVERED' ? 'Send "Delivered" WhatsApp' : 'Send "Out for delivery" WhatsApp');
          setTimeout(() => { location.href = data.whatsapp.url; }, 600);
        } else {
          showWaNotify(data.order, status, status === 'DELIVERED' ? 'Send "Delivered" WhatsApp' : 'Send "Out for delivery" WhatsApp');
        }
      }
      await loadOrders();
    } catch (error) { toast(error.message, 'error'); }
  }

  document.addEventListener('click', async event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.id === 'routeGo') return optimizeRoute();
    if (btn.id === 'routeClear') { state.routeSeq = null; state.routeInfo = null; state.routeCleared = true; render(); return; }
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
  });

  /* ---------- live tracking ---------- */

  function sendPosition(pos) {
    state.lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const now = Date.now();
    if (now - state.lastSentAt < 8000) return;
    state.lastSentAt = now;
    api('/api/partner/position', {
      method: 'POST',
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed })
    }).then(() => { $('trackNote').textContent = `🔴 LIVE — last update ${new Date().toLocaleTimeString('en-IN')}`; })
      .catch(() => { $('trackNote').textContent = '⚠️ Could not send location — will retry'; });
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
  });

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
      }).then(r => r.json());
      if (!data.ok) throw new Error(data.error || 'Sign-in failed');
      state.token = data.token;
      state.partner = data.partner;
      localStorage.setItem('rebesta_partner_token', data.token);
      enterApp();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  $('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('rebesta_partner_token');
    state.token = '';
    stopTracking();
    location.reload();
  });

  let knownIds = new Set();

  async function pollVersion() {
    if (document.visibilityState !== 'visible' || !state.token) return;
    try {
      const data = await api('/api/partner/version');
      if (data.v === state.lastVersion) return;
      const first = !state.lastVersion;
      state.lastVersion = data.v;
      if (first) return;
      const before = new Set(state.orders.active.map(o => o.id).concat(state.orders.doneToday.map(o => o.id)));
      await loadOrders();
      const fresh = state.orders.active.filter(o => !before.has(o.id));
      if (fresh.length) {
        toast(`🆕 New order assigned! ${fresh[0].customer?.name || ''} · ${money(fresh[0].totalInr)}`, 'success');
        try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {}
      }
    } catch {}
  }

  function enterApp() {
    $('loginCard').hidden = true;
    $('mainCard').hidden = false;
    renderAutoWaToggle();
    loadOrders().catch(e => toast(e.message, 'error'));
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(pollVersion, 10000);
  }

  (async function init() {
    if (!state.token) { $('loginCard').hidden = false; return; }
    try {
      const data = await api('/api/partner/session');
      state.partner = data.partner;
      state.hub = data.hub;
      enterApp();
    } catch {
      state.token = '';
      localStorage.removeItem('rebesta_partner_token');
      $('loginCard').hidden = false;
    }
  })();
})();
