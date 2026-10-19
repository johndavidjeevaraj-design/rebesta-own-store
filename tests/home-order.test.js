import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-home-order-'));
process.env.DATA_DIR = dataDir;
const { loadProducts, publicCatalog, saveProducts, updateProduct } = await import('../src/lib/store.js');

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('homepage slots are limited to 1–3 and stay unique when a slot is reassigned', () => {
  saveProducts([
    { handle: 'okra', title: 'Okra', priceInr: 30, stock: 5, active: true, homeOrder: 1 },
    { handle: 'tomato', title: 'Tomato', priceInr: 40, stock: 5, active: true, homeOrder: 2 },
    { handle: 'carrot', title: 'Carrot', priceInr: 50, stock: 5, active: true }
  ]);

  updateProduct('carrot', { homeOrder: 1 });
  let products = loadProducts();
  assert.equal(products.find(p => p.handle === 'carrot').homeOrder, 1);
  assert.equal(products.find(p => p.handle === 'okra').homeOrder, undefined);

  updateProduct('carrot', { homeOrder: 2 });
  products = loadProducts();
  assert.equal(products.find(p => p.handle === 'carrot').homeOrder, 2);
  assert.equal(products.find(p => p.handle === 'tomato').homeOrder, 1);

  updateProduct('carrot', { homeOrder: null });
  assert.equal(loadProducts().find(p => p.handle === 'carrot').homeOrder, undefined);
  assert.equal(publicCatalog().find(p => p.handle === 'tomato').homeOrder, 1);
  assert.throws(() => updateProduct('carrot', { homeOrder: 4 }), /Home position/);
});
