import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';

/* Terms of use — static prose. */
export default function Terms() {
  return (
    <>
      <VanillaHeader help={{ text: 'Help', href: 'https://wa.me/918438765119' }} />
      <main><section className="section"><div className="container prose-page">
        <div className="shop-panel" style={{ padding: '32px' }}>
          <span className="eyebrow">Legal</span>
          <h1 className="section-title">Terms of use</h1>
          <p className="section-subtitle" style={{ marginBottom: '22px' }}>The simple rules that keep our farm-to-door service fair for everyone.</p>
          <div className="prose">
            <p>Last updated: September 2026</p>
            <h3>1. Who we are</h3>
            <p>Rebesta Fresh ("we", "us") delivers farm-sourced vegetables to customers in and around Hosur, Tamil Nadu. By placing an order on rebestafresh.in you agree to these terms.</p>
            <h3>2. Orders and acceptance</h3>
            <p>An order is confirmed when you receive the order confirmation with an RB- order ID. We may decline or cancel orders where the address is outside our service area, stock is exhausted, or the order appears fraudulent. If vegetables run out after your order, we inform you on WhatsApp and refund/refill equivalent value.</p>
            <h3>3. Pricing and weight</h3>
            <p>Prices are per kg/per unit as displayed and may change with market rates. Weight is approximate at display; you are billed for the actual packed weight. If actual weight is lower, the difference is refunded; if higher, we absorb it.</p>
            <h3>4. Payment</h3>
            <p>Cash on Delivery (COD) and online payment (PayU — UPI/cards/netbanking) are supported. For COD, please keep the exact amount ready if possible. Online payments are processed by PayU under their terms.</p>
            <h3>5. Delivery</h3>
            <p>We deliver in fixed morning slots to the map pin provided at checkout. Please ensure someone is available to receive the order. Failed attempts may attract a re-delivery fee.</p>
            <h3>6. Cancellations</h3>
            <p>COD orders can be self-cancelled from the Track page until packing begins. Later cancellations and online-paid orders are handled per our <a href="/refund">Refund &amp; Cancellation policy</a>.</p>
            <h3>7. Coupons and rewards</h3>
            <p>Coupons, loyalty (LOY-) and referral (REF-) codes are single-use unless stated otherwise, are personal, and carry no cash value. We may withdraw a promotional code at any time.</p>
            <h3>8. Liability</h3>
            <p>Our liability for any order is limited to the order value. We are not liable for indirect losses. Nothing here limits consumer rights under Indian law.</p>
            <h3>9. Contact</h3>
            <p>WhatsApp <a href="https://wa.me/918438765119">+91 84387 65119</a> · rebestafresh.in</p>
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter fssai />
      <VanillaMobileCartBar />
    </>
  );
}
