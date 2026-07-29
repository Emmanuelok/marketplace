/**
 * Foreign-exchange rates.
 *
 * Order-to-ship pricing is only as good as the rate behind it, so rates are
 * read from the database (newest row per pair) with a short in-process cache.
 * The static fallback below exists so that a fresh clone with no seeded data
 * still produces sensible landed costs in development.
 */

import { and, desc, eq } from "drizzle-orm";

import { env } from "@/lib/env";
import { money, scale, type CurrencyCode, type Money } from "@/lib/money";
import { db, fxRates } from "@/server/db";

/**
 * Illustrative mid-market rates: 1 unit of the base currency in GHS.
 * These are a development fallback, not a source of truth — seed `fx_rates`
 * and refresh it from a provider before taking real payments.
 */
const FALLBACK_RATES: Readonly<Record<CurrencyCode, number>> = {
  GHS: 1,
  USD: 12.4,
  GBP: 15.8,
  EUR: 13.5,
  CAD: 9.1,
  CNY: 1.72,
};

interface CachedRate {
  rate: number;
  spreadBps: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedRate>();

async function loadRate(base: CurrencyCode, quote: CurrencyCode): Promise<CachedRate> {
  const key = `${base}:${quote}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;

  let resolved: CachedRate = {
    rate: base === quote ? 1 : FALLBACK_RATES[base] / FALLBACK_RATES[quote],
    spreadBps: env().FX_SPREAD_BPS,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  try {
    const rows = await db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.baseCurrency, base), eq(fxRates.quoteCurrency, quote)))
      .orderBy(desc(fxRates.effectiveAt))
      .limit(1);
    const row = rows[0];
    if (row) {
      resolved = {
        rate: row.rate,
        spreadBps: row.spreadBps,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    }
  } catch {
    // No database, or the table has not been migrated yet. The fallback rate is
    // already in `resolved`; pricing degrades to "illustrative" rather than
    // failing the whole page render.
  }

  cache.set(key, resolved);
  return resolved;
}

/** Mid-market rate: 1 unit of `base` expressed in `quote`. */
export async function getRate(base: CurrencyCode, quote: CurrencyCode = "GHS"): Promise<number> {
  if (base === quote) return 1;
  return (await loadRate(base, quote)).rate;
}

/** The spread we add on top of the mid-market rate, in basis points. */
export async function getSpreadBps(base: CurrencyCode, quote: CurrencyCode = "GHS"): Promise<number> {
  if (base === quote) return 0;
  return (await loadRate(base, quote)).spreadBps;
}

/**
 * Convert at the mid-market rate. The customer-facing spread is applied
 * separately by the landed-cost engine so it appears as its own line item
 * rather than being hidden inside the rate.
 */
export async function convert(amount: Money, to: CurrencyCode): Promise<Money> {
  if (amount.currency === to) return amount;
  const rate = await getRate(amount.currency, to);
  return scale(money(amount.minor, to), rate);
}

/** Clear the in-process cache. Used by tests and the admin rate-refresh action. */
export function clearFxCache(): void {
  cache.clear();
}
