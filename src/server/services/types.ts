import type { LandedCostBreakdown } from "@/lib/landed-cost";
import type { Money } from "@/lib/money";

export type FulfillmentType = "in_house" | "order_to_ship" | "vendor_direct";
export type SortKey = "relevance" | "price_asc" | "price_desc" | "newest" | "rating" | "popular";

export interface ProductFilters {
  q?: string;
  categorySlug?: string;
  brandSlugs?: string[];
  minPriceMinor?: number;
  maxPriceMinor?: number;
  fulfillment?: FulfillmentType[];
  inStockOnly?: boolean;
  minRating?: number;
  sort?: SortKey;
  page?: number;
  perPage?: number;
}

export interface ProductListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  brandName: string | null;
  brandSlug: string | null;
  categorySlug: string;
  imageUrl: string | null;
  placeholderColor: string | null;
  price: Money;
  compareAt: Money | null;
  ratingAverage: number;
  ratingCount: number;
  fulfillmentType: FulfillmentType;
  sourceCountry: string | null;
  /** Delivery window in days, [min, max]. */
  etaDays: readonly [number, number];
  availability: AvailabilityState;
  hasLocalWarranty: boolean;
  isAuthorisedBrand: boolean;
}

export type AvailabilityState = "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";

export interface Availability {
  state: AvailabilityState;
  quantity: number;
  locationCode: string | null;
  etaDays: readonly [number, number];
}

export interface VariantView {
  id: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  price: Money;
  compareAt: Money | null;
  imageUrl: string | null;
  availability: Availability;
  /** Present only for order_to_ship variants. */
  breakdown: LandedCostBreakdown | null;
  isDefault: boolean;
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  highlights: string[];
  specifications: { group: string; label: string; value: string }[];
  brand: { id: string; name: string; slug: string; isAuthorised: boolean; logoUrl: string | null } | null;
  breadcrumb: { label: string; href: string }[];
  images: { url: string; altText: string | null; placeholderColor: string | null }[];
  variants: VariantView[];
  fulfillmentType: FulfillmentType;
  sourceCountry: string | null;
  warrantyMonths: number;
  hasLocalWarranty: boolean;
  ratingAverage: number;
  ratingCount: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  path: string;
  depth: number;
  iconName: string | null;
  imageUrl: string | null;
  dutyBand: string;
  children: CategoryNode[];
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  brands: FacetBucket[];
  fulfillment: FacetBucket[];
  priceRange: { minMinor: number; maxMinor: number };
  ratings: FacetBucket[];
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  perPage: number;
  facets: Facets;
}

export interface Suggestion {
  kind: "product" | "brand" | "category" | "query";
  label: string;
  href: string;
  imageUrl?: string | null;
  meta?: string;
}

/**
 * Services return this rather than throwing when the failure is expected
 * (no database configured, empty catalog) — callers render an empty state.
 */
export class ServiceUnavailableError extends Error {
  constructor(
    readonly service: string,
    readonly cause?: unknown,
  ) {
    super(`${service} is unavailable`);
    this.name = "ServiceUnavailableError";
  }
}
