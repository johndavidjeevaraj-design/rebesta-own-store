"use client";

import { useEffect } from "react";

/* registers the service worker so the site is an installable web app
   (Add to Home Screen / Install app) — same as the legacy pages had.
   Registration happens after load so it never competes with first paint. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline SW is a bonus, never a blocker */ });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
