import crypto from 'node:crypto';
import { config } from '../config.js';
import { loadPartners, savePartners, loadPositions, savePositions } from './store.js';

const TOKEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // tokens rotate weekly (with 1-window grace)

function windowIndex() {
  return Math.floor(Date.now() / TOKEN_WINDOW_MS);
}

export function hashPin(pin, phone) {
  return crypto.createHash('sha256').update(`${String(pin)}:${String(phone)}:${config.adminKey}`).digest('hex');
}

export function partnerToken(partner, index = windowIndex()) {
  return crypto.createHash('sha256').update(`${partner.id}:${config.adminKey}:${index}`).digest('hex');
}

export function verifyPartnerToken(token) {
  const wanted = String(token || '');
  if (!wanted) return null;
  const index = windowIndex();
  for (const partner of loadPartners()) {
    if (partnerToken(partner, index) === wanted || partnerToken(partner, index - 1) === wanted) {
      return partner;
    }
  }
  return null;
}

export function findPartnerByPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return null;
  return loadPartners().find(p => String(p.phone || '').replace(/\D/g, '').endsWith(last10)) || null;
}

export function createPartner({ name, phone, pin }) {
  const partners = loadPartners();
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
  }
  const cleanPin = String(pin || '').replace(/\D/g, '');
  if (cleanPin.length < 4 || cleanPin.length > 6) {
    throw Object.assign(new Error('PIN must be 4–6 digits'), { status: 400 });
  }
  const cleanName = String(name || '').trim().slice(0, 60);
  if (cleanName.length < 2) throw Object.assign(new Error('Enter the partner name'), { status: 400 });
  if (partners.some(p => String(p.phone).replace(/\D/g, '') === cleanPhone)) {
    throw Object.assign(new Error('A partner with this mobile number already exists'), { status: 409 });
  }
  const partner = {
    id: `DP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    name: cleanName,
    phone: cleanPhone,
    pinHash: hashPin(cleanPin, cleanPhone),
    active: true,
    createdAt: new Date().toISOString()
  };
  partners.push(partner);
  savePartners(partners);
  return partner;
}

export function updatePartner(id, patch = {}) {
  const partners = loadPartners();
  const partner = partners.find(p => p.id === id);
  if (!partner) return null;
  if (patch.name !== undefined) {
    const cleanName = String(patch.name).trim().slice(0, 60);
    if (cleanName.length < 2) throw Object.assign(new Error('Enter the partner name'), { status: 400 });
    partner.name = cleanName;
  }
  if (patch.phone !== undefined) {
    const cleanPhone = String(patch.phone).replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
    if (partners.some(p => p !== partner && String(p.phone).replace(/\D/g, '') === cleanPhone)) {
      throw Object.assign(new Error('Another partner already uses this number'), { status: 409 });
    }
    partner.phone = cleanPhone;
  }
  if (patch.pin !== undefined && String(patch.pin).length) {
    const cleanPin = String(patch.pin).replace(/\D/g, '');
    if (cleanPin.length < 4 || cleanPin.length > 6) throw Object.assign(new Error('PIN must be 4–6 digits'), { status: 400 });
    partner.pinHash = hashPin(cleanPin, partner.phone);
  }
  if (patch.active !== undefined) partner.active = Boolean(patch.active);
  savePartners(partners);
  return partner;
}

export function deletePartner(id) {
  const partners = loadPartners();
  const partner = partners.find(p => p.id === id);
  if (!partner) return null;
  savePartners(partners.filter(p => p.id !== id));
  const positions = loadPositions();
  if (positions[id]) {
    delete positions[id];
    savePositions(positions);
  }
  return partner;
}

export function publicPartner(partner) {
  return {
    id: partner.id,
    name: partner.name,
    phone: partner.phone,
    active: partner.active !== false,
    createdAt: partner.createdAt
  };
}

export function recordPosition(partnerId, pos = {}) {
  const lat = Number(pos.lat);
  const lng = Number(pos.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    throw Object.assign(new Error('Invalid position'), { status: 400 });
  }
  const positions = loadPositions();
  positions[partnerId] = {
    lat,
    lng,
    accuracy: Number.isFinite(Number(pos.accuracy)) ? Math.round(Number(pos.accuracy)) : null,
    heading: Number.isFinite(Number(pos.heading)) ? Math.round(Number(pos.heading)) : null,
    speed: Number.isFinite(Number(pos.speed)) ? Number(pos.speed) : null,
    updatedAt: new Date().toISOString()
  };
  savePositions(positions);
  return positions[partnerId];
}

export function getPosition(partnerId, maxAgeMs = 10 * 60 * 1000) {
  const positions = loadPositions();
  const position = positions[partnerId];
  if (!position) return null;
  const age = Date.now() - Date.parse(position.updatedAt);
  if (!Number.isFinite(age) || age > maxAgeMs || age < -5 * 60 * 1000) return null;
  return position;
}

export function freshPositions(maxAgeMs = 30 * 60 * 1000) {
  const out = [];
  for (const partner of loadPartners()) {
    const position = getPosition(partner.id, maxAgeMs);
    if (position && partner.active !== false) out.push({ partner: publicPartner(partner), position });
  }
  return out;
}

export function findPartnerById(id) {
  return loadPartners().find(p => p.id === id) || null;
}

/* ETA: air-line km -> rough two-wheeler minutes in town traffic (road factor 1.25, ~18 km/h) */
export { haversineKm } from './delivery.js';
export function etaMinutesFromKm(airKm) {
  const roadKm = Number(airKm) * 1.25;
  const minutes = Math.ceil((roadKm / 18) * 60);
  return Math.min(90, Math.max(3, minutes));
}

/* Partner scorecard: deliveries + avg on-road time from the order history */
export function partnerScore(orders, partnerId) {
  const mine = orders.filter(o => o.assignedPartnerId === partnerId);
  const delivered = mine.filter(o => o.status === 'DELIVERED');
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = Date.now() - 7 * 86400000;
  const monthAgo = Date.now() - 30 * 86400000;
  const roadMinutes = [];
  for (const order of delivered) {
    let lastOut = null;
    for (const entry of order.history || []) {
      if (entry.status === 'OUT_FOR_DELIVERY') lastOut = Date.parse(entry.at);
      else if (entry.status === 'DELIVERED' && lastOut && Date.parse(entry.at) >= lastOut) {
        roadMinutes.push((Date.parse(entry.at) - lastOut) / 60000);
        lastOut = null;
      }
    }
  }
  const avgDeliverMin = roadMinutes.length ? Math.round(roadMinutes.reduce((a, b) => a + b, 0) / roadMinutes.length) : null;
  return {
    deliveredToday: delivered.filter(o => String(o.updatedAt || '').startsWith(today)).length,
    delivered7d: delivered.filter(o => Date.parse(o.updatedAt || 0) > weekAgo).length,
    delivered30d: delivered.filter(o => Date.parse(o.updatedAt || 0) > monthAgo).length,
    deliveredTotal: delivered.length,
    avgDeliverMin,
    revenue7dInr: Math.round(delivered.filter(o => Date.parse(o.updatedAt || 0) > weekAgo).reduce((s, o) => s + Number(o.totalInr || 0), 0))
  };
}
