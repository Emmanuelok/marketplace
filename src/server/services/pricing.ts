/**
 * Price resolution — the single place a customer-facing price is decided.
 *
 * For in-house and vendor-direct stock the variant's own price is authoritative.
 * For order-to-ship items there is no stored price: the price *is* the landed
 * cost, recomputed from the live FX rate, the freight tariff for the lane, and
 * the duty band. Everything that shows a price must come through here so the
 * PDP, the cart and the order can never disagree.
 */

import { and, desc, eq, isNull, or } from "drizzle-orm";

import { DUTY_BANDS, FREIGHT_MODES, freightEtaDays, type DutyBand, type FreightMode, type SourceCountry } from "@/lib/ghana";
import { computeLandedCost, type FreightTariff, type LandedCostBreakdown } from "@/lib/landed-cost";
import { isCurrencyCode, money, type CurrencyCode, type Money } from "@/lib/money";
import { db, categories, freightTariffs, productVariants, products } from "@/server/db";
import { getRate, getSpreadBps } from "./fx";

/** Default margin on landed cost, in basis points. Overridable per category. */
const DEFAULT_MARGIN_BPS = 1_200; // 12%
/** Transit insurance as a fraction of goods value. */
const DEFAULT_INSURANCE_BPS = 60; // 0.6%

/** Fallback tariffs so pricing works before `freight_tariffs` is seeded. */
const FALLBACK_TARIFFS: Readonly<Record<FreightMode, FreightTariff>> = {
  "air-express": { perKgMinor: 21_00, handlingMinor: 45_00, minimumMinor: 120_00 },
  "air-economy": { perKgMinor: 13_50, handlingMinor: 35_00, minimumMinor: 85_00 },
  "sea-lcl": { perKgMinor: 2_20, perCbmMinor: 2_800_00, handlingMinor: 180_00, minimumMinor: 400_00 },
};

export interface PricedVariant {
  variantId: string;
  price: Money;
  compareAt: Money | null;
  /** Present only when the price was derived from a landed-cost computation. */
  breakdown: LandedCostBreakdown | null;
  etaDays: readonly [number, number];
  /** True when any input to the price was an estimate rather than a booked cost. */
  estimated: boolean;
  freightMode: FreightMode | null;
}

export interface PriceVariantOptions {
  freightMode?: FreightMode;
  quantity?: number;
}

interface VariantPricingRow {
  variantId: string;
  priceMinor: number;
  priceCurrency: string;
  compareAtMinor: number | null;
  supplierPriceMinor: number | null;
  supplierCurrency: string | null;
  fulfillmentType: string;
  sourceCountry: string | null;
  dutyBpsOverride: number | null;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  categoryDutyBand: string;
}

const priceCache = new Map<string, { value: PricedVariant; expiresAt: number }>();
const PRICE_CACHE_TTL_MS = 60 * 1000;

