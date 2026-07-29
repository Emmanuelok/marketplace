/**
 * Ghana market constants: administrative geography, addressing, phone numbers
 * and the statutory levy schedule applied to imports.
 *
 * Rates here are the published statutory rates and are the *defaults* the
 * landed-cost engine falls back to. Production deployments should override them
 * from the `tax_rates` table so a budget change is a data edit, not a release.
 */

// --- Administrative regions (16, post-2019 reorganisation) ------------------

export interface GhanaRegion {
  readonly code: string;
  readonly name: string;
  readonly capital: string;
  /** Delivery zone used by the shipping-rate engine. */
  readonly zone: DeliveryZone;
}

export type DeliveryZone = "accra-metro" | "kumasi-metro" | "regional-capital" | "outer";

export const GHANA_REGIONS: readonly GhanaRegion[] = [
  { code: "GA", name: "Greater Accra", capital: "Accra", zone: "accra-metro" },
  { code: "AH", name: "Ashanti", capital: "Kumasi", zone: "kumasi-metro" },
  { code: "WP", name: "Western", capital: "Sekondi-Takoradi", zone: "regional-capital" },
  { code: "CP", name: "Central", capital: "Cape Coast", zone: "regional-capital" },
  { code: "EP", name: "Eastern", capital: "Koforidua", zone: "regional-capital" },
  { code: "VR", name: "Volta", capital: "Ho", zone: "regional-capital" },
  { code: "NR", name: "Northern", capital: "Tamale", zone: "regional-capital" },
  { code: "UE", name: "Upper East", capital: "Bolgatanga", zone: "outer" },
  { code: "UW", name: "Upper West", capital: "Wa", zone: "outer" },
  { code: "BR", name: "Bono", capital: "Sunyani", zone: "regional-capital" },
  { code: "BE", name: "Bono East", capital: "Techiman", zone: "outer" },
  { code: "AF", name: "Ahafo", capital: "Goaso", zone: "outer" },
  { code: "WN", name: "Western North", capital: "Sefwi Wiawso", zone: "outer" },
  { code: "OT", name: "Oti", capital: "Dambai", zone: "outer" },
  { code: "SV", name: "Savannah", capital: "Damongo", zone: "outer" },
  { code: "NE", name: "North East", capital: "Nalerigu", zone: "outer" },
];

export const REGION_BY_CODE: ReadonlyMap<string, GhanaRegion> = new Map(
  GHANA_REGIONS.map((r) => [r.code, r]),
);

export function regionByCode(code: string): GhanaRegion | undefined {
  return REGION_BY_CODE.get(code.toUpperCase());
}

// --- GhanaPost GPS digital addresses ---------------------------------------

/**
 * GhanaPost GPS codes look like `GA-543-0125` — a region/district prefix, a
 * 3-digit area code and a 4-digit unique address. Hyphens are optional on
 * input; we normalise to the canonical hyphenated form.
 */
const DIGITAL_ADDRESS_RE = /^([A-Z]{2})-?(\d{3})-?(\d{4})$/;

export interface DigitalAddress {
  readonly formatted: string;
  readonly regionCode: string;
  readonly districtCode: string;
  readonly uniqueCode: string;
}

export function parseDigitalAddress(input: string): DigitalAddress | null {
  const match = DIGITAL_ADDRESS_RE.exec(input.trim().toUpperCase().replace(/\s+/g, ""));
  if (!match) return null;
  const [, region, district, unique] = match as unknown as [string, string, string, string];
  // The prefix must name a real region, otherwise it is a typo, not an address.
  if (!REGION_BY_CODE.has(region)) return null;
  return {
    formatted: `${region}-${district}-${unique}`,
    regionCode: region,
    districtCode: district,
    uniqueCode: unique,
  };
}

export function isValidDigitalAddress(input: string): boolean {
  return parseDigitalAddress(input) !== null;
}

// --- Phone numbers and mobile-money networks -------------------------------

export type MomoNetwork = "mtn" | "telecel" | "airteltigo";

export interface MomoNetworkMeta {
  readonly id: MomoNetwork;
  readonly name: string;
  readonly shortName: string;
  /** Paystack `mobile_money` provider slug. */
  readonly paystackBank: string;
  readonly prefixes: readonly string[];
}

/**
 * Prefixes are the national-format (0XX) leading digits. Telecel took over
 * Vodafone Ghana's ranges in 2023; AirtelTigo trades as AT.
 */
