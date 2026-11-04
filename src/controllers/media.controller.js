import { createSignedUploadParameters, isCloudinaryConfigured } from '../integrations/cloudinary.client.js';

export function signImageUpload(_request, response) {
  if (!isCloudinaryConfigured()) return response.status(503).json({ error: 'Cloudinary is not configured' });
  return response.json(createSignedUploadParameters());
}
