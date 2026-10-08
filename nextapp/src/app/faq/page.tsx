import type { Metadata } from "next";
import { InfoShell } from "@/components/info-shell";

export const metadata: Metadata = {
  title: "FAQ — Delivery, Slots, COD & Coupons | Rebesta Fresh",
  description: "Everything customers ask us on WhatsApp, answered in one place — areas, slots, charges, COD, coupons and more.",
};

const FAQS: [string, React.ReactNode][] = [
  ["Which areas do you deliver to?", "All of Hosur town plus nearby areas within a 9 km road radius of our hub. Drop your map pin at checkout — we confirm eligibility and show your exact delivery fee before you pay."],
  ["What are the delivery slots?", <>Two fixed morning slots every day: <strong>7–9 AM</strong> and <strong>9–11 AM</strong>. Order by 9 PM the previous night for next-morning delivery.</>],
  ["What are the delivery charges?", <>Based on distance from our hub — shown live at checkout once you drop your pin. Delivery is <strong>free on baskets above ₹500</strong>.</>],
  ["Is Cash on Delivery available?", "Yes! COD is our default payment method across all serviceable areas. Online payment via UPI/cards is also available at checkout."],
  ["How do coupons and reward codes work?", "Enter the code in the coupon box at checkout. Discount applies instantly. Loyalty (LOY-…) and referral (REF-…) codes are single-use, personal reward coupons tied to your orders."],
  ["How do loyalty rewards work?", "Every delivered order earns you a LOY coupon worth about 2% of your basket — usable on your next order. It appears on the Track page after delivery."],
  ["How does the referral programme work?", <>Share your registered mobile number with a friend. They enter it in the referral box at checkout on their first order — when that order is delivered, you <em>both</em> get a ₹50 REF coupon.</>],
  ["Can I cancel my order?", "Yes — COD orders can be cancelled from the Track page until we start packing (usually early morning of delivery). After that, WhatsApp us and we'll help."],
  ["What if vegetables are not fresh?", "Send a photo on WhatsApp the same day — we replace the item on your next delivery or refund it. That's our freshness promise."],
  ["Do you take bulk or function orders?", <>Yes! WhatsApp us at <a href="https://wa.me/918438765119">+91 84387 65119</a> at least 2 days ahead for bulk vegetables, marriages and functions.</>],
];

export default function FaqPage() {
  return (
    <InfoShell eyebrow="Questions" title="Frequently asked questions" subtitle="Everything customers ask us on WhatsApp, answered in one place.">
      <div className="faq-list">
        {FAQS.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </InfoShell>
  );
}
