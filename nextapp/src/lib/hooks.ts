"use client";

import { useSyncExternalStore } from "react";
import { CART_EVENT, cartCount, LOCATION_EVENT, readCart, getSavedLocation, CART_KEY, LOCATION_KEY, CartLine, SavedLocation } from "./store";

/* ---- live cart count for the header badge ---- */
let countSnapshot = 0;
const countSub = (cb: () => void) => {
  countSnapshot = cartCount();
  window.addEventListener(CART_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CART_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const getCount = () => {
  const c = cartCount();
  if (c !== countSnapshot) countSnapshot = c;
  return countSnapshot;
};
export function useCartCount() {
  return useSyncExternalStore(countSub, getCount, () => 0);
}

/* ---- saved location (snapshot must be referentially stable!) ---- */
let locRaw = "__unset__";
let locSnapshot: SavedLocation | null = null;
const locSub = (cb: () => void) => {
  locRaw = localStorage.getItem(LOCATION_KEY) || "";
  locSnapshot = locRaw ? getSavedLocation() : null;
  window.addEventListener(LOCATION_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LOCATION_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const getLoc = (): SavedLocation | null => {
  const raw = localStorage.getItem(LOCATION_KEY) || "";
  if (raw !== locRaw) {
    locRaw = raw;
    locSnapshot = raw ? getSavedLocation() : null;
  }
  return locSnapshot;
};
export function useSavedLocation() {
  return useSyncExternalStore(locSub, getLoc, () => null);
}

/* ---- per-product carted qty (lines compared by value) ---- */
let linesRaw = "";
let linesSnapshot: CartLine[] = [];
const linesSub = (cb: () => void) => {
  linesRaw = localStorage.getItem(CART_KEY) || "";
  linesSnapshot = linesRaw ? readCart() : [];
  window.addEventListener(CART_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CART_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const getLines = (): CartLine[] => {
  const raw = localStorage.getItem(CART_KEY) || "";
  if (raw !== linesRaw) {
    linesRaw = raw;
    linesSnapshot = raw ? readCart() : [];
  }
  return linesSnapshot;
};
export function useCartQty(handle: string) {
  const lines = useSyncExternalStore(linesSub, getLines, () => [] as CartLine[]);
  return lines.find((l) => l.handle === handle)?.qty || 0;
}

/* ---- full cart lines for the basket page ---- */
export function useCartLines() {
  return useSyncExternalStore(linesSub, getLines, () => [] as CartLine[]);
}
