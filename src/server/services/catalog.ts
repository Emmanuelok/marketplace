/**
 * Catalog reads. Every query is defensive about an empty or absent database —
 * a fresh clone with no seed data renders empty states, never a 500.
 */

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { money, type Money } from "@/lib/money";
import {
  brands,
  categories,
  db,
  inventory,
  productImages,
  productVariants,
  products,
  reviews,
} from "@/server/db";
import { priceVariant } from "./pricing";
import type {
  Availability,
  CategoryNode,
  Facets,
  FulfillmentType,
  ProductDetail,
  ProductFilters,
  ProductListItem,
  ProductListResult,
  VariantView,
} from "./types";

const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 96;

const EMPTY_RESULT: ProductListResult = {
  items: [],
  total: 0,
  page: 1,
  perPage: DEFAULT_PER_PAGE,
  facets: {
    brands: [],
    fulfillment: [],
    priceRange: { minMinor: 0, maxMinor: 0 },
    ratings: [],
  },
};

// --- Listing ----------------------------------------------------------------

export async function listProducts(filters: ProductFilters = {}): Promise<ProductListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, filters.perPage ?? DEFAULT_PER_PAGE));

  try {
    const conditions = await buildConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // The default variant carries the display price. Products without one are
    // catalog errors and are excluded rather than rendered priceless.
    const defaultVariant = db
      .select({
        productId: productVariants.productId,
        variantId: sql<string>`min(${productVariants.id})`.as("variant_id"),
        // int8 aggregates come back as strings — see toMinor.
        priceMinor: sql<string>`min(${productVariants.priceMinor})`.as("price_minor"),
        compareAtMinor: sql<string | null>`max(${productVariants.compareAtMinor})`.as("compare_at_minor"),
      })
      .from(productVariants)
      .where(sql`${productVariants.archivedAt} is null`)
      .groupBy(productVariants.productId)
      .as("dv");

    const primaryImage = db
      .select({
        productId: productImages.productId,
        url: sql<string>`(array_agg(${productImages.url} order by ${productImages.position}))[1]`.as("url"),
        placeholderColor:
          sql<string | null>`(array_agg(${productImages.placeholderColor} order by ${productImages.position}))[1]`.as(
            "placeholder_color",
          ),
      })
      .from(productImages)
      .groupBy(productImages.productId)
      .as("pi");

    const rows = await db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        subtitle: products.subtitle,
        fulfillmentType: products.fulfillmentType,
        sourceCountry: products.sourceCountry,
        hasLocalWarranty: products.hasLocalWarranty,
        ratingAverage: products.ratingAverage,
        ratingCount: products.ratingCount,
        purchaseCount: products.purchaseCount,
        publishedAt: products.publishedAt,
        brandName: brands.name,
        brandSlug: brands.slug,
        brandAuthorised: brands.isAuthorised,
        categorySlug: categories.slug,
        variantId: defaultVariant.variantId,
        priceMinor: defaultVariant.priceMinor,
        compareAtMinor: defaultVariant.compareAtMinor,
        imageUrl: primaryImage.url,
        placeholderColor: primaryImage.placeholderColor,
      })
      .from(products)
      .innerJoin(defaultVariant, eq(defaultVariant.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(primaryImage, eq(primaryImage.productId, products.id))
      .where(where)
      .orderBy(...orderFor(filters.sort ?? "relevance"))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const countRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(defaultVariant, eq(defaultVariant.productId, products.id))
      .where(where);

    const items = await Promise.all(rows.map((row) => toListItem(row)));
    const facets = await computeFacets(where);

    return { items, total: countRows[0]?.total ?? 0, page, perPage, facets };
  } catch {
    return { ...EMPTY_RESULT, page, perPage };
  }
}

type ListRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  fulfillmentType: string;
  sourceCountry: string | null;
  hasLocalWarranty: boolean;
  ratingAverage: number;
  ratingCount: number;
  brandName: string | null;
  brandSlug: string | null;
  brandAuthorised: boolean | null;
  categorySlug: string;
  variantId: string;
  priceMinor: string;
  compareAtMinor: string | null;
  imageUrl: string | null;
  placeholderColor: string | null;
};

/**
 * node-postgres returns int8 as a string, and Drizzle's `mode: "number"` only
 * covers declared columns — not raw `sql` aggregates like min()/max(). Without
 * this, money() rejects the string and listProducts silently returns nothing.
 */
