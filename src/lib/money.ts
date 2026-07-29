/**
 * Money primitives.
 *
 * Every monetary amount in this codebase is an integer count of *minor units*
 * (pesewas for GHS, cents for USD/GBP/EUR/CAD, fen for CNY). Floats are never
 * used to carry money — they are only produced at the display boundary.
 *
 * The `Money` type carries its currency so that a GHS amount can never be
 * silently added to a USD amount.
 */

export const CURRENCIES = ["GHS", "USD", "GBP", "EUR", "CAD", "CNY"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

interface CurrencyMeta {
  readonly code: CurrencyCode;
  readonly symbol: string;
  /** Number of decimal places, i.e. log10(minor units per major unit). */
  readonly exponent: number;
  readonly name: string;
}

export const CURRENCY_META: Readonly<Record<CurrencyCode, CurrencyMeta>> = {
  GHS: { code: "GHS", symbol: "GH₵", exponent: 2, name: "Ghana Cedi" },
  USD: { code: "USD", symbol: "$", exponent: 2, name: "US Dollar" },
  GBP: { code: "GBP", symbol: "£", exponent: 2, name: "Pound Sterling" },
  EUR: { code: "EUR", symbol: "€", exponent: 2, name: "Euro" },
  CAD: { code: "CAD", symbol: "CA$", exponent: 2, name: "Canadian Dollar" },
  CNY: { code: "CNY", symbol: "¥", exponent: 2, name: "Chinese Yuan" },
};

export interface Money {
  /** Integer amount in minor units. May be negative (discounts, refunds). */
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Construct Money from an integer minor-unit amount. */
export function money(minor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minor)) {
    throw new TypeError(`Money.minor must be an integer, received ${minor}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money.minor exceeds safe integer range: ${minor}`);
  }
  return { minor, currency };
}

/** Construct Money from a major-unit decimal (e.g. 149.99 -> 14999 pesewas). */
export function fromMajor(major: number, currency: CurrencyCode): Money {
  if (!Number.isFinite(major)) {
    throw new TypeError(`fromMajor requires a finite number, received ${major}`);
  }
  const factor = 10 ** CURRENCY_META[currency].exponent;
  // Round through a string to dodge binary-float representation error
  // (e.g. 1.005 * 100 === 100.49999999999999).
  return money(Math.round(Number((major * factor).toFixed(6))), currency);
}

export function zero(currency: CurrencyCode): Money {
  return { minor: 0, currency };
}

