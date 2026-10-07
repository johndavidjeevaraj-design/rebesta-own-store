import { useEffect } from 'react';

/* Static JSX island driven by /js/admin.js — the owner dashboard
   (connect with the admin key, live orders, packing lists, fleet map,
   product editor, site settings, coupons, tiers, Cashfree + email config).
   Load order matches the vanilla page: Leaflet → store.js (RFS) → admin.js.
   The markup must stay static: admin.js binds to it once at load. */
export default function Admin() {

  useEffect(() => {
    if (document.querySelector('script[data-admin-page]')) return;
    /* async=false → dynamically inserted scripts execute in insertion order,
       exactly like the vanilla page's three defer scripts. */
    for (const src of [
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      '/js/store.js?v=20261006s16',
      '/js/admin.js?v=20261007a'
    ]) {
      const s = document.createElement('script');
      s.src = src; s.async = false; s.dataset.adminPage = '1';
      document.head.appendChild(s);
    }
  }, []);

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <span className="header-location">Owner dashboard</span>
          <span></span>
          <div className="header-actions"><a className="cart-link" href="/">Open storefront</a></div>
        </div>
      </header>
      <main>
        <section className="section">
          <div className="container">
            <div className="eyebrow">Owner dashboard</div>
            <h1 className="section-title">Rebesta Fresh operations</h1>
            <p className="section-subtitle">Run the whole shop from one screen — orders, fleet, stock and settings. Updates arrive live on their own.</p>
            <div className="admin-layout" style={{ marginTop: '28px' }}>
              <aside className="admin-side">
                <h2>Connection</h2>
                <form id="admin-key-form">
                  <div className="field"><label htmlFor="adminKey">Admin key</label><input id="adminKey" name="adminKey" type="password" autoComplete="current-password" required placeholder="Your production key" /></div>
                  <button className="button primary full" type="submit" data-connect-admin style={{ marginTop: '14px' }}>Connect dashboard</button>
                </form>
                <button className="button ghost full" type="button" data-refresh-admin>Refresh data</button>{' '}
                <button className="button ghost full" type="button" data-alert-toggle style={{ marginTop: '9px' }}>🔔 Order alerts: ON</button>{' '}
                <button className="button ghost full" type="button" data-export-csv style={{ marginTop: '9px' }}>⬇ Export orders CSV</button>{' '}
                <button className="button ghost full" type="button" data-download-backup style={{ marginTop: '9px' }}>💾 Download backup</button>
                <p className="summary-note">New orders arrive automatically with a chime — no refresh needed. Keep this tab open on shop days.</p>
              </aside>
              <div data-admin-content hidden>
                <nav className="admin-tabs" aria-label="Dashboard sections">
                  <button className="admin-tab active" type="button" data-tab-btn="dashboard">📊 Dashboard</button>
                  <button className="admin-tab" type="button" data-tab-btn="orders">📦 Orders</button>
                  <button className="admin-tab" type="button" data-tab-btn="fleet">🛵 Fleet &amp; Tracking</button>
                  <button className="admin-tab" type="button" data-tab-btn="products">🏪 Products</button>
                  <button className="admin-tab" type="button" data-tab-btn="settings">⚙️ Settings</button>
                  <span className="live-pill"><span className="live-dot"></span>Live</span>
                </nav>

                {/* ============ DASHBOARD ============ */}
                <section data-tab="dashboard">
                  <div className="metric-grid" data-dashboard data-admin-panel></div>
                  <section className="shop-panel" data-slots-panel style={{ marginBottom: '20px' }}></section>
                  <section className="shop-panel" data-subs-panel style={{ marginBottom: '20px' }}></section>
                  <section className="shop-panel" data-lowstock-panel style={{ marginBottom: '20px' }}></section>
                  <section className="shop-panel" data-sales-panel style={{ marginBottom: '20px' }}></section>
                  <section className="shop-panel" data-recent-panel style={{ marginBottom: '20px' }}></section>
                </section>

                {/* ============ ORDERS ============ */}
                <section data-tab="orders" hidden>
                  <section className="shop-panel" style={{ marginBottom: '20px' }}>
                    <div className="section-head" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                      <h2>Orders</h2>
                      <div className="orders-filter">
                        <select data-order-status-filter>
                          <option value="">All statuses</option>
                          <option value="ACTIVE">Active only</option>
                          <option value="PLACED">Placed</option>
                          <option value="CONFIRMED">Confirmed</option>
                          <option value="PACKING">Packing</option>
                          <option value="OUT_FOR_DELIVERY">Out for delivery</option>
                          <option value="DELIVERED">Delivered</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                        <input data-order-search type="search" placeholder="Search ID, name, phone…" style={{ minWidth: '180px' }} />
                      </div>
                    </div>
                    <div className="admin-table-wrap" data-orders-table data-admin-panel></div>
                  </section>
                  <section className="shop-panel" data-admin-panel>
                    <div className="section-head" style={{ marginBottom: '14px' }}><h2>Packing lists</h2><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><input type="date" data-packing-date style={{ minHeight: '38px', border: '1px solid var(--line-2)', borderRadius: '10px', padding: '6px 10px', background: '#fff' }} /><select data-packing-slot className="status-select"></select><button className="button orange small" type="button" data-packing-print>🖨 Print sheet</button></div></div>
                    <div data-packing-result></div>
                  </section>
                </section>

                {/* ============ FLEET & TRACKING ============ */}
                <section data-tab="fleet" hidden>
                  <section className="shop-panel" data-cash-panel style={{ marginBottom: '20px' }}></section>
                  <section className="shop-panel" data-tracking-panel style={{ marginBottom: '20px' }}></section>
                  <section className="shop-panel" data-partners-panel style={{ marginBottom: '20px' }}></section>
                </section>

                {/* ============ PRODUCTS ============ */}
                <section data-tab="products" hidden>
                  <section className="shop-panel" style={{ marginBottom: '20px' }}>
                    <div className="section-head" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                      <h2>Products</h2>
                      <button className="button orange small" type="button" data-open-editor>➕ Add product</button>
                    </div>
                    <form data-product-form className="form-grid" data-editor hidden>
                      <input type="hidden" name="handle" />
                      <div className="field"><label>Product title *</label><input name="title" maxLength={100} required placeholder="e.g. Ooty Beans" /></div>
                      <div className="field"><label>Category</label><input name="category" maxLength={60} list="categoryList" placeholder="Seasonal" /><datalist id="categoryList"></datalist></div>
                      <div className="field"><label>Price ₹ *</label><input name="priceInr" type="number" min={0} step="0.01" required inputMode="decimal" /></div>
                      <div className="field"><label>Compare-at ₹ <small>(strike-through, optional)</small></label><input name="compareAtInr" type="number" min={0} step="0.01" inputMode="decimal" /></div>
                      <div className="field"><label>Unit</label><input name="unitLabel" maxLength={30} list="unitList" placeholder="1 kg" /><datalist id="unitList"><option>1 kg</option><option>500 g</option><option>250 g</option><option>1 bunch</option><option>1 piece</option><option>1 pack</option><option>2 kg</option></datalist></div>
                      <div className="field"><label>Stock *</label><input name="stock" type="number" min={0} step={1} required inputMode="numeric" /></div>
                      <div className="field wide"><label>Description <small>(what customers read)</small></label><textarea name="description" maxLength={1500} rows={3} placeholder="Short, tasty description…"></textarea></div>
                      <div className="field wide"><div className="toggle-row"><label className="switch"><input type="checkbox" name="featured" /><span></span></label><span>Featured on home page</span></div></div>
                      <div className="field wide">
                        <label>Photo — camera or gallery</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <input type="file" accept="image/*" data-editor-photo style={{ display: 'none' }} />
                          <button className="button ghost small" type="button" data-editor-photo-btn>📸 Choose photo</button>
                          <span style={{ fontSize: '.8rem', color: 'var(--muted)' }} data-editor-photo-note>No photo yet — a basket image is used</span>
                          <img data-editor-preview style={{ width: '62px', height: '62px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--line-2)' }} alt="" hidden />
                        </div>
                      </div>
                      <div className="field wide" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="button orange" type="submit" data-editor-save>➕ Add product</button>
                        <button className="button ghost" type="button" data-editor-cancel>Cancel</button>
                        <span style={{ fontSize: '.82rem', color: 'var(--muted)' }} data-editor-hint></span>
                      </div>
                    </form>
                    <div className="shop-panel" data-reviews-panel style={{ marginBottom: '18px', padding: '16px' }}></div>
                    <div className="admin-table-wrap" data-products-table data-admin-panel></div>
                  </section>
                </section>

                {/* ============ SETTINGS ============ */}
                <section data-tab="settings" hidden>
                  <section className="shop-panel" style={{ marginBottom: '20px' }}>
                    <div className="section-head" style={{ marginBottom: '18px' }}>
                      <div><h2 style={{ marginBottom: '5px' }}>Website content &amp; delivery</h2><p className="section-subtitle" style={{ fontSize: '.94rem' }}>These changes save to the site immediately. No ZIP, FTP, or code editor required.</p></div>
                      <button className="button orange" type="submit" form="site-settings-form" data-save-settings>Save site settings</button>
                    </div>
                    <form id="site-settings-form" data-settings-form className="form-grid">
                      <div className="field"><label htmlFor="homeBadge">Home page badge</label><input id="homeBadge" name="homeBadge" maxLength={100} /></div>
                      <div className="field"><label htmlFor="homeTitle">Home page title</label><input id="homeTitle" name="homeTitle" maxLength={120} /></div>
                      <div className="field wide"><label htmlFor="homeSubtitle">Home page subtitle</label><input id="homeSubtitle" name="homeSubtitle" maxLength={200} /></div>
                      <div className="field"><label htmlFor="deliveryNoteTitle">Delivery note title</label><input id="deliveryNoteTitle" name="deliveryNoteTitle" maxLength={120} /></div>
                      <div className="field"><label htmlFor="deliveryNoteButton">Delivery note button</label><input id="deliveryNoteButton" name="deliveryNoteButton" maxLength={50} /></div>
                      <div className="field wide"><label htmlFor="deliveryNoteText">Delivery note text</label><input id="deliveryNoteText" name="deliveryNoteText" maxLength={200} /></div>
                      <div className="field"><label htmlFor="businessName">Business name</label><input id="businessName" name="businessName" maxLength={80} /></div>
                      <div className="field"><label htmlFor="whatsapp">WhatsApp number</label><input id="whatsapp" name="whatsapp" placeholder="918438765119" maxLength={20} /></div>
                      <div className="field"><label htmlFor="phoneDisplay">Phone display</label><input id="phoneDisplay" name="phoneDisplay" placeholder="+91 84387 65119" maxLength={25} /></div>
                      <div className="field"><label htmlFor="city">City</label><input id="city" name="city" maxLength={50} /></div>
                      <div className="field"><label htmlFor="hubLat">Hub latitude</label><input id="hubLat" name="hubLat" inputMode="decimal" /></div>
                      <div className="field"><label htmlFor="hubLng">Hub longitude</label><input id="hubLng" name="hubLng" inputMode="decimal" /></div>
                      <div className="field"><label htmlFor="maxRoadKm">Maximum road-km delivery radius</label><input id="maxRoadKm" name="maxRoadKm" inputMode="decimal" /></div>
                      <div className="field"><label htmlFor="freeOverInr">Basket value for free delivery</label><input id="freeOverInr" name="freeOverInr" inputMode="decimal" /></div>
                      <div className="field"><label htmlFor="slotCapacity">Orders per morning slot (capacity cap)</label><input id="slotCapacity" name="slotCapacity" inputMode="numeric" placeholder="25" /><small>Full slots are hidden at checkout — never over-promise a morning.</small></div>
                      <div className="field wide">
                        <div className="section-head" style={{ margin: '16px 0 12px' }}>
                          <div><strong style={{ color: 'var(--forest-2)' }}>🎟 Coupon codes</strong><br /><small style={{ color: 'var(--muted)' }}>Customers apply these at checkout. Flat ₹ off or % off, with an optional minimum basket.</small></div>
                          <button className="button ghost small" type="button" data-add-coupon>+ Add coupon</button>
                        </div>
                        <div className="admin-table-wrap" style={{ borderRadius: '16px' }}>
                          <table className="admin-table coupons-table" style={{ minWidth: '620px' }}>
                            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min basket ₹</th><th>Active</th><th></th></tr></thead>
                            <tbody data-coupon-body></tbody>
                          </table>
                        </div>
                        <div className="section-head" style={{ margin: '22px 0 12px' }}>
                          <h3>Customer testimonials (home page)</h3>
                          <button className="button ghost small" type="button" data-add-testimonial>+ Add review</button>
                        </div>
                        <div className="admin-table-wrap">
                          <table className="admin-table">
                            <thead><tr><th>Name</th><th>Area</th><th>Review</th><th>★</th><th></th></tr></thead>
                            <tbody data-testimonial-body></tbody>
                          </table>
                        </div>
                        <div className="settings-subgrid">
                          <div className="field"><label>Reward % (loyalty cashback)</label><input name="loyaltyPercent" inputMode="numeric" placeholder="2" /></div>
                          <div className="field"><label>Loyalty min basket ₹</label><input name="loyaltyMinOrder" inputMode="numeric" placeholder="299" /></div>
                          <div className="field"><label>Loyalty valid days</label><input name="loyaltyValidity" inputMode="numeric" placeholder="60" /></div>
                          <div className="field"><label>Referral bonus ₹ (both sides)</label><input name="referralBonus" inputMode="numeric" placeholder="50" /></div>
                        </div>
                        <div className="toggle-row"><label className="switch"><input type="checkbox" name="loyaltyEnabled" /><span></span></label><span>Loyalty rewards ON — delivered orders auto-earn a LOY- coupon</span></div>
                        <div className="toggle-row"><label className="switch"><input type="checkbox" name="referralEnabled" /><span></span></label><span>Referral programme ON — friend's phone at checkout earns both sides a REF- coupon</span></div>
                        <div className="section-head" style={{ margin: '22px 0 12px' }}><h3>Store controls</h3></div>
                        <div className="toggle-row"><label className="switch"><input type="checkbox" name="onlineEnabled" /><span></span></label><span>Online payments ON — UPI / cards / netbanking via Cashfree at checkout<br /><small data-cf-key-status style={{ color: 'var(--muted)' }}></small></span></div>
                        <div className="field"><label>Cashfree App ID</label><input name="cfAppId" autoComplete="off" placeholder="e.g. 12855655test…" /></div>
                        <div className="field"><label>Cashfree Secret Key</label><input name="cfSecretKey" type="password" placeholder="unchanged — paste key from Cashfree dashboard" autoComplete="new-password" /></div>
                        <div className="field"><label>Cashfree mode</label><select name="cfMode"><option value="test">Test (sandbox)</option><option value="live">Live (real money)</option></select></div>
                        <div className="field wide" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button className="button small" type="button" data-cf-save>Save Cashfree keys</button> <button className="button ghost small" type="button" data-cf-test>Test keys (creates a ₹1 order)</button> <small data-cf-save-status style={{ color: 'var(--muted)', alignSelf: 'center' }}></small></div>
                        <div className="toggle-row"><label className="switch"><input type="checkbox" name="maintenanceEnabled" /><span></span></label><span>Maintenance mode — pause new orders (shows a friendly banner)</span></div>
                        <div className="field wide"><label>Maintenance message</label><input name="maintenanceMessage" maxLength={200} placeholder="We are briefly paused for restocking — orders resume soon!" /></div>
                        <div className="field wide"><label>FSSAI licence number (shown in footer &amp; About)</label><input name="fssai" maxLength={20} placeholder="e.g. 21523005000123" /></div>
                        <div className="field wide"><label>Google Analytics ID (optional)</label><input name="gaId" maxLength={15} placeholder="G-XXXXXXXXXX" /></div>
                        <div className="section-head" style={{ margin: '18px 0 10px' }}><h3>📧 Email notifications</h3><small data-mail-status style={{ color: 'var(--muted)' }}></small></div>
                        <div className="field"><label>Gmail address (sends the emails)</label><input name="smtpUser" type="email" placeholder="you@gmail.com" autoComplete="off" /></div>
                        <div className="field"><label>Gmail App Password</label><input name="smtpPass" type="password" placeholder="unchanged — paste 16-char app password" autoComplete="new-password" /></div>
                        <div className="field wide"><label>Send order alerts to (email)</label><input name="smtpNotify" type="email" placeholder="defaults to the Gmail above" /></div>
                        <div className="field wide">
                          <div className="section-head" style={{ margin: '10px 0 12px' }}>
                            <div><strong style={{ color: 'var(--green-900)' }}>Delivery fee tiers by road distance</strong><br /><small id="tier-help" style={{ color: 'var(--muted)' }}>Edit distance ranges and prices carefully. Changes apply at checkout immediately.</small></div>
                            <button className="button ghost small" type="button" data-reset-tiers>Reset default tiers</button>
                          </div>
                          <div className="admin-table-wrap" style={{ borderRadius: '16px' }}>
                            <table className="admin-table tiers-table" style={{ minWidth: '560px' }}>
                              <thead><tr><th>Label</th><th>From (&gt;)</th><th>To (≤)</th><th>Fee ₹</th></tr></thead>
                              <tbody data-tier-body></tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </form>
                  </section>
                </section>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
