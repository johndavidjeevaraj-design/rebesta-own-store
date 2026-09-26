(() => {
  const state = {
    key: localStorage.getItem('rebesta_admin_key') || '',
    products: [],
    orders: [],
    settings: null,
    partners: [],
    map: null,
    mapMarkers: {},
    mapTimer: null,
    versions: null,
    knownOrderIds: new Set(),
    orderFilter: { status: '', search: '' }
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
    const restockText = `Rebesta Fresh — restock needed 🥬\n\n${low.map(p => `${p.title} (${p.unitLabel}) — ${Number(p.stock) <= 0 ? 'SOLD OUT' : `${p.stock} left`}`).join('\n')}\n\nPlease send fresh stock. Thank you! 🙏`;
    const restockHref = `https://wa.me/?text=${encodeURIComponent(restockText)}`;
    panel.innerHTML = `<h2>Stock alerts <span class="badge orange">${low.length} low</span></h2><div class="stock-chip-grid">${chips}</div><a class="button wa-btn" style="display:flex;align-items:center;justify-content:center;margin-top:14px" href="${restockHref}" target="_blank" rel="noopener">📩 Send restock list on WhatsApp</a><p class="summary-note" style="margin-top:8px">You get a beep + notification the moment any product drops below 10 — while this dashboard is open.</p>`;
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

  function wireOrderFilters() {
    const statusSelect = $('[data-order-status-filter]');
    const searchInput = $('[data-order-search]');
    statusSelect?.addEventListener('change', () => { state.orderFilter.status = statusSelect.value; renderOrders(); });
    let t;
    searchInput?.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.orderFilter.search = searchInput.value || ''; renderOrders(); }, 250);
    });
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
    setField('slotCapacity', delivery.slotCapacity ?? 25);
    renderTierRows(delivery.tiers?.length ? delivery.tiers : DEFAULT_TIERS);
    renderCouponRows(Array.isArray(state.settings.promotions?.coupons) ? state.settings.promotions.coupons : []);
    setField('fssai', business.fssai);
    const promotions = data.settings.promotions || {};
    setField('loyaltyPercent', promotions.loyalty?.percent ?? 2);
    setField('loyaltyMinOrder', promotions.loyalty?.minOrderInr ?? 299);
    setField('loyaltyValidity', promotions.loyalty?.validityDays ?? 60);
    setField('referralBonus', promotions.referral?.bonusInr ?? 50);
    const checked = (name, on) => { const el = document.querySelector(`[data-settings-form] [name="${name}"]`); if (el) el.checked = Boolean(on); };
    checked('loyaltyEnabled', promotions.loyalty?.enabled);
    checked('referralEnabled', promotions.referral?.enabled);
    checked('maintenanceEnabled', data.settings.maintenance?.enabled);
    setField('maintenanceMessage', data.settings.maintenance?.message || '');
    setField('gaId', data.settings.integrations?.gaId || '');
    renderTestimonialRows(Array.isArray(content.testimonials) ? content.testimonials : []);
  }

  function renderTestimonialRows(items) {
    const body = $('[data-testimonial-body]');
    if (!body) return;
    body.innerHTML = '';
    for (const item of items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="small-input t-name" value="${String(item.name || '').replace(/"/g, '&quot;')}" maxlength="60"></td>
        <td><input class="small-input t-area" value="${String(item.area || '').replace(/"/g, '&quot;')}" maxlength="40" placeholder="e.g. Mathigiri"></td>
        <td><input class="small-input t-text" value="${String(item.text || '').replace(/"/g, '&quot;')}" maxlength="400"></td>
        <td><input class="small-input t-rating" inputmode="numeric" value="${Number(item.rating || 5)}" style="width:52px"></td>
        <td><button class="button ghost small" type="button" data-remove-testimonial>✕</button></td>`;
      tr.querySelector('[data-remove-testimonial]').addEventListener('click', () => tr.remove());
      body.appendChild(tr);
    }
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
    const numberOr = (name, fallback) => { const raw = value(name); const num = Number(raw); return raw !== '' && Number.isFinite(num) ? num : fallback; };
    const testimonials = [...document.querySelectorAll('[data-testimonial-body] tr')].map(row => ({
      name: row.querySelector('.t-name').value.trim(),
      area: row.querySelector('.t-area').value.trim(),
      text: row.querySelector('.t-text').value.trim(),
      rating: Number(row.querySelector('.t-rating').value) || 5
    })).filter(t => t.name && t.text);
    return {
      promotions: {
        coupons,
        loyalty: {
          enabled: Boolean(document.querySelector('[data-settings-form] [name="loyaltyEnabled"]')?.checked),
          percent: numberOr('loyaltyPercent', 2),
          minOrderInr: numberOr('loyaltyMinOrder', 299),
          validityDays: numberOr('loyaltyValidity', 60)
        },
        referral: {
          enabled: Boolean(document.querySelector('[data-settings-form] [name="referralEnabled"]')?.checked),
          bonusInr: numberOr('referralBonus', 50)
        }
      },
      content: {
        homeBadge: value('homeBadge'),
        homeTitle: value('homeTitle'),
        homeSubtitle: value('homeSubtitle'),
        deliveryNoteTitle: value('deliveryNoteTitle'),
        deliveryNoteText: value('deliveryNoteText'),
        deliveryNoteButton: value('deliveryNoteButton'),
        testimonials
      },
      business: {
        name: value('businessName'),
        whatsapp: value('whatsapp'),
        phoneDisplay: value('phoneDisplay'),
        city: value('city'),
        fssai: value('fssai')
      },
      maintenance: {
        enabled: Boolean(document.querySelector('[data-settings-form] [name="maintenanceEnabled"]')?.checked),
        message: value('maintenanceMessage')
      },
      integrations: {
        gaId: value('gaId')
      },
      delivery: {
        hubLat: deliveryNumber('hubLat'),
        hubLng: deliveryNumber('hubLng'),
        maxRoadKm: deliveryNumber('maxRoadKm'),
        freeOverInr: deliveryNumber('freeOverInr'),
        slotCapacity: Math.max(1, Math.round(numberOr('slotCapacity', 25))),
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
  let knownLowStock = new Set();
  let lowStockInitialized = false;

  /* ⚠️ Low-stock crossing alert: beep + browser notification when a product
     first drops to ≤10 while the dashboard is open */
  function detectLowStock() {
    const low = state.products.filter(p => p.active && Number(p.stock) <= 10);
    const handles = low.map(p => p.handle);
    const fresh = low.filter(p => !knownLowStock.has(p.handle));
    if (lowStockInitialized && fresh.length) {
      const names = fresh.map(p => `${p.title} (${p.stock} left)`);
      if (alertsOn) {
        orderBeep();
        RFS.toast(`⚠️ Low stock: ${names.join(' · ')}`, 'error');
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('⚠️ Stock running low', { body: names.join('\n') + '\n— restock soon or hide the products.' }); } catch {}
        }
      }
    }
    knownLowStock = new Set(handles);
    lowStockInitialized = true;
  }

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

  /* Live polling: 10s version check (tiny), full re-render only when something changed */
  function startOrderAlerts() {
    if (alertTimer) return;
    pollLive();
    alertTimer = setInterval(pollLive, 10000);
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
    table.innerHTML = '<thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Visibility</th><th>Photo</th><th>Save</th></tr></thead><tbody></tbody>';
    const body = table.querySelector('tbody');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => uploadProductPhoto(fileInput.dataset.handle, fileInput.files?.[0]));
    wrap.appendChild(fileInput);

    async function uploadProductPhoto(handle, file) {
      if (!file) return;
      try {
        RFS.toast('📦 Compressing photo…');
        const dataUrl = await compressImage(file, 1000, 0.82);
        await api(`/api/admin/products/${encodeURIComponent(handle)}/photo`, { method: 'POST', body: JSON.stringify({ imageDataUrl: dataUrl }) });
        RFS.toast('📸 Photo updated — customers see it instantly', 'success');
        await renderProducts();
        refreshDashboard();
      } catch (error) { RFS.toast(error.message, 'error'); }
      finally { fileInput.value = ''; }
    }

    for (const p of state.products) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="prod-cell"><img class="prod-thumb" src="${p.image || '/assets/brand/basket.jpg'}" alt="" loading="lazy"><div><strong>${p.title}</strong><br><span>${p.handle}</span></div></td>
        <td></td>
        <td><input class="small-input" type="number" min="0" step="0.01" value="${p.priceInr}"></td>
        <td><input class="small-input" type="number" min="0" step="1" value="${p.stock}"></td>
        <td><label><input type="checkbox" ${p.active ? 'checked' : ''}> Live</label></td>
        <td><button class="button ghost small" type="button" data-photo>📸 Photo</button></td>
        <td><button class="button ghost small" type="button">Save</button></td>
      `;
      tr.children[1].textContent = p.category;
      tr.querySelector('[data-photo]').addEventListener('click', () => {
        fileInput.dataset.handle = p.handle;
        fileInput.click();
      });
      const [price, stock, active] = tr.querySelectorAll('input');
      tr.querySelectorAll('button').forEach(btn => {
        if (btn.hasAttribute('data-photo')) return;
        btn.addEventListener('click', async event => {
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
      });
      body.appendChild(tr);
    }
    wrap.appendChild(table);
  }

  /* Client-side photo compression — keeps uploads small on mobile data */
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

  function filteredOrders() {
    const q = state.orderFilter.search.trim().toLowerCase();
    return state.orders.filter(o => {
      if (state.orderFilter.status === 'ACTIVE') {
        if (['DELIVERED', 'CANCELLED'].includes(o.status)) return false;
      } else if (state.orderFilter.status && o.status !== state.orderFilter.status) {
        return false;
      }
      if (q) {
        const hay = `${o.id} ${o.customer?.name || ''} ${o.customer?.phone || ''} ${o.address?.area || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  async function renderOrders() {
    const wrap = $('[data-orders-table]');
    wrap.innerHTML = '';
    if (!state.orders.length) {
      wrap.innerHTML = '<div class="empty-state"><h3>No orders yet</h3><p>Orders placed from your own checkout will appear here.</p></div>';
      return;
    }
    const shown = filteredOrders();
    if (!shown.length) {
      wrap.innerHTML = '<div class="empty-state"><h3>No matching orders</h3><p>Try a different filter or search.</p></div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Delivery</th><th>Partner</th><th>Total</th><th>Status</th></tr></thead><tbody></tbody>';
    const body = table.querySelector('tbody');
    for (const order of shown) {
      const tr = document.createElement('tr');
      const itemText = order.items.map(i => `${i.title} × ${i.qty}`).join(', ');
      const addr = [order.address?.line1, order.address?.area, order.address?.city, order.address?.pincode].filter(Boolean).join(', ');
      const isSub = String(order.source || '').startsWith('subscription:');
      const waEvent = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(order.status) ? order.status : null;
      tr.innerHTML = `
        <td><strong>${order.id}</strong>${isSub ? ' <span class="badge orange" title="Auto-created weekly subscription order">🔁</span>' : ''}<br><span>${new Date(order.placedAt).toLocaleString('en-IN')}</span>${waEvent ? `<br><a class="wa-mini" target="_blank" rel="noopener" data-wa-send>💬 WhatsApp update</a>` : ''}</td>
        <td><strong>${order.customer?.name || ''}</strong><br><span>${order.customer?.phone || ''}</span></td>
        <td>${itemText}</td>
        <td><strong>${order.slot?.label || ''}</strong><br><span>${addr}</span><br><span>${order.location ? `Pin: ${order.location.lat}, ${order.location.lng}` : ''}</span></td>
        <td data-partner-cell></td>
        <td><strong>${RFS.money(order.totalInr)}</strong><br><span>${order.paymentMethod.toUpperCase()} · ${order.paymentStatus.replaceAll('_', ' ').toLowerCase()}</span>${order.paymentMethod === 'cod' && order.paymentStatus === 'PAY_ON_DELIVERY' && !['DELIVERED', 'CANCELLED'].includes(order.status) ? '<br><button class="button ghost small" type="button" data-mark-cash>💵 Mark cash received</button>' : ''}</td>
        <td><select class="status-select"></select></td>
      `;
      tr.querySelector('[data-wa-send]')?.addEventListener('click', () => {
        const phone = String(order.customer?.phone || '').replace(/\D/g, '').slice(-10);
        const first = String(order.customer?.name || '').split(' ')[0] || 'there';
        const texts = {
          CONFIRMED: `✅ Your Rebesta Fresh order ${order.id} is confirmed, ${first}! We are sourcing your vegetables fresh from the farms.`,
          PACKING: `🧺 We are packing your order ${order.id} with care — coming your way ${order.slot?.label || 'tomorrow morning'}.`,
          OUT_FOR_DELIVERY: `🛵 Good news ${first}! Order ${order.id} is OUT FOR DELIVERY.\nETA: about 20–30 minutes.\nLive tracking: ${location.origin}/track?id=${order.id}`,
          DELIVERED: `🎉 Delivered! Your order ${order.id} was handed over. Enjoy your fresh vegetables, ${first}! 🥬`,
          CANCELLED: `Hi ${first}, your Rebesta Fresh order ${order.id} has been cancelled as requested. We hope to serve you again soon! 🌱`
        };
        const text = texts[waEvent];
        if (text) window.open(`https://api.whatsapp.com/send/?phone=91${phone}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
      const select = tr.querySelector('select');
      for (const status of statuses) {
        const opt = new Option(status.replaceAll('_', ' '), status);
        if (order.status === status) opt.selected = true;
        select.appendChild(opt);
      }
      tr.querySelector('[data-mark-cash]')?.addEventListener('click', async event => {
        const btn = event.currentTarget;
        btn.disabled = true;
        try {
          await api(`/api/admin/orders/${encodeURIComponent(order.id)}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentStatus: 'PAID_CASH_ON_DELIVERY' }) });
          RFS.toast(`Cash recorded for ${order.id}`, 'success');
          renderOrders();
        } catch (error) { RFS.toast(error.message, 'error'); btn.disabled = false; }
      });
      select.addEventListener('change', async () => {
        try {
          await api(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          order.status = select.value;
          RFS.toast(`Order ${order.id} updated`);
          refreshDashboard();
        } catch (error) { RFS.toast(error.message, 'error'); select.value = order.status; }
      });
      const partnerCell = tr.querySelector('[data-partner-cell]');
      const activePartners = state.partners.filter(p => p.active);
      if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
        partnerCell.innerHTML = order.assignedPartnerName ? `<span>${order.assignedPartnerName}</span>` : '<span style="color:var(--muted)">—</span>';
      } else if (!activePartners.length) {
        partnerCell.innerHTML = '<span style="color:var(--muted);font-size:.85rem">No partners yet</span>';
      } else {
        const pSelect = document.createElement('select');
        pSelect.style.cssText = 'padding:7px;border-radius:9px;border:1px solid #cbd8c5;font-size:.85rem;max-width:130px';
        pSelect.appendChild(new Option('— assign —', ''));
        for (const partner of activePartners) {
          const opt = new Option(`${partner.name} (${partner.activeOrders})`, partner.id);
          if (order.assignedPartnerId === partner.id) opt.selected = true;
          pSelect.appendChild(opt);
        }
        pSelect.addEventListener('change', async () => {
          try {
            await api(`/api/admin/orders/${encodeURIComponent(order.id)}/assign`, { method: 'POST', body: JSON.stringify({ partnerId: pSelect.value || null }) });
            RFS.toast(pSelect.value ? `Assigned to ${pSelect.selectedOptions[0].text.split(' (')[0]} 🛵` : 'Order unassigned');
            await refreshPartners();
            renderOrders();
          } catch (error) { RFS.toast(error.message, 'error'); pSelect.value = order.assignedPartnerId || ''; }
        });
        partnerCell.appendChild(pSelect);
      }
      body.appendChild(tr);
    }
    wrap.appendChild(table);
    renderPacking();
  }

  /* ============ Delivery partners ============ */

  async function refreshPartners() {
    try {
      const data = await api('/api/admin/partners');
      state.partners = data.partners || [];
    } catch { state.partners = state.partners || []; }
    renderPartners();
  }

  function partnerLiveDot(partner) {
    const pos = partner.lastPosition;
    if (!pos) return '';
    const ageMin = Math.round((Date.now() - Date.parse(pos.updatedAt)) / 60000);
    if (ageMin <= 10) return ' <span style="color:#1f7a3d" title="Live now">●</span>';
    if (ageMin <= 60) return ` <span style="color:#f28c28" title="Seen ${ageMin}m ago">●</span>`;
    return '';
  }

  function renderPartners() {
    const panel = $('[data-partners-panel]');
    if (!panel) return;
    const rows = state.partners.map(p => `
      <tr>
        <td><strong>${p.name}</strong>${partnerLiveDot(p)}<br><small style="color:var(--muted)">${p.id}</small></td>
        <td>+91 ${p.phone}</td>
        <td>${p.activeOrders}</td>
        <td><strong>${p.deliveredToday ?? 0}</strong> today<br><small style="color:var(--muted)">${p.delivered7d ?? 0} this week · ${p.deliveredTotal ?? 0} total</small></td>
        <td>${p.avgDeliverMin != null ? `<strong>${p.avgDeliverMin} min</strong><br><small style="color:var(--muted)">avg per stop</small>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${p.active ? '<span class="badge green">active</span>' : '<span class="badge gray">disabled</span>'}</td>
        <td style="white-space:nowrap">
          <button class="button ghost small" type="button" data-partner-toggle="${p.id}">${p.active ? 'Disable' : 'Enable'}</button>
          <button class="button ghost small" type="button" data-partner-pin="${p.id}">Reset PIN</button>
          <button class="button danger small" type="button" data-partner-delete="${p.id}">Remove</button>
        </td>
      </tr>`).join('');
    panel.innerHTML = `
      <div class="section-head" style="margin-bottom:18px">
        <div><h2 style="margin-bottom:5px">🛵 Delivery partners — scorecards</h2><p class="section-subtitle" style="font-size:.94rem">Partners sign in at <strong>/partner</strong> on their phone with mobile + PIN. Avg time = collected → delivered.</p></div>
      </div>
      ${state.partners.length ? `
      <div class="admin-table-wrap" style="border-radius:16px;margin-bottom:18px">
        <table class="admin-table" style="min-width:760px">
          <thead><tr><th>Partner</th><th>Phone</th><th>Active</th><th>Deliveries</th><th>Avg time</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div class="alert info">No delivery partners yet — add your first partner below 👇</div>'}
      <form data-add-partner class="form-grid" style="align-items:end">
        <div class="field"><label>Partner name</label><input name="name" maxlength="60" placeholder="e.g. Ramesh" required></div>
        <div class="field"><label>Mobile number</label><input name="phone" inputmode="numeric" maxlength="10" placeholder="10-digit number" required></div>
        <div class="field"><label>PIN (4–6 digits)</label><input name="pin" inputmode="numeric" maxlength="6" placeholder="e.g. 4821" required></div>
        <div class="field" style="justify-content:end"><button class="button orange" type="submit">+ Add partner</button></div>
      </form>`;

    panel.querySelector('[data-add-partner]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form).entries());
      if (!/^[6-9]\d{9}$/.test(payload.phone.replace(/\D/g, ''))) return RFS.toast('Enter a valid 10-digit mobile number', 'error');
      if (!/^\d{4,6}$/.test(payload.pin)) return RFS.toast('PIN must be 4–6 digits', 'error');
      try {
        const data = await api('/api/admin/partners', { method: 'POST', body: JSON.stringify(payload) });
        RFS.toast(`${data.partner.name} added — share the PIN 🛵`, 'success');
        await refreshPartners();
        renderOrders();
      } catch (error) { RFS.toast(error.message, 'error'); }
    });

    panel.querySelectorAll('[data-partner-toggle]').forEach(btn => btn.addEventListener('click', async () => {
      try {
        const partner = state.partners.find(p => p.id === btn.dataset.partnerToggle);
        await api(`/api/admin/partners/${encodeURIComponent(btn.dataset.partnerToggle)}`, { method: 'PATCH', body: JSON.stringify({ active: !partner.active }) });
        await refreshPartners();
      } catch (error) { RFS.toast(error.message, 'error'); }
    }));

    panel.querySelectorAll('[data-partner-pin]').forEach(btn => btn.addEventListener('click', async () => {
      const pin = prompt('New 4–6 digit PIN for this partner:');
      if (!pin) return;
      try {
        await api(`/api/admin/partners/${encodeURIComponent(btn.dataset.partnerPin)}`, { method: 'PATCH', body: JSON.stringify({ pin }) });
        RFS.toast('PIN updated — partner uses it from next sign-in', 'success');
      } catch (error) { RFS.toast(error.message, 'error'); }
    }));

    panel.querySelectorAll('[data-partner-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const partner = state.partners.find(p => p.id === btn.dataset.partnerDelete);
      if (!confirm(`Remove ${partner?.name}? Their assigned orders will be unassigned.`)) return;
      try {
        await api(`/api/admin/partners/${encodeURIComponent(btn.dataset.partnerDelete)}`, { method: 'DELETE' });
        RFS.toast('Partner removed', 'success');
        await refreshPartners();
        renderOrders();
      } catch (error) { RFS.toast(error.message, 'error'); }
    }));
  }

  /* ============ Live tracking map ============ */

  function partnerIcon(name, live) {
    return L.divIcon({
      className: '',
      html: `<div style="transform:translate(-50%,-100%);text-align:center;white-space:nowrap">
        <div style="display:inline-flex;align-items:center;gap:4px;background:${live ? '#074015' : '#8a9784'};color:#fff;font-weight:700;font-size:.8rem;padding:4px 10px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.35)">🛵 ${name}${live ? ' <span style=\"color:#7CFC98\">●</span>' : ''}</div>
        <div style="width:14px;height:14px;background:${live ? '#074015' : '#8a9784'};border:2.5px solid #fff;border-radius:50%;margin:-4px auto 0;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
  }

  async function refreshTracking() {
    const panel = $('[data-tracking-panel]');
    if (!panel || !window.L) return;
    let data;
    try { data = await api('/api/admin/tracking'); } catch { return; }
    const live = data.partners || [];

    if (!state.map) {
      panel.innerHTML = `
        <div class="section-head" style="margin-bottom:12px">
          <div><h2 style="margin-bottom:5px">📡 Live delivery tracking</h2><p class="section-subtitle" style="font-size:.94rem">Partners appear here in real time while tracking is ON in their app. Map refreshes every 10 seconds.</p></div>
          <span class="badge ${live.length ? 'green' : 'gray'}">${live.length ? live.length + ' live' : 'nobody live'}</span>
        </div>
        <div id="trackMap" style="height:420px;border-radius:16px;border:1px solid #dbe5d6;z-index:0"></div>
        ${live.length ? '' : '<p class="summary-note" style="margin-top:10px">Nobody is tracking right now. Partners tap “Start live tracking” in their app while delivering.</p>'}`;
      const hub = data.hub && Number.isFinite(Number(data.hub.lat)) ? data.hub : { lat: 12.728582, lng: 77.824784 };
      state.map = L.map('trackMap').setView([hub.lat, hub.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(state.map);
      L.circle([hub.lat, hub.lng], { radius: 9000, color: '#1f7a3d', weight: 1.5, fillOpacity: 0.06 }).addTo(state.map);
      L.marker([hub.lat, hub.lng], { icon: L.divIcon({ className: '', html: '<div style="transform:translate(-50%,-100%)"><div style="background:#f28c28;color:#fff;font-weight:800;font-size:.8rem;padding:4px 10px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.35)">🏪 Rebesta hub</div></div>', iconSize: [0, 0] }) }).addTo(state.map);
    }

    const seen = new Set();
    for (const row of live) {
      const ageMin = Math.round((Date.now() - Date.parse(row.position.updatedAt)) / 60000);
      const isLive = ageMin <= 2;
      const popup = `<strong>${row.partner.name}</strong> · ${isLive ? '<span style="color:#1f7a3d">LIVE</span>' : `seen ${ageMin} min ago`}<br>
        ${row.orders.length ? row.orders.map(o => `🧾 ${o.id} — ${o.customer} (${RFS.money(o.totalInr)}) ${o.slot}`).join('<br>') : 'no active orders'}`;
      if (state.mapMarkers[row.partner.id]) {
        state.mapMarkers[row.partner.id].setLatLng([row.position.lat, row.position.lng]).setIcon(partnerIcon(row.partner.name, isLive)).setPopupContent(popup);
      } else {
        state.mapMarkers[row.partner.id] = L.marker([row.position.lat, row.position.lng], { icon: partnerIcon(row.partner.name, isLive) }).addTo(state.map).bindPopup(popup);
      }
      seen.add(row.partner.id);
    }
    for (const [id, marker] of Object.entries(state.mapMarkers)) {
      if (!seen.has(id)) { state.map.removeLayer(marker); delete state.mapMarkers[id]; }
    }
    if (live.length && !state.map._fitDone) {
      state.map.fitBounds(live.map(r => [r.position.lat, r.position.lng]), { padding: [60, 60], maxZoom: 14 });
      state.map._fitDone = true;
    }
  }

  /* ============ 🔁 Weekly subscriptions panel (dashboard) ============ */

  async function renderSubs() {
    const panel = $('[data-subs-panel]');
    if (!panel) return;
    let data;
    try { data = await api('/api/admin/subscriptions'); } catch { return; }
    const subs = data.subscriptions || [];
    const active = subs.filter(s => s.status === 'ACTIVE');
    const nextUp = [...active].sort((a, b) => String(a.nextRunOn).localeCompare(String(b.nextRunOn)))[0];
    const rows = subs.slice(0, 8).map(s => `
      <tr>
        <td><strong>${s.name}</strong><br><small style="color:var(--muted)">+91 ${s.phone}</small></td>
        <td>every ${s.weekdayLabel}<br><small style="color:var(--muted)">${s.itemCount} items · ${s.slotId || '—'}</small></td>
        <td>${s.status === 'ACTIVE' ? s.nextRunOn : '—'}</td>
        <td>${s.status === 'ACTIVE' ? '<span class="badge green">active</span>' : s.status === 'PAUSED' ? `<span class="badge orange">paused</span><br><small style="color:var(--muted)">${String(s.pauseReason || '').slice(0, 40)}</small>` : '<span class="badge gray">cancelled</span>'}</td>
        <td style="white-space:nowrap">
          ${s.status !== 'CANCELLED' ? `<button class="button ghost small" type="button" data-sub-action="${s.id}:${s.status === 'ACTIVE' ? 'pause' : 'resume'}">${s.status === 'ACTIVE' ? 'Pause' : 'Resume'}</button>` : ''}
          ${s.status !== 'CANCELLED' ? `<button class="button danger small" type="button" data-sub-action="${s.id}:cancel">Cancel</button>` : ''}
        </td>
      </tr>`).join('');
    panel.innerHTML = `
      <div class="section-head" style="margin-bottom:14px">
        <div><h2 style="margin-bottom:5px">🔁 Weekly subscriptions</h2>
        <p class="section-subtitle" style="font-size:.94rem">${active.length} active${nextUp ? ` · next auto-order: <strong>${nextUp.weekdayLabel} ${nextUp.nextRunOn}</strong> (${nextUp.name})` : ''} · orders appear automatically the day before delivery.</p></div>
      </div>
      ${subs.length ? `
      <div class="admin-table-wrap" style="border-radius:16px">
        <table class="admin-table" style="min-width:680px">
          <thead><tr><th>Customer</th><th>Repeat</th><th>Next delivery</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div class="empty-state"><h3>No subscriptions yet</h3><p>Customers tick "🔁 Repeat weekly" at checkout. You can also point them to <strong>/subscriptions</strong> to manage their baskets.</p></div>'}`;

    panel.querySelectorAll('[data-sub-action]').forEach(btn => btn.addEventListener('click', async () => {
      const [id, action] = btn.dataset.subAction.split(':');
      try {
        await api(`/api/admin/subscriptions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action }) });
        RFS.toast(action === 'cancel' ? 'Subscription cancelled' : action === 'pause' ? 'Subscription paused' : 'Subscription resumed', 'success');
        await renderSubs();
      } catch (error) { RFS.toast(error.message, 'error'); }
    }));
  }

  /* ============ 📅 Slot capacity meters (dashboard) ============ */

  function renderSlotUsage() {
    const panel = $('[data-slots-panel]');
    if (!panel) return;
    const active = state.orders.filter(o => !['CANCELLED', 'PAYMENT_FAILED'].includes(o.status));
    const upcoming = active.map(o => o.deliveryDate?.iso).filter(Boolean).sort().find(d => d >= new Date().toISOString().slice(0, 10));
    if (!upcoming) { panel.innerHTML = ''; return; }
    const settings = state.settings || {};
    const slots = settings.delivery?.slots || [];
    const capacity = Number(settings.delivery?.slotCapacity) || 25;
    const meters = slots.map(slot => {
      const used = active.filter(o => o.deliveryDate?.iso === upcoming && o.slot?.id === slot.id).length;
      const pct = Math.min(100, Math.round(used / capacity * 100));
      const tone = used >= capacity ? 'full' : pct > 75 ? 'warm' : 'ok';
      return `
        <div class="slot-meter">
          <div class="slot-meter-top"><strong>${slot.label}</strong><span>${used}/${capacity} orders</span></div>
          <div class="slot-meter-bar"><span class="${tone}" style="width:${Math.max(3, pct)}%"></span></div>
          <small>${used >= capacity ? 'Full — new customers pick the other slot' : `${capacity - used} left · tomorrow's morning`}</small>
        </div>`;
    }).join('');
    panel.innerHTML = `
      <h2>📅 Slot capacity <span class="badge green">next delivery day</span></h2>
      <div class="slot-meter-grid">${meters}</div>
      <p class="summary-note">Caps per morning slot (change in Settings). Customers cannot over-book a full slot.</p>`;
  }

  /* ============ Tabs ============ */

  function switchTab(name) {
    document.querySelectorAll('[data-tab-btn]').forEach(btn => btn.classList.toggle('active', btn.dataset.tabBtn === name));
    document.querySelectorAll('[data-tab]').forEach(sec => { sec.hidden = sec.dataset.tab !== name; });
    if (name === 'fleet') refreshTracking();
    if (name === 'dashboard') { renderRecent(); renderSubs(); renderSlotUsage(); }
    localStorage.setItem('rebesta_admin_tab', name);
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-tab-btn]');
    if (btn) switchTab(btn.dataset.tabBtn);
  });

  /* ============ Recent orders (dashboard) ============ */

  function renderRecent() {
    const panel = $('[data-recent-panel]');
    if (!panel) return;
    const recent = [...state.orders].sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt))).slice(0, 6);
    panel.innerHTML = `
      <div class="section-head" style="margin-bottom:8px"><h2>Latest orders</h2><button class="button ghost small" type="button" data-tab-btn="orders">See all →</button></div>
      ${recent.length ? recent.map(o => `
        <div class="recent-row" data-tab-btn="orders">
          <span class="ri">${o.status === 'DELIVERED' ? '✅' : o.status === 'CANCELLED' ? '❌' : o.status === 'OUT_FOR_DELIVERY' ? '🛵' : '🧾'}</span>
          <div><strong>${o.id}</strong> · ${o.customer?.name || ''}<br><span class="rmeta">${new Date(o.placedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${o.paymentMethod === 'cod' ? 'COD' : 'Online'}${o.assignedPartnerName ? ' · 🛵 ' + o.assignedPartnerName : ''}</span></div>
          <span class="rtotal">${RFS.money(o.totalInr)}</span>
        </div>`).join('') : '<div class="empty-state"><h3>No orders yet</h3><p>They will appear here automatically — with a chime.</p></div>'}`;
  }

  /* ============ Live updates (light polling, render only on change) ============ */

  function detectNewOrders() {
    const fresh = state.orders.filter(o => !state.knownOrderIds.has(o.id));
    if (state.knownOrderIds.size && fresh.length && alertsOn) {
      orderBeep();
      RFS.toast(`🆕 New order${fresh.length > 1 ? 's' : ''}! ${fresh.map(o => o.id + ' · ' + RFS.money(o.totalInr)).join(', ')}`, 'success');
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('🥬 New Rebesta order!', { body: fresh.map(o => `${o.id} — ${RFS.money(o.totalInr)}`).join('\n') }); } catch {}
      }
    }
    for (const o of state.orders) state.knownOrderIds.add(o.id);
  }

  async function pollLive() {
    if (document.visibilityState !== 'visible' || !state.key) return;
    let data;
    try { data = await api('/api/admin/version'); } catch { return; }
    const v = data.versions || {};
    if (!state.versions) { state.versions = v; return; }
    if (v.orders !== state.versions.orders) {
      try { state.orders = (await api('/api/admin/orders')).orders; } catch { return; }
      detectNewOrders();
      renderOrders();
      renderRecent();
      refreshDashboard();
      renderPacking();
      renderSlotUsage();
    }
    if (v.products !== state.versions.products) { await renderProducts(); refreshDashboard(); renderLowStock(); detectLowStock(); }
    if (v.partners !== state.versions.partners) { await refreshPartners(); renderOrders(); }
    if (v.subscriptions !== state.versions.subscriptions) { renderSubs(); }
    if (v.settings !== state.versions.settings) {
      const form = document.querySelector('[data-settings-form]');
      const editing = form && form.contains(document.activeElement);
      if (!editing) await renderSettings();
    }
    state.versions = v;
  }

  async function refreshAll() {
    await refreshDashboard();
    try { state.orders = (await api('/api/admin/orders')).orders; } catch { state.orders = state.orders || []; }
    await Promise.all([renderSettings(), renderProducts(), renderOrders(), refreshPartners()]);
    detectNewOrders();
    renderRecent();
    wireOrderFilters();
    refreshTracking();
    renderSubs();
    renderSlotUsage();
    switchTab(localStorage.getItem('rebesta_admin_tab') || 'dashboard');
    clearInterval(state.mapTimer);
    state.mapTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshTracking();
        pollLive();
      }
    }, 10000);
    renderLowStock();
    renderSales();
    detectLowStock();
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

  // --- CSV export & backup download ---
  document.querySelector('[data-export-csv]')?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/admin/orders.csv', { headers: { 'x-admin-key': state.key } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rebesta-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      RFS.toast('Orders CSV downloaded', 'success');
    } catch (error) { RFS.toast(error.message, 'error'); }
  });
  document.querySelector('[data-download-backup]')?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/admin/backup', { headers: { 'x-admin-key': state.key } });
      if (!response.ok) throw new Error('Backup failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rebesta-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      RFS.toast('Backup downloaded — keep it somewhere safe', 'success');
    } catch (error) { RFS.toast(error.message, 'error'); }
  });

  // --- Packing lists ---
  function renderPacking() {
    const dateInput = $('[data-packing-date]');
    const slotSelect = $('[data-packing-slot]');
    const result = $('[data-packing-result]');
    if (!dateInput || !result || !state.orders) return;
    const active = state.orders.filter(o => !['CANCELLED', 'PAYMENT_FAILED'].includes(o.status));
    const dates = [...new Set(active.map(o => o.deliveryDate?.iso || (o.deliveryDate?.label ? '' : '')).filter(Boolean))];
    // deliveryDate objects: use label for grouping; fall back to placedAt date
    const dateKeys = [...new Set(active.map(o => String(o.deliveryDate?.label || new Date(o.placedAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }))))];
    if (!dateInput.value) {
      const upcoming = active.map(o => o.deliveryDate?.iso).filter(Boolean).filter(d => d >= new Date().toISOString().slice(0, 10)).sort();
      dateInput.value = upcoming[0] || new Date().toISOString().slice(0, 10);
    }
    const slots = [...new Set(active.map(o => o.slot?.label).filter(Boolean))];
    slotSelect.innerHTML = '<option value="">All slots</option>' + slots.map(s => `<option value="${s}">${s}</option>`).join('');
    const chosenDate = dateInput.value;
    const matchDate = o => {
      const iso = o.deliveryDate?.iso || o.deliveryDate?.date || '';
      const label = String(o.deliveryDate?.label || '');
      return iso.startsWith(chosenDate) || label === new Date(chosenDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    };
    let list = active.filter(matchDate);
    if (slotSelect.value) list = list.filter(o => o.slot?.label === slotSelect.value);
    if (!list.length) {
      result.innerHTML = '<div class="empty-state"><h3>No orders for this date</h3><p>Pick the delivery date (and slot) you want to pack. Orders appear here as soon as customers place them.</p></div>';
      return;
    }
    const codToCollect = list.filter(o => o.paymentMethod === 'cod' && o.paymentStatus === 'PAY_ON_DELIVERY').reduce((sum, o) => sum + Number(o.totalInr || 0), 0);
    result.innerHTML = `
      <div class="packing-sheet" id="packing-sheet">
        <div class="packing-head"><img src="/assets/brand/logo.png" alt=""><div><strong>Packing sheet</strong><span>${new Date(chosenDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}${slotSelect.value ? ' · ' + slotSelect.value : ''} · ${list.length} orders</span></div></div>
        ${codToCollect > 0 ? `<div class="packing-cod">💵 Total COD to collect: <strong>${RFS.money(codToCollect)}</strong></div>` : ''}
        <div class="packing-list">
        ${list.map((o, index) => `
          <div class="packing-card">
            <div class="packing-order-head"><span class="packing-num">#${index + 1}</span><strong>${o.customer?.name || ''}</strong><span class="packing-phone">📞 ${o.customer?.phone || ''}</span></div>
            <div class="packing-address">📍 ${[o.address?.line1, o.address?.area, o.address?.city].filter(Boolean).join(', ')} · ${o.slot?.label || ''}</div>
            <ul class="packing-items">${o.items.map(i => `<li><span>${i.title} (${i.unitLabel})</span><strong>× ${i.qty}</strong></li>`).join('')}</ul>
            <div class="packing-total">${o.paymentMethod === 'cod' ? `<span class="badge orange">COD ${RFS.money(o.totalInr)}</span>` : `<span class="badge green">PAID ${RFS.money(o.totalInr)}</span>`}<span class="packing-paid">Cash ☐</span></div>
          </div>`).join('')}
        </div>
      </div>`;
  }
  $('[data-packing-date]')?.addEventListener('change', renderPacking);
  $('[data-packing-slot]')?.addEventListener('change', renderPacking);
  $('[data-packing-print]')?.addEventListener('click', () => {
    const sheet = document.getElementById('packing-sheet');
    if (!sheet) return RFS.toast('Nothing to print — pick a date with orders', 'error');
    document.body.classList.add('packing-print-mode');
    window.print();
    setTimeout(() => document.body.classList.remove('packing-print-mode'), 400);
  });

  // --- Testimonials add button ---
  document.querySelector('[data-add-testimonial]')?.addEventListener('click', () => {
    const body = $('[data-testimonial-body]');
    if (!body) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="small-input t-name" placeholder="Customer name" maxlength="60"></td>
      <td><input class="small-input t-area" placeholder="Area" maxlength="40"></td>
      <td><input class="small-input t-text" placeholder="What they said…" maxlength="400"></td>
      <td><input class="small-input t-rating" inputmode="numeric" value="5" style="width:52px"></td>
      <td><button class="button ghost small" type="button" data-remove-testimonial>✕</button></td>`;
    tr.querySelector('[data-remove-testimonial]').addEventListener('click', () => tr.remove());
    body.appendChild(tr);
  });
  document.querySelector('[name="adminKey"]').value = state.key;
  if (state.key) {
    refreshAll().then(() => { document.querySelector('[data-admin-content]').hidden = false; startOrderAlerts(); }).catch(error => {
      showError(error.message);
    });
  }
})();
