/* Rebesta Fresh — login / signup / account pages (optional accounts, shop never requires them) */
(() => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const errBox = document.querySelector('[data-auth-error]');

  function showError(message) {
    if (!errBox) return;
    errBox.textContent = message;
    errBox.hidden = false;
  }
  function clearError() { if (errBox) errBox.hidden = true; }

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'Something went wrong. Please try again.' }));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  /* ---------- /login ---------- */
  const loginForm = document.querySelector('[data-login-form]');
  if (loginForm) {
    // already signed in? straight to the account
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.customer) location.replace('/account'); }).catch(() => {});
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const btn = loginForm.querySelector('[data-login-submit]');
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        await post('/api/auth/login', {
          phone: loginForm.phone.value.trim(),
          password: loginForm.password.value
        });
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    });
  }

  /* ---------- /signup ---------- */
  const signupForm = document.querySelector('[data-signup-form]');
  if (signupForm) {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.customer) location.replace('/account'); }).catch(() => {});
    signupForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const phone = signupForm.phone.value.replace(/\D/g, '');
      if (phone.length !== 10) return showError('Enter a valid 10-digit Indian mobile number.');
      if (signupForm.password.value.length < 6) return showError('Password must be at least 6 characters.');
      const btn = signupForm.querySelector('[data-signup-submit]');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        await post('/api/auth/signup', {
          name: signupForm.name.value.trim(),
          phone,
          password: signupForm.password.value
        });
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        btn.disabled = false; btn.textContent = 'Create account';
      }
    });
  }

  /* ---------- /account ---------- */
  const view = document.querySelector('[data-account-view]');
  if (view) (async () => {
    try {
      const me = await (await fetch('/api/auth/me')).json();
      if (!me.customer) {
        document.querySelector('[data-account-signedout]').hidden = false;
        return;
      }
      view.hidden = false;
      const c = me.customer;
      document.querySelector('[data-account-name]').textContent = c.name;
      document.querySelector('[data-account-avatar]').textContent = (c.name || 'R').trim().charAt(0).toUpperCase();
      const since = c.createdAt ? new Date(c.createdAt) : null;
      document.querySelector('[data-account-meta]').textContent =
        `${c.phone} · with Rebesta since ${since ? since.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'today'}`;

      document.querySelector('[data-logout]')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        location.href = '/';
      });

      const list = document.querySelector('[data-orders-list]');
      const empty = document.querySelector('[data-orders-empty]');
      try {
        const data = await (await fetch('/api/auth/orders')).json();
        const orders = (data.orders || []).sort((a, b) => String(b.placedAt || '').localeCompare(String(a.placedAt || '')));
        if (!orders.length) { empty.hidden = false; return; }
        for (const order of orders) list.appendChild(orderCard(order));
      } catch { empty.hidden = false; }
    } catch {
      document.querySelector('[data-account-signedout]').hidden = false;
    }
  })();

  function orderCard(order) {
    const el = document.createElement('a');
    el.className = 'account-order';
    el.href = `/track?id=${encodeURIComponent(order.id)}`;
    const status = String(order.status || '').replace(/_/g, ' ').toLowerCase();
    const state = /deliver/.test(status) ? 'green' : /cancel/.test(status) ? 'gray' : 'orange';
    const when = order.placedAt ? new Date(order.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
    el.innerHTML = `
      <div class="ao-main">
        <strong>${order.itemCount} item${order.itemCount === 1 ? '' : 's'} · ₹${Number(order.totalInr || 0).toLocaleString('en-IN')}</strong>
        <span>${when}${order.slot?.label ? ' · ' + order.slot.label : ''}</span>
      </div>
      <div class="ao-side">
        <span class="badge ${state}">${status || 'order'}</span>
        <span class="ao-id">${order.id}</span>
      </div>`;
    return el;
  }
})();
