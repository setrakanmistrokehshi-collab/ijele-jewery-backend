import { loadSettings, saveSettings } from '../services/settings.service.js';
import { settingsSchema } from '../validators/settings.validators.js';

export const getSettings = async (_request, response) => response.json(await loadSettings());

export async function updateSettings(request, response) {
  response.json(await saveSettings(settingsSchema.parse(request.body)));
}
