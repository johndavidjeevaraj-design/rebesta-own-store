/* Shared Cashfree client helpers — used by the cart checkout AND the
   order-success retry-payment flow. Kept framework-free on purpose. */

export function loadCashfreeSdk(): Promise<void> {
  if ((window as any).Cashfree) return Promise.resolve();
  const urls = ["https://sdk.cashfree.com/js/v3/cashfree.js", "https://js.cashfree.com/cashfree-js.js", "https://js.cashfree.com/v2/cashfree.js"];
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) return reject(new Error("Could not load the payment page (script blocked). Check your network and try again."));
      const script = document.createElement("script");
      script.src = urls[i++];
      script.onload = () => ((window as any).Cashfree ? resolve() : tryNext());
      script.onerror = tryNext;
      document.head.appendChild(script);
    };
    tryNext();
  });
}

export async function getCashfreeClient(mode?: string) {
  await loadCashfreeSdk();
  const m = mode === "live" ? "production" : "sandbox";
  const Cashfree = (window as any).Cashfree;
  return typeof Cashfree === "function" ? Cashfree({ mode: m }) : await Cashfree.load({ mode: m });
}

/* drop-in: Cashfree's checkout renders INSIDE our page — no redirect away.
   SDK contract: redirectTarget must be the ELEMENT itself (HTMLElement),
   not a selector string — anything else falls back to a full-page redirect. */
export async function startCashfreeDropin(el: string, payment: { sessionId: string; mode?: string }) {
  const cashfree = await getCashfreeClient(payment.mode);
  const target = document.querySelector(el);
  if (!target) throw new Error("checkout container missing");
  cashfree.checkout({ paymentSessionId: payment.sessionId, redirectTarget: target, redirect: "if_required" });
}

/* UPI intents for an order — our server creates ONE payment attempt via
   Cashfree's link channel and hands us the raw intent links (generic
   upi:// + per-app). Cached per order so repeat launches ("Open app again",
   QR + app on the same order) reuse the same attempt instead of piling up
   new ones on Cashfree. */
const upiIntents: Record<string, any> = {};
export async function fetchUpiIntents(orderId: string) {
  if (upiIntents[orderId]) return upiIntents[orderId];
  const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/upi-qr`, { method: "POST" });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !(data.qr || data.apps?.default)) throw new Error(data.error || "Could not create the UPI payment");
  upiIntents[orderId] = data;
  return data;
}

/* Swiggy-style app launch: open the customer's UPI app DIRECTLY with the
   payment prefilled. Deliberately no Cashfree SDK element here — its upiApp
   flow redirects the whole page to Cashfree's hosted checkout whenever it
   can't complete in-page (app missing, iOS quirks, element load error).
   Navigating to the app scheme ourselves can only ever open the app; if it
   can't, the page simply stays put and the sheet keeps waiting. */
export async function startUpiApp(payment: { orderId: string; app?: string }) {
  const data = await fetchUpiIntents(payment.orderId);
  const apps = data.apps || {};
  const link = apps[payment.app || "default"] || apps.default || data.qr;
  if (!link) throw new Error("Could not create the UPI payment");
  window.location.href = link;
  return true;
}

/* desktop: render the UPI QR OURSELVES as pure SVG from the raw upi:// intent.
   Cashfree's widgets can't be used here: their iframe QR ships a permanent
   blur(3px) loading state, and their qrcode payload is a 256px PNG that goes
   soft on retina screens. An SVG QR is mathematically crisp at any size. */
export async function startUpiQr(payment: { orderId: string; host?: string }) {
  const host = document.querySelector(payment.host || "#cf-qr");
  if (!host) throw new Error("qr container missing");
  const data = await fetchUpiIntents(payment.orderId);
  const { default: QRCode } = await import("qrcode");
  const svg = await QRCode.toString(String(data.qr), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  host.innerHTML = svg;
  const el = host.querySelector("svg");
  if (el) {
    el.setAttribute("width", "280");
    el.setAttribute("height", "280");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "UPI payment QR");
    el.setAttribute("shape-rendering", "crispEdges");
    el.style.display = "block";
  }
}
