/**
 * Landed-cost engine for `ORDER_TO_SHIP` items.
 *
 * Given a supplier price abroad and the physical shape of a parcel, this
 * computes what the customer pays in cedis, itemised, so the checkout can show
 * a full breakdown instead of an opaque markup.
 *
 * The computation order matters and is not arbitrary — see GHANA_LEVIES in
 * ./ghana.ts for why the NHIL/GETFund/COVID levies must be added to the VAT
 * base rather than charged alongside VAT.
 */

import {
  DUTY_BANDS,
  FREIGHT_MODES,
  GHANA_LEVIES,
  SOURCE_COUNTRY_META,
  freightEtaDays,
  type DutyBand,
  type FreightMode,
  type SourceCountry,
} from "./ghana";
import {
  add,
  applyBps,
  money,
  scale,
  sum,
  zero,
  type CurrencyCode,
  type Money,
} from "./money";

// --- Inputs -----------------------------------------------------------------

export interface Dimensions {
  /** Centimetres. */
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  /** Kilograms — actual (gross) weight. */
  readonly weightKg: number;
}

export interface FreightTariff {
  /** Charge per chargeable kg, in GHS minor units. */
  readonly perKgMinor: number;
  /** Flat handling charge per parcel, in GHS minor units. */
  readonly handlingMinor: number;
  /** Charge per cubic metre for sea freight, in GHS minor units. */
  readonly perCbmMinor?: number;
  /** Minimum billable charge, in GHS minor units. */
  readonly minimumMinor: number;
}

export interface LandedCostInput {
  /** Unit price at the supplier, in the supplier's currency. */
  readonly supplierUnitPrice: Money;
  readonly quantity: number;
  readonly dimensions: Dimensions;
  readonly origin: SourceCountry;
  readonly freightMode: FreightMode;
  readonly dutyBand: DutyBand;
  /** Shipping from the supplier to our consolidation hub, supplier currency. */
  readonly domesticFreight?: Money;
  /** FX rate: how many GHS minor units per 1 minor unit of supplier currency. */
  readonly fxRate: number;
  /** FX spread charged on top of the mid-market rate, in basis points. */
  readonly fxSpreadBps: number;
  /** Freight tariff for the selected mode. */
  readonly tariff: FreightTariff;
  /** Our margin on the pre-margin landed cost, in basis points. */
  readonly marginBps: number;
  /** Insurance premium as a fraction of goods value, in basis points. */
  readonly insuranceBps?: number;
  /**
   * Overrides for statutory rates, supplied from the `tax_rates` table so a
   * budget change is a data edit rather than a deploy.
   *
   * Typed as `number` per key rather than `Partial<typeof GHANA_LEVIES>` —
   * that would inherit the `as const` literal types and only ever accept the
   * values it was meant to replace.
   */
  readonly levyOverrides?: Partial<Record<keyof typeof GHANA_LEVIES, number>>;
  /** Explicit duty rate in bps; overrides the band when a real HS code exists. */
  readonly dutyBpsOverride?: number;
}

// --- Output -----------------------------------------------------------------

export interface LineItem {
  readonly key: string;
  readonly label: string;
  readonly amount: Money;
  /** Short explanation surfaced in the customer-facing breakdown. */
  readonly note?: string;
}

export interface LandedCostBreakdown {
  readonly currency: CurrencyCode;
  /** Chargeable weight used for freight billing, in kg. */
  readonly chargeableWeightKg: number;
  readonly volumetricWeightKg: number;
  readonly actualWeightKg: number;
  readonly volumeCbm: number;

  /** Goods value converted to GHS, before any freight. */
  readonly goodsValue: Money;
  readonly internationalFreight: Money;
  readonly insurance: Money;
  /** Customs value = goods + international freight + insurance. */
  readonly cif: Money;

  readonly importDuty: Money;
  readonly ecowasLevy: Money;
  readonly auLevy: Money;
  readonly eximLevy: Money;
  readonly inspectionFee: Money;
  readonly processingFee: Money;
  readonly nhil: Money;
  readonly getfund: Money;
  readonly covidLevy: Money;
  readonly vat: Money;
  /** All statutory charges combined. */
  readonly totalDutiesAndTaxes: Money;

  readonly fxSpread: Money;
  readonly platformMargin: Money;

  /** What the customer pays, excluding last-mile delivery inside Ghana. */
  readonly total: Money;
  /** Itemised view for the UI, in display order. */
  readonly lines: readonly LineItem[];

  readonly etaDays: readonly [number, number];
  /**
   * True when any input was an estimate (duty band rather than a classified HS
   * code, or a tariff-table freight rate rather than a booked quote).
   */
  readonly estimated: boolean;
  readonly assumptions: readonly string[];
}

// --- Weight helpers ---------------------------------------------------------

export function volumetricWeightKg(d: Dimensions, divisor: number): number {
  return (d.lengthCm * d.widthCm * d.heightCm) / divisor;
}

