import test from 'node:test';
import assert from 'node:assert/strict';
import { tierForDistance, feeForQuote, haversineKm } from '../src/lib/delivery.js';

const settings = {
  freeOverInr: 500,
  tiers: [
    { min: 0, max: 1, label: '0–1 km', feeInr: 20 },
    { min: 1, max: 3, label: '1–3 km', feeInr: 30 },
    { min: 3, max: 4, label: '3–4 km', feeInr: 40 },
    { min: 4, max: 5, label: '4–5 km', feeInr: 50 },
    { min: 5, max: 6, label: '5–6 km', feeInr: 60 },
    { min: 6, max: 7, label: '6–7 km', feeInr: 70 },
    { min: 7, max: 9, label: '7–9 km', feeInr: 100 }
  ]
};

test('delivery tiers map each required road-distance range', () => {
  assert.equal(tierForDistance(0, settings).feeInr, 20);
  assert.equal(tierForDistance(0.5, settings).feeInr, 20);
  assert.equal(tierForDistance(1, settings).feeInr, 20);
  assert.equal(tierForDistance(1.01, settings).feeInr, 30);
  assert.equal(tierForDistance(3.8, settings).feeInr, 40);
  assert.equal(tierForDistance(4.7, settings).feeInr, 50);
  assert.equal(tierForDistance(5.8, settings).feeInr, 60);
  assert.equal(tierForDistance(6.8, settings).feeInr, 70);
  assert.equal(tierForDistance(8.99, settings).feeInr, 100);
  assert.equal(tierForDistance(9.01, settings), null);
});

test('free delivery has priority over distance fee at the ₹500 basket threshold', () => {
  assert.deepEqual(feeForQuote(8.9, 500, settings).deliveryFeeInr, 0);
  assert.deepEqual(feeForQuote(8.9, 499.99, settings).deliveryFeeInr, 100);
});

test('haversine calculates a sensible earth distance', () => {
  const km = haversineKm({ lat: 12.728582, lng: 77.824784 }, { lat: 12.660095, lng: 77.867623 });
  assert.ok(km > 8.8 && km < 9.0);
});
