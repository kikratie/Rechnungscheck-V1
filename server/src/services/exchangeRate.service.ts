/**
 * ECB Exchange Rate Service
 * Uses Frankfurter API (free, no API key) for daily ECB reference rates.
 * https://api.frankfurter.dev/v1/
 */

interface CachedRate {
  rate: number;     // 1 EUR = X Fremdwährung
  date: string;     // ISO-Datum des ECB-Kurses
  fetchedAt: number; // Date.now() when cached
}

export interface ExchangeRateResult {
  rate: number;
  date: string;
}

export interface EurEstimate {
  eurAmount: number;
  rate: number;
  date: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const API_TIMEOUT_MS = 10_000;
const API_BASE = 'https://api.frankfurter.dev/v1';

const rateCache = new Map<string, CachedRate>();

/**
 * Get the ECB exchange rate for a currency (1 EUR = X currency).
 * Returns null if the currency is not supported or API is unavailable.
 */
export async function getRate(currency: string): Promise<ExchangeRateResult | null> {
  const code = currency.toUpperCase().trim();

  if (code === 'EUR') return { rate: 1, date: new Date().toISOString().slice(0, 10) };

  // Check cache
  const cached = rateCache.get(code);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return { rate: cached.rate, date: cached.date };
  }

  try {
    const response = await fetch(`${API_BASE}/latest?from=EUR&to=${code}`, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[ExchangeRate] Frankfurter API HTTP ${response.status} for ${code}`);
      return null;
    }

    const data = await response.json() as { base: string; date: string; rates: Record<string, number> };

    const rate = data.rates?.[code];
    if (!rate) {
      console.warn(`[ExchangeRate] No rate found for ${code}`);
      return null;
    }

    // Cache the result
    rateCache.set(code, { rate, date: data.date, fetchedAt: Date.now() });

    return { rate, date: data.date };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.warn(`[ExchangeRate] Failed to fetch rate for ${code}: ${msg}`);
    return null;
  }
}

/**
 * Convert an amount from a foreign currency to EUR (estimated).
 * Returns null if exchange rate is not available.
 */
export async function toEurEstimate(amount: number, currency: string): Promise<EurEstimate | null> {
  if (currency.toUpperCase() === 'EUR') {
    return { eurAmount: amount, rate: 1, date: new Date().toISOString().slice(0, 10) };
  }

  const rateResult = await getRate(currency);
  if (!rateResult) return null;

  // rate = 1 EUR = X currency → EUR = amount / rate
  const eurAmount = Math.round((amount / rateResult.rate) * 100) / 100;

  return {
    eurAmount,
    rate: rateResult.rate,
    date: rateResult.date,
  };
}

/** Clear the rate cache (for testing) */
export function clearCache(): void {
  rateCache.clear();
}
