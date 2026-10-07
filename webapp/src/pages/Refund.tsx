import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';

/* Refund & cancellation policy — static prose. */
export default function Refund() {
  return (
    <>
      <VanillaHeader help={{ text: 'Help', href: 'https://wa.me/918438765119' }} />
      <main><section className="section"><div className="container prose-page">
        <div className="shop-panel" style={{ padding: '32px' }}>
          <span className="eyebrow">Policies</span>
          <h1 className="section-title">Refund &amp; cancellation policy</h1>
          <p className="section-subtitle" style={{ marginBottom: '22px' }}>Our freshness promise: if it is not fresh, it is free.</p>
          <div className="prose">
            <p>Last updated: September 2026</p>
            <h3>Cancellation by you</h3>
            <ul>
              <li><strong>Before packing starts</strong> (usually before 6 AM on delivery day): cancel yourself from the <a href="/track">Track page</a> — instant, no charges.</li>
              <li><strong>After packing / out for delivery:</strong> WhatsApp us — we will try to stop the rider; if delivered, the item quality rules below apply instead.</li>
            </ul>
            <h3>Cancellation by us</h3>
            <p>If we cannot service your area, pin, or an item is out of stock, we inform you on WhatsApp before the slot. Any online payment made is refunded in full within 3–5 working days.</p>
            <h3>Freshness promise</h3>
            <p>If any vegetable is spoiled, wilted or below expectation: send a photo on WhatsApp <strong>the same day</strong>. We replace the item free on your next delivery, or refund it — your choice. For COD orders the refund is adjusted against your next order or returned in cash/UPI.</p>
            <h3>Refund timelines</h3>
            <ul>
              <li><strong>UPI:</strong> 1–3 working days &nbsp;·&nbsp; <strong>Bank cards/netbanking:</strong> 3–7 working days (via PayU to the original payment method).</li>
              <li>Coupon-based discounts are refunded as coupon value only, never cash.</li>
            </ul>
            <h3>Non-returnable cases</h3>
            <p>For hygiene and perishability we cannot accept returned produce once accepted in good condition at the door — please check the bag at delivery. Our team carries a weighing scale: verify weights on the spot.</p>
            <h3>How to reach us</h3>
            <p>WhatsApp <a href="https://wa.me/918438765119">+91 84387 65119</a> with your RB- order ID — fastest route to a resolution.</p>
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter fssai />
      <VanillaMobileCartBar />
    </>
  );
}
