// Client-safe price formatting driven by DATABASE/Presets/Currency.txt (exposed via /api/design `pricing`).

export interface PricingSettings {
  hidePrices: boolean;
  currency: string;
}

export const DEFAULT_PRICING: PricingSettings = { hidePrices: false, currency: 'USD' };

/** Format an amount in the shop currency, e.g. "$12.00" or "€12.00". */
export function formatMoney(amount: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** ASCII-only variant for the generated PDF receipt (Helvetica Type1 has no € glyph): "EUR 12.00". */
export function formatMoneyAscii(amount: number, currency: string = 'USD'): string {
  return currency === 'USD' ? `$${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}
