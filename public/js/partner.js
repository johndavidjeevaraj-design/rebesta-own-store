/* Rebesta Fresh — Delivery Partner app */
(() => {
  const $ = id => document.getElementById(id);
  const state = { token: localStorage.getItem('rebesta_partner_token') || '', partner: null, hub: null, orders: [], watchId: null, lastSentAt: 0, lastPos: null, refreshTimer: null, lastVersion: '' };

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

    const list = $('ordersList');
    if (!state.orders.active.length) {
      list.innerHTML = '<div class="order-card"><div class="oc-name" style="text-align:center">📭 No orders assigned yet</div><div style="font-size:.82rem;color:#6b7a66;text-align:center">The shop owner assigns orders from the admin dashboard.</div></div>';
    } else {
      list.innerHTML = state.orders.active.map(order => {
        const out = order.status === 'OUT_FOR_DELIVERY';
        const cod = order.paymentMethod === 'cod' && order.paymentStatus !== 'PAID_CASH_ON_DELIVERY' && order.paymentStatus !== 'PAID_ONLINE';
        const items = (order.items || []).map(i => `${i.title} ×${i.qty}`).join(' · ');
        return `
        <div class="order-card ${out ? 'out' : 'ready'}" data-order="${order.id}">
          <div class="oc-top">
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

  /* ---------- actions ---------- */

  async function loadOrders() {
    const data = await api('/api/partner/orders');
    state.orders = data;
    render();
  }

  async function setStatus(orderId, status) {
    try {
      await api(`/api/partner/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(status === 'DELIVERED' ? '🎉 Marked delivered — great job!' : '🛵 Marked as on the road', 'success');
      await loadOrders();
    } catch (error) { toast(error.message, 'error'); }
  }

  document.addEventListener('click', async event => {
    const btn = event.target.closest('button');
    if (!btn) return;
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
