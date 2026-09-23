(() => {
  const state = {
    key: localStorage.getItem('rebesta_admin_key') || '',
    products: [],
    orders: [],
    settings: null
  };
  const $ = selector => document.querySelector(selector);
  const statuses = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'PAYMENT_FAILED', 'PAID_NEEDS_REVIEW'];
  const DEFAULT_TIERS = [
    { min: 0, max: 1, label: '0–1 km', feeInr: 20 },
    { min: 1, max: 3, label: '1–3 km', feeInr: 30 },
    { min: 3, max: 4, label: '3–4 km', feeInr: 40 },
    { min: 4, max: 5, label: '4–5 km', feeInr: 50 },
    { min: 5, max: 6, label: '5–6 km', feeInr: 60 },
    { min: 6, max: 7, label: '6–7 km', feeInr: 70 },
    { min: 7, max: 9, label: '7–9 km', feeInr: 100 }
  ];

  async function api(path, options = {}) {
    return RFS.api(path, { ...options, headers: { 'X-Admin-Key': state.key, ...(options.headers || {}) } });
  }

  function showError(message) {
    document.querySelectorAll('[data-admin-panel]').forEach(el => el.innerHTML = `<div class="alert error">${message}</div>`);
  }

  function renderLowStock() {
    const panel = $('[data-lowstock-panel]');
    if (!panel) return;
    const low = state.products.filter(p => p.active && Number(p.stock) <= 10).sort((a, b) => Number(a.stock) - Number(b.stock));
    if (!low.length) {
      panel.innerHTML = '<h2>Stock alerts</h2><div class="alert success">All stocked up — nothing is below 10 units right now.</div>';
      return;
    }
    const chips = low.map(p => `
      <div class="stock-chip ${Number(p.stock) <= 0 ? 'out' : ''}">
        <span><strong>${p.title}</strong><br><small>${p.category} · ${p.unitLabel}</small></span>
        <span class="stock-count">${Number(p.stock) <= 0 ? 'Sold out' : `Only ${p.stock} left`}</span>
      </div>`).join('');
    panel.innerHTML = `<h2>Stock alerts <span class="badge orange">${low.length} low</span></h2><div class="stock-chip-grid">${chips}</div>`;
  }

  function renderSales() {
    const panel = $('[data-sales-panel]');
    if (!panel) return;
    const paid = state.orders.filter(o => o.status !== 'CANCELLED');
    const revenue = paid.reduce((sum, o) => sum + Number(o.totalInr || 0), 0);
    const avg = paid.length ? revenue / paid.length : 0;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const perDay = days.map((day, i) => {
      const dayOrders = paid.filter(o => String(o.placedAt || '').startsWith(day));
      return {
        label: new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
        today: i === 6,
        orders: dayOrders.length,
        revenue: dayOrders.reduce((s, o) => s + Number(o.totalInr || 0), 0)
      };
    });
    const maxRev = Math.max(...perDay.map(d => d.revenue), 1);
    const bars = perDay.map(d => `
      <div class="chart-bar ${d.today ? 'today' : ''}" title="${d.orders} order(s) · ${RFS.money(d.revenue)}">
        <span class="val">${d.revenue ? RFS.money(d.revenue) : '–'}</span>
        <span class="bar" style="height:${Math.max(4, Math.round(d.revenue / maxRev * 100))}%"></span>
        <span class="day">${d.label}</span>
      </div>`).join('');
    const tally = new Map();
    for (const o of paid) for (const item of o.items || []) {
      const row = tally.get(item.title) || { units: 0, revenue: 0 };
      row.units += Number(item.qty || 0);
      row.revenue += Number(item.lineTotalInr || 0);
      tally.set(item.title, row);
    }
    const top = [...tally.entries()].sort((a, b) => b[1].units - a[1].units).slice(0, 5);
    const topHtml = top.length
      ? top.map(([title, r], i) => `<div class="top-row"><span class="rank">${i + 1}</span><span class="top-name">${title}</span><span class="top-fig"><strong>${r.units}</strong> units · ${RFS.money(r.revenue)}</span></div>`).join('')
      : '<p class="summary-note">Your best sellers will appear here after the first few orders.</p>';
    panel.innerHTML = `
      <h2>Sales <span class="badge green">last 7 days</span></h2>
      <div class="sales-layout">
        <div>
          <div class="chart-bars">${bars}</div>
          <div class="sales-totals">
            <div><strong>${RFS.money(revenue)}</strong><span>revenue (all time)</span></div>
            <div><strong>${RFS.money(avg)}</strong><span>avg order value</span></div>
            <div><strong>${paid.length}</strong><span>orders</span></div>
          </div>
        </div>
        <div>
          <h3 class="top-title">Top products</h3>
          <div class="top-products">${topHtml}</div>
        </div>
      </div>`;
  }

  async function refreshDashboard() {
    const panel = $('[data-dashboard]');
    const data = await api('/api/admin/dashboard');
    panel.innerHTML = `
      <div class="metric"><strong>${data.metrics.ordersToday}</strong><span>orders today</span></div>
      <div class="metric"><strong>${data.metrics.activeOrders}</strong><span>active orders</span></div>
      <div class="metric"><strong>${RFS.money(data.metrics.revenueTodayInr)}</strong><span>sales today</span></div>
      <div class="metric"><strong>${data.metrics.liveProducts}</strong><span>live products</span></div>
      <div class="metric"><strong>${data.metrics.lowStock}</strong><span>low stock</span></div>
    `;
  }

  function setField(name, value) {
    const input = document.querySelector(`[data-settings-form] [name="${name}"]`);
    if (input) input.value = value ?? '';
  }

  function renderCouponRows(coupons) {
    const body = document.querySelector('[data-coupon-body]');
    body.innerHTML = '';
    for (const c of coupons) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" class="coupon-code small-input" style="width:110px;text-transform:uppercase" value=""></td>
        <td><select class="coupon-type small-input"><option value="flat">Flat ₹</option><option value="percent">% off</option></select></td>
        <td><input type="number" class="coupon-value small-input" min="1" step="1"></td>
        <td><input type="number" class="coupon-min small-input" min="0" step="1"></td>
        <td><label><input type="checkbox" class="coupon-active" checked> Live</label></td>
        <td><button type="button" class="button ghost small" data-remove-coupon>✕</button></td>
      `;
      tr.querySelector('.coupon-code').value = c.code || '';
      tr.querySelector('.coupon-type').value = c.type === 'percent' ? 'percent' : 'flat';
      tr.querySelector('.coupon-value').value = Number(c.value || 0);
      tr.querySelector('.coupon-min').value = Number(c.minOrderInr || 0);
      tr.querySelector('.coupon-active').checked = c.active !== false;
      tr.querySelector('[data-remove-coupon]').addEventListener('click', () => { tr.remove(); RFS.toast('Row removed — Save settings to apply'); });
      body.appendChild(tr);
    }
  }

  function renderTierRows(tiers) {
    const body = document.querySelector('[data-tier-body]');
    body.innerHTML = '';
    for (const tier of tiers) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" class="tier-label" value=""></td>
        <td><input type="number" class="tier-min small-input" min="0" step="0.01"></td>
        <td><input type="number" class="tier-max small-input" min="0" step="0.01"></td>
        <td><input type="number" class="tier-fee small-input" min="0" step="0.01"></td>
      `;
      tr.querySelector('.tier-label').value = tier.label || '';
      tr.querySelector('.tier-min').value = Number(tier.min ?? 0);
      tr.querySelector('.tier-max').value = Number(tier.max ?? 0);
      tr.querySelector('.tier-fee').value = Number(tier.feeInr ?? 0);
      body.appendChild(tr);
    }
  }

  async function renderSettings() {
    const data = await api('/api/admin/settings');
    state.settings = data.settings;
    const content = data.settings.content || {};
    const business = data.settings.business || {};
    const delivery = data.settings.delivery || {};
    for (const key of ['homeBadge', 'homeTitle', 'homeSubtitle', 'deliveryNoteTitle', 'deliveryNoteText', 'deliveryNoteButton']) setField(key, content[key]);
    for (const key of ['name', 'whatsapp', 'phoneDisplay', 'city']) setField(key, business[key]);
    setField('hubLat', delivery.hubLat);
    setField('hubLng', delivery.hubLng);
    setField('maxRoadKm', delivery.maxRoadKm);
    setField('freeOverInr', delivery.freeOverInr);
    renderTierRows(delivery.tiers?.length ? delivery.tiers : DEFAULT_TIERS);
    renderCouponRows(Array.isArray(state.settings.promotions?.coupons) ? state.settings.promotions.coupons : []);
  }

  function collectSettings() {
    const value = name => (document.querySelector(`[data-settings-form] [name="${name}"]`)?.value || '').trim();
    const deliveryNumber = name => {
      const value = Number(document.querySelector(`[data-settings-form] [name="${name}"]`)?.value);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Enter a valid number for ${name}`);
      return value;
    };
    const tiers = [...document.querySelectorAll('[data-tier-body] tr')].map((row, index) => {
      const label = row.querySelector('.tier-label').value.trim() || `Level ${index + 1}`;
      const min = Number(row.querySelector('.tier-min').value);
      const max = Number(row.querySelector('.tier-max').value);
      const feeInr = Number(row.querySelector('.tier-fee').value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(feeInr) || min < 0 || max <= min || feeInr < 0) {
        throw new Error(`Tier ${index + 1} has invalid distance or fee values`);
      }
      return { min, max, label, feeInr };
    });
    if (!tiers.length) throw new Error('Keep at least one delivery tier');
    const coupons = [...document.querySelectorAll('[data-coupon-body] tr')].map(row => ({
      code: row.querySelector('.coupon-code').value,
      type: row.querySelector('.coupon-type').value,
      value: Number(row.querySelector('.coupon-value').value),
      minOrderInr: Number(row.querySelector('.coupon-min').value) || 0,
      active: row.querySelector('.coupon-active').checked
    })).filter(c => String(c.code || '').trim());
    return {
      promotions: { coupons },
      content: {
        homeBadge: value('homeBadge'),
        homeTitle: value('homeTitle'),
        homeSubtitle: value('homeSubtitle'),
        deliveryNoteTitle: value('deliveryNoteTitle'),
        deliveryNoteText: value('deliveryNoteText'),
        deliveryNoteButton: value('deliveryNoteButton')
      },
      business: {
        name: value('businessName'),
        whatsapp: value('whatsapp'),
        phoneDisplay: value('phoneDisplay'),
        city: value('city')
      },
      delivery: {
        hubLat: deliveryNumber('hubLat'),
        hubLng: deliveryNumber('hubLng'),
        maxRoadKm: deliveryNumber('maxRoadKm'),
        freeOverInr: deliveryNumber('freeOverInr'),
        tiers
      }
    };
  }

  $('[data-settings-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('[data-save-settings]');
    try {
      const payload = collectSettings();
      RFS.setBusy(button, true, 'Saving…');
      await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
      RFS.toast('Website settings saved. Refresh the storefront to see them.');
    } catch (error) {
      RFS.toast(error.message, 'error');
    } finally {
      RFS.setBusy(button, false);
    }
  });

  document.querySelector('[data-reset-tiers]').addEventListener('click', () => {
    renderTierRows(DEFAULT_TIERS);
    RFS.toast('Default tiers loaded. Click Save site settings to apply.');
  });

  document.querySelector('[data-add-coupon]')?.addEventListener('click', () => {
    const existing = [...document.querySelectorAll('[data-coupon-body] tr')].map(row => ({
      code: row.querySelector('.coupon-code').value,
      type: row.querySelector('.coupon-type').value,
      value: row.querySelector('.coupon-value').value,
      minOrderInr: row.querySelector('.coupon-min').value,
      active: row.querySelector('.coupon-active').checked
    }));
    existing.push({ code: '', type: 'flat', value: 50, minOrderInr: 399, active: true });
    renderCouponRows(existing);
    const rows = document.querySelectorAll('[data-coupon-body] tr');
    rows[rows.length - 1]?.querySelector('.coupon-code')?.focus();
  });

  // ---- live order alerts ----
  let alertsOn = localStorage.getItem('rebesta_admin_alerts') !== 'off';
  let lastOrderId = null;
  let alertTimer = null;

  function updateAlertButton() {
    const button = document.querySelector('[data-alert-toggle]');
    if (button) button.textContent = alertsOn ? '🔔 Order alerts: ON' : '🔕 Order alerts: OFF';
  }

  function orderBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(); osc.stop(ctx.currentTime + 0.65);
    } catch {}
  }

  async function pollOrders() {
    if (!state.key) return;
    try {
      const data = await api('/api/admin/orders');
      const sorted = [...(data.orders || [])].sort((a, b) => String(b.placedAt || '').localeCompare(String(a.placedAt || '')));
      const newest = sorted[0];
      if (lastOrderId && newest && newest.id !== lastOrderId) {
        const fresh = [];
        for (const order of sorted) {
          if (order.id === lastOrderId) break;
          fresh.push(order);
        }
        if (fresh.length) {
          if (alertsOn) orderBeep();
          RFS.toast(`🔔 ${fresh.length} new order${fresh.length === 1 ? '' : 's'}! ${fresh[0].id} · ${RFS.money(fresh[0].totalInr)}`);
          if (alertsOn && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('🥬 New Rebesta order!', { body: `${fresh[0].id} — ${RFS.money(fresh[0].totalInr)}` }); } catch {}
          }
          refreshAll().catch(() => {});
        }
      }
      if (newest) lastOrderId = newest.id;
    } catch {}
  }

  function startOrderAlerts() {
    if (alertTimer) return;
    pollOrders();
    alertTimer = setInterval(pollOrders, 25000);
  }

  document.querySelector('[data-alert-toggle]')?.addEventListener('click', async () => {
    alertsOn = !alertsOn;
    localStorage.setItem('rebesta_admin_alerts', alertsOn ? 'on' : 'off');
    if (alertsOn && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    updateAlertButton();
    RFS.toast(alertsOn ? 'Order alerts on — you will hear a beep on every new order' : 'Order alerts muted');
  });
  updateAlertButton();

  async function renderProducts() {
    const data = await api('/api/admin/products');
    state.products = data.products;
    const wrap = $('[data-products-table]');
    wrap.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Visibility</th><th>Save</th></tr></thead><tbody></tbody>';
    const body = table.querySelector('tbody');
    for (const p of state.products) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${p.title}</strong><br><span>${p.handle}</span></td>
        <td></td>
        <td><input class="small-input" type="number" min="0" step="0.01" value="${p.priceInr}"></td>
        <td><input class="small-input" type="number" min="0" step="1" value="${p.stock}"></td>
        <td><label><input type="checkbox" ${p.active ? 'checked' : ''}> Live</label></td>
        <td><button class="button ghost small" type="button">Save</button></td>
      `;
      tr.children[1].textContent = p.category;
      const [price, stock, active] = tr.querySelectorAll('input');
      tr.querySelector('button').addEventListener('click', async event => {
        RFS.setBusy(event.currentTarget, true, 'Saving…');
        try {
          await api(`/api/admin/products/${encodeURIComponent(p.handle)}`, {
            method: 'PATCH',
            body: JSON.stringify({ priceInr: Number(price.value), stock: Number(stock.value), active: active.checked })
          });
          RFS.toast(`${p.title} updated`);
          refreshDashboard();
        } catch (error) { RFS.toast(error.message, 'error'); }
        finally { RFS.setBusy(event.currentTarget, false); }
      });
      body.appendChild(tr);
    }
    wrap.appendChild(table);
  }

  async function renderOrders() {
    const data = await api('/api/admin/orders');
    state.orders = data.orders;
    const wrap = $('[data-orders-table]');
    wrap.innerHTML = '';
    if (!state.orders.length) {
      wrap.innerHTML = '<div class="empty-state"><h3>No orders yet</h3><p>Orders placed from your own checkout will appear here.</p></div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Delivery</th><th>Total</th><th>Status</th></tr></thead><tbody></tbody>';
    const body = table.querySelector('tbody');
    for (const order of state.orders) {
      const tr = document.createElement('tr');
      const itemText = order.items.map(i => `${i.title} × ${i.qty}`).join(', ');
      const addr = [order.address?.line1, order.address?.area, order.address?.city, order.address?.pincode].filter(Boolean).join(', ');
      tr.innerHTML = `
        <td><strong>${order.id}</strong><br><span>${new Date(order.placedAt).toLocaleString('en-IN')}</span></td>
        <td><strong>${order.customer?.name || ''}</strong><br><span>${order.customer?.phone || ''}</span></td>
        <td>${itemText}</td>
        <td><strong>${order.slot?.label || ''}</strong><br><span>${addr}</span><br><span>${order.location ? `Pin: ${order.location.lat}, ${order.location.lng}` : ''}</span></td>
        <td><strong>${RFS.money(order.totalInr)}</strong><br><span>${order.paymentMethod.toUpperCase()} · ${order.paymentStatus}</span></td>
        <td><select class="status-select"></select></td>
      `;
      const select = tr.querySelector('select');
      for (const status of statuses) {
        const opt = new Option(status.replaceAll('_', ' '), status);
        if (order.status === status) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', async () => {
        try {
          await api(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          order.status = select.value;
          RFS.toast(`Order ${order.id} updated`);
          refreshDashboard();
        } catch (error) { RFS.toast(error.message, 'error'); select.value = order.status; }
      });
      body.appendChild(tr);
    }
    wrap.appendChild(table);
  }

  async function refreshAll() {
    await refreshDashboard();
    await Promise.all([renderSettings(), renderProducts(), renderOrders()]);
    renderLowStock();
    renderSales();
  }

  $('#admin-key-form').addEventListener('submit', async event => {
    event.preventDefault();
    state.key = document.querySelector('[name="adminKey"]').value.trim();
    localStorage.setItem('rebesta_admin_key', state.key);
    RFS.setBusy(document.querySelector('[data-connect-admin]'), true, 'Connecting…');
    try {
      await refreshAll();
      document.querySelector('[data-admin-content]').hidden = false;
      startOrderAlerts();
      RFS.toast('Admin dashboard connected');
    } catch (error) {
      showError(error.message);
      RFS.toast(error.message, 'error');
    } finally {
      RFS.setBusy(document.querySelector('[data-connect-admin]'), false);
    }
  });

  document.querySelector('[data-refresh-admin]').addEventListener('click', () => refreshAll().catch(e => RFS.toast(e.message, 'error')));
  document.querySelector('[name="adminKey"]').value = state.key;
  if (state.key) {
    refreshAll().then(() => { document.querySelector('[data-admin-content]').hidden = false; startOrderAlerts(); }).catch(error => {
      showError(error.message);
    });
  }
})();
