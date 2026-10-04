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

  /* ---------- /login — OTP tab (shown only when SMS delivery is configured) ---------- */
  const otpForm = document.querySelector('[data-otp-form]');
  if (otpForm && loginForm) {
    const tabs = document.querySelector('[data-auth-tabs]');
    const pwBtn = document.querySelector('[data-tab-btn="password"]');
    const otpBtn = document.querySelector('[data-tab-btn="otp"]');
    const step1 = otpForm.querySelector('[data-otp-step1]');
    const step2 = otpForm.querySelector('[data-otp-step2]');
    const phoneInput = otpForm.querySelector('#otpPhone');
    const codeInput = otpForm.querySelector('#otpCode');
    const sendBtn = otpForm.querySelector('[data-otp-send]');
    const verifyBtn = otpForm.querySelector('[data-otp-verify]');
    const sentNote = otpForm.querySelector('[data-otp-sentto]');
    const resendLink = otpForm.querySelector('[data-otp-resend]');
    const changeLink = otpForm.querySelector('[data-otp-change]');
    let resendTimer = null;

    function switchTab(which) {
      clearError();
      pwBtn.classList.toggle('active', which === 'password');
      otpBtn.classList.toggle('active', which === 'otp');
      loginForm.hidden = which !== 'password';
      otpForm.hidden = which !== 'otp';
    }
    if (pwBtn) pwBtn.addEventListener('click', () => switchTab('password'));

    fetch('/api/auth/otp/available').then(r => r.json()).then(d => {
      if (d && d.enabled) { tabs.hidden = false; otpBtn.addEventListener('click', () => switchTab('otp')); }
    }).catch(() => {});

    function maskPhone(p) { return p ? `${p.slice(0, 2)}xxxxxx${p.slice(-2)}` : ''; }
    function startResendCountdown() {
      if (resendTimer) clearInterval(resendTimer);
      resendLink.style.pointerEvents = 'none';
      let left = 60;
      resendLink.textContent = `Resend in ${left}s`;
      resendTimer = setInterval(() => {
        left -= 1;
        if (left <= 0) { clearInterval(resendTimer); resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code'; }
        else resendLink.textContent = `Resend in ${left}s`;
      }, 1000);
    }

    async function sendCode() {
      clearError();
      const phone = phoneInput.value.replace(/\D/g, '');
      if (phone.length !== 10 || !/^[6-9]/.test(phone)) return showError('Enter a valid 10-digit Indian mobile number.');
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      try {
        const data = await post('/api/auth/otp/request', { phone });
        otpForm.dataset.phone = phone;
        step1.hidden = true; step2.hidden = false;
        sentNote.textContent = `Code sent to ${maskPhone(phone)} · valid 10 minutes`;
        codeInput.value = data.devCode || '';   // devCode only exists on the dev sender
        codeInput.focus();
        startResendCountdown();
      } catch (error) {
        showError(error.message);
        if (/no account with this number/i.test(error.message)) {
          setTimeout(() => { location.href = `/signup?phone=${phone}`; }, 1500);
        }
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = 'Send code by SMS';
      }
    }
    sendBtn.addEventListener('click', sendCode);
    resendLink.addEventListener('click', event => { event.preventDefault(); if (resendLink.style.pointerEvents !== 'none') sendCode(); });
    changeLink.addEventListener('click', event => {
      event.preventDefault();
      if (resendTimer) clearInterval(resendTimer);
      resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code';
      step2.hidden = true; step1.hidden = false; codeInput.value = ''; clearError(); phoneInput.focus();
    });

    otpForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const phone = otpForm.dataset.phone || '';
      const code = codeInput.value.replace(/\D/g, '');
      if (code.length !== 6) return showError('Enter the 6-digit code from the SMS.');
      verifyBtn.disabled = true; verifyBtn.textContent = 'Checking…';
      try {
        await post('/api/auth/otp/verify', { phone, code });
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        verifyBtn.disabled = false; verifyBtn.textContent = 'Verify & sign in';
      }
    });
  }

  /* ---------- /signup ---------- */
  const signupForm = document.querySelector('[data-signup-form]');
  if (signupForm) {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.customer) location.replace('/account'); }).catch(() => {});
    // arriving from OTP login with an unknown number? phone is prefilled
    const prefill = new URLSearchParams(location.search).get('phone');
    if (prefill && /^\d{10}$/.test(prefill)) {
      signupForm.phone.value = prefill;
      const note = document.createElement('p');
      note.className = 'otp-note';
      note.textContent = `No account exists for ${prefill.slice(0, 2)}xxxxxx${prefill.slice(-2)} yet — create one below.`;
      signupForm.prepend(note);
    }
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
