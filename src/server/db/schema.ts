/**
 * Database schema (PostgreSQL via Drizzle).
 *
 * Conventions used throughout:
 *  - Money is stored as `bigint` minor units plus a `currency` column. Never
 *    `numeric`, never floats. See src/lib/money.ts.
 *  - Every table has `id` (prefixed nanoid), `createdAt`, `updatedAt`.
 *  - Soft deletion via `archivedAt` where history matters; hard delete elsewhere.
 *  - Enums are Postgres enums so bad values fail at write time, not read time.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// --- Enums ------------------------------------------------------------------

export const fulfillmentTypeEnum = pgEnum("fulfillment_type", [
  "in_house", // held in the Accra warehouse, ships same/next day
  "order_to_ship", // sourced abroad on order, landed-cost priced
  "vendor_direct", // third-party merchant ships to the customer
]);

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "out_of_stock",
  "discontinued",
  "archived",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "sourcing", // order_to_ship: buying from the overseas supplier
  "in_transit_international",
  "customs_clearance",
  "in_country",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "initialised",
  "pending",
  "succeeded",
  "failed",
  "abandoned",
  "refunded",
  "partially_refunded",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "mobile_money",
  "card",
  "bank_transfer",
  "cash_on_delivery",
  "pay_in_4",
]);

export const userRoleEnum = pgEnum("user_role", ["customer", "vendor", "staff", "admin"]);

export const addressTypeEnum = pgEnum("address_type", ["shipping", "billing"]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "needs_review",
]);

export const reviewStatusEnum = pgEnum("review_status", ["pending", "published", "rejected"]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "label_created",
  "picked_up",
  "in_transit",
  "at_hub",
  "customs_hold",
  "out_for_delivery",
  "delivered",
  "exception",
  "returned",
]);

// --- Shared column helpers --------------------------------------------------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Money column pair. Amount is minor units; currency is an ISO-4217 code. */
const moneyColumns = (name: string) => ({
  [`${name}Minor`]: bigint(`${name}_minor`, { mode: "number" }),
  [`${name}Currency`]: varchar(`${name}_currency`, { length: 3 }),
});

