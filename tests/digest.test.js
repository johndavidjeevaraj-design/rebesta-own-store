import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMorningDigest } from '../src/lib/digest.js';

test('buildMorningDigest computes yesterday, today plan and low stock from live data shape', () => {
  // 2026-09-27 09:30 IST = 04:00 UTC
  const now = new Date('2026-09-27T04:00:00Z');
  const digest = buildMorningDigest(now);

  assert.equal(digest.stats.todayIso, '2026-09-27', 'today is IST date, not UTC');
  assert.equal(digest.stats.yesterdayIso, '2026-09-26', 'yesterday is IST-1');
  assert.ok(typeof digest.stats.ordersYesterday === 'number');
  assert.ok(typeof digest.stats.revenueYesterday === 'number');
  assert.ok(typeof digest.stats.todayOrders === 'number');
  assert.ok(typeof digest.stats.activeSubs === 'number');
  assert.ok(digest.subject.includes('Morning digest'));
  assert.ok(digest.title.includes('Good morning'));
  assert.ok(digest.bodyHtml.includes('Yesterday (2026-09-26)'));
  assert.ok(digest.bodyHtml.includes("Today's delivery plan"));
  assert.ok(digest.bodyHtml.includes('/admin'), 'links to the admin dashboard');
});

test('buildMorningDigest respects IST day boundaries for placedAt', () => {
  // 00:30 IST Sep 27 = 19:00 UTC Sep 26 — IST date must be the 27th
  const now = new Date('2026-09-26T19:00:00Z');
  const { stats } = buildMorningDigest(now);
  assert.equal(stats.todayIso, '2026-09-27');
  assert.equal(stats.yesterdayIso, '2026-09-26');
});

test('low stock list is sorted ascending and capped at 6', () => {
  const { stats } = buildMorningDigest(new Date());
  assert.ok(stats.lowStockTop.length <= 6);
  const stocks = stats.lowStockTop.map(p => Number(p.stock));
  assert.deepEqual(stocks, [...stocks].sort((a, b) => a - b));
});