function toMinor(value: string | number | null): number | null {
  if (value === null) return null;
  const minor = typeof value === "number" ? value : Number(value);
  return Number.isFinite(minor) ? minor : null;
}

async function toListItem(row: ListRow): Promise<ProductListItem> {
  // Imported items must be priced through the landed-cost engine, not read off
  // the variant row — the stored price is only a stale hint for sorting.
  const compareAtMinor = toMinor(row.compareAtMinor);
  let price: Money = money(toMinor(row.priceMinor) ?? 0, "GHS");
  let etaDays: readonly [number, number] = [1, 3];
  if (row.fulfillmentType === "order_to_ship") {
    try {
      const priced = await priceVariant(row.variantId);
      price = priced.price;
      etaDays = priced.etaDays;
    } catch {
      etaDays = [8, 18];
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    brandName: row.brandName,
    brandSlug: row.brandSlug,
    categorySlug: row.categorySlug,
    imageUrl: row.imageUrl,
    placeholderColor: row.placeholderColor,
    price,
    compareAt: compareAtMinor !== null ? money(compareAtMinor, "GHS") : null,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    fulfillmentType: row.fulfillmentType as FulfillmentType,
    sourceCountry: row.sourceCountry,
    etaDays,
    availability: row.fulfillmentType === "order_to_ship" ? "made_to_order" : "in_stock",
    hasLocalWarranty: row.hasLocalWarranty,
    isAuthorisedBrand: row.brandAuthorised ?? false,
  };
}

async function buildConditions(filters: ProductFilters): Promise<SQL[]> {
  const conditions: SQL[] = [eq(products.status, "active")];

  if (filters.q?.trim()) {
    const term = filters.q.trim();
    const fts = sql`to_tsvector('english', coalesce(${products.title}, '') || ' ' || coalesce(${products.subtitle}, '') || ' ' || coalesce(${products.description}, '')) @@ plainto_tsquery('english', ${term})`;
    // ILIKE catches partial words and model numbers that stemming misses.
    const like = or(ilike(products.title, `%${term}%`), ilike(products.subtitle, `%${term}%`));
    const combined = or(fts, like);
    if (combined) conditions.push(combined);
  }

  if (filters.categorySlug) {
    const rows = await db
      .select({ path: categories.path })
      .from(categories)
      .where(eq(categories.slug, filters.categorySlug))
      .limit(1);
    const path = rows[0]?.path;
    if (path) {
      // Match the category and every descendant via the materialised path.
      conditions.push(
        sql`${products.categoryId} in (select id from ${categories} where ${categories.path} = ${path} or ${categories.path} like ${`${path}/%`})`,
      );
    }
  }

  if (filters.brandSlugs?.length) {
    conditions.push(
      sql`${products.brandId} in (select id from ${brands} where ${inArray(brands.slug, filters.brandSlugs)})`,
    );
  }

  if (filters.fulfillment?.length) {
    conditions.push(
      inArray(
        products.fulfillmentType,
        filters.fulfillment as ("in_house" | "order_to_ship" | "vendor_direct")[],
      ),
    );
  }

  if (filters.minRating !== undefined) {
    conditions.push(gte(products.ratingAverage, filters.minRating));
  }

  if (filters.minPriceMinor !== undefined || filters.maxPriceMinor !== undefined) {
    const bounds: SQL[] = [];
    if (filters.minPriceMinor !== undefined) bounds.push(gte(productVariants.priceMinor, filters.minPriceMinor));
    if (filters.maxPriceMinor !== undefined) bounds.push(lte(productVariants.priceMinor, filters.maxPriceMinor));
    conditions.push(
      sql`exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${and(...bounds)})`,
    );
  }

  if (filters.inStockOnly) {
    conditions.push(
      sql`(${products.fulfillmentType} = 'order_to_ship' or exists (
        select 1 from ${inventory}
        join ${productVariants} on ${productVariants.id} = ${inventory.variantId}
        where ${productVariants.productId} = ${products.id} and ${inventory.onHand} > ${inventory.reserved}
      ))`,
    );
  }

  return conditions;
}

function orderFor(sort: NonNullable<ProductFilters["sort"]>): SQL[] {
  switch (sort) {
    case "price_asc":
      return [asc(sql`price_minor`)];
    case "price_desc":
      return [desc(sql`price_minor`)];
    case "newest":
      return [desc(sql`coalesce(${products.publishedAt}, ${products.createdAt})`)];
    case "rating":
      return [desc(products.ratingAverage), desc(products.ratingCount)];
    case "popular":
      return [desc(products.purchaseCount), desc(products.viewCount)];
    case "relevance":
    default:
      // Without a query term, "relevance" means the merchandising signal:
      // things people actually buy, then things people look at.
      return [desc(products.purchaseCount), desc(products.ratingAverage), desc(products.createdAt)];
  }
}

async function computeFacets(where: SQL | undefined): Promise<Facets> {
  try {
    const [brandRows, fulfillmentRows, priceRows, ratingRows] = await Promise.all([
      db
        .select({ value: brands.slug, label: brands.name, count: sql<number>`count(*)::int` })
        .from(products)
        .innerJoin(brands, eq(products.brandId, brands.id))
        .where(where)
        .groupBy(brands.slug, brands.name)
        .orderBy(desc(sql`count(*)`))
        .limit(40),
      db
        .select({ value: products.fulfillmentType, count: sql<number>`count(*)::int` })
        .from(products)
        .where(where)
        .groupBy(products.fulfillmentType),
      db
        .select({
          minMinor: sql<number>`coalesce(min(${productVariants.priceMinor}), 0)::int`,
          maxMinor: sql<number>`coalesce(max(${productVariants.priceMinor}), 0)::int`,
        })
        .from(products)
        .innerJoin(productVariants, eq(productVariants.productId, products.id))
        .where(where),
      db
        .select({
          value: sql<string>`floor(${products.ratingAverage})::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(products)
        .where(where)
        .groupBy(sql`floor(${products.ratingAverage})`),
    ]);

    const fulfillmentLabels: Record<string, string> = {
      in_house: "Ready in Accra",
      order_to_ship: "Order to ship",
      vendor_direct: "Marketplace seller",
    };

    return {
      brands: brandRows.map((r) => ({ value: r.value, label: r.label, count: r.count })),
      fulfillment: fulfillmentRows.map((r) => ({
        value: r.value,
        label: fulfillmentLabels[r.value] ?? r.value,
        count: r.count,
      })),
      priceRange: {
        minMinor: priceRows[0]?.minMinor ?? 0,
        maxMinor: priceRows[0]?.maxMinor ?? 0,
      },
      ratings: ratingRows
        .filter((r) => Number(r.value) >= 1)
        .map((r) => ({ value: r.value, label: `${r.value} stars & up`, count: r.count }))
        .sort((a, b) => Number(b.value) - Number(a.value)),
    };
  } catch {
    return EMPTY_RESULT.facets;
  }
}

// --- Detail -----------------------------------------------------------------

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  try {
    const rows = await db
      .select({
        product: products,
        brand: brands,
        category: categories,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.slug, slug), eq(products.status, "active")))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    const { product, brand, category } = row;

    const [variantRows, imageRows, ratingRows, ancestors] = await Promise.all([
      db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, product.id), sql`${productVariants.archivedAt} is null`))
        .orderBy(asc(productVariants.position)),
      db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.position)),
      db
        .select({ rating: reviews.rating, count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(and(eq(reviews.productId, product.id), eq(reviews.status, "published")))
        .groupBy(reviews.rating),
      loadAncestors(category.path),
    ]);

    const variants: VariantView[] = await Promise.all(
      variantRows.map(async (variant) => {
        const priced = await priceVariant(variant.id).catch(() => null);
        return {
          id: variant.id,
          sku: variant.sku,
          title: variant.title,
          options: variant.options,
          price: priced?.price ?? money(variant.priceMinor, "GHS"),
          compareAt:
            variant.compareAtMinor !== null ? money(variant.compareAtMinor, "GHS") : null,
          imageUrl: variant.imageUrl,
          availability: await getAvailability(variant.id, product.fulfillmentType),
          breakdown: priced?.breakdown ?? null,
          isDefault: variant.isDefault,
        };
      }),
    );

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratingRows) {
      if (r.rating >= 1 && r.rating <= 5) distribution[r.rating as 1 | 2 | 3 | 4 | 5] = r.count;
    }

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      highlights: product.highlights,
      specifications: product.specifications,
      brand: brand
        ? {
            id: brand.id,
            name: brand.name,
            slug: brand.slug,
            isAuthorised: brand.isAuthorised,
            logoUrl: brand.logoUrl,
          }
        : null,
      breadcrumb: [
        { label: "Home", href: "/" },
        ...ancestors.map((c) => ({ label: c.name, href: `/c/${c.slug}` })),
      ],
      images: imageRows.map((image) => ({
        url: image.url,
        altText: image.altText,
        placeholderColor: image.placeholderColor,
      })),
      variants,
      fulfillmentType: product.fulfillmentType as FulfillmentType,
      sourceCountry: product.sourceCountry,
      warrantyMonths: product.warrantyMonths,
      hasLocalWarranty: product.hasLocalWarranty,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
      ratingDistribution: distribution,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
    };
  } catch {
    return null;
  }
}

async function loadAncestors(path: string): Promise<{ name: string; slug: string }[]> {
  const segments = path.split("/").filter(Boolean);
  const paths = segments.map((_, index) => segments.slice(0, index + 1).join("/"));
  if (paths.length === 0) return [];
  try {
    const rows = await db
      .select({ name: categories.name, slug: categories.slug, path: categories.path })
      .from(categories)
      .where(inArray(categories.path, paths));
    // Restore hierarchical order — the IN query returns rows arbitrarily.
    return paths
      .map((p) => rows.find((r) => r.path === p))
      .filter((r): r is { name: string; slug: string; path: string } => r !== undefined)
      .map(({ name, slug }) => ({ name, slug }));
  } catch {
    return [];
  }
}

async function getAvailability(variantId: string, fulfillmentType: string): Promise<Availability> {
  if (fulfillmentType === "order_to_ship") {
    return { state: "made_to_order", quantity: 0, locationCode: null, etaDays: [8, 18] };
  }
  try {
    const rows = await db
      .select({
        onHand: inventory.onHand,
        reserved: inventory.reserved,
        locationCode: inventory.locationCode,
        reorderPoint: inventory.reorderPoint,
      })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));

    const available = rows.reduce((total, r) => total + Math.max(0, r.onHand - r.reserved), 0);
    const threshold = rows[0]?.reorderPoint ?? 3;
    return {
      state: available === 0 ? "out_of_stock" : available <= threshold ? "low_stock" : "in_stock",
      quantity: available,
      locationCode: rows[0]?.locationCode ?? null,
      etaDays: [1, 3],
    };
  } catch {
    return { state: "out_of_stock", quantity: 0, locationCode: null, etaDays: [1, 3] };
  }
}

// --- Taxonomy ---------------------------------------------------------------

export async function listCategories(): Promise<CategoryNode[]> {
  try {
    const rows = await db.select().from(categories).orderBy(asc(categories.depth), asc(categories.position));
    const byId = new Map<string, CategoryNode>();
    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        path: row.path,
        depth: row.depth,
        iconName: row.iconName,
        imageUrl: row.imageUrl,
        dutyBand: row.dutyBand,
        children: [],
      });
    }
    const roots: CategoryNode[] = [];
    for (const row of rows) {
      const node = byId.get(row.id);
      if (!node) continue;
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<CategoryNode | null> {
  try {
    const rows = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    const row = rows[0];
    if (!row) return null;
    const children = await db
      .select()
      .from(categories)
      .where(eq(categories.parentId, row.id))
      .orderBy(asc(categories.position));
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      path: row.path,
      depth: row.depth,
      iconName: row.iconName,
      imageUrl: row.imageUrl,
      dutyBand: row.dutyBand,
      children: children.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        path: c.path,
        depth: c.depth,
        iconName: c.iconName,
        imageUrl: c.imageUrl,
        dutyBand: c.dutyBand,
        children: [],
      })),
    };
  } catch {
    return null;
  }
}

export async function listBrands(limit = 60) {
  try {
    return await db
      .select()
      .from(brands)
      .orderBy(desc(brands.prominence), asc(brands.name))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getBrandBySlug(slug: string) {
  try {
    const rows = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function getRelatedProducts(productId: string, limit = 8): Promise<ProductListItem[]> {
  try {
    const rows = await db
      .select({ categoryId: products.categoryId, brandId: products.brandId })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    const source = rows[0];
    if (!source) return [];
    const result = await listProducts({ perPage: limit + 1 });
    return result.items.filter((item) => item.id !== productId).slice(0, limit);
  } catch {
    return [];
  }
}
