import { useEffect } from 'react';
import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';

/* The login page is a static JSX island driven by /js/auth.js (RFSAuth):
   number → code → (new? name), password fallback, MSG91 widget + captcha,
   OTP-availability check and the /account redirect after success.
   The markup must stay static — auth.js binds to it once at load. */
export default function Login() {

  useEffect(() => {
    /* MSG91 OTP widget (captcha renders into #otp-captcha) */
    if (!document.querySelector('script[data-otp-sdk]') && !(window as any).initSendOTP) {
      const config = {
        widgetId: '366a65687644323637363131',
        tokenAuth: '571380TgZrH8gvzsiK6aa8dedbP1',
        exposeMethods: true,
        captchaRenderId: 'otp-captcha',
        success: (data: unknown) => { (window as any).__otpWidgetSuccess = data; },
        failure: (error: unknown) => { (window as any).__otpWidgetFailure = error; }
      };
      const urls = ['https://verify.msg91.com/otp-provider.js', 'https://verify.phone91.com/otp-provider.js'];
      let i = 0;
      (function attempt() {
        const s = document.createElement('script');
        s.src = urls[i]; s.async = true; s.dataset.otpSdk = '1';
        s.onload = () => { if (typeof (window as any).initSendOTP === 'function') { try { (window as any).initSendOTP(config); } catch (e) { (window as any).__otpWidgetFailure = e; } } };
        s.onerror = () => { i += 1; if (i < urls.length) attempt(); };
        document.head.appendChild(s);
      })();
    }
    /* the page flow itself */
    if (!document.querySelector('script[data-auth-page]')) {
      const s = document.createElement('script');
      s.src = '/js/auth.js?v=20261005d'; s.async = true; s.dataset.authPage = '1';
      document.head.appendChild(s);
    }
  }, []);

  return (
    <>
      <VanillaHeader showAccount={false} />
      <main><section className="section auth-section"><div className="container auth-container-solo">
        <div className="auth-card" data-auth-card>
          <span className="auth-eyebrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22c5-3.5 8-7.5 8-11.5C20 6 16.5 3 12 3S4 6 4 10.5C4 14.5 7 18.5 12 22Z" stroke="currentColor" strokeWidth="2.4"/><path d="M12 22V9M12 12l3-2M12 15l-2.6-1.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>Welcome</span>
          <h1>Sign in to Rebesta</h1>
          <p className="auth-card-sub">Enter your mobile number — we'll text you a code. Existing number signs you in, new number creates your account. That's it.</p>
          <form data-otp-form className="auth-form" noValidate>
            <div className="auth-step" data-step="number">
              <div className="fx-field fx-phone"><input id="otpPhone" inputMode="tel" autoComplete="tel" placeholder=" " defaultValue="" /><label htmlFor="otpPhone">Mobile number</label><span className="fx-prefix"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h3l2 4-2 2a12 12 0 0 0 5 5l2-2 4 2v3a2 2 0 0 1-2 2A16 16 0 0 1 2 8a2 2 0 0 1 2-2Z" fill="currentColor"/></svg>+91</span></div>
              <div className="captcha-slot"><p className="cs-label"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 8.4-7 9.9C8 19.4 5 15.5 5 11V6l7-3Z" stroke="currentColor" strokeWidth="2"/><path d="m9 11.5 2.2 2.2L15.5 9.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Quick security check — keeps SMS free of bots</p><div id="otp-captcha" className="otp-captcha"></div></div>
              <button className="btn-main" type="submit" data-otp-send><span className="btn-label">Send code by SMS</span></button>
            </div>
            <div className="auth-step" data-step="code" hidden>
              <div className="sent-chip">
                <svg className="otp-phone-art" viewBox="0 0 48 48" fill="none"><path className="wave w1" d="M6 30c0-5 2.6-9.4 6.4-11.8" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round"/><path className="wave w2" d="M9.6 34.4C9.6 29 12.8 24.6 17 22" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round" opacity=".7"/><rect x="17" y="8" width="14" height="32" rx="4.5" fill="#073f1b"/><rect x="19" y="12" width="10" height="22" rx="2.5" fill="#e7f6e9"/><path d="M22 20h5M22 25h5M22 30h3" stroke="#0d8736" strokeWidth="2" strokeLinecap="round"/><path className="wave w3" d="M42 30c0-5-2.6-9.4-6.4-11.8" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round"/><path className="wave w2" d="M38.4 34.4C38.4 29 35.2 24.6 31 22" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round" opacity=".7"/></svg>
                <div><b data-otp-sentto></b><span>Code sent · valid 15 minutes</span></div>
              </div>
              <div className="otp-boxes" data-otp-boxes></div>
              <p className="otp-hint">Enter the code from the SMS</p>
              <button className="btn-main" type="submit" data-otp-verify><span className="btn-label">Verify &amp; continue</span></button>
              <p className="otp-resend">Didn't get it? <a href="#" data-otp-resend>Resend code</a> · <a href="#" data-otp-change>Wrong number?</a></p>
            </div>
            <div className="auth-step" data-step="name" hidden>
              <div className="sent-chip">
                <svg viewBox="0 0 48 48" fill="none"><path d="M24 42V22" stroke="#0d8736" strokeWidth="3" strokeLinecap="round"/><path d="M24 28c-8 0-13-5-13-13 8 0 13 5 13 13Z" fill="#0faa46"/><path d="M24 33c7 0 11-4.4 11-11-7 0-11 4.4-11 11Z" fill="#0d8736"/><circle cx="37" cy="11" r="3.4" fill="#ff8b3d"/><circle cx="11" cy="16" r="2.6" fill="#ffd582"/></svg>
                <div><b data-otp-newto></b><span>Number verified! You're new here — one last thing.</span></div>
              </div>
              <div className="fx-field"><input id="newName" autoComplete="name" placeholder=" " defaultValue="" /><label htmlFor="newName">What should we call you?</label></div>
              <button className="btn-main" type="submit" data-otp-create><span className="btn-label">Create my account</span></button>
              <p className="otp-resend"><a href="#" data-otp-restart>← Use a different number</a></p>
            </div>
          </form>
          <form data-login-form className="auth-form" hidden noValidate>
            <div className="fx-field fx-phone"><input id="loginPhone" inputMode="tel" autoComplete="tel" placeholder=" " defaultValue="" /><label htmlFor="loginPhone">Mobile number</label><span className="fx-prefix"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h3l2 4-2 2a12 12 0 0 0 5 5l2-2 4 2v3a2 2 0 0 1-2 2A16 16 0 0 1 2 8a2 2 0 0 1 2-2Z" fill="currentColor"/></svg>+91</span></div>
            <div className="fx-field"><input id="loginPassword" type="password" autoComplete="current-password" placeholder=" " defaultValue="" style={{ paddingRight: '52px' }} /><label htmlFor="loginPassword">Password</label>
              <button type="button" className="fx-eye" data-eye="loginPassword" aria-label="Show password"><svg className="eye-on" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="2"/></svg><svg className="eye-off" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.6 5.1 1.4M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.6-5.1-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="m4 20 16-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
            </div>
            <button className="btn-main" type="submit" data-login-submit><span className="btn-label">Sign in</span></button>
          </form>
          <div data-auth-error className="alert error" hidden style={{ marginTop: '14px' }}></div>
          <p className="auth-alt auth-toggle"><a href="#" data-pw-toggle>Sign in with password instead</a><a href="#" data-otp-toggle hidden>Use SMS code instead</a></p>
          <p className="auth-alt">You can always shop without an account · Orders stay linked to your number.</p>
          <div className="auth-success" data-auth-success aria-live="polite">
            <div className="as-inner">
              <div className="as-mark-wrap">
                <svg className="as-mark" viewBox="0 0 72 72" aria-hidden="true"><circle className="as-ring" cx="36" cy="36" r="30" /><path className="as-check" d="M23 37.5l9.5 9.5L49 27" /></svg>
                <span className="as-confetti" aria-hidden="true"></span>
              </div>
              <h3 data-success-title>Done!</h3>
              <p data-success-sub></p>
            </div>
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter minimal />
      <VanillaMobileCartBar />
    </>
  );
}
