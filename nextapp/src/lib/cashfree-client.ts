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

/* Swiggy-style UPI intent: launch the customer's chosen UPI app with the
   payment prefilled. The upiApp element must be mounted (hidden) first, then
   triggered via cashfree.pay(). Mobile only — desktop uses the QR element. */
export async function startUpiApp(payment: { sessionId: string; mode?: string; app: string; orderId: string }) {
  const cashfree = await getCashfreeClient(payment.mode);
  if (!document.querySelector("#cf-upi-hidden")) throw new Error("upi container missing");
  const comp = cashfree.create("upiApp", { values: { upiApp: payment.app } });
  comp.mount("#cf-upi-hidden");
  await new Promise<void>((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    comp.on("ready", fin);
    comp.on("loaderror", fin);
    setTimeout(fin, 2500);
  });
  const res = await cashfree.pay({
    paymentMethod: comp,
    paymentSessionId: payment.sessionId,
    returnUrl: `${location.origin}/api/payments/cashfree/callback?order_id=${encodeURIComponent(payment.orderId)}`,
    redirect: "if_required",
  });
  return res;
}

/* desktop: render the UPI QR OURSELVES as pure SVG from the raw upi:// intent.
   Cashfree's widgets can't be used here: their iframe QR ships a permanent
   blur(3px) loading state, and their qrcode payload is a 256px PNG that goes
   soft on retina screens. An SVG QR is mathematically crisp at any size. */
export async function startUpiQr(payment: { orderId: string }) {
  const host = document.querySelector("#cf-qr");
  if (!host) throw new Error("qr container missing");
  const res = await fetch(`/api/orders/${encodeURIComponent(payment.orderId)}/upi-qr`, { method: "POST" });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.qr) throw new Error(data.error || "Could not create the QR payment");
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
