// Signed direct uploads: the browser sends the image straight to Cloudinary; the API secret never leaves the server.
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

const UPLOAD_FOLDER = 'aurora/products';
const ALLOWED_FORMATS = 'jpg,png,webp';

export const isCloudinaryConfigured = () =>
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

/** Everything listed in the signature is locked: the browser cannot change the folder or the allowed formats. */
export function createSignedUploadParameters() {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: UPLOAD_FOLDER, allowed_formats: ALLOWED_FORMATS },
    env.CLOUDINARY_API_SECRET,
  );
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    folder: UPLOAD_FOLDER,
    allowedFormats: ALLOWED_FORMATS,
    signature,
  };
}
