import type { Metadata } from "next";
import { InfoShell } from "@/components/info-shell";
import { FssaiLine } from "@/components/fssai-line";

export const metadata: Metadata = {
  title: "About Us — Farm-Fresh Vegetables from Hosur | Rebesta Fresh",
  description: "We buy direct from farmers around Hosur and Denkanikottai — harvested, hand-sorted and delivered to your door the next morning.",
};

export default function AboutPage() {
  return (
    <InfoShell eyebrow="Our story" title="Farm fresh, from Hosur to your kitchen" subtitle="We started Rebesta Fresh with one simple belief: every family in Hosur deserves vegetables that were in the ground yesterday.">
      <p>
        <strong>We buy direct from farmers around Hosur and Denkanikottai.</strong> No cold storage, no middle mandi, no waxed produce. Vegetables
        are harvested, sorted by hand the same evening, and at your door the next morning — usually within 12 hours of harvest.
      </p>
      <h3>What makes us different</h3>
      <ul>
        <li>
          <strong>Honest weight.</strong> You pay for the exact weight you order — we weigh again at packing and add a little extra, never less.
        </li>
        <li>
          <strong>Fixed morning slots.</strong> Choose 7–9 AM or 9–11 AM. Your vegetables arrive before lunch, not at random evening hours.
        </li>
        <li>
          <strong>Transparent delivery fee.</strong> Based on your map pin distance from our hub — shown before you pay. Free above ₹500.
        </li>
        <li>
          <strong>Cash on delivery.</strong> Inspect the bag, then pay. Simple.
        </li>
        <li>
          <strong>Freshness promise.</strong> Anything not fresh? Photo on WhatsApp and we replace or refund — no questions, no forms.
        </li>
      </ul>
      <h3>Where we deliver</h3>
      <p>
        All of Hosur town and nearby areas up to a 9 km road radius from our hub. Enter your map pin at checkout to confirm exact eligibility and
        delivery fee.
      </p>
      <h3>Talk to us</h3>
      <p>
        WhatsApp is the fastest way to reach us: <a href="https://wa.me/918438765119">+91 84387 65119</a>. Whether it&rsquo;s a special vegetable
        request, a bulk order for a function, or feedback — we reply the same day.
      </p>
      <FssaiLine />
    </InfoShell>
  );
}
