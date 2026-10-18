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
    orderFilter: { status: '', search: '' },
    productSearch: '',
    productCategory: '',
    showCategories: false
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
    checked('onlineEnabled', data.settings.payments?.onlineEnabled ?? data.settings.payments?.payuEnabled);
    const cf = data.cashfree || {};
    const cfStatus = document.querySelector('[data-cf-key-status]');
    if (cfStatus) cfStatus.textContent = cf.enabled
      ? `✅ Cashfree keys saved (${cf.mode === 'live' ? 'LIVE' : 'TEST'} mode) — customers can pay online.`
      : '⚠️ Cashfree keys not saved yet — paste the App ID + Secret Key below and press Save.';
    const cfMode = document.querySelector('[data-settings-form] [name="cfMode"]');
    if (cfMode && cf.mode) cfMode.value = cf.mode;
    const cfApp = document.querySelector('[data-settings-form] [name="cfAppId"]');
    if (cfApp && !cfApp.value) cfApp.value = cf.hasAppId ? '(saved — retype to change)' : '';
    const cfSecret = document.querySelector('[data-settings-form] [name="cfSecretKey"]');
    if (cfSecret) cfSecret.value = '';
    setField('maintenanceMessage', data.settings.maintenance?.message || '');
    setField('gaId', data.settings.integrations?.gaId || '');
    setField('smtpUser', data.settings.smtp?.user || '');
    setField('smtpNotify', data.settings.smtp?.notify || '');
    const passInput = document.querySelector('[data-settings-form] [name="smtpPass"]'); if (passInput) passInput.value = '';
    const mailStatus = document.querySelector('[data-mail-status]');
    if (mailStatus) mailStatus.textContent = data.mailReady ? '✅ Email notifications active' : '⚠️ Not configured yet — add Gmail + App Password (2-Step Verification required)';
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
      payments: {
        onlineEnabled: Boolean(document.querySelector('[data-settings-form] [name="onlineEnabled"]')?.checked)
      },
      smtp: {
        user: value('smtpUser'),
        pass: value('smtpPass'),
        notify: value('smtpNotify')
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

    /* toolbar: instant search + category filter + manage + add */
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px';
    const search = document.createElement('input');
    search.type = 'search';
    search.value = state.productSearch || '';
    search.setAttribute('aria-label', 'Search products');
    search.placeholder = '🔍 Search products — name, category…';
    search.style.cssText = 'flex:1 1 200px;min-height:40px;border:1px solid #cbd8c5;border-radius:10px;padding:6px 12px;background:#fff;font-size:.95rem;font-family:inherit';
    const catSelect = document.createElement('select');
    catSelect.setAttribute('aria-label', 'Filter by category');
    catSelect.style.cssText = 'flex:0 1 auto;min-height:40px;border:1px solid #cbd8c5;border-radius:10px;padding:6px 10px;background:#fff;font-size:.9rem;font-family:inherit;max-width:46vw';
    const countLabel = document.createElement('span');
    countLabel.style.cssText = 'font-size:.82rem;font-weight:700;color:var(--muted,#6b7a66);white-space:nowrap';
    const manageBtn = document.createElement('button');
    manageBtn.type = 'button';
    manageBtn.className = 'button ghost small';
    manageBtn.style.cssText = 'white-space:nowrap';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'button small';
    addBtn.style.cssText = 'background:linear-gradient(135deg,#2ecb66 0%,#17b34e 45%,#0faa46 100%);color:#fff;border:none;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer;box-shadow:0 6px 16px rgba(11,124,49,.35);white-space:nowrap';
    addBtn.textContent = '➕ Add product';
    addBtn.addEventListener('click', () => openProductEditor());
    bar.append(search, catSelect, countLabel, manageBtn, addBtn);

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th>Product</th><th>Category</th><th>Quantities</th><th>Price ₹</th><th>Stock</th><th>Visibility</th><th>Photo</th><th>Save</th><th></th></tr></thead><tbody></tbody>';
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
      tr.dataset.search = `${p.title} ${p.handle} ${p.category}`.toLowerCase();
      tr.dataset.category = String(p.category || '').trim();
      tr.innerHTML = `
        <td class="prod-cell"><img class="prod-thumb" src="${p.image || '/assets/brand/basket.jpg'}" alt="" loading="lazy"><div><strong>${p.title}</strong><br><span>${p.handle}</span></div></td>
        <td></td>
        <td></td>
        <td><input class="small-input" type="number" min="0" step="0.01" value="${p.priceInr}"></td>
        <td><input class="small-input" type="number" min="0" step="1" value="${p.stock}"></td>
        <td><label><input type="checkbox" ${p.active ? 'checked' : ''}> Live</label></td>
        <td><button class="button ghost small" type="button" data-photo>📸 Photo</button></td>
        <td><button class="button ghost small" type="button">Save</button></td>
        <td></td>
      `;
      tr.children[1].textContent = p.category;
      /* quantities button — opens the per-product quantity picker */
      const unitTd = tr.children[2];
      const unitsBtn = document.createElement('button');
      unitsBtn.className = 'button ghost small';
      unitsBtn.type = 'button';
      unitsBtn.dataset.units = '1';
      unitsBtn.title = 'Choose the quantities customers can order';
      unitsBtn.style.cssText = 'max-width:170px;white-space:normal;line-height:1.3;text-align:left';
      unitsBtn.textContent = unitsSummary(p);
      unitTd.appendChild(unitsBtn);
      unitsBtn.addEventListener('click', () => openUnitsEditor(p));
      tr.querySelector('[data-photo]').addEventListener('click', () => {
        fileInput.dataset.handle = p.handle;
        fileInput.click();
      });
      const editBtn = document.createElement('button');
      editBtn.className = 'button ghost small';
      editBtn.type = 'button';
      editBtn.dataset.edit = '1';
      editBtn.textContent = '✏️ Edit';
      editBtn.title = 'Edit title, description, unit…';
      editBtn.addEventListener('click', () => openProductEditor(p));
      tr.lastElementChild.style.whiteSpace = 'nowrap';
      tr.lastElementChild.appendChild(editBtn);
      const delBtn = document.createElement('button');
      delBtn.className = 'button ghost small';
      delBtn.type = 'button';
      delBtn.dataset.remove = '1';
      delBtn.textContent = '🗑 Remove';
      delBtn.title = 'Delete this product from the catalog';
      delBtn.style.color = '#b3261e';
      delBtn.addEventListener('click', async () => {
        if (!window.confirm(`Remove "${p.title}" from the catalog?\n\nIt disappears from the shop immediately. Past orders keep their own copy, so history stays intact.`)) return;
        delBtn.disabled = true;
        delBtn.textContent = 'Removing…';
        try {
          await api(`/api/admin/products/${encodeURIComponent(p.handle)}`, { method: 'DELETE' });
          RFS.toast(`🗑 ${p.title} removed from the catalog`, 'success');
          await renderProducts();
          refreshDashboard();
          renderLowStock();
        } catch (error) {
          RFS.toast(error.message || 'Could not remove', 'error');
          delBtn.disabled = false;
          delBtn.textContent = '🗑 Remove';
        }
      });
      tr.lastElementChild.appendChild(delBtn);
      const [price, stock, active] = tr.querySelectorAll('input');
      tr.querySelectorAll('button').forEach(btn => {
        if (btn.hasAttribute('data-photo') || btn.hasAttribute('data-edit') || btn.hasAttribute('data-remove') || btn.hasAttribute('data-units')) return;
        btn.addEventListener('click', async () => {
          /* NOTE: use the closed-over btn — event.currentTarget is null after
             the first await, which left the button stuck at "Saving…" forever */
          RFS.setBusy(btn, true, 'Saving…');
          const newPrice = Number(price.value);
          const patch = { priceInr: newPrice, stock: Number(stock.value), active: active.checked };
          /* base price changed → rescale pinned quantity prices with it */
          const ex = explicitVariants(p);
          let rescaled = false;
          if (ex && Number.isFinite(newPrice) && Math.abs(newPrice - Number(p.priceInr)) > 1e-9) {
            const baseV = ex.find(v => v.default) || ex[0];
            const basePrice = Number(baseV && baseV.priceInr);
            const ratio = basePrice > 0 ? newPrice / basePrice : 1;
            if (Number.isFinite(ratio) && ratio > 0) {
              patch.variants = ex.map(v => ({ id: v.id, label: v.label, priceInr: Math.max(1, Math.round(Number(v.priceInr) * ratio)), default: v === baseV }));
              rescaled = true;
            }
          }
          try {
            await api(`/api/admin/products/${encodeURIComponent(p.handle)}`, {
              method: 'PATCH',
              body: JSON.stringify(patch)
            });
            RFS.toast(`${p.title} updated${rescaled ? ' — quantity prices rescaled to the new base price' : ''}`);
            if (rescaled) await renderProducts();
            refreshDashboard();
          } catch (error) { RFS.toast(error.message, 'error'); }
          finally { RFS.setBusy(btn, false); }
        });
      });
      body.appendChild(tr);
    }
    wrap.appendChild(table);

    /* category dropdown + counts */
    const catCounts = new Map();
    for (const p of state.products) {
      const c = String(p.category || '').trim() || '(no category)';
      catCounts.set(c, (catCounts.get(c) || 0) + 1);
    }
    catSelect.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = `All categories (${state.products.length})`;
    catSelect.appendChild(allOpt);
    for (const c of [...catCounts.keys()].sort((a, b) => a.localeCompare(b))) {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = `${c} (${catCounts.get(c)})`;
      catSelect.appendChild(o);
    }
    catSelect.value = state.productCategory || '';

    /* manage-categories panel: rename or merge in one tap */
    const catPanel = document.createElement('div');
    catPanel.hidden = !state.showCategories;
    catPanel.style.cssText = 'margin-bottom:12px;border:1px solid #dde7d8;border-radius:14px;padding:14px;background:#f6faf4';
    const catTitle = document.createElement('strong');
    catTitle.textContent = '🏷 Categories';
    catTitle.style.cssText = 'display:block;margin-bottom:4px;color:#074015';
    const catHint = document.createElement('small');
    catHint.style.cssText = 'display:block;color:var(--muted,#6b7a66);margin-bottom:8px';
    catHint.textContent = 'Rename a category to fix a spelling, or type an existing name to merge two into one. New categories are created by typing the name in any product\u2019s editor. Your shop chips update instantly.';
    catPanel.append(catTitle, catHint);
    const renameCategory = async (from, to) => {
      const toCount = catCounts.get(to) || 0;
      const msg = toCount
        ? `Merge "${from}" into "${to}"?\n\nAll ${catCounts.get(from)} product(s) move to "${to}".`
        : `Rename "${from}" to "${to}"?\n\n${catCounts.get(from)} product(s) update instantly on the store.`;
      if (!window.confirm(msg)) return;
      try {
        const r = await api('/api/admin/categories/rename', { method: 'POST', body: JSON.stringify({ from, to }) });
        RFS.toast(`🏷 ${r.moved} product(s) moved to "${to}"`, 'success');
        state.productCategory = '';
        await renderProducts();
        refreshDashboard();
      } catch (error) { RFS.toast(error.message || 'Could not rename', 'error'); }
    };
    for (const c of [...catCounts.keys()].sort((a, b) => catCounts.get(b) - catCounts.get(a))) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0;border-bottom:1px dashed #dde7d8';
      const name = document.createElement('strong');
      name.textContent = c;
      name.style.cssText = 'min-width:150px;font-size:.9rem';
      const n = document.createElement('span');
      n.textContent = `${catCounts.get(c)} product${catCounts.get(c) > 1 ? 's' : ''}`;
      n.style.cssText = 'font-size:.78rem;color:var(--muted,#6b7a66)';
      const inp = document.createElement('input');
      inp.placeholder = 'New name…';
      inp.maxLength = 60;
      inp.style.cssText = 'flex:1 1 150px;min-height:36px;border:1px solid #cbd8c5;border-radius:9px;padding:4px 10px;background:#fff;font-size:.88rem;font-family:inherit';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'button ghost small';
      go.textContent = '✓ Apply';
      go.addEventListener('click', () => {
        const to = inp.value.trim();
        if (!to) return RFS.toast('Type a new name first', 'error');
        renameCategory(c, to);
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
      row.append(name, n, inp, go);
      catPanel.appendChild(row);
    }
    const updateManageBtn = () => { manageBtn.textContent = state.showCategories ? '🏷 Hide categories' : '🏷 Categories'; };
    updateManageBtn();
    manageBtn.addEventListener('click', () => {
      state.showCategories = !state.showCategories;
      catPanel.hidden = !state.showCategories;
      updateManageBtn();
    });

    /* wire the search + category filter: rows filter instantly, and both the
       query and the chosen category survive re-renders (save/add/remove) */
    const applyProductSearch = () => {
      const q = search.value.trim().toLowerCase();
      const cat = catSelect.value;
      state.productSearch = search.value;
      state.productCategory = cat;
      let shown = 0;
      for (const tr of body.children) {
        const hit = (!q || tr.dataset.search.includes(q)) && (!cat || tr.dataset.category === cat);
        tr.style.display = hit ? '' : 'none';
        if (hit) shown++;
      }
      const filtering = Boolean(q || cat);
      countLabel.textContent = filtering ? `${shown} of ${state.products.length} products` : `${state.products.length} products`;
    };
    search.addEventListener('input', applyProductSearch);
    catSelect.addEventListener('change', applyProductSearch);
    wrap.insertBefore(bar, table);
    wrap.insertBefore(catPanel, table);
    applyProductSearch();
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
        <td><strong>${order.id}</strong>${isSub ? ' <span class="badge orange" title="Auto-created weekly subscription order">🔁</span>' : ''}<br><span>${new Date(order.placedAt).toLocaleString('en-IN')}</span>${waEvent ? `<br><a class="wa-mini" target="_blank" rel="noopener" data-wa-send>💬 WhatsApp update</a>` : ''}${order.deliveryPhoto ? `<br><a href="${order.deliveryPhoto}" target="_blank" rel="noopener" class="proof-link">📸 Proof</a>` : ''}${order.status === 'DELIVERED' ? `<br><a class="wa-mini" target="_blank" rel="noopener" data-wa-nudge>💬 Nudge reorder</a>` : ''}</td>
        <td><strong>${order.customer?.name || ''}</strong><br><span>${order.customer?.phone || ''}</span></td>
        <td>${itemText}</td>
        <td><strong>${order.slot?.label || ''}</strong><br><span>${addr}</span><br><span>${order.location ? `Pin: ${order.location.lat}, ${order.location.lng}` : ''}</span></td>
        <td data-partner-cell></td>
        <td><strong>${RFS.money(order.totalInr)}</strong><br><span>${order.paymentMethod.toUpperCase()} · ${order.paymentStatus.replaceAll('_', ' ').toLowerCase()}</span>${order.paymentMethod === 'cod' && order.paymentStatus === 'PAY_ON_DELIVERY' && !['DELIVERED', 'CANCELLED'].includes(order.status) ? '<br><button class="button ghost small" type="button" data-mark-cash>💵 Mark cash received</button>' : ''}</td>
        <td><select class="status-select"></select></td>
      `;
      tr.querySelector('[data-wa-nudge]')?.addEventListener('click', () => {
        const phone = String(order.customer?.phone || '').replace(/\D/g, '');
        const first = String(order.customer?.name || '').split(' ')[0] || 'there';
        const top = order.items.slice(0, 2).map(i => `${i.title} (${i.unitLabel})`).join(' + ');
        const msg = `Hi ${first}! 👋 Fresh farm vegetables delivered tomorrow morning in Hosur. Your last order: ${top}…\nRefill the same basket in one tap 👉 https://rebestafresh.in/track?phone=${phone.slice(-10)}`;
        window.open(`https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      });
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
    if (name === 'fleet') { refreshTracking(); renderCashPanel(); }
    if (name === 'products') renderReviewsPanel();
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
      renderCashPanel();
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


  /* ============ ⚖ Per-product quantity picker ============ */

  /* per-product quantities — what the customer can pick on the product page.
     Auto = the site's size ladder (250/500 g + 1 kg, or 1/2/3 bunch for leafy
     greens). Anything else pins the exact list: tick every quantity you
     actually sell (whole items → pieces/bunches, no impossible 250 g cuts). */
  const QUANTITIES = [
    { id: '100g', label: '100 g', grams: 100 },
    { id: '250g', label: '250 g', grams: 250 },
    { id: '500g', label: '500 g', grams: 500 },
    { id: '1kg', label: '1 kg', grams: 1000 },
    { id: '2kg', label: '2 kg', grams: 2000 },
    { id: '5kg', label: '5 kg', grams: 5000 },
    { id: '1piece', label: '1 piece', count: 1 },
    { id: '2pieces', label: '2 pieces', count: 2 },
    { id: '3pieces', label: '3 pieces', count: 3 },
    { id: '1bunch', label: '1 bunch', count: 1, bunch: true },
    { id: '2bunch', label: '2 bunches', count: 2, bunch: true },
    { id: '3bunch', label: '3 bunches', count: 3, bunch: true },
    { id: '1pack', label: '1 pack' },
    { id: '1box', label: '1 box' }
  ];
  const explicitVariants = p => (Array.isArray(p.variants) && p.variants.length ? p.variants : null);
  const unitsSummary = p => {
    const ex = explicitVariants(p);
    if (ex) return ex.map(v => v.label).join(' + ');
    const unit = String(p.unitLabel || '').trim();
    const category = String(p.category || '');
    if (category === 'Leafy Greens') return '⚡ 1/2/3 bunch';
    if (/^\s*1\s*kg$/i.test(unit) && !/box|kit|combo/i.test(category)) return '⚡ 250/500 g + 1 kg';
    return '⚡ ' + (unit || '1 unit');
  };

  function openUnitsEditor(product) {
    const category = String(product.category || '');
    const unit = String(product.unitLabel || '').trim();
    const ex = Array.isArray(product.variants) && product.variants.length ? product.variants : null;
    const isLeafy = category === 'Leafy Greens';
    /* what "Auto" means for this product: already-auto keeps its unit;
       pinned products guess the natural ladder from what's pinned
       (bunches → bunch ladder, any gram/kg → 250/500 g + 1 kg,
       pieces/packs only → that single unit — never re-add 250 g cuts
       to a whole item) */
    let autoUnit;
    if (!ex) autoUnit = isLeafy ? '1 bunch' : (unit || '1 unit');
    else {
      const labels = ex.map(v => String(v.label || ''));
      autoUnit = labels.some(l => /bunch/i.test(l)) ? '1 bunch'
        : labels.some(l => /(^|\s)(g|kg)$/i.test(l)) ? '1 kg'
        : (labels[0] || '1 kg');
    }
    const ladder = isLeafy ? ['1 bunch', '2 bunches', '3 bunches'] : (autoUnit === '1 kg' ? ['250 g', '500 g', '1 kg'] : [autoUnit]);
    const base = Math.round(Number(product.priceInr || 0) * 100) / 100;
    /* mirror of the site's auto-ladder math (store.js productVariants) */
    const autoPrice = label => {
      if (isLeafy) { const b = Math.max(5, Math.ceil(base * 0.25)); return label === '1 bunch' ? b : label === '2 bunches' ? b * 2 : b * 3; }
      if (autoUnit === '1 kg') {
        if (label === '250 g') return Math.max(1, Math.round(base * 0.25));
        if (label === '500 g') return Math.max(1, Math.round(base * 0.5));
      }
      return base;
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(18,25,16,.55);z-index:700;display:flex;align-items:center;justify-content:center;padding:14px';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:18px;max-width:440px;width:100%;max-height:88vh;overflow:auto;padding:18px;box-shadow:0 18px 50px rgba(18,25,16,.35)';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    const head = document.createElement('strong');
    head.style.cssText = 'font-size:1.05rem;display:block';
    head.textContent = `⚖ ${product.title}`;
    const sub = document.createElement('div');
    sub.style.cssText = 'color:#5b6b55;font-size:.85rem;margin:4px 0 12px';
    sub.textContent = `Tick every quantity customers can order. Prices auto-fill from ₹${base} — you can edit each one.`;
    panel.append(head, sub);

    let auto = !ex;
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'button small';
    autoBtn.style.cssText = 'display:block;width:100%;margin-bottom:12px';
    const autoText = isLeafy ? '⚡ Auto — 1 + 2 + 3 bunch' : (autoUnit === '1 kg' ? '⚡ Auto — 250 g + 500 g + 1 kg' : `⚡ Auto — ${autoUnit}`);
    const syncAutoBtn = () => {
      autoBtn.textContent = auto ? `${autoText}  ✓ on` : autoText;
      autoBtn.style.background = auto ? '#e3f2e1' : '';
      autoBtn.style.borderColor = auto ? '#1e4620' : '';
    };
    autoBtn.addEventListener('click', () => {
      auto = true;
      for (const r of rows) {
        r.cb.checked = ladder.includes(r.q.label);
        r.dirty = false;
        r.price.value = r.cb.checked ? autoPrice(r.q.label) : '';
        r.price.style.display = r.cb.checked ? '' : 'none';
      }
      syncAutoBtn(); syncSummary();
    });
    panel.appendChild(autoBtn);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px';
    panel.appendChild(grid);

    /* standard quantities + any custom labels already pinned on the product */
    const defs = QUANTITIES.slice();
    for (const v of (ex || [])) if (!defs.some(q => q.label === v.label)) defs.push({ id: v.id, label: v.label, custom: true });

    const rows = defs.map(q => {
      const row = document.createElement('label');
      row.style.cssText = 'border:1px solid #dde7d8;border-radius:12px;padding:8px;display:flex;align-items:center;gap:7px;cursor:pointer;font-size:.88rem;background:#fbfdfa';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.style.cssText = 'accent-color:#1e4620;width:17px;height:17px;flex:none';
      const name = document.createElement('span');
      name.textContent = q.label;
      name.style.cssText = 'flex:1';
      const price = document.createElement('input');
      price.type = 'number';
      price.min = '1';
      price.step = '0.5';
      price.placeholder = '₹';
      price.setAttribute('aria-label', `Price for ${q.label}`);
      price.style.cssText = 'width:62px;padding:4px 5px;border:1px solid #cbd8c5;border-radius:8px;font-size:.82rem;font-family:inherit';
      row.append(cb, name, price);
      grid.appendChild(row);
      return { q, cb, price, dirty: false };
    });

    /* recompute auto prices for untouched rows (largest ticked weight = base;
       bunches follow the site's bunch math — a bunch is a quarter of base) */
    const syncPrices = () => {
      const checked = rows.filter(r => r.cb.checked);
      const grams = checked.map(r => r.q.grams).filter(Boolean);
      const gMax = grams.length ? Math.max(...grams) : 0;
      for (const r of rows) {
        if (!r.cb.checked || r.dirty) continue;
        if (r.q.grams) r.price.value = Math.max(1, Math.round(base * (r.q.grams / (gMax || r.q.grams))));
        else if (r.q.bunch) r.price.value = Math.max(5, Math.ceil(base * 0.25)) * r.q.count;
        else if (r.q.count) r.price.value = Math.max(1, Math.round(base * r.q.count));
        else r.price.value = Math.max(1, Math.round(base));
      }
    };
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:.85rem;color:#2c382b;border-top:1px solid #eef2ec;padding-top:10px;margin-bottom:12px;min-height:20px';
    panel.appendChild(summary);
    const syncSummary = () => {
      if (auto) { summary.textContent = 'Customers see (auto): ' + ladder.map(l => `${l} ₹${autoPrice(l)}`).join(' · '); return; }
      const on = rows.filter(r => r.cb.checked);
      summary.textContent = on.length
        ? 'Customers see: ' + on.map(r => `${r.q.label} ₹${r.price.value || '?'}`).join(' · ')
        : 'Nothing ticked — tick at least one quantity, or use Auto';
    };

    for (const r of rows) {
      r.cb.addEventListener('change', () => {
        if (r.cb.checked && rows.filter(x => x.cb.checked).length > 8) {
          r.cb.checked = false;
          RFS.toast('Up to 8 quantities per product', 'error');
          return;
        }
        auto = false;
        syncAutoBtn();
        r.price.style.display = r.cb.checked ? '' : 'none';
        syncPrices();
        syncSummary();
      });
      r.price.addEventListener('input', () => { r.dirty = true; syncSummary(); });
    }

    /* initial state: pinned quantities, or the auto ladder pre-ticked */
    if (ex) {
      for (const r of rows) {
        const v = ex.find(x => x.label === r.q.label);
        if (v) {
          r.cb.checked = true;
          r.price.value = Math.round(Number(v.priceInr) * 100) / 100;
          r.dirty = true; /* pinned prices are deliberate — never auto-overwrite */
        }
      }
    } else {
      for (const r of rows) if (ladder.includes(r.q.label)) { r.cb.checked = true; r.price.value = autoPrice(r.q.label); }
    }
    for (const r of rows) if (!r.cb.checked) r.price.style.display = 'none';
    syncAutoBtn();
    syncSummary();

    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'button ghost small';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', close);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'button small';
    saveBtn.style.background = 'linear-gradient(135deg,#2e7d32,#1e4620)';
    saveBtn.style.color = '#fff';
    saveBtn.textContent = '✓ Save quantities';
    saveBtn.addEventListener('click', async () => {
      let patch;
      if (auto) {
        patch = { unitLabel: autoUnit, variants: null };
      } else {
        const on = rows.filter(r => r.cb.checked);
        if (!on.length) { RFS.toast('Tick at least one quantity (or use Auto)', 'error'); return; }
        /* default = largest weight; else the smallest count; else first */
        const withG = on.filter(r => r.q.grams);
        const top = withG.length
          ? withG.reduce((a, b) => (b.q.grams > a.q.grams ? b : a))
          : (on.some(r => r.q.count) ? on.filter(r => r.q.count).reduce((a, b) => (b.q.count < a.q.count ? b : a)) : on[0]);
        patch = {
          unitLabel: top.q.label,
          variants: on.map(r => ({ id: r.q.id, label: r.q.label, priceInr: Math.max(1, Math.round((Number(r.price.value) || 1) * 100) / 100), default: r === top }))
        };
      }
      RFS.setBusy(saveBtn, true, 'Saving…');
      try {
        await api(`/api/admin/products/${encodeURIComponent(product.handle)}`, { method: 'PATCH', body: JSON.stringify(patch) });
        RFS.toast(`${product.title}: ${auto ? 'auto sizes' : patch.variants.map(v => v.label).join(' + ')}`, 'success');
        close();
        await renderProducts();
        refreshDashboard();
      } catch (error) {
        RFS.toast(error.message, 'error');
        RFS.setBusy(saveBtn, false);
      }
    });
    foot.append(cancelBtn, saveBtn);
    panel.appendChild(foot);
  }


  /* ============ ➕✏️ Product add/edit editor ============ */

  const editorState = { photoFile: null, editingHandle: '' };

  function openProductEditor(product = null) {
    const form = $('[data-product-form]');
    form.hidden = false;
    form.reset();
    editorState.photoFile = null;
    editorState.editingHandle = product?.handle || '';
    const set = (name, value) => { form.querySelector(`[name="${name}"]`).value = value ?? ''; };
    if (product) {
      set('handle', product.handle);
      set('title', product.title);
      set('category', product.category);
      set('priceInr', product.priceInr);
      set('compareAtInr', product.compareAtInr || '');
      set('unitLabel', product.unitLabel);
      set('stock', product.stock);
      set('description', product.description || '');
      form.querySelector('[name="featured"]').checked = Boolean(product.featured);
      $('[data-editor-save]').textContent = '💾 Save changes';
      $('[data-editor-hint]').textContent = `Editing ${product.handle}`;
      const preview = $('[data-editor-preview]');
      preview.hidden = false;
      preview.src = product.image || '/assets/brand/basket.jpg';
      $('[data-editor-photo-note]').textContent = 'Keeping current photo';
    } else {
      set('handle', '');
      $('[data-editor-save]').textContent = '➕ Add product';
      $('[data-editor-hint]').textContent = '';
      $('[data-editor-preview]').hidden = true;
      $('[data-editor-photo-note]').textContent = 'No photo yet — a basket image is used';
    }
    // category suggestions from the live catalog
    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))];
    $('#categoryList').innerHTML = categories.map(c => `<option value="${String(c).replace(/"/g, '&quot;')}">`).join('');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('[name="title"]').focus();
  }

  function closeProductEditor() {
    const form = $('[data-product-form]');
    form.hidden = true;
    form.reset();
    editorState.photoFile = null;
    editorState.editingHandle = '';
  }

  document.querySelector('[data-open-editor]')?.addEventListener('click', () => openProductEditor());
  document.querySelector('[data-editor-cancel]')?.addEventListener('click', closeProductEditor);
  document.querySelector('[data-editor-photo-btn]')?.addEventListener('click', () => document.querySelector('[data-editor-photo]')?.click());
  document.querySelector('[data-editor-photo]')?.addEventListener('change', event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    editorState.photoFile = file;
    const preview = $('[data-editor-preview]');
    preview.hidden = false;
    preview.src = URL.createObjectURL(file);
    $('[data-editor-photo-note]').textContent = `📷 ${file.name.slice(0, 28)} — will upload on save`;
  });

  document.querySelector('[data-product-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('[data-editor-save]');
    const data = Object.fromEntries(new FormData(form).entries());
    if (!String(data.title || '').trim()) return RFS.toast('Enter a title', 'error');
    const payload = {
      title: String(data.title).trim(),
      category: String(data.category || 'Seasonal').trim() || 'Seasonal',
      priceInr: Number(data.priceInr),
      stock: Math.max(0, Math.round(Number(data.stock) || 0)),
      unitLabel: String(data.unitLabel || '1 kg').trim() || '1 kg',
      description: String(data.description || '').trim(),
      compareAtInr: Number(data.compareAtInr) || 0,
      featured: form.querySelector('[name="featured"]').checked
    };
    if (!Number.isFinite(payload.priceInr) || payload.priceInr < 0) return RFS.toast('Enter a valid price', 'error');
    RFS.setBusy(button, true, editorState.editingHandle ? 'Saving…' : 'Adding…');
    try {
      let handle;
      if (editorState.editingHandle) {
        await api(`/api/admin/products/${encodeURIComponent(editorState.editingHandle)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        handle = editorState.editingHandle;
        RFS.toast(`${payload.title} updated`, 'success');
      } else {
        const created = await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
        handle = created.product.handle;
        RFS.toast(`${payload.title} added — live on the store now 🎉`, 'success');
      }
      if (editorState.photoFile) {
        try {
          const dataUrl = await compressImage(editorState.photoFile, 1000, 0.82);
          await api(`/api/admin/products/${encodeURIComponent(handle)}/photo`, { method: 'POST', body: JSON.stringify({ imageDataUrl: dataUrl }) });
          RFS.toast('📸 Photo uploaded', 'success');
        } catch (error) { RFS.toast(`Photo failed: ${error.message}`, 'error'); }
      }
      closeProductEditor();
      await renderProducts();
      refreshDashboard();
      renderLowStock();
    } catch (error) {
      RFS.toast(error.message, 'error');
    } finally {
      RFS.setBusy(button, false);
    }
  });

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
  /* ============ COD cash reconciliation panel ============ */

  async function renderCashPanel() {
    const panel = $('[data-cash-panel]');
    if (!panel) return;
    let data;
    try { data = await api('/api/admin/cash'); } catch { return; }
    const s = data.summary;
    const rowsHtml = s.partners.filter(p => p.collectedInr > 0 || p.receivedInr > 0).map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.orderCount}</td>
        <td><strong>${RFS.money(p.collectedInr)}</strong></td>
        <td>${RFS.money(p.receivedInr)}</td>
        <td><strong class="${p.pendingInr > 0 ? 'cash-pending' : ''}">${RFS.money(p.pendingInr)}</strong></td>
        <td>${p.pendingInr > 0 ? `<button class="button orange small" type="button" data-cash-received="${p.partnerId}" data-amount="${p.pendingInr}">✅ Received</button>` : '<span class="badge green">settled</span>'}</td>
      </tr>`).join('');
    panel.innerHTML = `
      <div class="section-head" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
        <div><h2 style="margin-bottom:4px">💵 COD cash — ${s.date}</h2><p class="section-subtitle" style="font-size:.92rem">Cash partners collected today. Mark received when they hand the money over.</p></div>
        <div style="text-align:right"><strong style="font-size:1.15rem">${RFS.money(s.totals.collectedInr)}</strong><br><small style="color:var(--muted)">collected · ${RFS.money(s.totals.pendingInr)} pending</small></div>
      </div>
      ${rowsHtml ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Partner</th><th>COD orders</th><th>Collected</th><th>Received</th><th>Pending</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>` : '<div class="empty-state" style="padding:14px"><p>No COD deliveries today yet.</p></div>'}`;
    panel.querySelectorAll('[data-cash-received]').forEach(btn => btn.addEventListener('click', async () => {
      const partner = s.partners.find(p => p.partnerId === btn.dataset.cashReceived);
      const amount = window.prompt(`How much cash did ${partner?.name || 'the partner'} hand over? (₹)`, btn.dataset.amount || '');
      if (amount === null) return;
      try {
        await api('/api/admin/cash/received', { method: 'POST', body: JSON.stringify({ partnerId: btn.dataset.cashReceived, amount: Number(amount) }) });
        RFS.toast('💵 Cash marked as received', 'success');
        renderCashPanel();
      } catch (error) { RFS.toast(error.message || 'Could not record cash', 'error'); }
    }));
  }

  /* ============ Review moderation ============ */

  async function renderReviewsPanel() {
    const panel = $('[data-reviews-panel]');
    if (!panel) return;
    let data;
    try { data = await api('/api/admin/reviews'); } catch { return; }
    const reviews = data.reviews || [];
    const pending = reviews.filter(r => !r.approved);
    const approved = reviews.filter(r => r.approved);
    if (!reviews.length) { panel.innerHTML = '<p style="color:var(--muted);margin:0">⭐ No customer reviews yet — they can review from the Track page after delivery.</p>'; return; }
    const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    panel.innerHTML = `
      <div class="section-head" style="margin-bottom:10px"><h3 style="margin:0">⭐ Reviews — ${pending.length} waiting</h3><small style="color:var(--muted)">${approved.length} approved</small></div>
      ${pending.length ? `<div class="review-admin-list">${pending.map(r => `
        <div class="review-admin-row">
          <div><strong>${r.name}</strong> <span class="review-stars">${stars(r.rating)}</span> <small style="color:var(--muted)">· ${r.orderId}</small><br><span>${String(r.text || '(no text)').replace(/</g, '&lt;')}</span></div>
          <div style="display:flex;gap:6px;flex-shrink:0"><button class="button primary small" type="button" data-review-approve="${r.id}">✅ Approve</button><button class="button ghost small" type="button" data-review-delete="${r.id}">🗑 Delete</button></div>
        </div>`).join('')}</div>` : '<p style="color:var(--muted);margin:0 0 8px">No pending reviews — all caught up ✅</p>'}`;
    panel.querySelectorAll('[data-review-approve]').forEach(btn => btn.addEventListener('click', async () => {
      try { await api(`/api/admin/reviews/${encodeURIComponent(btn.dataset.reviewApprove)}/approve`, { method: 'POST', body: JSON.stringify({ approved: true }) }); RFS.toast('Review approved — now shown on the product page', 'success'); renderReviewsPanel(); } catch (e) { RFS.toast(e.message || 'Failed', 'error'); }
    }));
    panel.querySelectorAll('[data-review-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this review permanently?')) return;
      try { await api(`/api/admin/reviews/${encodeURIComponent(btn.dataset.reviewDelete)}`, { method: 'DELETE' }); RFS.toast('Review deleted'); renderReviewsPanel(); } catch (e) { RFS.toast(e.message || 'Failed', 'error'); }
    }));
  }

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

  /* ---------- Cashfree payment gateway keys ---------- */
  document.querySelector('[data-cf-save]')?.addEventListener('click', async () => {
    const status = document.querySelector('[data-cf-save-status]');
    const appId = (document.querySelector('[data-settings-form] [name="cfAppId"]')?.value || '').trim();
    const secretKey = (document.querySelector('[data-settings-form] [name="cfSecretKey"]')?.value || '').trim();
    const mode = document.querySelector('[data-settings-form] [name="cfMode"]')?.value || 'test';
    if (!appId || !secretKey) { if (status) status.textContent = '⚠️ Enter both App ID and Secret Key.'; return; }
    if (appId === '(saved — retype to change)') { if (status) status.textContent = '⚠️ Enter the real App ID.'; return; }
    if (status) status.textContent = 'Saving…';
    try {
      await api('/api/admin/cashfree', { method: 'POST', body: JSON.stringify({ appId, secretKey, mode }) });
      if (status) status.textContent = '✅ Keys saved.';
      document.querySelector('[data-settings-form] [name="cfSecretKey"]').value = '';
      await renderSettings();
    } catch (error) { if (status) status.textContent = '⚠️ ' + (error.message || 'Could not save'); }
  });

  document.querySelector('[data-cf-test]')?.addEventListener('click', async () => {
    const status = document.querySelector('[data-cf-save-status]');
    if (status) status.textContent = 'Testing keys against Cashfree…';
    try {
      const r = await api('/api/admin/cashfree/test', { method: 'POST', body: JSON.stringify({}) });
      if (status) status.textContent = '✅ ' + r.note;
    } catch (error) { if (status) status.textContent = '⚠️ ' + (error.message || 'Test failed'); }
  });

})();
