import { ContactMessage, Order, Product } from '../models/index.js';
import { loadSettings } from '../services/settings.service.js';
import { trustedQueryOperator } from '../utils/trusted-query-operator.js';

/**
 * The dashboard's headline numbers, counted by the database. The Overview page and the navigation badges use this
 * instead of downloading every order, product and message just to count them.
 */
export async function getOverview(_request, response) {
  const { lowStockLimit } = await loadSettings(); // "low" means this many units or fewer
  const [ordersToShip, ordersInReview, pendingCheckouts, lowStockProducts, unhandledMessages] = await Promise.all([
    Order.countDocuments({ status: 'paid', step: trustedQueryOperator({ $lt: 2 }) }), // not yet shipped
    Order.countDocuments({ status: 'review' }),
    Order.countDocuments({ status: 'pending' }),
    Product.countDocuments({ active: true, stock: trustedQueryOperator({ $lte: lowStockLimit }) }),
    ContactMessage.countDocuments({ handled: false }),
  ]);
  response.json({
    ordersToShip, ordersInReview, pendingCheckouts, lowStockProducts, unhandledMessages, lowStockLimit,
  });
}
