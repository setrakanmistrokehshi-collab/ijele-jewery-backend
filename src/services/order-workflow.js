// The order lifecycle the admin can drive. Pure functions (no database), so the rules are easy to read and test.
//
//   pending ──cancel──────────────► cancelled
//   review  ──mark-paid──► paid     review ──cancel──► cancelled
//   paid    ──processing / packed / shipped / delivered (the shipping step)
//   paid    ──refund──► refund_pending ──mark-refunded (or Bachs refund.paid webhook)──► refunded

export const SHIPPING_STEP_LABELS = ['Processing', 'Packed', 'Shipped', 'Delivered'];
const SHIPPING_STEP_BY_ACTION = { processing: 0, packed: 1, shipped: 2, delivered: 3 };
const SHIPPING_ACTIONS = Object.keys(SHIPPING_STEP_BY_ACTION);

export const ORDER_ACTIONS = [...SHIPPING_ACTIONS, 'mark-paid', 'cancel', 'refund', 'mark-refunded'];

/** Which actions make sense for an order in its current state. The admin UI shows exactly these. */
export function getAllowedActions(order) {
  switch (order.status) {
    case 'pending': return ['cancel'];
    case 'review': return ['mark-paid', 'cancel'];
    case 'paid': return [...SHIPPING_ACTIONS, 'refund'];
    case 'refund_pending': return ['mark-refunded'];
    default: return []; // cancelled, refunded, expired and failed are final
  }
}

const noteRequired = (reason) => ({ ok: false, error: `Add a note: ${reason}.` });

/**
 * Decides what an action does. Returns either `{ ok: false, error }` or
 * `{ ok: true, changes, from, to, shouldRestock, notifyCustomer }` where
 *  - `changes` is what to write on the order,
 *  - `shouldRestock` says whether the items go back on the shelf,
 *  - `notifyCustomer` is 'step' | 'refunded' | null (the kind of message to send).
 */
export function planOrderAction(order, action, input = {}) {
  if (!getAllowedActions(order).includes(action)) {
    return { ok: false, error: `Cannot ${action} an order that is ${order.status}.` };
  }
  const note = (input.note ?? '').trim();

  if (action in SHIPPING_STEP_BY_ACTION) {
    const step = SHIPPING_STEP_BY_ACTION[action];
    const carrier = input.carrier?.trim() || order.carrier || '';
    const trackingNumber = input.trackingNumber?.trim() || order.trackingNumber || '';
    if (action === 'shipped' && (!carrier || !trackingNumber)) {
      return { ok: false, error: 'Shipped needs a carrier and a tracking number.' };
    }
    return {
      ok: true,
      changes: { step, carrier, trackingNumber },
      from: SHIPPING_STEP_LABELS[order.step],
      to: SHIPPING_STEP_LABELS[step],
      shouldRestock: false,
      notifyCustomer: step > order.step ? 'step' : null, // customers hear about progress, never about corrections
    };
  }

  switch (action) {
    case 'mark-paid': // an override: only after checking the payment in the Bachs dashboard
      if (!note) return noteRequired('say how the payment was verified');
      return {
        ok: true, changes: { status: 'paid', paidAt: new Date(), step: 0 },
        from: order.status, to: 'paid', shouldRestock: false, notifyCustomer: null,
      };
    case 'cancel':
      if (order.status === 'review' && !note) return noteRequired('say why this order is being cancelled');
      return {
        ok: true, changes: { status: 'cancelled' },
        from: order.status, to: 'cancelled', shouldRestock: true, notifyCustomer: null,
      };
    case 'refund':
      if (!note) return noteRequired('give the refund reason');
      return {
        ok: true, changes: { status: 'refund_pending' },
        from: order.status, to: 'refund_pending', shouldRestock: Boolean(input.restock), notifyCustomer: null,
      };
    case 'mark-refunded':
      return {
        ok: true,
        changes: { status: 'refunded', refundedAt: new Date(), ...(input.reference ? { refundReference: input.reference } : {}) },
        from: order.status, to: 'refunded', shouldRestock: false, notifyCustomer: 'refunded',
      };
    default:
      return { ok: false, error: 'Unknown action.' };
  }
}