export function volumeCbm(d: Dimensions): number {
  return (d.lengthCm * d.widthCm * d.heightCm) / 1_000_000;
}

/**
 * Carriers bill the greater of actual and volumetric weight, rounded up to the
 * next 0.5 kg.
 */
export function chargeableWeightKg(d: Dimensions, mode: FreightMode): number {
  const volumetric = volumetricWeightKg(d, FREIGHT_MODES[mode].volumetricDivisor);
  const greater = Math.max(d.weightKg, volumetric);
  return Math.ceil(greater * 2) / 2;
}

// --- Engine -----------------------------------------------------------------

export function computeLandedCost(input: LandedCostInput): LandedCostBreakdown {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError(`quantity must be a positive integer, received ${input.quantity}`);
  }
  if (!Number.isFinite(input.fxRate) || input.fxRate <= 0) {
    throw new RangeError(`fxRate must be a positive finite number, received ${input.fxRate}`);
  }

  const GHS: CurrencyCode = "GHS";
  const levies = { ...GHANA_LEVIES, ...input.levyOverrides };
  const assumptions: string[] = [];
  let estimated = false;

  // --- 1. Goods value in GHS -----------------------------------------------
  // The supplier price and any domestic (supplier -> hub) freight are both in
  // the supplier's currency, so they convert together at the same rate.
  const supplierTotalMinor =
    input.supplierUnitPrice.minor * input.quantity + (input.domesticFreight?.minor ?? 0);
  const goodsValue = money(Math.round(supplierTotalMinor * input.fxRate), GHS);

  // --- 2. International freight --------------------------------------------
  const perParcel = perParcelDimensions(input.dimensions, input.quantity);
  const actualKg = perParcel.weightKg;
  const volumetricKg = volumetricWeightKg(perParcel, FREIGHT_MODES[input.freightMode].volumetricDivisor);
  const chargeableKg = chargeableWeightKg(perParcel, input.freightMode);
  const cbm = volumeCbm(perParcel);

  const internationalFreight = computeFreight(
    input.freightMode,
    input.tariff,
    chargeableKg,
    cbm,
  );
  if (input.freightMode === "sea-lcl") {
    assumptions.push(`Sea freight billed on ${cbm.toFixed(3)} CBM consolidated volume.`);
  } else {
    assumptions.push(
      `Freight billed on ${chargeableKg.toFixed(1)} kg chargeable weight ` +
        `(actual ${actualKg.toFixed(1)} kg, volumetric ${volumetricKg.toFixed(1)} kg).`,
    );
  }
  estimated = true; // tariff-table rate, not a booked carrier quote
  assumptions.push("Freight quoted from the current tariff table; a booked rate may differ.");

  // --- 3. Insurance ---------------------------------------------------------
  const insuranceBps = input.insuranceBps ?? 0;
  const insurance = insuranceBps > 0 ? applyBps(goodsValue, insuranceBps) : zero(GHS);

  // --- 4. CIF (the customs value) ------------------------------------------
  const cif = sum([goodsValue, internationalFreight, insurance], GHS);

  // --- 5. Duty and CIF-based levies ----------------------------------------
  const dutyBps = input.dutyBpsOverride ?? DUTY_BANDS[input.dutyBand];
  if (input.dutyBpsOverride === undefined) {
    estimated = true;
    assumptions.push(
      `Import duty estimated at ${(dutyBps / 100).toFixed(1)}% from the ` +
        `${input.dutyBand} band; the final rate depends on HS classification at clearance.`,
    );
  }
  const importDuty = applyBps(cif, dutyBps);

  const originMeta = SOURCE_COUNTRY_META[input.origin];
  const ecowasLevy = originMeta.ecowasMember ? zero(GHS) : applyBps(cif, levies.ECOWAS_BPS);
  const auLevy = originMeta.auMember ? zero(GHS) : applyBps(cif, levies.AU_LEVY_BPS);
  const eximLevy = applyBps(cif, levies.EXIM_BPS);
  const inspectionFee = applyBps(cif, levies.INSPECTION_BPS);
  const processingFee = applyBps(cif, levies.PROCESSING_BPS);

  // --- 6. The cascading levies ---------------------------------------------
  // NHIL, GETFund and the COVID levy are charged on (CIF + duty + CIF-levies),
  // and are themselves inside the VAT base.
  const preLevyBase = sum(
    [cif, importDuty, ecowasLevy, auLevy, eximLevy, inspectionFee, processingFee],
    GHS,
  );
  const nhil = applyBps(preLevyBase, levies.NHIL_BPS);
  const getfund = applyBps(preLevyBase, levies.GETFUND_BPS);
  const covidLevy = applyBps(preLevyBase, levies.COVID_BPS);

  // --- 7. VAT ---------------------------------------------------------------
  const vatBase = sum([preLevyBase, nhil, getfund, covidLevy], GHS);
  const vat = applyBps(vatBase, levies.VAT_BPS);

  const totalDutiesAndTaxes = sum(
    [
      importDuty,
      ecowasLevy,
      auLevy,
      eximLevy,
      inspectionFee,
      processingFee,
      nhil,
      getfund,
      covidLevy,
      vat,
    ],
    GHS,
  );

  // --- 8. FX spread ---------------------------------------------------------
  // Charged on the imported-goods value only — freight and taxes are already
  // denominated in cedis.
  const fxSpread = applyBps(goodsValue, input.fxSpreadBps);

  // --- 9. Margin ------------------------------------------------------------
  // Applied to everything we have laid out, so the margin covers the working
  // capital tied up in duties as well as in goods.
  const preMarginTotal = sum([cif, totalDutiesAndTaxes, fxSpread], GHS);
  const platformMargin = applyBps(preMarginTotal, input.marginBps);

  const total = add(preMarginTotal, platformMargin);

  const lines: LineItem[] = [
    {
      key: "goods",
      label: "Item price",
      amount: goodsValue,
      note: `${input.quantity} × ${originMeta.flag} ${originMeta.name} supplier price`,
    },
    {
      key: "freight",
      label: `Freight — ${FREIGHT_MODES[input.freightMode].label}`,
      amount: internationalFreight,
      note: FREIGHT_MODES[input.freightMode].description,
    },
  ];
  if (insurance.minor > 0) {
    lines.push({ key: "insurance", label: "Transit insurance", amount: insurance });
  }
  lines.push(
    {
      key: "duty",
      label: "Import duty",
      amount: importDuty,
      note: `${(dutyBps / 100).toFixed(1)}% of customs value`,
    },
    {
      key: "vat",
      label: "VAT",
      amount: vat,
      note: `${(levies.VAT_BPS / 100).toFixed(0)}% standard rate`,
    },
    {
      key: "levies",
      label: "Statutory levies",
      amount: sum(
        [nhil, getfund, covidLevy, ecowasLevy, auLevy, eximLevy, inspectionFee, processingFee],
        GHS,
      ),
      note: "NHIL, GETFund, COVID-19 recovery, ECOWAS, AU, EXIM, inspection and processing",
    },
  );
  if (fxSpread.minor > 0) {
    lines.push({
      key: "fx",
      label: "Currency conversion",
      amount: fxSpread,
      note: `${(input.fxSpreadBps / 100).toFixed(2)}% on the foreign-currency portion`,
    });
  }
  lines.push({ key: "margin", label: "Nyansa service fee", amount: platformMargin });

  return {
    currency: GHS,
    chargeableWeightKg: chargeableKg,
    volumetricWeightKg: volumetricKg,
    actualWeightKg: actualKg,
    volumeCbm: cbm,
    goodsValue,
    internationalFreight,
    insurance,
    cif,
    importDuty,
    ecowasLevy,
    auLevy,
    eximLevy,
    inspectionFee,
    processingFee,
    nhil,
    getfund,
    covidLevy,
    vat,
    totalDutiesAndTaxes,
    fxSpread,
    platformMargin,
    total,
    lines,
    etaDays: freightEtaDays(input.freightMode),
    estimated,
    assumptions,
  };
}

