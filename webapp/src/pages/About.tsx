import { useEffect, useState } from 'react';
import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';
import { api } from '../shared/store';

/* About us — static prose page; the FSSAI line fills from /api/settings (vanilla inline script). */
export default function About() {
  const [fssai, setFssai] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    api('/api/settings')
      .then((d: any) => { if (live) setFssai(d?.business?.fssai || null); })
      .catch(() => { })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  return (
    <>
      <VanillaHeader help={{ text: 'Help', href: 'https://wa.me/918438765119' }} />
      <main><section className="section"><div className="container prose-page">
        <div className="shop-panel" style={{ padding: '32px' }}>
          <span className="eyebrow">Our story</span>
          <h1 className="section-title">Farm fresh, from Hosur to your kitchen</h1>
          <p className="section-subtitle" style={{ marginBottom: '22px' }}>We started Rebesta Fresh with one simple belief: every family in Hosur deserves vegetables that were in the ground yesterday.</p>
          <div className="prose">
            <p><strong>We buy direct from farmers around Hosur and Denkanikottai.</strong> No cold storage, no middle mandi, no waxed produce. Vegetables are harvested, sorted by hand the same evening, and at your door the next morning — usually within 12 hours of harvest.</p>
            <h3>What makes us different</h3>
            <ul>
              <li><strong>Honest weight.</strong> You pay for the exact weight you order — we weigh again at packing and add a little extra, never less.</li>
              <li><strong>Fixed morning slots.</strong> Choose 7–9 AM or 9–11 AM. Your vegetables arrive before lunch, not at random evening hours.</li>
              <li><strong>Transparent delivery fee.</strong> Based on your map pin distance from our hub — shown before you pay. Free above ₹500.</li>
              <li><strong>Cash on delivery.</strong> Inspect the bag, then pay. Simple.</li>
              <li><strong>Freshness promise.</strong> Anything not fresh? Photo on WhatsApp and we replace or refund — no questions, no forms.</li>
            </ul>
            <h3>Where we deliver</h3>
            <p>All of Hosur town and nearby areas up to a 9 km road radius from our hub. Enter your map pin at checkout to confirm exact eligibility and delivery fee.</p>
            <h3>Talk to us</h3>
            <p>WhatsApp is the fastest way to reach us: <a href="https://wa.me/918438765119">+91 84387 65119</a>. Whether it's a special vegetable request, a bulk order for a function, or feedback — we reply the same day.</p>
            <p className="fssai-line" data-fssai-line style={ready && !fssai ? { display: 'none' } : undefined}>FSSAI license number: <strong data-fssai-value>{fssai || '—'}</strong></p>
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter fssai />
      <VanillaMobileCartBar />
    </>
  );
}
