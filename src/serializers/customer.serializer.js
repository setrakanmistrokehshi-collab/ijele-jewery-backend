import { createPushId } from '../services/notification.service.js';

export const toPublicCustomer = (customer) => ({
  name: customer.name,
  email: customer.email,
  picture: customer.picture,
  trusted: customer.trusted,
  pushId: customer.trusted ? createPushId(customer.email) : undefined,
});