export function toMajor(m: Money): number {
  return m.minor / 10 ** CURRENCY_META[m.currency].exponent;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `Currency mismatch: cannot combine ${a.currency} with ${b.currency}. ` +
        `Convert explicitly with convert() first.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce<Money>((acc, m) => add(acc, m), zero(currency));
}

/** Multiply by a whole quantity. Exact — no rounding involved. */
export function multiply(m: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`multiply expects an integer quantity, received ${quantity}`);
  }
  return money(m.minor * quantity, m.currency);
}

export type RoundingMode = "half-up" | "half-even" | "up" | "down";

function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case "up":
      return Math.ceil(value - Number.EPSILON);
    case "down":
      return Math.floor(value + Number.EPSILON);
    case "half-even": {
      const floor = Math.floor(value);
      const diff = value - floor;
      if (Math.abs(diff - 0.5) > Number.EPSILON) return Math.round(value);
      return floor % 2 === 0 ? floor : floor + 1;
    }
    case "half-up":
    default:
      // Math.round rounds -0.5 to -0, which is "half-up" toward +Infinity.
      // For money we want symmetric half-away-from-zero on negatives.
      return value < 0 ? -Math.round(-value) : Math.round(value);
  }
}

/** Scale by an arbitrary rational factor (tax rates, margins, FX). */
export function scale(m: Money, factor: number, mode: RoundingMode = "half-up"): Money {
  if (!Number.isFinite(factor)) {
    throw new TypeError(`scale requires a finite factor, received ${factor}`);
  }
  return money(applyRounding(m.minor * factor, mode), m.currency);
}

/**
 * Apply a rate expressed in basis points (1 bp = 0.01%). Preferred over raw
 * floats for tax and margin rates, because bps are exactly representable.
 */
export function applyBps(m: Money, bps: number, mode: RoundingMode = "half-up"): Money {
  return money(applyRounding((m.minor * bps) / 10_000, mode), m.currency);
}

export function percentOf(m: Money, percent: number, mode: RoundingMode = "half-up"): Money {
  return applyBps(m, percent * 100, mode);
}

/**
 * Split an amount into `parts` shares whose sum is exactly the original.
 * The remainder pesewas are distributed to the leading shares, so
 * allocate(GH₵10.00, 3) -> [334, 333, 333].
 */
export function allocate(m: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`allocate requires a positive integer, received ${parts}`);
  }
  const base = Math.trunc(m.minor / parts);
  let remainder = m.minor - base * parts;
  const step = remainder < 0 ? -1 : 1;
  return Array.from({ length: parts }, () => {
    let share = base;
    if (remainder !== 0) {
      share += step;
      remainder -= step;
    }
    return money(share, m.currency);
  });
}

/** Distribute an amount across weights, preserving the exact total. */
export function allocateByWeights(m: Money, weights: readonly number[]): Money[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return allocate(m, Math.max(weights.length, 1));
  const shares = weights.map((w) => Math.floor((m.minor * w) / total));
  let remainder = m.minor - shares.reduce((a, b) => a + b, 0);
  // Hand the leftover minor units to the largest weights first.
  const order = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.i);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const idx = order[cursor % order.length]!;
    shares[idx] = (shares[idx] ?? 0) + 1;
    remainder -= 1;
    cursor += 1;
  }
  return shares.map((s) => money(s, m.currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export const isZero = (m: Money): boolean => m.minor === 0;
export const isNegative = (m: Money): boolean => m.minor < 0;
export const isPositive = (m: Money): boolean => m.minor > 0;
export const negate = (m: Money): Money => money(-m.minor, m.currency);
export const absolute = (m: Money): Money => money(Math.abs(m.minor), m.currency);

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b;
}

/** Clamp to zero — used where a discount must not create a negative total. */
export function clampToZero(m: Money): Money {
  return m.minor < 0 ? zero(m.currency) : m;
}

// --- Formatting -------------------------------------------------------------

export interface FormatOptions {
  /** Drop the decimal part when the amount is a whole major unit. */
  readonly compactDecimals?: boolean;
  /** Render as "GH₵1,499" instead of "GH₵1,499.00" regardless of value. */
  readonly hideDecimals?: boolean;
  readonly locale?: string;
}

/**
 * Format for display. Ghana uses the en-GH locale with the GH₵ symbol; we
 * render the symbol ourselves so the placement is stable across runtimes
 * (Node's ICU renders GHS as "GH₵" or "GHS" depending on the build).
 */
export function formatMoney(m: Money, options: FormatOptions = {}): string {
  const meta = CURRENCY_META[m.currency];
  const locale = options.locale ?? "en-GH";
  const major = Math.abs(m.minor) / 10 ** meta.exponent;
  const whole = m.minor % 10 ** meta.exponent === 0;
  const showDecimals = !options.hideDecimals && !(options.compactDecimals && whole);
  const digits = showDecimals ? meta.exponent : 0;

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);

  return `${m.minor < 0 ? "−" : ""}${meta.symbol}${formatted}`;
}

/** Compact display for dense UI: GH₵12.5k, GH₵1.2M. */
export function formatMoneyCompact(m: Money): string {
  const meta = CURRENCY_META[m.currency];
  const major = Math.abs(m.minor) / 10 ** meta.exponent;
  const sign = m.minor < 0 ? "−" : "";
  if (major < 1000) return formatMoney(m, { compactDecimals: true });
  const units: [number, string][] = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "k"],
  ];
  for (const [threshold, suffix] of units) {
    if (major >= threshold) {
      const value = major / threshold;
      const text = value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
      return `${sign}${meta.symbol}${text}${suffix}`;
    }
  }
  return formatMoney(m);
}

// --- Serialisation ----------------------------------------------------------

/** Wire format: "GHS:149900". Stable, sortable within a currency, lossless. */
export function serializeMoney(m: Money): string {
  return `${m.currency}:${m.minor}`;
}

export function parseMoney(value: string): Money {
  const [code, raw] = value.split(":");
  if (!code || raw === undefined || !isCurrencyCode(code)) {
    throw new TypeError(`Malformed money string: ${value}`);
  }
  const minor = Number(raw);
  if (!Number.isInteger(minor)) {
    throw new TypeError(`Malformed money string: ${value}`);
  }
  return money(minor, code);
}
