import { loadSettings } from './store.js';

const cache = new Map();
const GEO_TTL_MS = 15 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function validLatLng(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { lat: latitude, lng: longitude };
}

function cacheGet(key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() > row.expires) { cache.delete(key); return null; }
  return row.value;
}

function cacheSet(key, value, ttl = GEO_TTL_MS) {
  cache.set(key, { value, expires: Date.now() + ttl });
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RebestaFresh-Independent-Store/1.0 (Hosur quick commerce)' }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodeAddress(addressText) {
  const query = String(addressText || '').trim();
  if (!query) throw Object.assign(new Error('Enter your address or choose a map/GPS pin'), { status: 400 });
  const key = query.toLowerCase().replace(/\s+/g, ' ');
  const cached = cacheGet(`geo:${key}`);
  if (cached) return cached;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'in');
  url.searchParams.set('q', query);
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data[0]) {
    throw Object.assign(new Error('Could not locate that address. Drag/select the exact map pin instead.'), { status: 400 });
  }
  const result = { ...validLatLng(data[0].lat, data[0].lon), label: data[0].display_name, provider: 'openstreetmap-address' };
  cacheSet(`geo:${key}`, result);
  return result;
}

export async function reverseGeocode(lat, lng) {
  const coordinates = validLatLng(lat, lng);
  if (!coordinates) throw Object.assign(new Error('Invalid coordinates'), { status: 400 });
  const key = `${coordinates.lat.toFixed(5)}:${coordinates.lng.toFixed(5)}`;
  const cached = cacheGet(`reverse:${key}`);
  if (cached) return cached;
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', coordinates.lat);
  url.searchParams.set('lon', coordinates.lng);
  const data = await fetchJson(url);
  const result = {
    ...coordinates,
    label: data.display_name || 'Selected map pin',
    provider: 'openstreetmap-reverse'
  };
  cacheSet(`reverse:${key}`, result);
  return result;
}

export function haversineKm(origin, destination) {
  const earthKm = 6371;
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLng = (destination.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(a));
}

export async function drivingRouteKm(origin, destination) {
  const key = `${origin.lat.toFixed(5)}:${origin.lng.toFixed(5)}-${destination.lat.toFixed(5)}:${destination.lng.toFixed(5)}`;
  const cached = cacheGet(`route:${key}`);
  if (cached) return cached;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('annotations', 'false');
  const data = await fetchJson(url);
  const metres = Number(data.routes?.[0]?.distance);
  if (data.code !== 'Ok' || !Number.isFinite(metres) || metres <= 0) {
    throw Object.assign(new Error('Could not calculate a driving route to that pin. Try another exact pin.'), { status: 400 });
  }
  const result = { distanceKm: metres / 1000, provider: 'osrm-driving-route' };
  cacheSet(`route:${key}`, result, ONE_DAY_MS);
  return result;
}

function getDeliveryDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const localToday = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
  const tomorrow = new Date(localToday.getTime() + ONE_DAY_MS);
  const tomorrowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long'
  }).formatToParts(tomorrow).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return {
    iso: `${tomorrowParts.year}-${tomorrowParts.month}-${tomorrowParts.day}`,
    label: `${tomorrowParts.weekday}, ${tomorrowParts.day}-${tomorrowParts.month}-${tomorrowParts.year}`
  };
}

export function tierForDistance(distanceKm, deliverySettings) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return null;
  return (deliverySettings.tiers || []).find(t => distance === 0 ? t.min === 0 : (distance > t.min && distance <= t.max)) || null;
}

export function feeForQuote(distanceKm, subtotalInr, deliverySettings) {
  if (Number(subtotalInr || 0) >= Number(deliverySettings.freeOverInr || 500)) {
    return { deliveryFeeInr: 0, freeApplied: true, tier: tierForDistance(distanceKm, deliverySettings) };
  }
  const tier = tierForDistance(distanceKm, deliverySettings);
  return { deliveryFeeInr: Number(tier?.feeInr || 0), freeApplied: false, tier };
}

export async function quoteDelivery({ cart, location = {}, address = {} }) {
  const settings = loadSettings();
  const delivery = settings.delivery;
  if (!delivery?.hubLat || !delivery?.hubLng) throw Object.assign(new Error('Delivery hub is not configured'), { status: 500 });

  let point;
  const supplied = validLatLng(location.lat ?? address.lat, location.lng ?? address.lng);
  if (supplied) {
    point = { ...supplied, label: location.label || address.area || 'Exact map pin', provider: 'customer-exact-pin' };
  } else {
    const addressParts = [address.line1, address.line2, address.area, address.city, address.state, address.pincode, 'India'].filter(Boolean);
    point = await geocodeAddress(addressParts.join(', '));
  }

  const route = await drivingRouteKm({ lat: delivery.hubLat, lng: delivery.hubLng }, point);
  const distanceKm = route.distanceKm;
  const maxRoadKm = Number(delivery.maxRoadKm || 9);
  const eligible = distanceKm <= maxRoadKm;
  const quote = feeForQuote(distanceKm, cart.subtotalInr, delivery);
  const date = getDeliveryDate();
  const slots = (delivery.slots || []).map(slot => ({
    id: slot.id,
    label: slot.label,
    startHour: slot.startHour,
    endHour: slot.endHour,
    date: date.iso,
    dateLabel: date.label
  }));

  return {
    eligible,
    location: point,
    provider: route.provider,
    distanceKm: Math.round(distanceKm * 100) / 100,
    maxRoadKm,
    subtotalInr: cart.subtotalInr,
    freeApplied: quote.freeApplied,
    deliveryFeeInr: quote.deliveryFeeInr,
    deliveryTier: quote.tier,
    tiers: delivery.tiers,
    slots: eligible ? slots : [],
    deliveryDate: date,
    message: eligible
      ? (quote.freeApplied ? `Free delivery above ₹${delivery.freeOverInr}` : `₹${quote.deliveryFeeInr} delivery · ${distanceKm.toFixed(1)} road km from the hub`)
      : `This location is ${distanceKm.toFixed(1)} road km away. Current Rebesta Fresh delivery limit is 9 road km.`
  };
}
