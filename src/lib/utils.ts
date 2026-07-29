import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes, resolving conflicts in favour of the last one. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** "2 days ago", "in 3 weeks" — relative time without pulling in a date library. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en-GH", { numeric: "auto" });
  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = seconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(value) < amount) return formatter.format(Math.round(value), unit);
    value /= amount;
  }
  return formatter.format(Math.round(value), "year");
}

/** Format a delivery window as "3–6 Aug" or "Tomorrow" when it is a single day. */
export function formatDeliveryWindow(from: Date, to: Date): string {
  const day = new Intl.DateTimeFormat("en-GH", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short" });
  if (from.toDateString() === to.toDateString()) return dayMonth.format(from);
  if (from.getMonth() === to.getMonth()) {
    return `${day.format(from)}–${dayMonth.format(to)}`;
  }
  return `${dayMonth.format(from)} – ${dayMonth.format(to)}`;
}

/** Add business days, skipping Saturday and Sunday. */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const weekday = result.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Group an array by a derived key, preserving insertion order. */
export function groupBy<T, K extends string | number>(
  items: readonly T[],
  keyOf: (item: T) => K,
): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = result.get(key);
    if (bucket) bucket.push(item);
    else result.set(key, [item]);
  }
  return result;
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Percentage saved, rounded to a whole number. Returns null when there is none. */
export function discountPercent(priceMinor: number, compareAtMinor?: number | null): number | null {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return null;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}
