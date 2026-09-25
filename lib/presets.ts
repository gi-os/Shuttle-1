import fs from 'fs';
import path from 'path';

const DATABASE_PATH = path.join(process.cwd(), 'DATABASE');
const PRESETS_PATH = path.join(DATABASE_PATH, 'Presets');
const DESIGN_PATH = path.join(DATABASE_PATH, 'Design');

export type ShopType = 'free' | 'po' | 'stripe';

export interface DataRequired {
  address: boolean;
  details: boolean;
  extra_notes: boolean;
  shipping_handler: boolean;
  hotel_list: boolean;
  // Extended checkout fields (all default false so existing shops are unchanged)
  brand: boolean;
  billing_address: boolean;
  need_by_date: boolean;
  budget: boolean;
  artwork_link: boolean;
}

export interface Pricing {
  hidePrices: boolean;
  currency: string; // ISO 4217 code, e.g. "USD", "EUR"
}

export interface PresetsData {
  shopType: ShopType;
  dataRequired: DataRequired;
  hotelList: string[];
  brandList: string[];
  pricing: Pricing;
}

function parseKeyValueFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

/**
 * Get the shop type from DATABASE/Presets/ShopType.txt
 * Defaults to 'free' if the Presets folder or file doesn't exist.
 */
export function getShopType(): ShopType {
  try {
    const shopTypePath = path.join(PRESETS_PATH, 'ShopType.txt');
    if (!fs.existsSync(PRESETS_PATH) || !fs.existsSync(shopTypePath)) {
      return 'free';
    }
    const content = fs.readFileSync(shopTypePath, 'utf-8');
    const parsed = parseKeyValueFile(content);
    const type = (parsed.type || 'free').toLowerCase();

    if (type === 'po' || type === 'stripe' || type === 'free') {
      return type;
    }
    return 'free';
  } catch (error) {
    console.error('Error reading shop type:', error);
    return 'free';
  }
}

/**
 * Get data required toggles from DATABASE/Presets/DataRequired.txt
 * Defaults to all true (except hotel_list) if the Presets folder or file doesn't exist.
 */
export function getDataRequired(): DataRequired {
  const defaults: DataRequired = {
    address: true,
    details: true,
    extra_notes: true,
    shipping_handler: true,
    hotel_list: false,
    brand: false,
    billing_address: false,
    need_by_date: false,
    budget: false,
    artwork_link: false,
  };

  try {
    const dataRequiredPath = path.join(PRESETS_PATH, 'DataRequired.txt');
    if (!fs.existsSync(PRESETS_PATH) || !fs.existsSync(dataRequiredPath)) {
      return defaults;
    }
    const content = fs.readFileSync(dataRequiredPath, 'utf-8');
    const parsed = parseKeyValueFile(content);

    return {
      address: parsed.address !== 'false',
      details: parsed.details !== 'false',
      extra_notes: parsed.extra_notes !== 'false',
      shipping_handler: parsed.shipping_handler !== 'false',
      hotel_list: parsed.hotel_list === 'true',
      brand: parsed.brand === 'true',
      billing_address: parsed.billing_address === 'true',
      need_by_date: parsed.need_by_date === 'true',
      budget: parsed.budget === 'true',
      artwork_link: parsed.artwork_link === 'true',
    };
  } catch (error) {
    console.error('Error reading data required:', error);
    return defaults;
  }
}

/**
 * Read a one-entry-per-line list from DATABASE/Design/Details/<filename>.
 * Lines starting with # are comments. Returns empty array if the file doesn't exist.
 */
function readDetailsList(filename: string): string[] {
  try {
    const listPath = path.join(DESIGN_PATH, 'Details', filename);
    if (!fs.existsSync(listPath)) {
      return [];
    }
    const content = fs.readFileSync(listPath, 'utf-8');
    const entries: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      entries.push(trimmed);
    }

    return entries;
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return [];
  }
}

/**
 * Get hotel list from DATABASE/Design/Details/Hotels.txt
 */
export function getHotelList(): string[] {
  return readDetailsList('Hotels.txt');
}

/**
 * Get brand list from DATABASE/Design/Details/Brands.txt (used when DataRequired brand: true)
 */
export function getBrandList(): string[] {
  return readDetailsList('Brands.txt');
}

/**
 * Read the first meaningful line of a Presets/<filename> file, lowercased/trimmed as given.
 * Accepts either a bare value ("true") or key: value ("hide: true").
 */
function readPresetValue(filename: string): string {
  try {
    const filePath = path.join(PRESETS_PATH, filename);
    if (!fs.existsSync(filePath)) return '';
    for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const colonIndex = trimmed.indexOf(':');
      return (colonIndex === -1 ? trimmed : trimmed.substring(colonIndex + 1)).trim();
    }
    return '';
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return '';
  }
}

/**
 * Pricing display settings:
 *   Presets/HidePrices.txt — "true" suppresses every price display (totals are still computed/stored)
 *   Presets/Currency.txt   — ISO 4217 code (default USD)
 */
export function getPricing(): Pricing {
  const currency = readPresetValue('Currency.txt').toUpperCase();
  return {
    hidePrices: readPresetValue('HidePrices.txt').toLowerCase() === 'true',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
  };
}

/**
 * Get all presets data combined.
 */
export function getPresetsData(): PresetsData {
  return {
    shopType: getShopType(),
    dataRequired: getDataRequired(),
    hotelList: getHotelList(),
    brandList: getBrandList(),
    pricing: getPricing(),
  };
}
