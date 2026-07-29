/**
 * Agent tools.
 *
 * Two rules govern everything here:
 *
 *  1. A tool executor NEVER throws. A failure returns `{ error }`, which the
 *     loop turns into a `tool_result` with `is_error: true`. A thrown error
 *     would kill the whole turn over one bad lookup.
 *  2. Descriptions are prescriptive about *when* to call the tool, not just
 *     what it does. Recent models are conservative about reaching for tools;
 *     the trigger condition in the description is what fixes that.
 */

import { FREIGHT_MODES, GHANA_REGIONS, type FreightMode } from "@/lib/ghana";
import { formatMoney } from "@/lib/money";
import {
  getProductBySlug,
  listBrands,
  listCategories,
  listProducts,
} from "@/server/services/catalog";
import { getRate } from "@/server/services/fx";
import { quoteAllFreightModes, quoteLandedCost } from "@/server/services/pricing";
import type { ProductFilters } from "@/server/services/types";

export interface ToolContext {
  userId?: string;
  /** Region the shopper is browsing from, used for delivery estimates. */
  regionCode?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  execute: (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

// --- Helpers ----------------------------------------------------------------

function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key];
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : undefined;
}

/** Compact projection — full product rows would burn the context window. */
function summariseProduct(item: Awaited<ReturnType<typeof listProducts>>["items"][number]) {
  return {
    slug: item.slug,
    title: item.title,
    brand: item.brandName,
    price: formatMoney(item.price, { compactDecimals: true }),
    priceMinor: item.price.minor,
    rating: item.ratingAverage || null,
    reviews: item.ratingCount || null,
    fulfillment: item.fulfillmentType,
    deliveryDays: `${item.etaDays[0]}–${item.etaDays[1]}`,
    availability: item.availability,
    localWarranty: item.hasLocalWarranty,
    url: `/p/${item.slug}`,
  };
}

// --- Tools ------------------------------------------------------------------