export const MOMO_NETWORKS: readonly MomoNetworkMeta[] = [
  {
    id: "mtn",
    name: "MTN Mobile Money",
    shortName: "MTN MoMo",
    paystackBank: "MTN",
    prefixes: ["024", "054", "055", "059", "025", "053"],
  },
  {
    id: "telecel",
    name: "Telecel Cash",
    shortName: "Telecel",
    paystackBank: "VOD",
    prefixes: ["020", "050"],
  },
  {
    id: "airteltigo",
    name: "AT Money",
    shortName: "AT",
    paystackBank: "ATL",
    prefixes: ["027", "057", "026", "056"],
  },
];

export interface ParsedPhone {
  /** E.164, e.g. +233241234567. */
  readonly e164: string;
  /** National format, e.g. 0241234567. */
  readonly national: string;
  readonly network: MomoNetwork | null;
}

/**
 * Accepts +233XXXXXXXXX, 233XXXXXXXXX, 0XXXXXXXXX and XXXXXXXXX (9 digits,
 * leading zero omitted), with any punctuation.
 */
export function parseGhanaPhone(input: string): ParsedPhone | null {
  const digits = input.replace(/[^\d]/g, "");
  let subscriber: string; // 9 digits, no leading zero

  if (digits.startsWith("233") && digits.length === 12) {
    subscriber = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 10) {
    subscriber = digits.slice(1);
  } else if (digits.length === 9) {
    subscriber = digits;
  } else {
    return null;
  }

  // Ghanaian mobile subscriber numbers start with 2 or 5 after the 0.
  if (!/^[25]\d{8}$/.test(subscriber)) return null;

  const national = `0${subscriber}`;
  const prefix = national.slice(0, 3);
  const network = MOMO_NETWORKS.find((n) => n.prefixes.includes(prefix))?.id ?? null;

  return { e164: `+233${subscriber}`, national, network };
}

