(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || '';
  const phone = params.get('phone') || '';
  const whatsapp = params.get('whatsapp') || '';
  const summary = document.querySelector('[data-order-summary]');

  function history(order) {
    const rows = (order.history || []).slice(-5).reverse();
    return rows.map(row => `
      <div class="track-row"><span class="track-dot">✓</span><div><strong>${row.status.replaceAll('_', ' ')}</strong><br><span>${new Date(row.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></div></div>
    `).join('');
  }

  async function load() {
    if (!id) {
      summary.innerHTML = '<div class="alert error">Order ID missing. Return to the basket and try again.</div>';
      return;
    }
    try {
      const data = await RFS.api(`/api/orders/${encodeURIComponent(id)}${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`);
      const order = data.order;
      const paymentState = params.get('payment') || '';
      const statusBadge = document.querySelector('[data-status-badge]');
      const titleNode = document.querySelector('[data-success-title]');
      if (paymentState === 'paid') {
        if (statusBadge) { statusBadge.textContent = 'Payment verified'; statusBadge.className = 'badge green'; }
        if (titleNode) titleNode.textContent = 'Payment received. Your vegetables are locked.';
      } else if (paymentState === 'failed' || order.paymentStatus === 'FAILED') {
        if (statusBadge) { statusBadge.textContent = 'Payment not completed'; statusBadge.className = 'badge orange'; }
        if (titleNode) titleNode.textContent = 'Payment was not completed.';
      } else if (order.paymentMethod === 'online' && order.paymentStatus === 'PENDING') {
        if (statusBadge) { statusBadge.textContent = 'Payment pending'; statusBadge.className = 'badge orange'; }
        if (titleNode) titleNode.textContent = 'We are waiting for payment verification.';
      }
      document.querySelector('[data-order-id]').textContent = order.id;
      document.querySelector('[data-order-copy]').textContent = `${RFS.money(order.totalInr)} · ${order.slot?.label || 'Morning delivery'} · ${order.deliveryDate?.label || ''}`;
      const items = order.items.map(item => `
        <div class="order-mini"><img src="${item.image}" alt="${item.title}"><div><strong>${item.title}</strong><br><span>${item.qty} × ${item.unitLabel}</span></div><div class="price">${RFS.money(item.lineTotalInr)}</div></div>
      `).join('');
      summary.innerHTML = `
        <div class="order-mini-list">${items}</div>
        <div class="summary-row"><span>Product amount</span><strong>${RFS.money(order.subtotalInr)}</strong></div>
        <div class="summary-row"><span>Delivery (${Number(order.distanceKm || 0).toFixed(2)} road km)</span><strong>${RFS.money(order.deliveryFeeInr)}</strong></div>
        <div class="summary-total"><span>Total</span><strong>${RFS.money(order.totalInr)}</strong></div>
        <div class="track-list">${history(order)}</div>
      `;
      const wa = document.querySelector('[data-whatsapp-link]');
      if (wa && whatsapp) wa.href = whatsapp;
      else wa?.remove();
    } catch (error) {
      summary.innerHTML = `<div class="alert error">${error.message}</div>`;
    }
  }
  RFS.syncCartUI([]);
  load();
})();
