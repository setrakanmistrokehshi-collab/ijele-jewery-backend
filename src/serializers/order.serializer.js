/** What a customer may see about their own order. */
export const toCustomerOrderView = (order) => ({
  orderNumber: order.orderNumber,
  placedAt: order.createdAt,
  status: order.status,
  paymentPending: order.status === 'pending' || (order.status === 'review' && order.reviewReason === 'payment-unconfirmed'),
  step: order.step,
  carrier: order.carrier,
  trackingNumber: order.trackingNumber,
  currency: order.currency,
  total: order.revenue,
  itemCount: order.items.reduce((total, item) => total + item.qty, 0),
  items: order.items.map((item) => ({ name: item.name, qty: item.qty, gift: item.gift })),
});
