import './helpers/env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { query, stub } from './helpers/stub.js';

const { Customer, Order, Product, Setting } = await import('../src/models/index.js');
const { csvCell, toCsv } = await import('../src/utils/csv.js');
const { loadSettings, DEFAULT_SETTINGS } = await import('../src/services/settings.service.js');
const { settingsSchema } = await import('../src/validators/settings.validators.js');
const { createProductSchema, updateProductSchema } = await import('../src/validators/product.validators.js');
const { checkoutRequestSchema } = await import('../src/validators/checkout.validators.js');
const reports = await import('../src/controllers/admin-reports.controller.js');
const { buildOrderLines } = await import('../src/services/checkout.service.js');

const call = async (handler, request = {}) => {
  const out = { headers: {} };
  await handler(request, { json: (v) => { out.body = v; }, send: (v) => { out.body = v; }, set: (h) => Object.assign(out.headers, h) });
  return out;
};

test('csv cells are quoted and cannot run as spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+2348012345678'), "'+2348012345678");
  assert.equal(csvCell('-5.00'), '-5.00'); // a negative number stays a number
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv([{ header: 'A', value: (r) => r.a }], [{ a: 1 }]), '﻿A\r\n1\r\n');
});

test('settings fall back to defaults, and bad values are rejected', async (t) => {
  stub(t, Setting, { findById: () => query(null) });
  assert.deepEqual(await loadSettings(), DEFAULT_SETTINGS);
  stub(t, Setting, { findById: () => query({ lowStockLimit: 9 }) });
  assert.deepEqual(await loadSettings(), { ...DEFAULT_SETTINGS, lowStockLimit: 9 });

  const good = { lowStockLimit: 3, rates: { NGN: 1600, EUR: 0.9, GBP: 0.8 } };
  assert.ok(settingsSchema.safeParse(good).success);
  assert.ok(!settingsSchema.safeParse({ ...good, lowStockLimit: -1 }).success);
  assert.ok(!settingsSchema.safeParse({ ...good, rates: { ...good.rates, NGN: 0 } }).success);
  assert.ok(!settingsSchema.safeParse({ ...good, extra: 1 }).success);
});

test('customers are joined with their paid-order totals per currency', async (t) => {
  const joined = new Date('2026-01-01');
  stub(t, Customer, { find: () => query([{ _id: 'c1', name: 'Ada', email: 'ada@x.com', createdAt: joined }, { _id: 'c2', email: 'b@x.com', createdAt: joined }]) });
  stub(t, Order, {
    aggregate: () => Promise.resolve([
      { _id: { customer: 'c1', currency: 'USD' }, orders: 2, spent: 5000, last: new Date('2026-02-01') },
      { _id: { customer: 'c1', currency: 'NGN' }, orders: 1, spent: 900000, last: new Date('2026-03-01') },
    ]),
  });
  const { body } = await call(reports.listCustomers);
  assert.deepEqual(body[0].spent, { USD: 5000, NGN: 900000 });
  assert.equal(body[0].orders, 3);
  assert.equal(body[0].lastOrderAt.toISOString(), new Date('2026-03-01').toISOString());
  assert.deepEqual([body[1].orders, body[1].spent, body[1].name], [0, {}, '']);
});

test('analytics only accepts 7, 30 or 90 days and flattens the grouped rows', async (t) => {
  stub(t, Order, {
    aggregate: (pipeline) => Promise.resolve(
      pipeline[0].$match.status === 'paid' && pipeline[1]?.$unwind
        ? [{ _id: { sku: 'W-1', currency: 'USD' }, name: 'Watch', units: 2, revenue: 400 }]
        : pipeline[0].$match.status === 'paid'
          ? [{ _id: { day: '2026-11-01', currency: 'USD' }, orders: 1, revenue: 200, net: 50 }]
          : [{ _id: 'paid', count: 1 }],
    ),
  });
  const { body } = await call(reports.getAnalytics, { query: {} });
  assert.equal(body.days, 30);
  assert.deepEqual(body.daily, [{ orders: 1, revenue: 200, net: 50, day: '2026-11-01', currency: 'USD' }]);
  assert.equal(body.topProducts[0].sku, 'W-1');
  assert.deepEqual(body.statuses, [{ status: 'paid', count: 1 }]);
  await assert.rejects(call(reports.getAnalytics, { query: { days: '365' } }));
});

