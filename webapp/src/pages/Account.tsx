import { useEffect } from 'react';
import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';

/* Account page — static JSX island driven by /js/auth.js:
   /api/auth/me → profile card + verified chip + sign out, /api/auth/orders → order cards. */
export default function Account() {

  useEffect(() => {
    if (!document.querySelector('script[data-auth-page]')) {
      const s = document.createElement('script');
      s.src = '/js/auth.js?v=20261005d'; s.async = true; s.dataset.authPage = '1';
      document.head.appendChild(s);
    }
  }, []);

  return (
    <>
      <VanillaHeader showAccount={false} />
      <main><section className="section"><div className="container" style={{ maxWidth: '730px' }}>
        <div data-account-signedout className="shop-panel" style={{ padding: '36px', textAlign: 'center' }} hidden>
          <span className="eyebrow">Account</span>
          <h1 className="section-title">You're not signed in</h1>
          <p className="section-subtitle" style={{ marginBottom: '20px' }}>Sign in to see your orders and profile — or keep shopping, no account needed.</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="button orange" href="/login">Sign in</a>
            <a className="button ghost" href="/login">Sign in / create account</a>
          </div>
        </div>
        <div data-account-view hidden>
          <div className="shop-panel account-panel" style={{ padding: '24px' }}>
            <div className="account-head">
              <span className="account-avatar" data-account-avatar aria-hidden="true">R</span>
              <div className="account-id">
                <h1 className="section-title" style={{ fontSize: '1.35rem' }} data-account-name>…</h1>
                <p className="section-subtitle" style={{ margin: '2px 0 0' }} data-account-meta></p>
              </div>
              <button className="button ghost small" type="button" data-logout>Sign out</button>
            </div>
          </div>
          <div style={{ marginTop: '22px' }}>
            <div className="section-head" style={{ marginBottom: '12px' }}><div><span className="eyebrow">History</span><h2 className="section-title" style={{ fontSize: '1.2rem' }}>Your orders</h2></div></div>
            <div data-orders-list></div>
            <div data-orders-empty className="empty-state" hidden style={{ padding: '28px' }}>
              <h3>No orders yet</h3>
              <p>Your first Rebesta order will appear here.</p>
              <a className="button orange" href="/shop">Start shopping</a>
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
