import { broadcastPush, getSubscriberStats } from '../services/notification.service.js';
import { broadcastSchema } from '../validators/notification.validators.js';

export async function sendBroadcast(request, response) {
  await broadcastPush(broadcastSchema.parse(request.body));
  response.json({ ok: true });
}

export async function getStats(_request, response) {
  response.json(await getSubscriberStats());
}