/**
 * Scale a single unit's dimensions to the whole consignment. Weight scales
 * linearly; volume is approximated by stacking along the longest axis, which is
 * how a consolidator would actually pack identical cartons.
 */
function perParcelDimensions(d: Dimensions, quantity: number): Dimensions {
  if (quantity === 1) return d;
  const longest = Math.max(d.lengthCm, d.widthCm, d.heightCm);
  const scaled = { ...d, weightKg: d.weightKg * quantity };
  if (longest === d.lengthCm) return { ...scaled, lengthCm: d.lengthCm * quantity };
  if (longest === d.widthCm) return { ...scaled, widthCm: d.widthCm * quantity };
  return { ...scaled, heightCm: d.heightCm * quantity };
}

function computeFreight(
  mode: FreightMode,
  tariff: FreightTariff,
  chargeableKg: number,
  cbm: number,
): Money {
  const GHS: CurrencyCode = "GHS";
  const base =
    mode === "sea-lcl" && tariff.perCbmMinor !== undefined
      ? scale(money(tariff.perCbmMinor, GHS), cbm)
      : scale(money(tariff.perKgMinor, GHS), chargeableKg);

  const withHandling = add(base, money(tariff.handlingMinor, GHS));
  return withHandling.minor < tariff.minimumMinor
    ? money(tariff.minimumMinor, GHS)
    : withHandling;
}

/**
 * The effective multiple between the supplier price and what the customer pays.
 * Merchandising uses this to flag items where importing is poor value.
 */
export function landedCostMultiple(breakdown: LandedCostBreakdown): number {
  if (breakdown.goodsValue.minor === 0) return 0;
  return breakdown.total.minor / breakdown.goodsValue.minor;
}
