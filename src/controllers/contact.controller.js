import { ContactMessage } from '../models/index.js';
import { idParams } from '../validators/common.validators.js';
import { contactMessageSchema, markHandledSchema } from '../validators/contact.validators.js';

export async function submitContactMessage(request, response) {
  const { website: honeypot, ...message } = contactMessageSchema.parse(request.body);
  if (!honeypot) await ContactMessage.create(message); // bots get the same success response
  response.status(201).json({ ok: true });
}

// ---- Admin ----
export async function listMessages(_request, response) {
  response.json(await ContactMessage.find().sort({ createdAt: -1 }).limit(200).lean());
}

export async function setMessageHandled(request, response) {
  const { id } = idParams.parse(request.params);
  const { handled } = markHandledSchema.parse(request.body);
  const message = await ContactMessage.findByIdAndUpdate(id, { handled }, { new: true });
  return message ? response.json(message) : response.status(404).json({ error: 'Not found' });
}

export async function deleteMessage(request, response) {
  const { id } = idParams.parse(request.params);
  const result = await ContactMessage.deleteOne({ _id: id });
  return result.deletedCount ? response.status(204).end() : response.status(404).json({ error: 'Not found' });
}
