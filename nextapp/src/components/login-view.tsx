"use client";

import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/* Static island driven by /js/auth.js (RFSAuth): number → code → (new? name),
   password fallback, MSG91 widget + captcha, OTP-availability check and the
   /account redirect after success. The markup must stay static — auth.js binds
   to the data-* hooks once at load. Styling lives in the scoped block below. */
export function LoginView() {
  useEffect(() => {
    /* MSG91 OTP widget (captcha renders into #otp-captcha) */
    if (!document.querySelector("script[data-otp-sdk]") && !(window as any).initSendOTP) {
      const config = {
        widgetId: "366a65687644323637363131",
        tokenAuth: "571380TgZrH8gvzsiK6aa8dedbP1",
        exposeMethods: true,
        captchaRenderId: "otp-captcha",
        success: (data: unknown) => { (window as any).__otpWidgetSuccess = data; },
        failure: (error: unknown) => { (window as any).__otpWidgetFailure = error; },
      };
      const urls = ["https://verify.msg91.com/otp-provider.js", "https://verify.phone91.com/otp-provider.js"];
      let i = 0;
      (function attempt() {
        const s = document.createElement("script");
        s.src = urls[i]; s.async = true; s.dataset.otpSdk = "1";
        s.onload = () => { if (typeof (window as any).initSendOTP === "function") { try { (window as any).initSendOTP(config); } catch (e) { (window as any).__otpWidgetFailure = e; } } };
        s.onerror = () => { i += 1; if (i < urls.length) attempt(); };
        document.head.appendChild(s);
      })();
    }
    /* the page flow itself */
    if (!document.querySelector("script[data-auth-page]")) {
      const s = document.createElement("script");
      s.src = "/js/auth.js?v=20261005d"; s.async = true; s.dataset.authPage = "1";
      document.head.appendChild(s);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="pb-20">
        <section className="mx-auto max-w-md px-4 pt-14 sm:pt-20">
          <div className="auth-card rounded-[28px] border border-line bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.06)] sm:p-9" data-auth-card>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22c5-3.5 8-7.5 8-11.5C20 6 16.5 3 12 3S4 6 4 10.5C4 14.5 7 18.5 12 22Z" stroke="currentColor" strokeWidth="2.4"/><path d="M12 22V9M12 12l3-2M12 15l-2.6-1.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
              Welcome
            </span>
            <h1 className="mt-3 font-display text-[28px] font-semibold tracking-tight text-ink">Sign in to Rebesta</h1>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-muted-foreground">
              Enter your mobile number — we&rsquo;ll text you a code. Existing number signs you in, new number creates your account. That&rsquo;s it.
            </p>

            <form data-otp-form className="mt-7" noValidate>
              <div className="auth-step" data-step="number">
                <div className="relative">
                  <input
                    id="otpPhone" inputMode="tel" autoComplete="tel" placeholder=" " defaultValue=""
                    className="peer h-14 w-full rounded-2xl border border-line-2 bg-white pl-14 pr-4 text-[14px] font-semibold text-ink outline-none transition placeholder:text-transparent focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                  />
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-muted-foreground">+91</span>
                  <label htmlFor="otpPhone" className="pointer-events-none absolute left-14 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted-foreground transition-all peer-focus:top-3.5 peer-focus:text-[11px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-wide peer-focus:text-muted-foreground peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-bold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wide">
                    Mobile number
                  </label>
                </div>

                <div className="captcha-slot mt-5">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 8.4-7 9.9C8 19.4 5 15.5 5 11V6l7-3Z" stroke="currentColor" strokeWidth="2"/><path d="m9 11.5 2.2 2.2L15.5 9.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Quick security check — keeps SMS free of bots
                  </p>
                  <div id="otp-captcha" className="otp-captcha mt-3"></div>
                </div>

                <button className="btn-main mt-5" type="submit" data-otp-send><span className="btn-label">Send code by SMS</span></button>
              </div>

              <div className="auth-step" data-step="code" hidden>
                <div className="sent-chip flex items-center gap-3.5 rounded-2xl bg-[#f5f5f7] p-4">
                  <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <path d="M6 30c0-5 2.6-9.4 6.4-11.8" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round"/>
                    <path d="M9.6 34.4C9.6 29 12.8 24.6 17 22" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round" opacity=".7"/>
                    <rect x="17" y="8" width="14" height="32" rx="4.5" fill="#1d1d1f"/>
                    <rect x="19" y="12" width="10" height="22" rx="2.5" fill="#f0f5f0"/>
                    <path d="M22 20h5M22 25h5M22 30h3" stroke="#0d8736" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M42 30c0-5-2.6-9.4-6.4-11.8" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round"/>
                    <path d="M38.4 34.4C38.4 29 35.2 24.6 31 22" stroke="#0d8736" strokeWidth="2.4" strokeLinecap="round" opacity=".7"/>
                  </svg>
                  <div className="min-w-0">
                    <b data-otp-sentto className="block truncate text-[14px] font-bold text-ink"></b>
                    <span className="text-[13px] font-medium text-muted-foreground">Code sent · valid 15 minutes</span>
                  </div>
                </div>
                <div className="otp-boxes mt-5" data-otp-boxes></div>
                <p className="otp-hint mt-3 text-[13px] font-medium text-muted-foreground">Enter the code from the SMS</p>
                <button className="btn-main mt-4" type="submit" data-otp-verify><span className="btn-label">Verify &amp; continue</span></button>
                <p className="otp-resend mt-4 text-center text-[13px] font-medium text-muted-foreground">
                  Didn&rsquo;t get it? <a href="#" data-otp-resend className="font-bold text-leaf hover:underline">Resend code</a> · <a href="#" data-otp-change className="font-bold text-leaf hover:underline">Wrong number?</a>
                </p>
              </div>

              <div className="auth-step" data-step="name" hidden>
                <div className="sent-chip flex items-center gap-3.5 rounded-2xl bg-mint p-4">
                  <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <path d="M24 42V22" stroke="#0d8736" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M24 28c-8 0-13-5-13-13 8 0 13 5 13 13Z" fill="#0faa46"/>
                    <path d="M24 33c7 0 11-4.4 11-11-7 0-11 4.4-11 11Z" fill="#0d8736"/>
                    <circle cx="37" cy="11" r="3.4" fill="#ff5b20"/>
                    <circle cx="11" cy="16" r="2.6" fill="#ffd582"/>
                  </svg>
                  <div className="min-w-0">
                    <b data-otp-newto className="block truncate text-[14px] font-bold text-ink"></b>
                    <span className="text-[13px] font-medium text-muted-foreground">Number verified! You&rsquo;re new here — one last thing.</span>
                  </div>
                </div>
                <div className="relative mt-5">
                  <input
                    id="newName" autoComplete="name" placeholder=" " defaultValue=""
                    className="peer h-14 w-full rounded-2xl border border-line-2 bg-white px-4 text-[14px] font-semibold text-ink outline-none transition placeholder:text-transparent focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                  />
                  <label htmlFor="newName" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted-foreground transition-all peer-focus:top-3.5 peer-focus:text-[11px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-wide peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-bold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wide">
                    What should we call you?
                  </label>
                </div>
                <button className="btn-main mt-4" type="submit" data-otp-create><span className="btn-label">Create my account</span></button>
                <p className="otp-resend mt-4 text-center text-[13px] font-medium text-muted-foreground">
                  <a href="#" data-otp-restart className="font-bold text-leaf hover:underline">← Use a different number</a>
                </p>
              </div>
            </form>

            <form data-login-form className="mt-7" hidden noValidate>
              <div className="relative">
                <input
                  id="loginPhone" inputMode="tel" autoComplete="tel" placeholder=" " defaultValue=""
                  className="peer h-14 w-full rounded-2xl border border-line-2 bg-white pl-14 pr-4 text-[14px] font-semibold text-ink outline-none transition placeholder:text-transparent focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                />
                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-muted-foreground">+91</span>
                <label htmlFor="loginPhone" className="pointer-events-none absolute left-14 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted-foreground transition-all peer-focus:top-3.5 peer-focus:text-[11px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-wide peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-bold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wide">
                  Mobile number
                </label>
              </div>
              <div className="relative mt-3.5">
                <input
                  id="loginPassword" type="password" autoComplete="current-password" placeholder=" " defaultValue=""
                  className="peer h-14 w-full rounded-2xl border border-line-2 bg-white px-4 pr-14 text-[14px] font-semibold text-ink outline-none transition placeholder:text-transparent focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                />
                <label htmlFor="loginPassword" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted-foreground transition-all peer-focus:top-3.5 peer-focus:text-[11px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-wide peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-bold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wide">
                  Password
                </label>
                <button type="button" className="fx-eye" data-eye="loginPassword" aria-label="Show password">
                  <svg className="eye-on" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="2"/></svg>
                  <svg className="eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.6 5.1 1.4M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.6-5.1-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="m4 20 16-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
              <button className="btn-main mt-4" type="submit" data-login-submit><span className="btn-label">Sign in</span></button>
            </form>

            <div data-auth-error className="alert-error mt-4" hidden></div>

            <p className="auth-alt mt-6 text-center text-[13px] font-medium text-muted-foreground">
              <a href="#" data-pw-toggle className="font-bold text-leaf hover:underline">Sign in with password instead</a>
              <a href="#" data-otp-toggle hidden className="font-bold text-leaf hover:underline">Use SMS code instead</a>
            </p>
            <p className="auth-alt mt-2 text-center text-[13px] font-medium text-muted-foreground">
              You can always shop without an account · Orders stay linked to your number.
            </p>

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
        </section>
      </main>

      {/* scoped styles for everything auth.js generates or toggles */}
      <style>{`
        .btn-main { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; height:52px; border-radius:9999px;
          background-image:linear-gradient(135deg,#17b34e 0%,#0faa46 45%,#0b7c31 100%); color:#fff; font-size: 14px; font-weight:700; cursor:pointer; border:none;
          box-shadow:0 8px 20px rgba(11,124,49,0.35); transition:filter .15s, transform .1s; }
        .btn-main:hover { filter:brightness(1.04); }
        .btn-main:active { transform:scale(0.98); }
        .btn-main:disabled { opacity:.6; cursor:default; }
        .btn-main.is-loading .btn-label { visibility:hidden; }
        .btn-main.is-loading::after { content:""; position:absolute; width:20px; height:20px; border-radius:50%;
          border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff; animation:spin .7s linear infinite; }
        .btn-main { position:relative; }
        @keyframes spin { to { transform:rotate(360deg); } }

        .otp-boxes { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .otp-box { width:50px; height:58px; border-radius:16px; border:1.5px solid #d2d2d7; background:#fff;
          text-align:center; font-size: 21px; font-weight:600; color:#1d1d1f; outline:none;
          transition:border-color .15s, box-shadow .15s, background .15s; font-family:inherit; }
        .otp-box:focus { border-color:#1d1d1f; box-shadow:0 0 0 3px rgba(29,29,31,0.10); }
        .otp-box.filled { background:#f0f5f0; border-color:#0d8736; color:#0d8736; }

        .otp-captcha { display:flex; justify-content:center; min-height:54px; }
        .otp-captcha:empty { min-height:0; }

        .alert-error { border-radius:16px; background:rgba(255,91,32,0.10); color:#c8400f;
          padding:14px 18px; font-size: 13px; font-weight:600; }
        .alert-error.shake { animation:shake .4s; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }

        .fx-eye { position:absolute; right:14px; top:50%; transform:translateY(-50%); display:grid; place-items:center;
          width:34px; height:34px; border-radius:50%; border:none; background:transparent; color:#4a4a4f; cursor:pointer; }
        .fx-eye:hover { background:rgba(0,0,0,0.05); color:#1d1d1f; }
        .fx-eye .eye-off { display:none; }
        .fx-eye.revealed .eye-on { display:none; }
        .fx-eye.revealed .eye-off { display:block; }

        .auth-step.in { animation:stepIn .35s ease; }
        @keyframes stepIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

        .auth-success { display:none; }
        .auth-success.show { display:block; animation:stepIn .4s ease; }
        .auth-success .as-inner { text-align:center; padding-top:8px; }
        .as-mark-wrap { position:relative; width:72px; height:72px; margin:0 auto; }
        .as-mark { width:72px; height:72px; }
        .as-ring { fill:none; stroke:#0d8736; stroke-width:4; stroke-dasharray:190; stroke-dashoffset:190; stroke-linecap:round; transform:rotate(-90deg); transform-origin:center; }
        .as-check { fill:none; stroke:#0d8736; stroke-width:5; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:48; stroke-dashoffset:48; }
        .auth-success.show .as-ring { animation:drawRing .6s .1s ease forwards; }
        .auth-success.show .as-check { animation:drawCheck .35s .55s ease forwards; }
        @keyframes drawRing { to { stroke-dashoffset:0; } }
        @keyframes drawCheck { to { stroke-dashoffset:0; } }
        .as-confetti { position:absolute; inset:0; }
        .as-confetti i { position:absolute; left:50%; top:50%; width:7px; height:7px; border-radius:2px; opacity:0; }
        .auth-success.show .as-confetti i { animation:confetti .9s ease-out forwards; }
        @keyframes confetti { 0% { transform:translate(0,0) rotate(0); opacity:1; } 100% { transform:translate(var(--dx),var(--dy)) rotate(240deg); opacity:0; } }
        .auth-success h3 { margin-top:14px; font-size: 21px; font-weight:600; color:#1d1d1f; letter-spacing:-0.02em; }
        .auth-success p { margin-top:6px; font-size: 14px; font-weight:500; color:#4a4a4f; }
      `}</style>
      <SiteFooter />
    </div>
  );
}
