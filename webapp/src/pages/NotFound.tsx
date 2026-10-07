import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';

/* 404 — served by the server for any unknown path; main.tsx routes unknown paths here too. */
export default function NotFound() {
  return (
    <>
      <VanillaHeader help={{ text: 'Help', href: 'https://wa.me/918438765119' }} />
      <main><section className="section"><div className="container" style={{ maxWidth: '600px', textAlign: 'center' }}>
        <div className="shop-panel" style={{ padding: '44px 32px' }}>
          <div style={{ fontSize: '2rem', letterSpacing: '8px', marginBottom: '4px' }} aria-hidden="true">🥕🥬🍅</div>
          <div className="error-code">404</div>
          <h1 className="section-title">This page rolled off somewhere</h1>
          <p className="section-subtitle" style={{ marginBottom: '24px' }}>The link is old or mistyped — but don't worry, the fresh stock is exactly where you left it.</p>
          <div className="success-actions" style={{ justifyContent: 'center' }}>
            <a className="button orange" href="/">Shop fresh stock</a>
            <a className="button primary" href="/track">Track my order</a>
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter fssai />
      <VanillaMobileCartBar />
    </>
  );
}
