/* Rebesta Fresh — customer weekly subscription manager */
(() => {
  const $ = sel => document.querySelector(sel);
  const state = { phone: '' };

  function toast(message, kind = 'info') {
    const el = $('#toast');
    el.hidden = false;
    el.innerHTML = `<div class="alert ${kind}" style="margin:0">${message}</div>`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 4000);
  }

  const money = v => `₹${Number(v || 0) % 1 === 0 ? Number(v || 0) : Number(v || 0).toFixed(2)}`;
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function card(sub) {
    const statusChip = sub.status === 'ACTIVE'
      ? '<span class="badge green">active</span>'
      : sub.status === 'PAUSED'
        ? '<span class="badge orange">paused</span>'
        : '<span class="badge gray">cancelled</span>';
    const actions = sub.status === 'ACTIVE'
      ? `<button class="button ghost small" type="button" data-sub="pause:${sub.id}">⏸ Pause</button>
         <button class="button danger small" type="button" data-sub="cancel:${sub.id}">Cancel</button>`
      : sub.status === 'PAUSED'
        ? `<button class="button primary small" type="button" data-sub="resume:${sub.id}">▶ Resume</button>
           <button class="button danger small" type="button" data-sub="cancel:${sub.id}">Cancel</button>`
        : '';
    return `
      <div class="sub-card ${sub.status === 'ACTIVE' ? '' : 'inactive'}">
        <div class="sub-card-top">
          <strong>🥬 Weekly basket</strong> ${statusChip}
        </div>
        <div class="sub-card-row">📅 Every <strong>${sub.weekdayLabel || WEEKDAYS[sub.weekday]}</strong>${sub.status === 'ACTIVE' ? ` · next delivery <strong>${sub.nextRunOn}</strong>` : ''}</div>
        <div class="sub-card-row">🧺 ${sub.itemCount} items · morning slot ${sub.slotId === 'am1' ? '7–9 AM' : sub.slotId === 'am2' ? '9–11 AM' : sub.slotId || ''}</div>
        <div class="sub-card-row">📍 ${[sub.address?.line1, sub.address?.area, sub.address?.city].filter(Boolean).join(', ') || 'Saved address'}</div>
        ${sub.pauseReason && sub.status === 'PAUSED' ? `<div class="sub-card-note">⚠️ ${sub.pauseReason}</div>` : ''}
        ${sub.status === 'ACTIVE' ? '<div class="sub-card-note">An order is created automatically the day before each delivery — you pay on delivery as usual.</div>' : ''}
        <div class="sub-card-actions">${actions}</div>
      </div>`;
  }

  async function load(phone) {
    const wrap = $('[data-sub-list]');
    wrap.innerHTML = '<div class="alert info">Loading…</div>';
    try {
      const data = await RFS.api(`/api/subscriptions?phone=${encodeURIComponent(phone)}`);
      if (!data.subscriptions?.length) {
        wrap.innerHTML = `<div class="empty-state"><h3>No subscriptions on this number</h3><p>Tick <strong>“🔁 Make it a weekly order”</strong> at checkout next time and your basket repeats automatically every week.</p></div>`;
        return;
      }
      wrap.innerHTML = data.subscriptions.map(card).join('');
    } catch (error) {
      wrap.innerHTML = `<div class="alert error">${error.message}</div>`;
    }
  }

  $('[data-sub-lookup]').addEventListener('submit', event => {
    event.preventDefault();
    const phone = String(new FormData(event.currentTarget).get('phone') || '').replace(/\D/g, '');
    if (phone.length !== 10) return toast('Enter your 10-digit mobile number', 'error');
    state.phone = phone;
    load(phone);
  });

  document.addEventListener('click', async event => {
    const btn = event.target.closest('[data-sub]');
    if (!btn) return;
    const [action, id] = btn.dataset.sub.split(':');
    btn.disabled = true;
    try {
      const data = await RFS.api(`/api/subscriptions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ phone: state.phone, action }) });
      toast(action === 'cancel' ? 'Subscription cancelled' : action === 'pause' ? 'Subscription paused — no order next week' : 'Subscription resumed 🥬', 'success');
      await load(state.phone);
    } catch (error) {
      toast(error.message, 'error');
      btn.disabled = false;
    }
  });

  const prefill = new URLSearchParams(location.search).get('phone');
  if (prefill) {
    $('#subPhone').value = prefill.replace(/\D/g, '').slice(-10);
    $('[data-sub-lookup]').requestSubmit();
  }
})();
