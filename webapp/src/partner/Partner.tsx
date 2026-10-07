import { useEffect } from 'react';

/* Static JSX island driven by /js/partner.js — the delivery-partner app
   (phone + PIN sign-in, today's deliveries, live tracking, proof photos).
   The markup must stay static: partner.js binds to it once at load. */
export default function Partner() {

  useEffect(() => {
    if (!document.querySelector('script[data-partner-page]')) {
      const s = document.createElement('script');
      s.src = '/js/partner.js?v=20260926f4'; s.async = true; s.dataset.partnerPage = '1';
      document.head.appendChild(s);
    }
  }, []);

  return (
    <>
      <div className="partner-wrap">
        <div className="partner-head">
          <img src="/assets/brand/logo.png" alt="Rebesta Fresh" />
          <span className="p-badge">DELIVERY PARTNER</span>
        </div>

        {/* LOGIN */}
        <div className="partner-login" id="loginCard" hidden>
          <h1>🛵 Partner sign-in</h1>
          <p className="sub">Enter the mobile number and PIN the shop owner gave you.</p>
          <form id="loginForm" className="form-grid">
            <div className="field wide"><label htmlFor="pPhone">Mobile number</label><input id="pPhone" className="num" inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="10-digit number" required /></div>
            <div className="field wide"><label htmlFor="pPin">PIN</label><input id="pPin" className="num" inputMode="numeric" type="password" maxLength={6} placeholder="Your PIN" required /></div>
            <button className="button primary full" type="submit" style={{ marginTop: '14px', padding: '14px' }}>Sign in</button>
          </form>
          <p className="sub" id="loginError" style={{ color: '#a13030', marginTop: '12px' }} hidden></p>
        </div>

        {/* MAIN */}
        <div id="mainCard" hidden>
          <div id="hello"></div>
          <div className="p-stats" id="stats"></div>
          <div id="weekStats"></div>

          <button className="track-toggle" id="trackToggle" type="button">🛵 Start live tracking</button>
          <div className="track-note" id="trackNote">Owner sees your live location only while tracking is ON. Uses little battery.</div>

          <div className="p-section-title" id="routeTitle" hidden>🧭 Smart route</div>
          <div id="routePanel"></div>

          <div className="p-section-title">Today's deliveries</div>
          <div id="ordersList"></div>

          <div className="p-section-title" id="doneTitle" hidden>✅ Delivered today</div>
          <div id="doneList"></div>

          <div className="logout-row"><button type="button" id="logoutBtn">Sign out</button></div>
        </div>
      </div>
      <div className="offline-note" id="toast" hidden></div>
      <div id="waNotify" hidden></div>
    </>
  );
}
