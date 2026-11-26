import { MILLISECONDS_PER_DAY } from '../config/constants.js';
import { Customer, Order } from '../models/index.js';
import { toCsv } from '../utils/csv.js';
import { analyticsQuery } from '../validators/settings.validators.js';

const CUSTOMER_LIMIT = 1000;
const EXPORT_ORDER_LIMIT = 5000;
const REPORT_TIME_ZONE = 'Africa/Lagos'; // "a day" means a day in the shop's own time
const money = (minorUnits) => ((minorUnits ?? 0) / 100).toFixed(2);

/** Customers (newest first) with their paid-order count, total spent per currency and last order date. */
export async function listCustomerRows() {
  const [customers, totals] = await Promise.all([
    Customer.find().sort({ createdAt: -1 }).limit(CUSTOMER_LIMIT).select('name email createdAt').lean(),
    Order.aggregate([
      { $match: { status: 'paid', customer: { $ne: null } } },
      { $group: { _id: { customer: '$customer', currency: '$currency' }, orders: { $sum: 1 }, spent: { $sum: '$revenue' }, last: { $max: '$createdAt' } } },
    ]),
  ]);
  const byCustomer = new Map();
  for (const { _id, orders, spent, last } of totals) {
    const entry = byCustomer.get(String(_id.customer)) ?? { orders: 0, spent: {}, lastOrderAt: null };
    entry.orders += orders;
    entry.spent[_id.currency] = spent;
    if (!entry.lastOrderAt || last > entry.lastOrderAt) entry.lastOrderAt = last;
    byCustomer.set(String(_id.customer), entry);
  }
  return customers.map((customer) => ({
    _id: customer._id, name: customer.name ?? '', email: customer.email ?? '', createdAt: customer.createdAt,
    orders: 0, spent: {}, lastOrderAt: null, ...byCustomer.get(String(customer._id)),
  }));
}

export async function listCustomers(_request, response) {
  response.json(await listCustomerRows());
}

/** Paid sales per day, best sellers and order statuses for the last 7, 30 or 90 days. */
export async function getAnalytics(request, response) {
  const { days } = analyticsQuery.parse(request.query);
  const since = new Date(Date.now() - days * MILLISECONDS_PER_DAY);
  const paid = { $match: { status: 'paid', createdAt: { $gte: since } } };
  const [daily, topProducts, statuses] = await Promise.all([
    Order.aggregate([
      paid,
      { $group: {
        _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIME_ZONE } }, currency: '$currency' },
        orders: { $sum: 1 }, revenue: { $sum: '$revenue' }, net: { $sum: '$netProfit' },
      } },
      { $sort: { '_id.day': 1 } },
    ]),
    Order.aggregate([
      paid,
      { $unwind: '$items' },
      { $group: {
        _id: { sku: '$items.sku', currency: '$currency' }, name: { $first: '$items.name' },
        units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.qty', '$items.unitAmount'] } },
      } },
      { $sort: { units: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  response.json({
    days,
    daily: daily.map(({ _id, ...totals }) => ({ ...totals, day: _id.day, currency: _id.currency })),
    topProducts: topProducts.map(({ _id, ...totals }) => ({ ...totals, sku: _id.sku, currency: _id.currency })),
    statuses: statuses.map(({ _id, count }) => ({ status: _id, count })),
  });
}

function sendCsv(response, filename, columns, rows) {
  response.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
  response.send(toCsv(columns, rows));
}

const ORDER_COLUMNS = [
  { header: 'Order', value: (o) => o.orderNumber },
  { header: 'Date', value: (o) => o.createdAt?.toISOString() },
  { header: 'Status', value: (o) => o.status },
  { header: 'Name', value: (o) => o.address?.name },
  { header: 'Email', value: (o) => o.email },
  { header: 'Phone', value: (o) => o.phone },
  { header: 'Address', value: (o) => [o.address?.line1, o.address?.city, o.address?.postal, o.shipping?.state, o.shipping?.country].filter(Boolean).join(', ') },
  { header: 'Items', value: (o) => o.items.map((item) => `${item.sku} x${item.qty}`).join('; ') },
  { header: 'Currency', value: (o) => o.currency },
  { header: 'Revenue', value: (o) => money(o.revenue) },
  { header: 'Product costs', value: (o) => money(o.operatingExpenses) },
  { header: 'Net profit', value: (o) => money(o.netProfit) },
  { header: 'Carrier', value: (o) => o.carrier },
  { header: 'Tracking number', value: (o) => o.trackingNumber },
];

const CUSTOMER_COLUMNS = [
  { header: 'Name', value: (c) => c.name },
  { header: 'Email', value: (c) => c.email },
  { header: 'Joined', value: (c) => c.createdAt?.toISOString() },
  { header: 'Paid orders', value: (c) => c.orders },
  { header: 'Last order', value: (c) => c.lastOrderAt?.toISOString() },
  { header: 'Spent', value: (c) => Object.entries(c.spent).map(([currency, amount]) => `${money(amount)} ${currency}`).join('; ') },
];

export async function exportOrders(_request, response) {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(EXPORT_ORDER_LIMIT).lean();
  sendCsv(response, 'ijele-orders.csv', ORDER_COLUMNS, orders);
}

export async function exportCustomers(_request, response) {
  sendCsv(response, 'ijele-customers.csv', CUSTOMER_COLUMNS, await listCustomerRows());
}