test('the orders export is a csv download with plain-number money', async (t) => {
  stub(t, Order, { find: () => query([{
    orderNumber: 'IJL-1', createdAt: new Date('2026-11-01T10:00:00Z'), status: 'paid', email: 'a@x.com', phone: '+2348012345678',
    address: { name: '=cmd', line1: '1 Road', city: 'Lagos' }, shipping: { country: 'Nigeria' },
    items: [{ sku: 'W-1', qty: 2 }], currency: 'USD', revenue: 12050, operatingExpenses: 5000, netProfit: -550,
  }]) });
  const { body, headers } = await call(reports.exportOrders);
  assert.match(headers['Content-Type'], /text\/csv/);
  assert.match(headers['Content-Disposition'], /attachment/);
  assert.ok(body.includes("'=cmd")); // formula neutralised
  assert.ok(body.includes("'+2348012345678"));
  assert.ok(body.includes('120.50') && body.includes('-5.50') && body.includes('W-1 x2'));
});

const product = (extra = {}) => ({
  _id: 'p1', sku: 'W-1', name: 'Watch', prices: { USD: 100, NGN: 1, EUR: 1, GBP: 1 }, costs: { USD: 40, NGN: 1, EUR: 1, GBP: 1 },
  priceOptions: [], ...extra,
});
const OPTION_ID = 'a'.repeat(24);
const withOptions = () => product({
  priceOptions: [{ _id: OPTION_ID, label: 'Gold', prices: { USD: 250, NGN: 1, EUR: 1, GBP: 1 } }],
});

test('a chosen price option is priced and named by the server, and is required when the product has options', async (t) => {
  stub(t, Product, { find: () => Promise.resolve([withOptions()]) });
  const [line] = await buildOrderLines([{ sku: 'W-1', optionId: OPTION_ID.toUpperCase(), qty: 2 }], 'USD');
  assert.equal(line.unitAmount, 250);
  assert.equal(line.unitCost, 40); // cost stays the product's
  assert.equal(line.name, 'Watch (Gold)');
  await assert.rejects(buildOrderLines([{ sku: 'W-1', qty: 1 }], 'USD'), { status: 422 }); // option required
  await assert.rejects(buildOrderLines([{ sku: 'W-1', optionId: 'b'.repeat(24), qty: 1 }], 'USD'), { status: 422 }); // unknown
});

test('products without options keep the single price, and cannot be bought with an option id', async (t) => {
  stub(t, Product, { find: () => Promise.resolve([product()]) });
  const [line] = await buildOrderLines([{ sku: 'W-1', qty: 1 }], 'USD');
  assert.deepEqual([line.unitAmount, line.name], [100, 'Watch']);
  await assert.rejects(buildOrderLines([{ sku: 'W-1', optionId: OPTION_ID, qty: 1 }], 'USD'), { status: 422 });
});

test('the same product with different options stays on separate lines', async (t) => {
  const two = withOptions();
  two.priceOptions.push({ _id: 'c'.repeat(24), label: 'Silver', prices: { USD: 150, NGN: 1, EUR: 1, GBP: 1 } });
  stub(t, Product, { find: () => Promise.resolve([two]) });
  const lines = await buildOrderLines([{ sku: 'W-1', optionId: OPTION_ID, qty: 1 }, { sku: 'W-1', optionId: 'c'.repeat(24), qty: 1 }, { sku: 'W-1', optionId: OPTION_ID, qty: 2 }], 'USD');
  assert.deepEqual(lines.map((l) => [l.name, l.qty]), [['Watch (Gold)', 3], ['Watch (Silver)', 1]]);
});

test('product and checkout validators accept optional price options only in the right shape', () => {
  const base = {
    name: 'W', sku: 'W-1', description: 'd', category: 'Watch', stock: 1, images: [], active: true,
    prices: { USD: 1, NGN: 1, EUR: 1, GBP: 1 }, costs: { USD: 1, NGN: 1, EUR: 1, GBP: 1 }, seo: { metaTitle: '', metaDescription: '' },
  };
  assert.deepEqual(createProductSchema.parse(base).priceOptions, []); // optional
  const option = (label) => ({ label, prices: { USD: 5, NGN: 5, EUR: 5, GBP: 5 } });
  assert.ok(createProductSchema.safeParse({ ...base, priceOptions: [option('Gold'), option('Silver')] }).success);
  assert.ok(!createProductSchema.safeParse({ ...base, priceOptions: [option('Gold'), option('gold')] }).success);
  assert.ok(!createProductSchema.safeParse({ ...base, priceOptions: Array.from({ length: 7 }, (_, i) => option(`O${i}`)) }).success);
  assert.equal(updateProductSchema.parse({ stock: 3 }).priceOptions, undefined); // an update that omits them leaves them alone
  const cart = { sku: 'w-1', qty: 1, optionId: OPTION_ID };
  assert.ok(checkoutRequestSchema.shape.items.safeParse([cart]).success);
  assert.ok(!checkoutRequestSchema.shape.items.safeParse([{ ...cart, optionId: 'nope' }]).success);
});
