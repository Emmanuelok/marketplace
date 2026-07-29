/**
 * Prefixed identifiers.
 *
 * Every id carries a 3–4 character type prefix, so an id in a log line or a
 * support ticket is self-describing and a variant id can never be mistaken for
 * a product id at a call site.
 */

import { customAlphabet } from "nanoid";

// Base58-ish: no 0/O/I/l, so ids survive being read aloud over the phone.
const ALPHABET = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const generate = customAlphabet(ALPHABET, 21);

export const ID_PREFIXES = {
  user: "usr",
  session: "ses",
  address: "adr",
  brand: "brd",
  category: "cat",
  vendor: "vnd",
  product: "prd",
  variant: "var",
  image: "img",
  inventory: "inv",
  cart: "crt",
  cartItem: "cri",
  order: "ord",
  orderItem: "ori",
  payment: "pay",
  shipment: "shp",
  shipmentEvent: "she",
  review: "rev",
  wishlist: "wsh",
  promotion: "pro",
  agentRun: "run",
  agentMessage: "msg",
  agentDecision: "dec",
  conversation: "cnv",
  fxRate: "fxr",
  taxRate: "txr",
  freightTariff: "frt",
  deliveryZone: "dlz",
  searchQuery: "sqy",
  productEvent: "pev",
} as const;

export type EntityKind = keyof typeof ID_PREFIXES;

/** `newId("product")` -> "prd_7k3m2qX9..." (max 25 chars, fits varchar(32)). */
export function newId(kind: EntityKind): string {
  return `${ID_PREFIXES[kind]}_${generate()}`;
}

export function isId(kind: EntityKind, value: string): boolean {
  return value.startsWith(`${ID_PREFIXES[kind]}_`);
}

/** Human-facing order reference: NYA-K3M2QP. Uppercase, unambiguous, short. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const generateReference = customAlphabet(REFERENCE_ALPHABET, 6);

export function newOrderReference(): string {
  return `NYA-${generateReference()}`;
}

/** Anonymous visitor id stored in a cookie so a guest cart survives a reload. */
export function newAnonymousId(): string {
  return `anon_${generate()}`;
}
