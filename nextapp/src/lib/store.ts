/* Shared frontend contracts — identical keys/events to the vite app's store,
   so the Next home, the old shop/cart pages and the vanilla islands all stay
   perfectly in sync (same localStorage cart, same location, same events). */

export interface Variant { id: string; label: string; priceInr: number; default?: boolean }

export interface Product {
  handle: string;
  title: string;
  category: string;
  priceInr: number;
  compareAtInr?: number | null;
  unitLabel: string;
  image: string;
  stock: number;
  active: boolean;
  featured?: boolean;
  homeOrder?: number | null;
  description?: string;
  tags?: string[];
  sku?: string;
  baseHandle?: string;
  weightGrams?: number;
  variantTitle?: string;
  variants?: Variant[];
}

export interface CartLine { handle: string; qty: number; variant?: string }

export interface SavedLocation { label?: string; lat: number; lng: number; source?: string }

export interface Settings {
  business?: { name?: string; whatsapp?: string; phoneDisplay?: string; city?: string; fssai?: string };
  content?: { homeBadge?: string; homeTitle?: string; homeSubtitle?: string; deliveryNoteTitle?: string; deliveryNoteText?: string; deliveryNoteButton?: string };
  delivery?: { maxRoadKm?: number; freeOverInr?: number };
  payments?: { codEnabled?: boolean; onlineEnabled?: boolean };
}

export const CART_KEY = "rebesta_own_cart_v1";
export const LOCATION_KEY = "rebesta_own_location_v1";
export const CART_EVENT = "rebesta:cart-changed";
export const LOCATION_EVENT = "rebesta:location-changed";

export const money = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: Number(value) % 1 ? 2 : 0,
  }).format(Number(value) || 0);

/* Explicit slots stay in place; unassigned products fill any open slots, then follow. */
export function orderHomepageProducts<T extends { homeOrder?: number | null }>(products: T[]): T[] {
  const pinned = new Map<number, T>();
  const automatic: T[] = [];
  for (const product of products) {
    const order = Number(product.homeOrder);
    if (Number.isInteger(order) && order >= 1 && order <= 3 && !pinned.has(order)) pinned.set(order, product);
    else automatic.push(product);
  }
  const ordered: T[] = [];
  for (let slot = 1; slot <= 3; slot++) {
    const product = pinned.get(slot) || automatic.shift();
    if (product) ordered.push(product);
  }
  return [...ordered, ...automatic];
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

/* ---------- pack sizes / variants ---------- */
export function defaultVariant(p?: Product | null): Variant {
  const fallback: Variant = { id: "default", label: p?.unitLabel || "1 unit", priceInr: p?.priceInr || 0, default: true };
  if (!p?.variants?.length) return fallback;
  return p.variants.find((v) => v.default) || p.variants[0];
}
/* the variant id a (possibly legacy, variant-less) cart line refers to */
export function lineVariantId(p: Product, line: CartLine): string {
  const wanted = String(line.variant || "").trim();
  if (wanted && p.variants?.some((v) => v.id === wanted)) return wanted;
  return defaultVariant(p).id;
}

/* ---------- cart (localStorage + cross-page events) ---------- */
export function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
export function saveCart(lines: CartLine[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch {}
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}
export function addToCart(handle: string, qty = 1, variant = "") {
  const lines = readCart();
  const line = lines.find((l) => l.handle === handle && (l.variant || "") === variant);
  if (line) line.qty = Math.min(99, line.qty + qty);
  else lines.push({ handle, qty, variant });
  saveCart(lines);
}
export function setCartQty(handle: string, qty: number, variant = "") {
  let lines = readCart();
  if (qty <= 0) lines = lines.filter((l) => !(l.handle === handle && (l.variant || "") === variant));
  else {
    const line = lines.find((l) => l.handle === handle && (l.variant || "") === variant);
    if (line) line.qty = Math.min(99, qty);
    else lines.push({ handle, qty, variant });
  }
  saveCart(lines);
}
export const cartCount = () => readCart().reduce((sum, l) => sum + l.qty, 0);
/* qty of one specific pack size in the basket (legacy lines count as the product default) */
export function cartQtyOf(p: Product, variantId: string): number {
  return readCart()
    .filter((l) => l.handle === p.handle && lineVariantId(p, l) === variantId)
    .reduce((sum, l) => sum + l.qty, 0);
}

/* ---------- recently viewed (same key as the old app) ---------- */
const RECENT_KEY = "rebesta_recent";
export function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
export function pushRecent(handle: string) {
  try {
    const seen = readRecent().filter((x) => x !== handle);
    seen.unshift(handle);
    localStorage.setItem(RECENT_KEY, JSON.stringify(seen.slice(0, 12)));
  } catch {}
}

/* ---------- location (same contract as store.js) ---------- */
export function getSavedLocation(): SavedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const loc = JSON.parse(localStorage.getItem(LOCATION_KEY) || "null");
    return Number.isFinite(loc?.lat) ? loc : null;
  } catch { return null; }
}
export function saveLocation(loc: SavedLocation) {
  try { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch {}
  window.dispatchEvent(new CustomEvent(LOCATION_EVENT));
}

export const LOC_AREAS: { name: string; lat: number; lng: number }[] = [
  { name: "Hosur town / Bus stand", lat: 12.7409, lng: 77.8253 },
  { name: "Mathigiri", lat: 12.718, lng: 77.79 },
  { name: "Maharaja Nagar", lat: 12.733, lng: 77.81 },
  { name: "Zuzuvadi", lat: 12.762, lng: 77.806 },
  { name: "SIPCOT Phase 1", lat: 12.776, lng: 77.817 },
  { name: "Rayakottai Road", lat: 12.755, lng: 77.78 },
  { name: "Thally Road", lat: 12.705, lng: 77.83 },
  { name: "Belagondapalli", lat: 12.716, lng: 77.852 },
];

export const locationLabel = (loc: SavedLocation | null) =>
  loc ? String(loc.label || "").trim() || (loc.source === "area" ? "Selected area" : "Selected pin") : "";