const searchProducts: AgentTool = {
  name: "search_products",
  description:
    "Search the Nyansa catalog. Call this whenever the shopper mentions a product, category, brand, " +
    "budget, or use case — even loosely ('something for my kitchen', 'a laptop for uni'). Always " +
    "search before recommending anything; never recommend from memory, because stock and prices " +
    "change daily. Prices returned are final Ghana cedi prices with duties already included.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search terms, e.g. 'noise cancelling headphones'" },
      category: { type: "string", description: "Category slug to restrict to, e.g. 'laptops'" },
      brands: { type: "array", items: { type: "string" }, description: "Brand slugs, e.g. ['apple','samsung']" },
      maxPriceGhs: { type: "number", description: "Maximum price in whole cedis" },
      minPriceGhs: { type: "number", description: "Minimum price in whole cedis" },
      fulfillment: {
        type: "string",
        enum: ["in_house", "order_to_ship", "any"],
        description: "'in_house' for stock ready in Accra, 'order_to_ship' for imports",
      },
      sort: {
        type: "string",
        enum: ["relevance", "price_asc", "price_desc", "rating", "newest", "popular"],
      },
      limit: { type: "number", description: "How many results to return, 1-12" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(input) {
    try {
      const fulfillment = str(input, "fulfillment");
      const filters: ProductFilters = {
        q: str(input, "query"),
        categorySlug: str(input, "category"),
        brandSlugs: strArray(input, "brands"),
        minPriceMinor: num(input, "minPriceGhs") !== undefined ? num(input, "minPriceGhs")! * 100 : undefined,
        maxPriceMinor: num(input, "maxPriceGhs") !== undefined ? num(input, "maxPriceGhs")! * 100 : undefined,
        fulfillment:
          fulfillment && fulfillment !== "any"
            ? [fulfillment as "in_house" | "order_to_ship"]
            : undefined,
        sort: (str(input, "sort") as ProductFilters["sort"]) ?? "relevance",
        perPage: Math.min(12, Math.max(1, num(input, "limit") ?? 6)),
      };
      const result = await listProducts(filters);
      return {
        total: result.total,
        results: result.items.map(summariseProduct),
        note:
          result.total === 0
            ? "No matches. Try a broader query or suggest an adjacent category rather than inventing a product."
            : undefined,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Search failed" };
    }
  },
};

const getProduct: AgentTool = {
  name: "get_product",
  description:
    "Fetch full detail for one product by its slug: specifications, every variant with its price and " +
    "stock, warranty, and — for imported items — the itemised landed-cost breakdown. Call this before " +
    "answering any specific question about a product ('does it have X?', 'what does it really cost?', " +
    "'which storage sizes?'). search_products returns summaries only; this returns the facts.",
  input_schema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Product slug, from search_products results" },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  async execute(input) {
    try {
      const slug = str(input, "slug");
      if (!slug) return { error: "slug is required" };
      const product = await getProductBySlug(slug);
      if (!product) return { error: `No product found with slug '${slug}'` };
      return {
        slug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        brand: product.brand?.name ?? null,
        authorisedReseller: product.brand?.isAuthorised ?? false,
        highlights: product.highlights,
        specifications: product.specifications,
        fulfillment: product.fulfillmentType,
        sourceCountry: product.sourceCountry,
        warrantyMonths: product.warrantyMonths,
        localWarranty: product.hasLocalWarranty,
        rating: product.ratingAverage,
        reviewCount: product.ratingCount,
        variants: product.variants.map((v) => ({
          id: v.id,
          title: v.title,
          options: v.options,
          price: formatMoney(v.price, { compactDecimals: true }),
          priceMinor: v.price.minor,
          availability: v.availability.state,
          quantityAvailable: v.availability.quantity,
          landedCost: v.breakdown
            ? {
                estimated: v.breakdown.estimated,
                lines: v.breakdown.lines.map((l) => ({
                  label: l.label,
                  amount: formatMoney(l.amount, { compactDecimals: true }),
                  note: l.note,
                })),
                assumptions: v.breakdown.assumptions,
              }
            : null,
        })),
        url: `/p/${product.slug}`,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Lookup failed" };
    }
  },
};

const compareProducts: AgentTool = {
  name: "compare_products",
  description:
    "Fetch 2-4 products side by side for an honest comparison. Call this whenever the shopper is " +
    "choosing between options, or when you are about to recommend one product over another — you " +
    "should be comparing real specifications, not impressions. Say plainly when the cheaper option " +
    "is the better buy.",
  input_schema: {
    type: "object",
    properties: {
      slugs: {
        type: "array",
        items: { type: "string" },
        description: "2-4 product slugs to compare",
      },
    },
    required: ["slugs"],
    additionalProperties: false,
  },
  async execute(input) {
    try {
      const slugs = strArray(input, "slugs")?.slice(0, 4);
      if (!slugs || slugs.length < 2) return { error: "Provide between 2 and 4 slugs" };
      const products = await Promise.all(slugs.map((slug) => getProductBySlug(slug)));
      const found = products.filter((p): p is NonNullable<typeof p> => p !== null);
      if (found.length === 0) return { error: "None of those slugs matched a product" };
      return {
        products: found.map((p) => {
          const cheapest = p.variants.reduce<(typeof p.variants)[number] | null>(
            (best, v) => (best === null || v.price.minor < best.price.minor ? v : best),
            null,
          );
          return {
            slug: p.slug,
            title: p.title,
            brand: p.brand?.name ?? null,
            fromPrice: cheapest ? formatMoney(cheapest.price, { compactDecimals: true }) : null,
            fulfillment: p.fulfillmentType,
            localWarranty: p.hasLocalWarranty,
            warrantyMonths: p.warrantyMonths,
            rating: p.ratingAverage,
            reviewCount: p.ratingCount,
            specifications: p.specifications,
            highlights: p.highlights,
          };
        }),
        missing: slugs.filter((s) => !found.some((p) => p.slug === s)),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Comparison failed" };
    }
  },
};

const quoteImport: AgentTool = {
  name: "quote_landed_cost",
  description:
    "Get the full itemised import cost for an order-to-ship variant across every freight option " +
    "(air express, air economy, sea). Call this whenever the shopper asks what an imported item " +
    "'really' costs, questions the price, asks about duties or customs, or is weighing speed against " +
    "cost. The breakdown is the honest answer — walk them through it line by line rather than just " +
    "quoting a total.",
  input_schema: {
    type: "object",
    properties: {
      variantId: { type: "string", description: "Variant id from get_product" },
      freightMode: {
        type: "string",
        enum: ["air-express", "air-economy", "sea-lcl"],
        description: "Omit to get a quote for all three modes",
      },
    },
    required: ["variantId"],
    additionalProperties: false,
  },
  async execute(input) {
    try {
      const variantId = str(input, "variantId");
      if (!variantId) return { error: "variantId is required" };
      const mode = str(input, "freightMode") as FreightMode | undefined;

      if (mode) {
        const breakdown = await quoteLandedCost(variantId, mode);
        return {
          mode,
          modeLabel: FREIGHT_MODES[mode].label,
          total: formatMoney(breakdown.total, { compactDecimals: true }),
          deliveryDays: `${breakdown.etaDays[0]}–${breakdown.etaDays[1]}`,
          chargeableWeightKg: breakdown.chargeableWeightKg,
          lines: breakdown.lines.map((l) => ({
            label: l.label,
            amount: formatMoney(l.amount, { compactDecimals: true }),
            note: l.note,
          })),
          estimated: breakdown.estimated,
          assumptions: breakdown.assumptions,
        };
      }

      const quotes = await quoteAllFreightModes(variantId);
      return {
        options: quotes.map((q) => ({
          mode: q.mode,
          modeLabel: FREIGHT_MODES[q.mode].label,
          description: FREIGHT_MODES[q.mode].description,
          total: formatMoney(q.price, { compactDecimals: true }),
          deliveryDays: `${q.etaDays[0]}–${q.etaDays[1]}`,
        })),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Quote failed" };
    }
  },
};

const getCategories: AgentTool = {
  name: "get_categories",
  description:
    "List the category tree with slugs. Call this when you need a valid category slug for " +
    "search_products, or when the shopper asks what the store sells. Do not guess slugs.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async execute() {
    try {
      const tree = await listCategories();
      const flatten = (nodes: Awaited<ReturnType<typeof listCategories>>): unknown[] =>
        nodes.map((n) => ({
          slug: n.slug,
          name: n.name,
          children: n.children.length > 0 ? flatten(n.children) : undefined,
        }));
      return { categories: flatten(tree) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to load categories" };
    }
  },
};

const getBrands: AgentTool = {
  name: "get_brands",
  description:
    "List stocked brands with slugs and whether Nyansa is an authorised reseller. Call this when the " +
    "shopper asks about a specific brand, asks whether something is genuine, or when you need a valid " +
    "brand slug for search_products.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async execute() {
    try {
      const rows = await listBrands(60);
      return {
        brands: rows.map((b) => ({
          slug: b.slug,
          name: b.name,
          authorisedReseller: b.isAuthorised,
        })),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to load brands" };
    }
  },
};

const estimateDelivery: AgentTool = {
  name: "estimate_delivery",
  description:
    "Estimate the delivery window and fee to a Ghanaian region. Call this whenever the shopper " +
    "mentions where they are, asks 'when will it arrive?', or is comparing an in-stock item against " +
    "an import. Delivery outside Greater Accra and Ashanti takes meaningfully longer — say so.",
  input_schema: {
    type: "object",
    properties: {
      regionCode: {
        type: "string",
        description: "Two-letter region code, e.g. GA for Greater Accra, AH for Ashanti",
      },
      fulfillment: { type: "string", enum: ["in_house", "order_to_ship"] },
      freightMode: { type: "string", enum: ["air-express", "air-economy", "sea-lcl"] },
    },
    required: ["regionCode", "fulfillment"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const code = (str(input, "regionCode") ?? context.regionCode ?? "GA").toUpperCase();
    const region = GHANA_REGIONS.find((r) => r.code === code);
    if (!region) {
      return {
        error: `Unknown region code '${code}'`,
        validCodes: GHANA_REGIONS.map((r) => ({ code: r.code, name: r.name })),
      };
    }

    // Last-mile inside Ghana, by zone. Matches the delivery_zones defaults.
    const lastMile: Record<string, { days: [number, number]; feeGhs: number; cod: boolean }> = {
      "accra-metro": { days: [1, 2], feeGhs: 25, cod: true },
      "kumasi-metro": { days: [1, 3], feeGhs: 35, cod: true },
      "regional-capital": { days: [2, 4], feeGhs: 55, cod: true },
      outer: { days: [3, 7], feeGhs: 85, cod: false },
    };
    const zone = lastMile[region.zone] ?? lastMile["outer"]!;

    if (str(input, "fulfillment") === "order_to_ship") {
      const mode = (str(input, "freightMode") as FreightMode | undefined) ?? "air-economy";
      const meta = FREIGHT_MODES[mode];
      const min = meta.transitDays[0] + meta.clearanceDays[0] + zone.days[0];
      const max = meta.transitDays[1] + meta.clearanceDays[1] + zone.days[1];
      return {
        region: region.name,
        mode: meta.label,
        totalDays: `${min}–${max}`,
        breakdown: {
          internationalTransit: `${meta.transitDays[0]}–${meta.transitDays[1]} days`,
          customsClearance: `${meta.clearanceDays[0]}–${meta.clearanceDays[1]} days`,
          lastMile: `${zone.days[0]}–${zone.days[1]} days to ${region.capital}`,
        },
        deliveryFeeGhs: zone.feeGhs,
        cashOnDeliveryAvailable: false,
      };
    }

    return {
      region: region.name,
      totalDays: `${zone.days[0]}–${zone.days[1]}`,
      deliveryFeeGhs: zone.feeGhs,
      cashOnDeliveryAvailable: zone.cod,
      note: zone.cod ? undefined : "Cash on delivery is not available in this region.",
    };
  },
};

const getFxRate: AgentTool = {
  name: "get_fx_rate",
  description:
    "Get the current exchange rate used for import pricing. Call this only when the shopper explicitly " +
    "asks about exchange rates or why an imported price moved — do not volunteer it unprompted.",
  input_schema: {
    type: "object",
    properties: {
      currency: { type: "string", enum: ["USD", "GBP", "EUR", "CAD", "CNY"] },
    },
    required: ["currency"],
    additionalProperties: false,
  },
  async execute(input) {
    try {
      const currency = str(input, "currency");
      if (!currency) return { error: "currency is required" };
      const rate = await getRate(currency as "USD", "GHS");
      return { currency, ghsPerUnit: Number(rate.toFixed(4)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Rate lookup failed" };
    }
  },
};

// --- Registry ---------------------------------------------------------------

const ALL_TOOLS: AgentTool[] = [
  searchProducts,
  getProduct,
  compareProducts,
  quoteImport,
  getCategories,
  getBrands,
  estimateDelivery,
  getFxRate,
];

export const TOOLS_BY_NAME: ReadonlyMap<string, AgentTool> = new Map(
  ALL_TOOLS.map((tool) => [tool.name, tool]),
);

/**
 * Build the Anthropic `tools` array. Sorted by name so the serialised tool
 * block is byte-stable across requests — an unstable tool order silently
 * invalidates the prompt cache on every call.
 */
export function toolDefinitions(names: readonly string[]) {
  return [...names]
    .sort()
    .map((name) => TOOLS_BY_NAME.get(name))
    .filter((tool): tool is AgentTool => tool !== undefined)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
      strict: true as const,
    }));
}

export async function executeTool(
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<{ result: unknown; isError: boolean }> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { result: { error: `Unknown tool '${name}'` }, isError: true };
  const payload = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const result = await tool.execute(payload, context);
  const isError =
    typeof result === "object" && result !== null && "error" in result && result.error !== undefined;
  return { result, isError };
}