export function formatGhanaPhone(input: string): string | null {
  const parsed = parseGhanaPhone(input);
  if (!parsed) return null;
  const n = parsed.national;
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

export function detectMomoNetwork(phone: string): MomoNetworkMeta | null {
  const parsed = parseGhanaPhone(phone);
  if (!parsed?.network) return null;
  return MOMO_NETWORKS.find((n) => n.id === parsed.network) ?? null;
}

// --- Statutory levy schedule for imports -----------------------------------

/**
 * Ghana applies several ad-valorem charges to imports. They do not all share a
 * base, which is the single most common source of landed-cost errors:
 *
 *   CIF                = customs value (goods + international freight + insurance)
 *   Import Duty        = CIF x duty rate (HS-code dependent)
 *   Levies (ECOWAS,
 *     AU, EXIM, etc.)  = CIF x rate
 *   VAT-inclusive base = CIF + duty + levies
 *   NHIL/GETFund/COVID = VAT-inclusive base x rate   (these are NOT in the VAT base)
 *   VAT (15%)          = (VAT-inclusive base + NHIL + GETFund + COVID) x 15%
 *
 * i.e. the 2.5% + 2.5% + 1% levies cascade *into* the VAT base. Getting this
 * wrong understates a landed cost by roughly 0.9% of CIF.
 *
 * Rates are basis points (1 bp = 0.01%).
 */
export const GHANA_LEVIES = {
  /** Value Added Tax — standard rate 15%. */
  VAT_BPS: 1_500,
  /** National Health Insurance Levy — 2.5%. */
  NHIL_BPS: 250,
  /** Ghana Education Trust Fund Levy — 2.5%. */
  GETFUND_BPS: 250,
  /** COVID-19 Health Recovery Levy — 1%. */
  COVID_BPS: 100,
  /** ECOWAS Levy — 0.5% of CIF, non-ECOWAS origin only. */
  ECOWAS_BPS: 50,
  /** African Union Import Levy — 0.2% of CIF, non-AU origin only. */
  AU_LEVY_BPS: 20,
  /** EXIM Levy — 0.75% of CIF. */
  EXIM_BPS: 75,
  /** Ghana Shippers' Authority / inspection fee — 1% of CIF. */
  INSPECTION_BPS: 100,
  /** GCNet/ICUMS processing fee — 0.4% of CIF. */
  PROCESSING_BPS: 40,
} as const;

/**
 * Import duty by product family. Real classification is by HS code; these are
 * the common bands used to quote before a formal classification exists, and
 * every quote produced with them is flagged `estimated: true`.
 */
export const DUTY_BANDS = {
  /** Most consumer electronics, computers, phones. */
  ELECTRONICS: 1_000, // 10%
  /** Laptops/desktops and parts frequently attract 0% under ICT concessions. */
  COMPUTING: 0,
  /** Large appliances. */
  APPLIANCES: 2_000, // 20%
  /** Apparel, footwear, accessories. */
  FASHION: 2_000, // 20%
  /** Cosmetics and personal care. */
  BEAUTY: 2_000, // 20%
  /** Books, educational material. */
  BOOKS: 0,
  /** Raw materials / industrial inputs. */
  INDUSTRIAL: 500, // 5%
  /** Catch-all when classification is unknown — deliberately conservative. */
  GENERAL: 2_000, // 20%
} as const;

export type DutyBand = keyof typeof DUTY_BANDS;

/** Countries we source `ORDER_TO_SHIP` inventory from. */
export const SOURCE_COUNTRIES = ["US", "GB", "CA", "CN", "AE", "DE"] as const;
export type SourceCountry = (typeof SOURCE_COUNTRIES)[number];

export interface SourceCountryMeta {
  readonly code: SourceCountry;
  readonly name: string;
  readonly currency: "USD" | "GBP" | "CAD" | "CNY" | "EUR" | "AED";
  readonly flag: string;
  /** Whether goods from here are exempt from the ECOWAS levy. */
  readonly ecowasMember: boolean;
  /** Whether goods from here are exempt from the AU import levy. */
  readonly auMember: boolean;
}

export const SOURCE_COUNTRY_META: Readonly<Record<SourceCountry, SourceCountryMeta>> = {
  US: { code: "US", name: "United States", currency: "USD", flag: "🇺🇸", ecowasMember: false, auMember: false },
  GB: { code: "GB", name: "United Kingdom", currency: "GBP", flag: "🇬🇧", ecowasMember: false, auMember: false },
  CA: { code: "CA", name: "Canada", currency: "CAD", flag: "🇨🇦", ecowasMember: false, auMember: false },
  CN: { code: "CN", name: "China", currency: "CNY", flag: "🇨🇳", ecowasMember: false, auMember: false },
  AE: { code: "AE", name: "United Arab Emirates", currency: "AED", flag: "🇦🇪", ecowasMember: false, auMember: false },
  DE: { code: "DE", name: "Germany", currency: "EUR", flag: "🇩🇪", ecowasMember: false, auMember: false },
};

// --- Freight ----------------------------------------------------------------

export type FreightMode = "air-express" | "air-economy" | "sea-lcl";

export interface FreightModeMeta {
  readonly id: FreightMode;
  readonly label: string;
  readonly description: string;
  /** Transit time to Accra, in business days, excluding customs clearance. */
  readonly transitDays: readonly [min: number, max: number];
  /** Additional days for customs clearance at Kotoka / Tema. */
  readonly clearanceDays: readonly [min: number, max: number];
  /**
   * Volumetric divisor (cm³ per kg) used to compute chargeable weight.
   * Air express uses 5000, air economy 6000, sea is billed by volume.
   */
  readonly volumetricDivisor: number;
}

export const FREIGHT_MODES: Readonly<Record<FreightMode, FreightModeMeta>> = {
  "air-express": {
    id: "air-express",
    label: "Air Express",
    description: "Fastest option. Door-to-door courier via Kotoka International.",
    transitDays: [3, 6],
    clearanceDays: [1, 2],
    volumetricDivisor: 5000,
  },
  "air-economy": {
    id: "air-economy",
    label: "Air Economy",
    description: "Consolidated air freight. Best balance of speed and cost.",
    transitDays: [8, 14],
    clearanceDays: [2, 4],
    volumetricDivisor: 6000,
  },
  "sea-lcl": {
    id: "sea-lcl",
    label: "Sea Freight",
    description: "Lowest cost for bulky items. Consolidated container to Tema Port.",
    transitDays: [35, 55],
    clearanceDays: [4, 8],
    volumetricDivisor: 1_000_000, // billed per CBM, handled separately
  },
};

/** Business-day-aware ETA window for a freight mode. */
export function freightEtaDays(mode: FreightMode): readonly [number, number] {
  const meta = FREIGHT_MODES[mode];
  return [
    meta.transitDays[0] + meta.clearanceDays[0],
    meta.transitDays[1] + meta.clearanceDays[1],
  ];
}
