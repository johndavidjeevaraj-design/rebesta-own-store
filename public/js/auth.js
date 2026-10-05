/* Rebesta Fresh — login / signup / account pages (optional accounts, shop never requires them) */
(() => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
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

  function maskPhone(p) { return p ? `${p.slice(0, 2)}xxxxx${p.slice(-2)}` : ''; }
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

  /* ---------- widget helpers (MSG91 SDK on the page) ---------- */
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
     /login
     ============================================================ */
  const loginForm = document.querySelector('[data-login-form]');
  const otpForm = document.querySelector('[data-otp-form]');

  if (loginForm) {
    // already signed in? straight to the account
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.customer) location.replace('/account'); }).catch(() => {});
    // arriving from signup with a known number? prefill both forms
    const prefill = new URLSearchParams(location.search).get('phone');
    if (prefill && /^\d{10}$/.test(prefill)) {
      loginForm.querySelector('#loginPhone').value = prefill;
      const otpP = document.querySelector('#otpPhone'); if (otpP) otpP.value = prefill;
    }

    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const btn = loginForm.querySelector('[data-login-submit]');
      busy(btn, true);
      try {
        await post('/api/auth/login', {
          phone: loginForm.phone.value.replace(/\D/g, ''),
          password: loginForm.password.value
        });
        await showSuccess('Welcome back!', 'Signed in — taking you to your account…');
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        busy(btn, false);
      }
    });
  }

  /* ---------- /login — Mobile OTP tab ---------- */
  if (otpForm && loginForm) {
    const tabs = document.querySelector('[data-auth-tabs]');
    const pwBtn = document.querySelector('[data-tab-btn="password"]');
    const otpBtn = document.querySelector('[data-tab-btn="otp"]');
    const pill = tabs ? tabs.querySelector('.auth-tab-pill') : null;
    const step1 = otpForm.querySelector('[data-otp-step1]');
    const step2 = otpForm.querySelector('[data-otp-step2]');
    const phoneInput = otpForm.querySelector('#otpPhone');
    const sendBtn = otpForm.querySelector('[data-otp-send]');
    const verifyBtn = otpForm.querySelector('[data-otp-verify]');
    const sentNote = otpForm.querySelector('[data-otp-sentto]');
    const resendLink = otpForm.querySelector('[data-otp-resend]');
    const changeLink = otpForm.querySelector('[data-otp-change]');
    const boxes = otpBoxes(otpForm.querySelector('[data-otp-boxes]'));
    let mode = null;          // 'widget' (MSG91 SDK) | 'api' (server-side send)
    let widgetPhone = null;   // phone currently being verified via widget

    function positionPill() {
      if (!pill || !tabs || tabs.hidden) return;
      const active = tabs.querySelector('.auth-tab.active');
      if (active) { pill.style.width = `${active.offsetWidth}px`; pill.style.transform = `translateX(${active.offsetLeft - 4}px)`; }
    }
    function switchTab(which) {
      clearError();
      pwBtn.classList.toggle('active', which === 'password');
      otpBtn.classList.toggle('active', which === 'otp');
      loginForm.hidden = which !== 'password';
      otpForm.hidden = which !== 'otp';
      requestAnimationFrame(positionPill);
    }
    if (pwBtn) pwBtn.addEventListener('click', () => switchTab('password'));

    fetch('/api/auth/otp/available').then(r => r.json()).then(d => {
      if (d && d.enabled) {
        mode = d.mode === 'widget' ? 'widget' : 'api';
        tabs.hidden = false;
        otpBtn.addEventListener('click', () => switchTab('otp'));
        requestAnimationFrame(positionPill);
      }
    }).catch(() => {});
    window.addEventListener('resize', positionPill);

    function showStep(which) {
      const el = which === 2 ? step2 : step1;
      (which === 2 ? step1 : step2).hidden = true;
      el.hidden = false;
      el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    }

    function sendCode() {
      clearError();
      const phone = phoneInput.value.replace(/\D/g, '');
      if (phone.length !== 10 || !/^[6-9]/.test(phone)) return showError('Enter a valid 10-digit Indian mobile number.');
      if (mode === 'widget') {
        if (typeof window.sendOtp !== 'function') return showError('OTP system is still loading — wait a few seconds and try again.');
        if (typeof window.isCaptchaVerified === 'function' && !window.isCaptchaVerified()) return showError('Please complete the security check first.');
        busy(sendBtn, true);
        window.sendOtp('91' + phone,
          () => {
            widgetPhone = phone;
            busy(sendBtn, false);
            sentNote.textContent = `Code sent to ${prettyPhone(phone)}`;
            showStep(2);
            boxes.fill(''); boxes.focus();
            resendCountdown(resendLink);
          },
          e => { showError(widgetError(e)); busy(sendBtn, false); }
        );
        return;
      }
      // api mode (dev / server-side send)
      busy(sendBtn, true);
      post('/api/auth/otp/request', { phone }).then(data => {
        otpForm.dataset.phone = phone;
        busy(sendBtn, false);
        sentNote.textContent = `Code sent to ${prettyPhone(phone)}`;
        showStep(2);
        boxes.fill(data.devCode || ''); boxes.focus();
        resendCountdown(resendLink);
      }).catch(error => {
        showError(error.message);
        busy(sendBtn, false);
        if (/no account with this number/i.test(error.message)) setTimeout(() => { location.href = `/signup?phone=${phone}`; }, 1500);
      });
    }
    sendBtn.addEventListener('click', sendCode);
    resendLink.addEventListener('click', event => {
      event.preventDefault();
      if (resendLink.style.pointerEvents === 'none') return;
      clearError();
      if (mode === 'widget') {
        if (typeof window.retryOtp !== 'function' || !widgetPhone) return showError('Please request a code first.');
        window.retryOtp(null, () => resendCountdown(resendLink), e => showError(widgetError(e)));
      } else sendCode();
    });
    const changeNumber = event => {
      event.preventDefault();
      if (resendLink._timer) clearInterval(resendLink._timer);
      resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code';
      showStep(1);
      boxes.fill(''); widgetPhone = null; clearError(); phoneInput.focus();
    };
    changeLink.addEventListener('click', changeNumber);

    otpForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      const code = boxes.value();
      if (code.length < 4 || code.length > 8) return showError('Enter the code from the SMS.');
      busy(verifyBtn, true);
      try {
        if (mode === 'widget') {
          const token = await widgetVerifyCode(code);
          const phone = widgetPhone;
          if (!phone) throw new Error('Please request a code first.');
          await post('/api/auth/otp/widget', { phone, token });
        } else {
          await post('/api/auth/otp/verify', { phone: otpForm.dataset.phone || '', code });
        }
        await showSuccess('Number verified!', 'Signed in — taking you to your account…');
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        busy(verifyBtn, false);
        if (/no account with this number/i.test(error.message) && widgetPhone) {
          setTimeout(() => { location.href = `/signup?phone=${widgetPhone}`; }, 1600);
        }
      }
    });
  }

  /* ============================================================
     /signup — two-step: details → verify your number by SMS
     ============================================================ */
  const signupForm = document.querySelector('[data-signup-form]');
  if (signupForm) {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.customer) location.replace('/account'); }).catch(() => {});

    const nameInput = signupForm.querySelector('#suName');
    const phoneInput = signupForm.querySelector('#suPhone');
    const passwordInput = signupForm.querySelector('#suPassword');
    const submitBtn = signupForm.querySelector('[data-signup-submit]');
    const dots = document.querySelector('[data-auth-dots]');
    const steps = {
      details: signupForm.querySelector('[data-su-details]'),
      verify: signupForm.querySelector('[data-su-verify]'),
      code: signupForm.querySelector('[data-su-code]')
    };
    const sendBtn = signupForm.querySelector('[data-su-send]');
    const verifyBtn = signupForm.querySelector('[data-su-verify-btn]');
    const numberLabel = signupForm.querySelector('[data-su-number]');
    const sentLabel = signupForm.querySelector('[data-su-sentto]');
    const resendLink = signupForm.querySelector('[data-su-resend]');
    const changeLinks = [signupForm.querySelector('[data-su-change]'), signupForm.querySelector('[data-su-change2]')];
    const boxes = otpBoxes(signupForm.querySelector('[data-su-boxes]'));
    let suMode = null;            // 'widget' (verified signup) | 'classic' (direct create)
    let widgetPhone = null;
    let pendingDetails = null;    // { name, phone, password } while verifying

    // arriving from OTP login with an unknown number? phone is prefilled
    const prefill = new URLSearchParams(location.search).get('phone');
    if (prefill && /^\d{10}$/.test(prefill)) {
      phoneInput.value = prefill;
      const note = document.createElement('p');
      note.className = 'otp-note';
      note.textContent = `No account exists for ${maskPhone(prefill)} yet — create one below.`;
      signupForm.prepend(note);
    }

    const suModeReady = fetch('/api/auth/otp/available').then(r => r.json()).then(d => {
      if (d && d.enabled && d.mode === 'widget') {
        suMode = 'widget';
        submitBtn.querySelector('.btn-label').textContent = 'Continue';
      } else {
        suMode = 'classic';
        if (dots) dots.hidden = true;
        submitBtn.querySelector('.btn-label').textContent = 'Create account';
      }
    }).catch(() => { suMode = 'classic'; if (dots) dots.hidden = true; submitBtn.querySelector('.btn-label').textContent = 'Create account'; });

    function showStep(name) {
      for (const [k, el] of Object.entries(steps)) el.hidden = k !== name;
      const el = steps[name];
      el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
      if (dots) {
        const d1 = dots.querySelector('[data-dot="1"]');
        const d2 = dots.querySelector('[data-dot="2"]');
        const l1 = dots.querySelector('[data-dotlabel="1"]');
        d1.classList.toggle('on', name === 'details');
        d1.classList.toggle('done', name !== 'details');
        d2.classList.toggle('on', name !== 'details');
        d2.classList.toggle('done', false);
        l1.classList.toggle('on', name === 'details');
      }
    }

    function readDetails() {
      const name = nameInput.value.trim();
      const phone = phoneInput.value.replace(/\D/g, '');
      const password = passwordInput.value;
      if (name.length < 2) return { error: 'Please enter your name.' };
      if (phone.length !== 10 || !/^[6-9]/.test(phone)) return { error: 'Enter a valid 10-digit Indian mobile number.' };
      if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
      return { data: { name, phone, password } };
    }

    function sendCode() {
      clearError();
      if (typeof window.sendOtp !== 'function') return showError('OTP system is still loading — wait a few seconds and try again.');
      if (typeof window.isCaptchaVerified === 'function' && !window.isCaptchaVerified()) return showError('Please complete the security check first.');
      busy(sendBtn, true);
      window.sendOtp('91' + pendingDetails.phone,
        () => {
          widgetPhone = pendingDetails.phone;
          busy(sendBtn, false);
          sentLabel.textContent = `Code sent to ${prettyPhone(widgetPhone)}`;
          showStep('code');
          boxes.fill(''); boxes.focus();
          resendCountdown(resendLink);
        },
        e => { showError(widgetError(e)); busy(sendBtn, false); }
      );
    }
    sendBtn.addEventListener('click', sendCode);

    resendLink.addEventListener('click', event => {
      event.preventDefault();
      if (resendLink.style.pointerEvents === 'none') return;
      clearError();
      if (typeof window.retryOtp !== 'function' || !widgetPhone) return showError('Please request a code first.');
      window.retryOtp(null, () => resendCountdown(resendLink), e => showError(widgetError(e)));
    });
    changeLinks.forEach(l => l && l.addEventListener('click', event => {
      event.preventDefault();
      if (resendLink._timer) clearInterval(resendLink._timer);
      resendLink.style.pointerEvents = ''; resendLink.textContent = 'Resend code';
      widgetPhone = null; clearError();
      showStep('details');
      phoneInput.focus();
    }));

    async function classicSignup() {
      const r = readDetails();
      if (r.error) return showError(r.error);
      busy(submitBtn, true);
      try {
        await post('/api/auth/signup', r.data);
        await showSuccess('Account created!', 'Welcome to Rebesta Fresh.');
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        busy(submitBtn, false);
      }
    }

    async function widgetVerify() {
      clearError();
      const code = boxes.value();
      if (code.length < 4 || code.length > 8) return showError('Enter the code from the SMS.');
      busy(verifyBtn, true);
      try {
        const token = await widgetVerifyCode(code);
        await post('/api/auth/signup/verify', { ...pendingDetails, token });
        await showSuccess('Account created!', 'Number verified — welcome to Rebesta Fresh.');
        location.href = '/account';
      } catch (error) {
        showError(error.message);
        busy(verifyBtn, false);
        if (/already has an account/i.test(error.message) && pendingDetails) {
          setTimeout(() => { location.href = `/login?phone=${pendingDetails.phone}`; }, 1700);
        }
      }
    }

    signupForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      if (suMode === null) await suModeReady.catch(() => {});
      if (suMode !== 'widget') return classicSignup();
      if (!steps.code.hidden) return widgetVerify();       // step 3: verify code
      if (!steps.details.hidden) {                          // step 1 → step 2
        const r = readDetails();
        if (r.error) return showError(r.error);
        pendingDetails = r.data;
        numberLabel.textContent = prettyPhone(pendingDetails.phone);
        showStep('verify');
        return;
      }
      if (!steps.verify.hidden) return sendCode();          // Enter on step 2 sends the code
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
})();
