"use client";

import { useEffect, useRef } from "react";
import { bindPartnerPage } from "@/lib/partner-flow.js";

/* eslint-disable @next/next/no-css-tags -- Reuse the shared static styles without changing legacy CSS. */
/* eslint-disable @next/next/no-img-element -- Keep the original brand image file and quality unchanged. */

/* Static delivery-partner island; all API and GPS behavior is bundled with Next. */
export function PartnerView() {
  const partnerRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = partnerRoot.current;
    if (!root) return;
    return bindPartnerPage(root);
  }, []);

  return (
    <div ref={partnerRoot}>
      <link rel="stylesheet" href="/css/styles.css?v=20261006ac" />
      <link rel="stylesheet" href="/css/apple-skin.css?v=1" />
      <div className="partner-wrap">
        <div className="partner-head">
          {/* Keep the original brand asset; do not recompress or replace it. */}
          <img src="/assets/brand/logo.png" alt="Rebesta Fresh" />
          <span className="p-badge">DELIVERY PARTNER</span>
        </div>

        <div className="partner-login" id="loginCard" hidden>
          <h1>🛵 Partner sign-in</h1>
          <p className="sub">Enter the mobile number and PIN the shop owner gave you.</p>
          <form id="loginForm" className="form-grid">
            <div className="field wide">
              <label htmlFor="pPhone">Mobile number</label>
              <input id="pPhone" className="num" inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="10-digit number" required />
            </div>
            <div className="field wide">
              <label htmlFor="pPin">PIN</label>
              <input id="pPin" className="num" inputMode="numeric" type="password" maxLength={6} placeholder="Your PIN" required />
            </div>
            <button className="button primary full" type="submit" style={{ marginTop: "14px", padding: "14px" }}>Sign in</button>
          </form>
          <p className="sub" id="loginError" style={{ color: "#a13030", marginTop: "12px" }} hidden />
        </div>

        <div id="mainCard" hidden>
          <div id="hello" />
          <div className="p-stats" id="stats" />
          <div id="weekStats" />

          <button className="track-toggle" id="trackToggle" type="button">🛵 Start live tracking</button>
          <div className="track-note" id="trackNote">Owner sees your live location only while tracking is ON. Uses little battery.</div>

          <div className="p-section-title" id="routeTitle" hidden>🧭 Smart route</div>
          <div id="routePanel" />

          <div className="p-section-title">Today&rsquo;s deliveries</div>
          <div id="ordersList" />

          <div className="p-section-title" id="doneTitle" hidden>✅ Delivered today</div>
          <div id="doneList" />

          <div className="logout-row"><button type="button" id="logoutBtn">Sign out</button></div>
        </div>
      </div>
      <div className="offline-note" id="toast" hidden />
      <div id="waNotify" hidden />
      <style>{`
        body { background: #f4f7f2; }
        .partner-wrap { max-width: 640px; margin: 0 auto; padding: 18px 14px 90px; }
        .partner-head { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
        .partner-head img { height:30px; width:auto; }
        .partner-head .p-badge { margin-left:auto; background:#074015; color:#fff; font-size:.72rem; font-weight:700; padding:5px 10px; border-radius:999px; letter-spacing:.4px; }
        .p-stats { display:flex; gap:8px; margin:14px 0; }
        .p-stat { flex:1; background:#fff; border:1px solid #e3e9de; border-radius:14px; padding:10px 8px; text-align:center; }
        .p-stat b { display:block; font-size:1.45rem; color:#074015; line-height:1.1; }
        .p-stat span { font-size:.72rem; color:#6b7a66; }
        .track-toggle { width:100%; padding:16px; font-size:1.05rem; border-radius:16px; border:2px dashed #b7c9b0; background:#fff; cursor:pointer; font-weight:700; color:#33452f; }
        .track-toggle.on { background:#074015; color:#fff; border-style:solid; border-color:#074015; animation:pulse 2.2s infinite; }
        @keyframes pulse { 0%,100%{ box-shadow:0 0 0 0 rgba(7,64,21,.35);} 50%{ box-shadow:0 0 0 9px rgba(7,64,21,0);} }
        .track-note { font-size:.78rem; color:#6b7a66; text-align:center; margin-top:6px; }
        .order-card { background:#fff; border:1px solid #e3e9de; border-radius:18px; padding:14px; margin-bottom:14px; box-shadow:0 1px 3px rgba(20,40,15,.05); }
        .order-card.out { border-left:6px solid #f28c28; }
        .order-card.ready { border-left:6px solid #1f7a3d; }
        .oc-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
        .oc-top strong { font-size:.95rem; }
        .oc-slot { background:#eef5ea; color:#1f7a3d; font-size:.72rem; font-weight:700; padding:3px 9px; border-radius:999px; }
        .oc-cod { margin-left:auto; background:#fff4e3; color:#a15c00; font-size:.78rem; font-weight:800; padding:4px 10px; border-radius:999px; }
        .oc-name { font-size:1.06rem; font-weight:800; color:#22321e; margin:2px 0; }
        .oc-addr { font-size:.86rem; color:#55654f; line-height:1.45; margin-bottom:8px; }
        .oc-items { background:#f7faf5; border-radius:10px; padding:8px 10px; font-size:.82rem; color:#44543e; margin-bottom:10px; line-height:1.55; }
        .oc-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .oc-actions .button { padding:13px 8px; font-size:.92rem; border-radius:12px; }
        .oc-actions .wide { grid-column:1 / -1; }
        .p-section-title { font-size:.8rem; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#6b7a66; margin:22px 0 10px; }
        .done-card { background:#fff; border:1px solid #e3e9de; border-radius:12px; padding:10px 12px; margin-bottom:8px; display:flex; align-items:center; gap:8px; font-size:.86rem; }
        .done-card .tick { color:#1f7a3d; font-weight:900; }
        .partner-login { max-width:400px; margin:8vh auto 0; background:#fff; border:1px solid #e3e9de; border-radius:20px; padding:26px 22px; }
        .partner-login h1 { font-size:1.3rem; color:#074015; margin-bottom:4px; }
        .partner-login p.sub { font-size:.86rem; color:#6b7a66; margin-bottom:18px; }
        .partner-login input { font-size:1.1rem; padding:12px; }
        .partner-login .num { letter-spacing:2px; }
        .logout-row { text-align:center; margin-top:26px; }
        .logout-row button { background:none; border:none; color:#8a2f2f; font-size:.82rem; text-decoration:underline; cursor:pointer; }
        .offline-note { position:fixed; bottom:12px; left:12px; right:12px; max-width:616px; margin:0 auto; }
      `}</style>
    </div>
  );
}