export async function priceVariant(
  variantId: string,
  options: PriceVariantOptions = {},
): Promise<PricedVariant> {
  const mode = options.freightMode ?? "air-economy";
  const cacheKey = `${variantId}:${mode}`;
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await loadVariantPricingRow(variantId);
  if (!row) {
    throw new Error(`Variant ${variantId} not found`);
  }

  const result = await resolvePrice(row, mode);
  priceCache.set(cacheKey, { value: result, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
  return result;
}

/** Landed-cost breakdown for a specific freight mode, for the PDP panel. */
export async function quoteLandedCost(
  variantId: string,
  freightMode: FreightMode,
): Promise<LandedCostBreakdown> {
  const priced = await priceVariant(variantId, { freightMode });
  if (!priced.breakdown) {
    throw new Error(`Variant ${variantId} is not an order-to-ship item`);
  }
  return priced.breakdown;
}

/** Quote every freight mode at once, for the mode selector. */
export async function quoteAllFreightModes(
  variantId: string,
): Promise<{ mode: FreightMode; price: Money; etaDays: readonly [number, number] }[]> {
  const modes = Object.keys(FREIGHT_MODES) as FreightMode[];
  const quotes = await Promise.all(
    modes.map(async (mode) => {
      const priced = await priceVariant(variantId, { freightMode: mode });
      return { mode, price: priced.price, etaDays: priced.etaDays };
    }),
  );
  return quotes;
}

async function resolvePrice(row: VariantPricingRow, mode: FreightMode): Promise<PricedVariant> {
  const currency: CurrencyCode = isCurrencyCode(row.priceCurrency) ? row.priceCurrency : "GHS";

  // In-house and vendor-direct: the stored price is the price.
  if (row.fulfillmentType !== "order_to_ship") {
    return {
      variantId: row.variantId,
      price: money(row.priceMinor, currency),
      compareAt: row.compareAtMinor !== null ? money(row.compareAtMinor, currency) : null,
      breakdown: null,
      etaDays: [1, 3],
      estimated: false,
      freightMode: null,
    };
  }

  // Order-to-ship without supplier data is a catalog error; fall back to the
  // stored price rather than showing nothing, and mark it estimated.
  const supplierCurrency = row.supplierCurrency;
  if (row.supplierPriceMinor === null || !supplierCurrency || !isCurrencyCode(supplierCurrency)) {
    return {
      variantId: row.variantId,
      price: money(row.priceMinor, currency),
      compareAt: row.compareAtMinor !== null ? money(row.compareAtMinor, currency) : null,
      breakdown: null,
      etaDays: freightEtaDays(mode),
      estimated: true,
      freightMode: mode,
    };
  }

  const origin = (row.sourceCountry ?? "US") as SourceCountry;
  const [fxRate, fxSpreadBps, tariff] = await Promise.all([
    getRate(supplierCurrency, "GHS"),
    getSpreadBps(supplierCurrency, "GHS"),
    loadTariff(origin, mode),
  ]);

  const dutyBand = normaliseDutyBand(row.categoryDutyBand);

  const breakdown = computeLandedCost({
    supplierUnitPrice: money(row.supplierPriceMinor, supplierCurrency),
    quantity: 1,
    dimensions: {
      // Fall back to a modest parcel when the catalog is missing dimensions —
      // better a slightly wrong freight quote than a crash on the PDP.
      lengthCm: (row.lengthMm ?? 300) / 10,
      widthCm: (row.widthMm ?? 220) / 10,
      heightCm: (row.heightMm ?? 90) / 10,
      weightKg: (row.weightGrams ?? 1500) / 1000,
    },
    origin,
    freightMode: mode,
    dutyBand,
    fxRate,
    fxSpreadBps,
    tariff,
    marginBps: DEFAULT_MARGIN_BPS,
    insuranceBps: DEFAULT_INSURANCE_BPS,
    dutyBpsOverride: row.dutyBpsOverride ?? undefined,
  });

  return {
    variantId: row.variantId,
    price: breakdown.total,
    compareAt: row.compareAtMinor !== null ? money(row.compareAtMinor, "GHS") : null,
    breakdown,
    etaDays: breakdown.etaDays,
    estimated: breakdown.estimated,
    freightMode: mode,
  };
}

function normaliseDutyBand(value: string): DutyBand {
  return value in DUTY_BANDS ? (value as DutyBand) : "GENERAL";
}

async function loadVariantPricingRow(variantId: string): Promise<VariantPricingRow | null> {
  try {
    const rows = await db
      .select({
        variantId: productVariants.id,
        priceMinor: productVariants.priceMinor,
        priceCurrency: productVariants.priceCurrency,
        compareAtMinor: productVariants.compareAtMinor,
        supplierPriceMinor: productVariants.supplierPriceMinor,
        supplierCurrency: productVariants.supplierCurrency,
        fulfillmentType: products.fulfillmentType,
        sourceCountry: products.sourceCountry,
        dutyBpsOverride: products.dutyBpsOverride,
        weightGrams: productVariants.weightGrams,
        lengthMm: products.lengthMm,
        widthMm: products.widthMm,
        heightMm: products.heightMm,
        categoryDutyBand: categories.dutyBand,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(productVariants.id, variantId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      weightGrams: row.weightGrams ?? null,
    };
  } catch {
    return null;
  }
}

async function loadTariff(origin: SourceCountry, mode: FreightMode): Promise<FreightTariff> {
  const fallback = FALLBACK_TARIFFS[mode];
  try {
    const rows = await db
      .select()
      .from(freightTariffs)
      .where(
        and(
          eq(freightTariffs.originCountry, origin),
          eq(freightTariffs.freightMode, mode),
          or(isNull(freightTariffs.effectiveTo), undefined),
        ),
      )
      .orderBy(desc(freightTariffs.effectiveFrom))
      .limit(1);
    const row = rows[0];
    if (!row) return fallback;
    return {
      perKgMinor: row.perKgMinor,
      perCbmMinor: row.perCbmMinor ?? undefined,
      handlingMinor: row.handlingMinor,
      minimumMinor: row.minimumMinor,
    };
  } catch {
    return fallback;
  }
}

export function clearPriceCache(): void {
  priceCache.clear();
}
