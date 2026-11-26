import { Setting } from '../models/index.js';

const SETTINGS_ID = 'store';
export const DEFAULT_SETTINGS = { lowStockLimit: 2, rates: { NGN: 1500, EUR: 0.92, GBP: 0.79 } };

/** The saved settings, with defaults for anything never saved (so a fresh database just works). */
export async function loadSettings() {
  const saved = await Setting.findById(SETTINGS_ID).lean();
  return {
    lowStockLimit: saved?.lowStockLimit ?? DEFAULT_SETTINGS.lowStockLimit,
    rates: { ...DEFAULT_SETTINGS.rates, ...saved?.rates },
  };
}

export async function saveSettings({ lowStockLimit, rates }) {
  await Setting.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $set: { lowStockLimit, rates } },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return loadSettings();
}
