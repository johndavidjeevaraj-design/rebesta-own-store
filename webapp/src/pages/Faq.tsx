import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';

/* FAQ — native <details>/<summary> accordion, no JS on the vanilla page. */
export default function Faq() {
  return (
    <>
      <VanillaHeader help={{ text: 'Help', href: 'https://wa.me/918438765119' }} />
      <main><section className="section"><div className="container prose-page">
        <div className="shop-panel" style={{ padding: '32px' }}>
          <span className="eyebrow">Questions</span>
          <h1 className="section-title">Frequently asked questions</h1>
          <p className="section-subtitle" style={{ marginBottom: '22px' }}>Everything customers ask us on WhatsApp, answered in one place.</p>
          <div className="faq-list">
            <details><summary>Which areas do you deliver to?</summary><p>All of Hosur town plus nearby areas within a 9 km road radius of our hub. Drop your map pin at checkout — we confirm eligibility and show your exact delivery fee before you pay.</p></details>
            <details><summary>What are the delivery slots?</summary><p>Two fixed morning slots every day: <strong>7–9 AM</strong> and <strong>9–11 AM</strong>. Order by 9 PM the previous night for next-morning delivery.</p></details>
            <details><summary>What are the delivery charges?</summary><p>Based on distance from our hub — shown live at checkout once you drop your pin. Delivery is <strong>free on baskets above ₹500</strong>.</p></details>
            <details><summary>Is Cash on Delivery available?</summary><p>Yes! COD is our default payment method across all serviceable areas. Online payment via UPI/cards is also available at checkout.</p></details>
            <details><summary>How do coupons and reward codes work?</summary><p>Enter the code in the coupon box at checkout. Discount applies instantly. Loyalty (LOY-…) and referral (REF-…) codes are single-use, personal reward coupons tied to your orders.</p></details>
            <details><summary>How do loyalty rewards work?</summary><p>Every delivered order earns you a LOY coupon worth about 2% of your basket — usable on your next order. It appears on the Track page after delivery.</p></details>
            <details><summary>How does the referral programme work?</summary><p>Share your registered mobile number with a friend. They enter it in the referral box at checkout on their first order — when that order is delivered, you <em>both</em> get a ₹50 REF coupon.</p></details>
            <details><summary>Can I cancel my order?</summary><p>Yes — COD orders can be cancelled from the Track page until we start packing (usually early morning of delivery). After that, WhatsApp us and we'll help.</p></details>
            <details><summary>What if vegetables are not fresh?</summary><p>Send a photo on WhatsApp the same day — we replace the item on your next delivery or refund it. That's our freshness promise.</p></details>
            <details><summary>Do you take bulk or function orders?</summary><p>Yes! WhatsApp us at <a href="https://wa.me/918438765119">+91 84387 65119</a> at least 2 days ahead for bulk vegetables, marriages and functions.</p></details>
          </div>
        </div>
      </div></section></main>
      <VanillaBottomNav />
      <VanillaFooter fssai />
      <VanillaMobileCartBar />
    </>
  );
}
