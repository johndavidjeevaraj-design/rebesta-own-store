/* Rebesta Fresh — one-page auth (number → SMS code → sign in or create account), account page */
(() => {
  const errBox = document.querySelector('[data-auth-error]');

  function showError(message) {
    if (!errBox) return;
    errBox.textContent = message;
    errBox.hidden = false;
    errBox.classList.remove('shake');
    void errBox.offsetWidth;           // restart the shake animation
    errBox.classList.add('shake');
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

  function busy(btn, on) { if (!btn) return; btn.classList.toggle('is-loading', !!on); btn.disabled = !!on; }

  function prettyPhone(p) { return p ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : ''; }

  /* ---------- success overlay (animated check + confetti) ---------- */
  const successEl = document.querySelector('[data-auth-success]');
  function showSuccess(title, sub) {
    return new Promise(resolve => {
      if (!successEl) return resolve();
      successEl.querySelector('[data-success-title]').textContent = title;
      successEl.querySelector('[data-success-sub]').textContent = sub;
      const wrap = successEl.querySelector('.as-confetti');
      if (wrap && !wrap.childElementCount) {
        const colors = ['#0d8736', '#0faa46', '#ff8b3d', '#ffd582', '#e23a2e'];
        for (let i = 0; i < 14; i++) {
          const s = document.createElement('i');
          const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
          const dist = 70 + Math.random() * 55;
          s.style.setProperty('--tx', `${Math.cos(ang) * dist}px`);
          s.style.setProperty('--ty', `${Math.sin(ang) * dist - 30}px`);
          s.style.setProperty('--rot', `${Math.round(Math.random() * 500 - 250)}deg`);
          s.style.setProperty('--cf', colors[i % colors.length]);
          s.style.animationDelay = `${(0.6 + Math.random() * 0.25).toFixed(2)}s`;
          wrap.appendChild(s);
        }
      }
      successEl.classList.add('show');
      setTimeout(resolve, 1100);
    });
  }

  /* ---------- password visibility toggles ---------- */
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-eye]');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.eye);
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.classList.toggle('revealed', reveal);
  });

  /* ---------- segmented OTP input boxes (auto-grow 4 → 8 digits) ---------- */
  function otpBoxes(wrap, { min = 4, max = 8 } = {}) {
    const inputs = [];
    function refresh() {
      inputs.forEach(i => i.classList.toggle('filled', !!i.value));
      wrap.dataset.count = inputs.length;
    }
    function setCount(n) {
      n = Math.max(min, Math.min(max, n));
      while (inputs.length < n) {
        const i = document.createElement('input');
        i.type = 'text'; i.inputMode = 'numeric'; i.autocomplete = inputs.length ? 'off' : 'one-time-code';
        i.maxLength = 1; i.className = 'otp-box'; i.setAttribute('aria-label', `digit ${inputs.length + 1}`);
        wrap.appendChild(i); inputs.push(i);
      }
      while (inputs.length > n) inputs.pop().remove();
      refresh();
    }
    const value = () => inputs.map(i => i.value).join('').replace(/\D/g, '');
    function fill(code) {
      code = String(code || '').replace(/\D/g, '').slice(0, max);
      setCount(Math.max(min, code.length));
      inputs.forEach((i, idx) => { i.value = code[idx] || ''; });
      refresh();
    }
    const focus = () => (inputs.find(i => !i.value) || inputs[0])?.focus();
    /* trailing empty boxes stay while typing (so longer codes can be entered),
       then settle back to the entered length once typing pauses */
    let settleTimer = null;
    function queueSettle() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const v = value();
        if (v.length >= min && v.length < inputs.length) {
          setCount(v.length);
          if (!inputs.includes(document.activeElement)) inputs[inputs.length - 1]?.focus();
        }
      }, 550);
    }
    wrap.addEventListener('input', e => {
      const idx = inputs.indexOf(e.target); if (idx < 0) return;
      e.target.value = e.target.value.replace(/\D/g, '').slice(-1);
      if (e.target.value && idx === inputs.length - 1 && inputs.length < max) {
        setCount(inputs.length + 1);
        inputs[idx + 1].focus();
      } else if (e.target.value && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
      refresh();
      queueSettle();
    });
    wrap.addEventListener('keydown', e => {
      const idx = inputs.indexOf(e.target); if (idx < 0) return;
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        e.preventDefault(); inputs[idx - 1].focus(); inputs[idx - 1].value = ''; refresh();
      } else if (e.key === 'ArrowLeft' && idx > 0) inputs[idx - 1].focus();
      else if (e.key === 'ArrowRight' && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    wrap.addEventListener('paste', e => {
      e.preventDefault();
      fill((e.clipboardData || window.clipboardData).getData('text') || '');
      focus();
    });
    wrap.addEventListener('focusout', e => {
      if (wrap.contains(e.relatedTarget)) return;   // still typing inside the boxes
      clearTimeout(settleTimer);
      const v = value();
      if (v.length >= min && v.length < inputs.length) setCount(v.length);
    });
    setCount(min);
    return { value, fill, focus };
  }

  /* ---------- MSG91 widget helpers ---------- */
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
  function widgetVerifyCode(code) {
    return new Promise((resolve, reject) => {
      if (typeof window.verifyOtp !== 'function') return reject(new Error('OTP system is still loading — wait a few seconds and try again.'));
      window.verifyOtp(code,
        data => { const t = extractToken(data); t ? resolve(t) : reject(new Error('Verification response was incomplete — please try again.')); },
        e => reject(new Error(widgetError(e)))
      );
    });
  }
  function resendCountdown(link, seconds = 60) {
    if (!link) return;
    if (link._timer) clearInterval(link._timer);
    link.style.pointerEvents = 'none';
    let left = seconds;
    link.textContent = `Resend in ${left}s`;
    link._timer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(link._timer); link.style.pointerEvents = ''; link.textContent = 'Resend code'; }
      else link.textContent = `Resend in ${left}s`;
    }, 1000);
  }

  /* ============================================================
     /login — ONE flow: number → code → (new number? name) → account
     ============================================================ */
  const otpForm = document.querySelector('[data-otp-form]');
  const pwForm = document.querySelector('[data-login-form]');

  if (otpForm || pwForm) {
    // already signed in? straight to the account
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.customer) location.replace('/account'); }).catch(() => {});

    const steps = {
      number: otpForm?.querySelector('[data-step="number"]'),
      code: otpForm?.querySelector('[data-step="code"]'),
      name: otpForm?.querySelector('[data-step="name"]')
    };
    const phoneInput = otpForm?.querySelector('#otpPhone');
    const sendBtn = otpForm?.querySelector('[data-otp-send]');
    const verifyBtn = otpForm?.querySelector('[data-otp-verify]');
    const createBtn = otpForm?.querySelector('[data-otp-create]');
    const sentNote = otpForm?.querySelector('[data-otp-sentto]');
    const newNote = otpForm?.querySelector('[data-otp-newto]');
    const resendLink = otpForm?.querySelector('[data-otp-resend]');
    const changeLink = otpForm?.querySelector('[data-otp-change]');
    const restartLink = otpForm?.querySelector('[data-otp-restart]');
    const nameInput = otpForm?.querySelector('#newName');
    const boxes = otpForm ? otpBoxes(otpForm.querySelector('[data-otp-boxes]')) : null;
    const pwToggle = document.querySelector('[data-pw-toggle]');
    const otpToggle = document.querySelector('[data-otp-toggle]');

    let widgetPhone = null;      // number currently being verified
    let verifiedSignupToken = null; // server-signed proof for the name step
    let otpReady = false;
    let currentStep = 'number';

    // arriving with ?phone= (e.g. legacy /signup redirect)? prefill
    const prefill = new URLSearchParams(location.search).get('phone');
    if (prefill && /^\d{10}$/.test(prefill) && phoneInput) phoneInput.value = prefill;

    function showStep(name) {
      currentStep = name;
      if (!otpForm) return;
      for (const [k, el] of Object.entries(steps)) if (el) el.hidden = k !== name;
      const el = steps[name];
      el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    }

    function usePasswordMode(on) {
      clearError();
      if (!otpForm || !pwForm) return;
      otpForm.hidden = on;
      pwForm.hidden = !on;
      if (pwToggle) pwToggle.hidden = on || !otpReady;
      if (otpToggle) otpToggle.hidden = !on;
    }
    pwToggle?.addEventListener('click', e => { e.preventDefault(); usePasswordMode(true); });
    otpToggle?.addEventListener('click', e => { e.preventDefault(); usePasswordMode(false); });

    fetch('/api/auth/otp/available').then(r => r.json()).then(d => {
      otpReady = !!(d && d.enabled && d.mode === 'widget');
      if (!otpReady) {
        // no SMS configured — password is the primary (only) path
        usePasswordMode(true);
        if (pwToggle) pwToggle.hidden = true;
      }
    }).catch(() => { otpReady = false; usePasswordMode(true); if (pwToggle) pwToggle.hidden = true; });

    function restart(keepPhone) {
      if (resendLink._timer) { clearInterval(resendLink._timer); resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code'; }
      widgetPhone = null;
      verifiedSignupToken = null;
      if (boxes) boxes.fill('');
      if (nameInput) nameInput.value = '';
      clearError();
      showStep('number');
      if (!keepPhone && phoneInput) { phoneInput.value = ''; phoneInput.focus(); }
      else if (phoneInput) phoneInput.focus();
    }
    changeLink?.addEventListener('click', e => { e.preventDefault(); restart(false); });
    restartLink?.addEventListener('click', e => { e.preventDefault(); restart(false); });

    function sendCode() {
      clearError();
      const phone = (phoneInput?.value || '').replace(/\D/g, '');
      if (phone.length !== 10 || !/^[6-9]/.test(phone)) return showError('Enter a valid 10-digit Indian mobile number.');
      if (typeof window.sendOtp !== 'function') return showError('OTP system is still loading — wait a few seconds and try again.');
      if (typeof window.isCaptchaVerified === 'function' && !window.isCaptchaVerified()) return showError('Please complete the security check first.');
      busy(sendBtn, true);
      window.sendOtp('91' + phone,
        () => {
          widgetPhone = phone;
          busy(sendBtn, false);
          sentNote.textContent = `Code sent to ${prettyPhone(phone)}`;
          showStep('code');
          boxes.fill(''); boxes.focus();
          resendCountdown(resendLink);
        },
        e => { showError(widgetError(e)); busy(sendBtn, false); }
      );
    }
    resendLink?.addEventListener('click', e => {
      e.preventDefault();
      if (resendLink.style.pointerEvents === 'none') return;
      clearError();
      if (typeof window.retryOtp !== 'function' || !widgetPhone) return showError('Please request a code first.');
      window.retryOtp(null, () => resendCountdown(resendLink), e2 => showError(widgetError(e2)));
    });

    async function verifyCode() {
      clearError();
      const code = boxes.value();
      if (code.length < 4 || code.length > 8) return showError('Enter the code from the SMS.');
      if (!widgetPhone) return showError('Please request a code first.');
      busy(verifyBtn, true);
      try {
        const token = await widgetVerifyCode(code);
        const data = await post('/api/auth/otp/widget', { phone: widgetPhone, token });
        if (data.isNew) {
          verifiedSignupToken = data.verifiedToken;
          newNote.textContent = `${prettyPhone(widgetPhone)} verified`;
          busy(verifyBtn, false);
          showStep('name');
          nameInput.focus();
        } else {
          await showSuccess('Welcome back!', 'Signed in — taking you to your account…');
          location.href = '/account';
        }
      } catch (error) {
        showError(error.message);
        busy(verifyBtn, false);
      }
    }

    async function createAccount() {
      clearError();
      const name = (nameInput?.value || '').trim();
      if (name.length < 2) return showError('Please tell us your name.');
      if (!verifiedSignupToken) return showError('Please verify your number first.');
      busy(createBtn, true);
      try {
        await post('/api/auth/otp/complete-signup', { name, verifiedToken: verifiedSignupToken });
        await showSuccess('Account created!', `Welcome to Rebesta Fresh, ${name.split(' ')[0]} 🌿`);
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        busy(createBtn, false);
        if (/already has an account/i.test(error.message)) setTimeout(() => restart(true), 1800);
      }
    }

    otpForm?.addEventListener('submit', async event => {
      event.preventDefault();
      if (currentStep === 'number') return sendCode();
      if (currentStep === 'code') return verifyCode();
      if (currentStep === 'name') return createAccount();
    });

    /* password fallback (legacy accounts / OTP outage) */
    pwForm?.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const btn = pwForm.querySelector('[data-login-submit]');
      busy(btn, true);
      try {
        await post('/api/auth/login', {
          phone: pwForm.querySelector('#loginPhone').value.replace(/\D/g, ''),
          password: pwForm.querySelector('#loginPassword').value
        });
        await showSuccess('Welcome back!', 'Signed in — taking you to your account…');
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        busy(btn, false);
      }
    });
  }

  /* ============================================================
     /account
     ============================================================ */
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
      const meta = document.querySelector('[data-account-meta]');
      meta.textContent =
        `${c.phone} · with Rebesta since ${since ? since.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'today'}`;
      if (c.phoneVerified) {
        const chip = document.createElement('span');
        chip.className = 'verified-chip';
        chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>verified';
        meta.appendChild(chip);
      }

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

  /* ============================================================
     RFSAuth.bindFlow(root, {onSuccess}) — mount the number → code → (new? name)
     flow into any container (used by the checkout login sheet). The root must
     contain the three .auth-step blocks with data-flow-* hooks, mirroring /login.
     ============================================================ */
  window.RFSAuth = {
    bindFlow(root, { onSuccess } = {}) {
      if (!root || root.dataset.flowBound) return { reset() {} };
      root.dataset.flowBound = '1';
      const steps = {
        number: root.querySelector('[data-step="number"]'),
        code: root.querySelector('[data-step="code"]'),
        name: root.querySelector('[data-step="name"]')
      };
      const phoneInput = root.querySelector('[data-flow-phone]');
      const nameInput = root.querySelector('[data-flow-name]');
      const sendBtn = root.querySelector('[data-flow-send]');
      const verifyBtn = root.querySelector('[data-flow-verify]');
      const createBtn = root.querySelector('[data-flow-create]');
      const sentNote = root.querySelector('[data-flow-sentto]');
      const newNote = root.querySelector('[data-flow-newto]');
      const resendLink = root.querySelector('[data-flow-resend]');
      const changeLink = root.querySelector('[data-flow-change]');
      const restartLink = root.querySelector('[data-flow-restart]');
      const errBox = root.querySelector('[data-flow-error]');
      const boxes = otpBoxes(root.querySelector('[data-flow-boxes]'));
      let widgetPhone = null;
      let verifiedSignupToken = null;
      let currentStep = 'number';

      const showError = message => {
        if (!errBox) return;
        errBox.textContent = message; errBox.hidden = false;
        errBox.classList.remove('shake'); void errBox.offsetWidth; errBox.classList.add('shake');
      };
      const clearError = () => { if (errBox) errBox.hidden = true; };
      const busy = (btn, on) => { if (btn) { btn.classList.toggle('is-loading', !!on); btn.disabled = !!on; } };

      function showStep(name) {
        currentStep = name;
        for (const [k, el] of Object.entries(steps)) if (el) el.hidden = k !== name;
        const el = steps[name];
        if (el) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
      }
      function restart() {
        if (resendLink && resendLink._timer) { clearInterval(resendLink._timer); resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code'; }
        widgetPhone = null; verifiedSignupToken = null;
        boxes.fill(''); if (nameInput) nameInput.value = '';
        clearError(); showStep('number'); if (phoneInput) phoneInput.focus();
      }

      function sendCode() {
        clearError();
        const phone = (phoneInput?.value || '').replace(/\D/g, '');
        if (phone.length !== 10 || !/^[6-9]/.test(phone)) return showError('Enter a valid 10-digit Indian mobile number.');
        if (typeof window.sendOtp !== 'function') return showError('OTP system is still loading — wait a few seconds and try again.');
        if (typeof window.isCaptchaVerified === 'function' && !window.isCaptchaVerified()) return showError('Please complete the security check first.');
        busy(sendBtn, true);
        window.sendOtp('91' + phone,
          () => {
            widgetPhone = phone; busy(sendBtn, false);
            if (sentNote) sentNote.textContent = `Code sent to ${prettyPhone(phone)}`;
            showStep('code'); boxes.fill(''); boxes.focus();
            resendCountdown(resendLink);
          },
          e => { showError(widgetError(e)); busy(sendBtn, false); }
        );
      }
      sendBtn?.addEventListener('click', sendCode);
      resendLink?.addEventListener('click', event => {
        event.preventDefault();
        if (resendLink.style.pointerEvents === 'none') return;
        clearError();
        if (typeof window.retryOtp !== 'function' || !widgetPhone) return showError('Please request a code first.');
        window.retryOtp(null, () => resendCountdown(resendLink), e2 => showError(widgetError(e2)));
      });
      changeLink?.addEventListener('click', event => { event.preventDefault(); restart(); });
      restartLink?.addEventListener('click', event => { event.preventDefault(); restart(); });

      async function verifyCode() {
        clearError();
        const code = boxes.value();
        if (code.length < 4 || code.length > 8) return showError('Enter the code from the SMS.');
        if (!widgetPhone) return showError('Please request a code first.');
        busy(verifyBtn, true);
        try {
          const token = await widgetVerifyCode(code);
          const data = await post('/api/auth/otp/widget', { phone: widgetPhone, token });
          if (data.isNew) {
            verifiedSignupToken = data.verifiedToken;
            if (newNote) newNote.textContent = `${prettyPhone(widgetPhone)} verified`;
            busy(verifyBtn, false);
            showStep('name'); nameInput?.focus();
          } else if (typeof onSuccess === 'function') {
            onSuccess(data.customer || null);
          }
        } catch (error) {
          showError(error.message); busy(verifyBtn, false);
        }
      }

      async function createAccount() {
        clearError();
        const name = (nameInput?.value || '').trim();
        if (name.length < 2) return showError('Please tell us your name.');
        if (!verifiedSignupToken) return showError('Please verify your number first.');
        busy(createBtn, true);
        try {
          const data = await post('/api/auth/otp/complete-signup', { name, verifiedToken: verifiedSignupToken });
          if (typeof onSuccess === 'function') onSuccess(data.customer || null);
        } catch (error) {
          showError(error.message); busy(createBtn, false);
          if (/already has an account/i.test(error.message)) setTimeout(restart, 1800);
        }
      }

      root.addEventListener('submit', event => {
        event.preventDefault();
        if (currentStep === 'number') return sendCode();
        if (currentStep === 'code') return verifyCode();
        if (currentStep === 'name') return createAccount();
      });

      return { reset: restart };
    }
  };
})();