// --- Identity ---------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** E.164, e.g. +233241234567. */
    phone: varchar("phone", { length: 20 }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    role: userRoleEnum("role").notNull().default("customer"),
    /** Preferred display currency; prices are always charged in GHS. */
    displayCurrency: varchar("display_currency", { length: 3 }).notNull().default("GHS"),
    locale: varchar("locale", { length: 10 }).notNull().default("en-GH"),
    /** Free-form personalisation signals maintained by the merchandising agent. */
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_unique").on(t.phone),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 32 }).references(() => users.id, { onDelete: "cascade" }),
    /** Anonymous carts attach to a session before the user signs in. */
    anonymousId: varchar("anonymous_id", { length: 32 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: addressTypeEnum("type").notNull().default("shipping"),
    recipientName: varchar("recipient_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    /** GhanaPost GPS code, e.g. GA-543-0125. The primary addressing method. */
    digitalAddress: varchar("digital_address", { length: 20 }),
    /** Free-text description — how a courier actually finds the place. */
    landmark: text("landmark"),
    streetAddress: text("street_address"),
    city: varchar("city", { length: 120 }).notNull(),
    regionCode: varchar("region_code", { length: 4 }).notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("GH"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

// --- Catalog ----------------------------------------------------------------

export const brands = pgTable(
  "brands",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    slug: varchar("slug", { length: 140 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    logoUrl: text("logo_url"),
    heroImageUrl: text("hero_image_url"),
    description: text("description"),
    /** Whether we are an authorised reseller — drives the trust badge. */
    isAuthorised: boolean("is_authorised").notNull().default(false),
    /** Sort weight for brand rails; higher shows first. */
    prominence: smallint("prominence").notNull().default(0),
    countryOfOrigin: varchar("country_of_origin", { length: 2 }),
    ...timestamps,
  },
  (t) => [uniqueIndex("brands_slug_unique").on(t.slug), index("brands_prominence_idx").on(t.prominence)],
);

export const categories = pgTable(
  "categories",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    slug: varchar("slug", { length: 140 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    parentId: varchar("parent_id", { length: 32 }),
    /** Materialised path, e.g. "electronics/computing/laptops". */
    path: text("path").notNull(),
    depth: smallint("depth").notNull().default(0),
    description: text("description"),
    iconName: varchar("icon_name", { length: 60 }),
    imageUrl: text("image_url"),
    /** Default duty band applied to order-to-ship items in this category. */
    dutyBand: varchar("duty_band", { length: 30 }).notNull().default("GENERAL"),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categories_slug_unique").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
    index("categories_path_idx").on(t.path),
  ],
);

export const vendors = pgTable(
  "vendors",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    ownerUserId: varchar("owner_user_id", { length: 32 }).references(() => users.id),
    slug: varchar("slug", { length: 140 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    legalName: varchar("legal_name", { length: 250 }),
    /** Ghana Revenue Authority TIN. */
    tin: varchar("tin", { length: 20 }),
    /** Registrar-General's Department business registration number. */
    registrationNumber: varchar("registration_number", { length: 40 }),
    supportEmail: varchar("support_email", { length: 320 }),
    supportPhone: varchar("support_phone", { length: 20 }),
    logoUrl: text("logo_url"),
    /** Commission taken on vendor_direct sales, in basis points. */
    commissionBps: integer("commission_bps").notNull().default(1200),
    isVerified: boolean("is_verified").notNull().default(false),
    /** 0–100, maintained by the vendor-performance agent. */
    performanceScore: smallint("performance_score").notNull().default(50),
    payoutDetails: jsonb("payout_details").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("vendors_slug_unique").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    slug: varchar("slug", { length: 200 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    subtitle: varchar("subtitle", { length: 300 }),
    brandId: varchar("brand_id", { length: 32 }).references(() => brands.id),
    categoryId: varchar("category_id", { length: 32 })
      .notNull()
      .references(() => categories.id),
    vendorId: varchar("vendor_id", { length: 32 }).references(() => vendors.id),
    status: productStatusEnum("status").notNull().default("draft"),
    fulfillmentType: fulfillmentTypeEnum("fulfillment_type").notNull().default("in_house"),

    description: text("description"),
    /** Bullet highlights shown above the fold on the PDP. */
    highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
    /** Normalised spec sheet: [{ group, label, value }]. */
    specifications: jsonb("specifications")
      .$type<{ group: string; label: string; value: string }[]>()
      .notNull()
      .default([]),
    /** Structured attributes used for faceted filtering. */
    attributes: jsonb("attributes").$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),

    /** Country the item is sourced from for order_to_ship. */
    sourceCountry: varchar("source_country", { length: 2 }),
    /** Overrides the category duty band when the HS code is known. */
    hsCode: varchar("hs_code", { length: 12 }),
    dutyBpsOverride: integer("duty_bps_override"),

    /** Shipping shape, used by the landed-cost and delivery engines. */
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),

    warrantyMonths: smallint("warranty_months").notNull().default(0),
    /** True when the warranty is honoured by a service centre inside Ghana. */
    hasLocalWarranty: boolean("has_local_warranty").notNull().default(false),

    ratingAverage: real("rating_average").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    purchaseCount: integer("purchase_count").notNull().default(0),

    seoTitle: varchar("seo_title", { length: 300 }),
    seoDescription: text("seo_description"),

    /** Set by the catalog agent when it last enriched this record. */
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_slug_unique").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brandId),
    index("products_status_idx").on(t.status),
    index("products_fulfillment_idx").on(t.fulfillmentType),
    index("products_vendor_idx").on(t.vendorId),
    // Full-text search over title + subtitle + description.
    index("products_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${t.title}, '') || ' ' || coalesce(${t.subtitle}, '') || ' ' || coalesce(${t.description}, ''))`,
    ),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    productId: varchar("product_id", { length: 32 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 80 }).notNull(),
    /** Manufacturer part number / EAN, used to match supplier catalogues. */
    mpn: varchar("mpn", { length: 80 }),
    barcode: varchar("barcode", { length: 40 }),
    title: varchar("title", { length: 200 }).notNull(),
    /** Variant axes, e.g. { colour: "Titanium", storage: "512GB" }. */
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),

    /** Selling price in GHS minor units. Authoritative for in_house items. */
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    priceCurrency: varchar("price_currency", { length: 3 }).notNull().default("GHS"),
    /** Was-price for strike-through display. */
    compareAtMinor: bigint("compare_at_minor", { mode: "number" }),
    /** What the unit costs us, for margin reporting. */
    costMinor: bigint("cost_minor", { mode: "number" }),

    /** For order_to_ship: the supplier price abroad, in supplier currency. */
    supplierPriceMinor: bigint("supplier_price_minor", { mode: "number" }),
    supplierCurrency: varchar("supplier_currency", { length: 3 }),
    supplierUrl: text("supplier_url"),
    supplierName: varchar("supplier_name", { length: 200 }),

    weightGrams: integer("weight_grams"),
    imageUrl: text("image_url"),
    position: smallint("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("variants_sku_unique").on(t.sku),
    index("variants_product_idx").on(t.productId),
    index("variants_price_idx").on(t.priceMinor),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    productId: varchar("product_id", { length: 32 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: varchar("variant_id", { length: 32 }).references(() => productVariants.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    /** Alt text — generated by the catalog agent when missing. */
    altText: text("alt_text"),
    width: integer("width"),
    height: integer("height"),
    /** Dominant colour, used for the blur-up placeholder. */
    placeholderColor: varchar("placeholder_color", { length: 9 }),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.position)],
);

export const inventory = pgTable(
  "inventory",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    variantId: varchar("variant_id", { length: 32 })
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    /** Warehouse/location code, e.g. "ACC-01" (Accra), "KMS-01" (Kumasi). */
    locationCode: varchar("location_code", { length: 20 }).notNull().default("ACC-01"),
    onHand: integer("on_hand").notNull().default(0),
    /** Held by unpaid carts and unfulfilled orders. */
    reserved: integer("reserved").notNull().default(0),
    /** Below this, the demand agent raises a restock recommendation. */
    reorderPoint: integer("reorder_point").notNull().default(3),
    /** Supplier lead time in days, used for restock timing. */
    leadTimeDays: smallint("lead_time_days").notNull().default(14),
    lastCountedAt: timestamp("last_counted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("inventory_variant_location_unique").on(t.variantId, t.locationCode),
    index("inventory_low_stock_idx").on(t.onHand),
  ],
);

// --- Pricing infrastructure -------------------------------------------------

export const fxRates = pgTable(
  "fx_rates",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull().default("GHS"),
    /** Mid-market rate: 1 base unit = `rate` quote units. */
    rate: real("rate").notNull(),
    /** Spread we add on top when charging customers, in basis points. */
    spreadBps: integer("spread_bps").notNull().default(250),
    source: varchar("source", { length: 60 }).notNull().default("manual"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("fx_rates_pair_idx").on(t.baseCurrency, t.quoteCurrency, t.effectiveAt)],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    /** Matches a key of GHANA_LEVIES, e.g. "VAT_BPS". */
    code: varchar("code", { length: 40 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    rateBps: integer("rate_bps").notNull(),
    /** Which base this applies to: "cif" | "pre_levy" | "vat_base". */
    appliesTo: varchar("applies_to", { length: 20 }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("tax_rates_code_idx").on(t.code, t.effectiveFrom)],
);

export const freightTariffs = pgTable(
  "freight_tariffs",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    originCountry: varchar("origin_country", { length: 2 }).notNull(),
    freightMode: varchar("freight_mode", { length: 20 }).notNull(),
    perKgMinor: bigint("per_kg_minor", { mode: "number" }).notNull(),
    perCbmMinor: bigint("per_cbm_minor", { mode: "number" }),
    handlingMinor: bigint("handling_minor", { mode: "number" }).notNull().default(0),
    minimumMinor: bigint("minimum_minor", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("freight_tariffs_lane_unique").on(t.originCountry, t.freightMode, t.effectiveFrom)],
);

export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    /** Region codes covered by this zone. */
    regionCodes: jsonb("region_codes").$type<string[]>().notNull().default([]),
    baseFeeMinor: bigint("base_fee_minor", { mode: "number" }).notNull(),
    perKgMinor: bigint("per_kg_minor", { mode: "number" }).notNull().default(0),
    /** Orders at or above this subtotal ship free. Null disables the threshold. */
    freeThresholdMinor: bigint("free_threshold_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),
    etaMinDays: smallint("eta_min_days").notNull().default(1),
    etaMaxDays: smallint("eta_max_days").notNull().default(3),
    supportsCashOnDelivery: boolean("supports_cash_on_delivery").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("delivery_zones_code_unique").on(t.code)],
);

// --- Cart and orders --------------------------------------------------------

export const carts = pgTable(
  "carts",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: varchar("user_id", { length: 32 }).references(() => users.id, { onDelete: "cascade" }),
    anonymousId: varchar("anonymous_id", { length: 32 }),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),
    /** Applied promotion code, if any. */
    promotionCode: varchar("promotion_code", { length: 40 }),
    /** Where the shopper is having it delivered — drives shipping quotes. */
    shippingAddressId: varchar("shipping_address_id", { length: 32 }).references(() => addresses.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("carts_user_idx").on(t.userId), index("carts_anonymous_idx").on(t.anonymousId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    cartId: varchar("cart_id", { length: 32 })
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: varchar("variant_id", { length: 32 })
      .notNull()
      .references(() => productVariants.id),
    quantity: integer("quantity").notNull().default(1),
    /** Price captured when added, so a mid-session repricing is visible. */
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),
    /** Chosen freight mode for order_to_ship lines. */
    freightMode: varchar("freight_mode", { length: 20 }),
    /** Frozen landed-cost breakdown for order_to_ship lines. */
    landedCostBreakdown: jsonb("landed_cost_breakdown").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cart_items_cart_variant_unique").on(t.cartId, t.variantId),
    index("cart_items_cart_idx").on(t.cartId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    /** Human-facing reference, e.g. NYA-7K3M2Q. */
    reference: varchar("reference", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 32 }).references(() => users.id),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),

    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    shippingMinor: bigint("shipping_minor", { mode: "number" }).notNull().default(0),
    /** Duties/VAT on order_to_ship lines, already inside the line prices. */
    dutiesAndTaxesMinor: bigint("duties_and_taxes_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),

    shippingAddress: jsonb("shipping_address").$type<Record<string, unknown>>().notNull(),
    billingAddress: jsonb("billing_address").$type<Record<string, unknown>>(),
    deliveryZoneCode: varchar("delivery_zone_code", { length: 40 }),
    promotionCode: varchar("promotion_code", { length: 40 }),
    customerNote: text("customer_note"),

    /** 0–100 from the risk agent; >70 holds the order for manual review. */
    riskScore: smallint("risk_score"),
    riskFactors: jsonb("risk_factors").$type<string[]>().notNull().default([]),

    placedAt: timestamp("placed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_reference_unique").on(t.reference),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_placed_idx").on(t.placedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    orderId: varchar("order_id", { length: 32 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: varchar("variant_id", { length: 32 }).references(() => productVariants.id),
    vendorId: varchar("vendor_id", { length: 32 }).references(() => vendors.id),

    /** Denormalised so an order stays readable after a product is edited. */
    productTitle: varchar("product_title", { length: 300 }).notNull(),
    variantTitle: varchar("variant_title", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 80 }).notNull(),
    imageUrl: text("image_url"),

    quantity: integer("quantity").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),

    fulfillmentType: fulfillmentTypeEnum("fulfillment_type").notNull(),
    freightMode: varchar("freight_mode", { length: 20 }),
    landedCostBreakdown: jsonb("landed_cost_breakdown").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_vendor_idx").on(t.vendorId)],
);

export const payments = pgTable(
  "payments",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    orderId: varchar("order_id", { length: 32 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: paymentStatusEnum("status").notNull().default("initialised"),
    method: paymentMethodEnum("method").notNull(),
    /** "paystack" | "hubtel" | "manual". */
    provider: varchar("provider", { length: 40 }).notNull().default("paystack"),
    /** Provider-side reference used to reconcile webhooks. */
    providerReference: varchar("provider_reference", { length: 120 }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("GHS"),
    /** MoMo network when method = mobile_money. */
    momoNetwork: varchar("momo_network", { length: 20 }),
    /** Raw provider payload, kept for dispute resolution. */
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    failureReason: text("failure_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    uniqueIndex("payments_provider_ref_unique").on(t.provider, t.providerReference),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    orderId: varchar("order_id", { length: 32 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: shipmentStatusEnum("status").notNull().default("label_created"),
    carrier: varchar("carrier", { length: 80 }),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    trackingUrl: text("tracking_url"),
    /** Leg of the journey: "international" | "last-mile". */
    leg: varchar("leg", { length: 20 }).notNull().default("last-mile"),
    estimatedDeliveryFrom: timestamp("estimated_delivery_from", { withTimezone: true }),
    estimatedDeliveryTo: timestamp("estimated_delivery_to", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("shipments_order_idx").on(t.orderId), index("shipments_tracking_idx").on(t.trackingNumber)],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    shipmentId: varchar("shipment_id", { length: 32 })
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: shipmentStatusEnum("status").notNull(),
    description: text("description").notNull(),
    location: varchar("location", { length: 200 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("shipment_events_shipment_idx").on(t.shipmentId, t.occurredAt)],
);

// --- Engagement -------------------------------------------------------------

export const reviews = pgTable(
  "reviews",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    productId: varchar("product_id", { length: 32 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 32 }).references(() => users.id, { onDelete: "set null" }),
    orderId: varchar("order_id", { length: 32 }).references(() => orders.id),
    rating: smallint("rating").notNull(),
    title: varchar("title", { length: 200 }),
    body: text("body"),
    status: reviewStatusEnum("status").notNull().default("pending"),
    isVerifiedPurchase: boolean("is_verified_purchase").notNull().default(false),
    helpfulCount: integer("helpful_count").notNull().default(0),
    /** Aspect sentiment extracted by the review-insight agent. */
    aspectSentiment: jsonb("aspect_sentiment").$type<Record<string, number>>(),
    moderationNote: text("moderation_note"),
    ...timestamps,
  },
  (t) => [
    index("reviews_product_idx").on(t.productId, t.status),
    uniqueIndex("reviews_user_product_unique").on(t.userId, t.productId),
  ],
);

export const wishlists = pgTable(
  "wishlists",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    variantId: varchar("variant_id", { length: 32 })
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    /** Notify when the price drops to or below this, in GHS minor units. */
    priceAlertMinor: bigint("price_alert_minor", { mode: "number" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("wishlists_user_variant_unique").on(t.userId, t.variantId)],
);

export const promotions = pgTable(
  "promotions",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    /** "percentage" | "fixed" | "free_shipping". */
    kind: varchar("kind", { length: 20 }).notNull(),
    valueBps: integer("value_bps"),
    valueMinor: bigint("value_minor", { mode: "number" }),
    minSubtotalMinor: bigint("min_subtotal_minor", { mode: "number" }),
    maxDiscountMinor: bigint("max_discount_minor", { mode: "number" }),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    perUserLimit: integer("per_user_limit").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("promotions_code_unique").on(sql`upper(${t.code})`)],
);

// --- AI agent infrastructure ------------------------------------------------

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    /** Registry key, e.g. "concierge", "sourcing", "pricing". */
    agentKey: varchar("agent_key", { length: 60 }).notNull(),
    status: agentRunStatusEnum("status").notNull().default("running"),
    userId: varchar("user_id", { length: 32 }).references(() => users.id, { onDelete: "set null" }),
    /** Groups multi-turn conversations. */
    conversationId: varchar("conversation_id", { length: 32 }),
    model: varchar("model", { length: 80 }).notNull(),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    /** Names of tools the agent called, in order. */
    toolCalls: jsonb("tool_calls").$type<{ name: string; ms: number; ok: boolean }[]>()
      .notNull()
      .default([]),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Estimated cost in USD minor units (cents), for cost dashboards. */
    costUsdMinor: integer("cost_usd_minor").notNull().default(0),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("agent_runs_key_idx").on(t.agentKey, t.createdAt),
    index("agent_runs_conversation_idx").on(t.conversationId),
    index("agent_runs_status_idx").on(t.status),
  ],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 32 }).notNull(),
    runId: varchar("run_id", { length: 32 }).references(() => agentRuns.id, { onDelete: "set null" }),
    role: varchar("role", { length: 20 }).notNull(),
    /** Full Anthropic content-block array, preserved verbatim for replay. */
    content: jsonb("content").$type<unknown[]>().notNull(),
    ...timestamps,
  },
  (t) => [index("agent_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/**
 * Decisions an agent made that changed customer-visible state. Separate from
 * agent_runs because this is the audit trail a human reviews, not telemetry.
 */
export const agentDecisions = pgTable(
  "agent_decisions",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    runId: varchar("run_id", { length: 32 }).references(() => agentRuns.id, { onDelete: "set null" }),
    agentKey: varchar("agent_key", { length: 60 }).notNull(),
    /** "price_change" | "restock" | "risk_hold" | "content_update" | ... */
    kind: varchar("kind", { length: 40 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 32 }).notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    rationale: text("rationale").notNull(),
    /** 0–100. Below the agent's threshold, the change queues for review. */
    confidence: smallint("confidence").notNull().default(50),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 32 }).references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("agent_decisions_entity_idx").on(t.entityType, t.entityId),
    index("agent_decisions_kind_idx").on(t.kind, t.createdAt),
  ],
);

// --- Analytics --------------------------------------------------------------

export const searchQueries = pgTable(
  "search_queries",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: varchar("user_id", { length: 32 }).references(() => users.id, { onDelete: "set null" }),
    rawQuery: text("raw_query").notNull(),
    /** Structured filters the search agent inferred from the raw query. */
    parsedFilters: jsonb("parsed_filters").$type<Record<string, unknown>>(),
    resultCount: integer("result_count").notNull().default(0),
    clickedProductId: varchar("clicked_product_id", { length: 32 }),
    ...timestamps,
  },
  (t) => [index("search_queries_created_idx").on(t.createdAt)],
);

export const productEvents = pgTable(
  "product_events",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    productId: varchar("product_id", { length: 32 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 32 }).references(() => users.id, { onDelete: "set null" }),
    anonymousId: varchar("anonymous_id", { length: 32 }),
    /** "view" | "add_to_cart" | "remove_from_cart" | "purchase" | "wishlist". */
    kind: varchar("kind", { length: 30 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    index("product_events_product_idx").on(t.productId, t.kind, t.createdAt),
    index("product_events_user_idx").on(t.userId, t.createdAt),
  ],
);

// --- Relations --------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
  reviews: many(reviews),
  wishlists: many(wishlists),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  vendor: one(vendors, { fields: [products.vendorId], references: [vendors.id] }),
  variants: many(productVariants),
  images: many(productImages),
  reviews: many(reviews),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  inventory: many(inventory),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: "parent" }),
  children: many(categories, { relationName: "parent" }),
  products: many(products),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  variant: one(productVariants, { fields: [cartItems.variantId], references: [productVariants.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  payments: many(payments),
  shipments: many(shipments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(productVariants, { fields: [orderItems.variantId], references: [productVariants.id] }),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  events: many(shipmentEvents),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  variant: one(productVariants, { fields: [inventory.variantId], references: [productVariants.id] }),
}));

// --- Inferred types ---------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Inventory = typeof inventory.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentDecision = typeof agentDecisions.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type DeliveryZone = typeof deliveryZones.$inferSelect;
export type FreightTariff = typeof freightTariffs.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type Address = typeof addresses.$inferSelect;

// Silence the unused-helper warning while keeping the helper available for
// future money columns that follow the same pattern.
void moneyColumns;
