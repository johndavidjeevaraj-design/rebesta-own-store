import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePackagingFeeInr, couponDiscount, getPackagingFeePercent } from '../src/lib/store.js';

test('a maximum merchandise subtotal is inclusive and blocks the next cent above it', () => {
  const first50 = { code: 'FIRST50', type: 'percent', value: 50, minOrderInr: 0, maxOrderInr: 399 };

  assert.equal(couponDiscount(first50, 399), 200);
  assert.equal(couponDiscount(first50, 399.01), 0);
  assert.equal(couponDiscount(first50, 250), 125);
});

test('coupon minimum and optional maximum are both enforced', () => {
  const bounded = { type: 'flat', value: 25, minOrderInr: 100, maxOrderInr: 399 };

  assert.equal(couponDiscount(bounded, 99.99), 0);
  assert.equal(couponDiscount(bounded, 100), 25);
  assert.equal(couponDiscount(bounded, 400), 0);
  assert.equal(couponDiscount({ type: 'flat', value: 25, minOrderInr: 100 }, 500), 25);
});

test('packaging fee is a percentage of the supplied merchandise subtotal, rounded to paise', () => {
  const settings = { packagingFee: { percent: 5 } };

  assert.equal(getPackagingFeePercent(settings), 5);
  assert.equal(calculatePackagingFeeInr(399, settings), 19.95);
  assert.equal(calculatePackagingFeeInr(0, settings), 0);
  assert.equal(calculatePackagingFeeInr(-25, settings), 0);
});

test('packaging fee remains off when unset and rejects an invalid rate safely', () => {
  assert.equal(getPackagingFeePercent({}), 0);
  assert.equal(calculatePackagingFeeInr(399, {}), 0);
  assert.equal(getPackagingFeePercent({ packagingFee: { percent: 101 } }), 0);
});
