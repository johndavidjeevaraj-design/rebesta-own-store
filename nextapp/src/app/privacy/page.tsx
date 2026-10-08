import type { Metadata } from "next";
import { InfoShell } from "@/components/info-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Rebesta Fresh",
  description: "We collect the minimum data needed to put vegetables at your door — and nothing else.",
};

export default function PrivacyPage() {
  return (
    <InfoShell eyebrow="Legal" title="Privacy policy" subtitle="We collect the minimum data needed to put vegetables at your door — and nothing else.">
      <p>Last updated: September 2026</p>
      <h3>1. What we collect</h3>
      <p>
        Name, mobile number, delivery address, map pin and order details. If you choose online payment, the payment is processed by PayU — we never
        see or store your card/UPI credentials.
      </p>
      <h3>2. Why we collect it</h3>
      <ul>
        <li>To pack and deliver your order to the right place.</li>
        <li>To send order updates (WhatsApp/email, if you share an email).</li>
        <li>Order history and reward coupons tied to your phone number.</li>
      </ul>
      <h3>3. What we never do</h3>
      <p>
        We do not sell, rent or share your data with advertisers. Data is shared only with our delivery team (address + phone for your delivery) and
        payment gateway (for online payments).
      </p>
      <h3>4. Storage and security</h3>
      <p>Order data is stored on our secured server with access restricted to the store owner. Public order lookup requires both your order ID and phone number.</p>
      <h3>5. Cookies and analytics</h3>
      <p>
        We use a small local storage entry to remember your basket and preferences. If enabled, Google Analytics collects anonymised visit
        statistics to improve the store.
      </p>
      <h3>6. Your rights</h3>
      <p>
        WhatsApp us to request a copy of your data or deletion of your account/history. Order records may be retained briefly for accounting as
        required by law.
      </p>
      <h3>7. Contact</h3>
      <p>
        WhatsApp <a href="https://wa.me/918438765119">+91 84387 65119</a> · rebestafresh.in
      </p>
    </InfoShell>
  );
}
