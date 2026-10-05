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

  /* ---------- /login — OTP tab (shown when SMS delivery is configured) ---------- */
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
    let mode = null;          // 'widget' (MSG91 SDK) | 'api' (server-side send)
    let widgetPhone = null;   // phone currently verified via widget

    function switchTab(which) {
      clearError();
      pwBtn.classList.toggle('active', which === 'password');
      otpBtn.classList.toggle('active', which === 'otp');
      loginForm.hidden = which !== 'password';
      otpForm.hidden = which !== 'otp';
    }
    if (pwBtn) pwBtn.addEventListener('click', () => switchTab('password'));

    fetch('/api/auth/otp/available').then(r => r.json()).then(d => {
      if (d && d.enabled) {
        mode = d.mode === 'widget' ? 'widget' : 'api';
        tabs.hidden = false;
        otpBtn.addEventListener('click', () => switchTab('otp'));
      }
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

    /* find a JWT-looking string anywhere in the widget response */
    function extractToken(data, depth) {
      depth = depth || 0;
      if (data == null || depth > 4) return null;
      if (typeof data === 'string') return data.startsWith('eyJ') && data.includes('.') ? data : null;
      if (typeof data !== 'object') return null;
      for (const k of ['token', 'accessToken', 'access_token', 'jwt', 'access-token']) {
        if (typeof data[k] === 'string' && data[k].startsWith('eyJ')) return data[k];
      }
      for (const v of Object.values(data)) {
        const found = extractToken(v, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const widgetError = e => (e && (e.message || e.error || e.msg)) || (typeof e === 'string' ? e : null) || 'Something went wrong. Please try again.';

    function sendCode() {
      clearError();
      const phone = phoneInput.value.replace(/\D/g, '');
      if (phone.length !== 10 || !/^[6-9]/.test(phone)) return showError('Enter a valid 10-digit Indian mobile number.');
      if (mode === 'widget') {
        if (typeof window.sendOtp !== 'function') return showError('OTP system is still loading — wait a few seconds and try again.');
        if (typeof window.isCaptchaVerified === 'function' && !window.isCaptchaVerified()) return showError('Please complete the security check first.');
        sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
        window.sendOtp('91' + phone,
          () => {
            widgetPhone = phone;
            step1.hidden = true; step2.hidden = false;
            sentNote.textContent = `Code sent to ${maskPhone(phone)} · valid 15 minutes`;
            codeInput.value = ''; codeInput.focus();
            startResendCountdown();
            sendBtn.disabled = false; sendBtn.textContent = 'Send code by SMS';
          },
          e => { showError(widgetError(e)); sendBtn.disabled = false; sendBtn.textContent = 'Send code by SMS'; }
        );
        return;
      }
      // api mode (dev / server-side send)
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      post('/api/auth/otp/request', { phone }).then(data => {
        otpForm.dataset.phone = phone;
        step1.hidden = true; step2.hidden = false;
        sentNote.textContent = `Code sent to ${maskPhone(phone)} · valid 10 minutes`;
        codeInput.value = data.devCode || '';
        codeInput.focus();
        startResendCountdown();
      }).catch(error => {
        showError(error.message);
        if (/no account with this number/i.test(error.message)) setTimeout(() => { location.href = `/signup?phone=${phone}`; }, 1500);
      }).finally(() => { sendBtn.disabled = false; sendBtn.textContent = 'Send code by SMS'; });
    }
    sendBtn.addEventListener('click', sendCode);
    resendLink.addEventListener('click', event => {
      event.preventDefault();
      if (resendLink.style.pointerEvents === 'none') return;
      clearError();
      if (mode === 'widget') {
        if (typeof window.retryOtp !== 'function' || !widgetPhone) return showError('Please request a code first.');
        window.retryOtp(null, () => startResendCountdown(), e => showError(widgetError(e)));
      } else sendCode();
    });
    changeLink.addEventListener('click', event => {
      event.preventDefault();
      if (resendTimer) clearInterval(resendTimer);
      resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code';
      step2.hidden = true; step1.hidden = false; codeInput.value = ''; widgetPhone = null; clearError(); phoneInput.focus();
    });

    otpForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const code = codeInput.value.replace(/\D/g, '');
      if (code.length < 4 || code.length > 8) return showError('Enter the code from the SMS.');
      verifyBtn.disabled = true; verifyBtn.textContent = 'Checking…';
      try {
        if (mode === 'widget') {
          const token = await new Promise((resolve, reject) => {
            window.verifyOtp(code,
              data => { const t = extractToken(data); t ? resolve(t) : reject(new Error('Verification response was incomplete — please try again.')); },
              e => reject(new Error(widgetError(e)))
            );
          });
          const phone = widgetPhone;
          if (!phone) throw new Error('Please request a code first.');
          await post('/api/auth/otp/widget', { phone, token });
        } else {
          await post('/api/auth/otp/verify', { phone: otpForm.dataset.phone || '', code });
        }
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
