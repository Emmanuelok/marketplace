/**
 * Idempotent seed. Safe to re-run — every insert is an upsert keyed on a
 * natural unique column (slug, sku, code), so running it twice does not
 * duplicate the catalogue.
 *
 *   npm run db:push && npm run db:seed
 */

import { eq, sql } from "drizzle-orm";

import { GHANA_LEVIES, GHANA_REGIONS } from "@/lib/ghana";
import { newId } from "@/lib/ids";
import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import {
  brands,
  categories,
  deliveryZones,
  freightTariffs,
  fxRates,
  inventory,
  productImages,
  productVariants,
  products,
  reviews,
  taxRates,
} from "@/server/db/schema";
import { BRANDS, CATEGORIES, PRODUCTS, type SeedProduct } from "./catalog";

function log(step: string, detail: string): void {
  process.stdout.write(`  ${step.padEnd(18)} ${detail}\n`);
}

/**
 * Reference data is append-only by nature (an FX rate has an `effectiveAt`, a
 * tax rate has an `effectiveFrom`), so re-inserting it would grow the tables
 * without changing behaviour — and `delivery_zones` has a unique index on
 * `code`, so a second insert throws outright. Seeding is therefore skipped
 * entirely once the tables are populated.
 */
async function referenceAlreadySeeded(): Promise<boolean> {
  const rows = await db.select({ id: deliveryZones.id }).from(deliveryZones).limit(1);
  return rows.length > 0;
}

async function seedReference(): Promise<void> {
  if (await referenceAlreadySeeded()) {
    log("reference", "already seeded, skipping");
    return;
  }

  // Illustrative mid-market rates. Refresh from a provider before taking
  // real payments — an out-of-date rate silently erodes import margin.
  const rates: [string, number][] = [
    ["USD", 12.4],
    ["GBP", 15.8],
    ["EUR", 13.5],
    ["CAD", 9.1],
    ["CNY", 1.72],
  ];
  for (const [base, rate] of rates) {
    await db.insert(fxRates).values({
      id: newId("fxRate"),
      baseCurrency: base,
      quoteCurrency: "GHS",
      rate,
      spreadBps: 250,
      source: "seed",
    });
  }
  log("fx rates", `${rates.length} pairs`);

  const levies: [string, string, number, string][] = [
    ["VAT_BPS", "Value Added Tax", GHANA_LEVIES.VAT_BPS, "vat_base"],
    ["NHIL_BPS", "National Health Insurance Levy", GHANA_LEVIES.NHIL_BPS, "pre_levy"],
    ["GETFUND_BPS", "GETFund Levy", GHANA_LEVIES.GETFUND_BPS, "pre_levy"],
    ["COVID_BPS", "COVID-19 Health Recovery Levy", GHANA_LEVIES.COVID_BPS, "pre_levy"],
    ["ECOWAS_BPS", "ECOWAS Levy", GHANA_LEVIES.ECOWAS_BPS, "cif"],
    ["AU_LEVY_BPS", "African Union Import Levy", GHANA_LEVIES.AU_LEVY_BPS, "cif"],
    ["EXIM_BPS", "EXIM Levy", GHANA_LEVIES.EXIM_BPS, "cif"],
    ["INSPECTION_BPS", "Inspection Fee", GHANA_LEVIES.INSPECTION_BPS, "cif"],
    ["PROCESSING_BPS", "ICUMS Processing Fee", GHANA_LEVIES.PROCESSING_BPS, "cif"],
  ];
  for (const [code, label, rateBps, appliesTo] of levies) {
    await db.insert(taxRates).values({ id: newId("taxRate"), code, label, rateBps, appliesTo });
  }
  log("tax rates", `${levies.length} statutory charges`);

  // Per-kg / per-CBM rates in pesewas, by origin lane.
  const lanes: [string, string, number, number | null, number, number][] = [
    ["US", "air-express", 2_100, null, 4_500, 12_000],
    ["US", "air-economy", 1_350, null, 3_500, 8_500],
    ["US", "sea-lcl", 220, 280_000, 18_000, 40_000],
    ["GB", "air-express", 1_950, null, 4_200, 11_000],
    ["GB", "air-economy", 1_250, null, 3_200, 8_000],
    ["GB", "sea-lcl", 200, 260_000, 17_000, 38_000],
    ["CA", "air-express", 2_250, null, 4_800, 13_000],
    ["CA", "air-economy", 1_450, null, 3_800, 9_000],
    ["CN", "air-express", 1_800, null, 4_000, 10_000],
    ["CN", "air-economy", 1_050, null, 2_800, 7_000],
    ["CN", "sea-lcl", 160, 210_000, 15_000, 32_000],
    ["AE", "air-economy", 1_150, null, 3_000, 7_500],
    ["DE", "air-economy", 1_300, null, 3_400, 8_200],
  ];
  for (const [origin, mode, perKg, perCbm, handling, minimum] of lanes) {
    await db.insert(freightTariffs).values({
      id: newId("freightTariff"),
      originCountry: origin,
      freightMode: mode,
      perKgMinor: perKg,
      perCbmMinor: perCbm,
      handlingMinor: handling,
      minimumMinor: minimum,
    });
  }
  log("freight lanes", `${lanes.length} origin × mode combinations`);

  // Delivery zones cover every region. Cash on delivery is withheld in the
  // outer zone, where a failed delivery costs more than the order margin.
  const zones = [
    { code: "accra-metro", label: "Greater Accra", base: 2_500, free: 150_000, eta: [1, 2], cod: true },
    { code: "kumasi-metro", label: "Kumasi metro", base: 3_500, free: 200_000, eta: [1, 3], cod: true },
    { code: "regional-capital", label: "Regional capitals", base: 5_500, free: 250_000, eta: [2, 4], cod: true },
    { code: "outer", label: "Outer regions", base: 8_500, free: null, eta: [3, 7], cod: false },
  ] as const;

  for (const zone of zones) {
    await db.insert(deliveryZones).values({
      id: newId("deliveryZone"),
      code: zone.code,
      label: zone.label,
      regionCodes: GHANA_REGIONS.filter((r) => r.zone === zone.code).map((r) => r.code),
      baseFeeMinor: zone.base,
      perKgMinor: 150,
      freeThresholdMinor: zone.free,
      etaMinDays: zone.eta[0],
      etaMaxDays: zone.eta[1],
      supportsCashOnDelivery: zone.cod,
    });
  }
  log("delivery zones", `${zones.length} zones covering 16 regions`);
}

async function seedTaxonomy(): Promise<Map<string, string>> {
  const brandIds = new Map<string, string>();
  for (const brand of BRANDS) {
    const id = newId("brand");
    await db
      .insert(brands)
      .values({
        id,
        slug: brand.slug,
        name: brand.name,
        isAuthorised: brand.authorised,
        prominence: brand.prominence,
        countryOfOrigin: brand.origin,
        description: brand.description,
      })
      .onConflictDoUpdate({
        target: brands.slug,
        set: { name: brand.name, isAuthorised: brand.authorised, updatedAt: new Date() },
      });
    const row = await db
      .select({ id: brands.id })
      .from(brands)
      .where(sql`${brands.slug} = ${brand.slug}`)
      .limit(1);
    brandIds.set(brand.slug, row[0]?.id ?? id);
  }
  log("brands", `${BRANDS.length} brands`);

  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const id = newId("category");
    const parentId = category.parent ? categoryIds.get(category.parent) : null;
    const path = category.parent
      ? `${CATEGORIES.find((c) => c.slug === category.parent)?.slug ?? ""}/${category.slug}`
      : category.slug;

    await db
      .insert(categories)
      .values({
        id,
        slug: category.slug,
        name: category.name,
        parentId: parentId ?? null,
        path,
        depth: category.parent ? 1 : 0,
        dutyBand: category.dutyBand,
        iconName: category.icon ?? null,
        position: category.position,
      })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: category.name, dutyBand: category.dutyBand, path, updatedAt: new Date() },
      });

    const row = await db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.slug} = ${category.slug}`)
      .limit(1);
    categoryIds.set(category.slug, row[0]?.id ?? id);
  }
  log("categories", `${CATEGORIES.length} categories`);

  return new Map([...brandIds, ...categoryIds]);
}

const REVIEWER_NAMES = [
  "Kwame", "Ama", "Kofi", "Akosua", "Yaw", "Abena", "Kwesi", "Adwoa",
  "Nana", "Efua", "Kojo", "Esi", "Fiifi", "Akua", "Yaa", "Kwabena",
];

const REVIEW_BODIES = [
  "Delivered to Osu in two days. Exactly as described, sealed box.",
  "Paid with MoMo, no issues. The import breakdown matched what I was charged.",
  "Good value once you account for what it would cost to bring in yourself.",
  "Took a bit longer than the estimate but customer service kept me updated.",
  "Quality is solid. Warranty card was in the box and it registered locally.",
  "Second one I've bought here. Consistent.",
  "Works well. Packaging could be better for the price.",
  "Arrived in Kumasi on time. Would order again.",
];

async function seedProducts(ids: Map<string, string>): Promise<void> {
  let variantCount = 0;
  let reviewCount = 0;

  for (const product of PRODUCTS) {
    const productId = newId("product");
    const brandId = ids.get(product.brand);
    const categoryId = ids.get(product.category);
    if (!categoryId) {
      process.stderr.write(`  ! skipping ${product.slug}: unknown category ${product.category}\n`);
      continue;
    }

    const ratingAverage = product.rating ?? 4.2 + Math.random() * 0.7;
    const ratingCount = product.reviews ?? Math.floor(8 + Math.random() * 180);

    await db
      .insert(products)
      .values({
        id: productId,
        slug: product.slug,
        title: product.title,
        subtitle: product.subtitle,
        brandId: brandId ?? null,
        categoryId,
        status: "active",
        fulfillmentType: product.fulfillment,
        description: product.description,
        highlights: product.highlights,
        specifications: product.specs,
        sourceCountry: product.sourceCountry ?? null,
        weightGrams: product.weightGrams,
        lengthMm: product.dimensionsMm[0],
        widthMm: product.dimensionsMm[1],
        heightMm: product.dimensionsMm[2],
        warrantyMonths: product.warrantyMonths,
        hasLocalWarranty: product.fulfillment === "in_house",
        ratingAverage: Number(ratingAverage.toFixed(2)),
        ratingCount,
        purchaseCount: Math.floor(Math.random() * 400),
        viewCount: Math.floor(Math.random() * 4000),
        publishedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: { title: product.title, status: "active", updatedAt: new Date() },
      });

    const resolved = await db
      .select({ id: products.id })
      .from(products)
      .where(sql`${products.slug} = ${product.slug}`)
      .limit(1);
    const resolvedId = resolved[0]?.id ?? productId;

    // Images and reviews hang off the product with no natural unique key, so
    // they are replaced rather than upserted — otherwise every re-run stacks
    // another copy onto the gallery.
    await db.delete(productImages).where(eq(productImages.productId, resolvedId));
    await db.delete(reviews).where(eq(reviews.productId, resolvedId));

    for (const [index, image] of product.images.entries()) {
      await db.insert(productImages).values({
        id: newId("image"),
        productId: resolvedId,
        url: image,
        altText: `${product.title} — view ${index + 1}`,
        placeholderColor: product.placeholderColor,
        position: index,
      });
    }

    for (const [index, variant] of product.variants.entries()) {
      const variantId = newId("variant");
      await db
        .insert(productVariants)
        .values({
          id: variantId,
          productId: resolvedId,
          sku: variant.sku,
          title: variant.title,
          options: variant.options,
          priceMinor: variant.priceMinor,
          compareAtMinor: variant.compareAtMinor ?? null,
          supplierPriceMinor: variant.supplierPriceMinor ?? null,
          supplierCurrency: variant.supplierCurrency ?? null,
          weightGrams: product.weightGrams,
          imageUrl: product.images[0] ?? null,
          position: index,
          isDefault: index === 0,
        })
        .onConflictDoUpdate({
          target: productVariants.sku,
          set: { priceMinor: variant.priceMinor, updatedAt: new Date() },
        });
      variantCount += 1;

      if (product.fulfillment === "in_house") {
        const resolvedVariant = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(sql`${productVariants.sku} = ${variant.sku}`)
          .limit(1);
        await db
          .insert(inventory)
          .values({
            id: newId("inventory"),
            variantId: resolvedVariant[0]?.id ?? variantId,
            locationCode: "ACC-01",
            onHand: variant.stock ?? Math.floor(2 + Math.random() * 25),
            reserved: 0,
            reorderPoint: 3,
            leadTimeDays: 14,
          })
          .onConflictDoNothing();
      }
    }

    // A J-shaped distribution: mostly 5s and 4s with a thin negative tail,
    // which is what real review data looks like.
    const reviewsToWrite = Math.min(6, Math.max(2, Math.floor(ratingCount / 25)));
    for (let index = 0; index < reviewsToWrite; index += 1) {
      const roll = Math.random();
      const rating = roll > 0.55 ? 5 : roll > 0.25 ? 4 : roll > 0.14 ? 3 : roll > 0.06 ? 2 : 1;
      await db.insert(reviews).values({
        id: newId("review"),
        productId: resolvedId,
        rating,
        title: rating >= 4 ? "Happy with it" : rating === 3 ? "Does the job" : "Not for me",
        body: REVIEW_BODIES[Math.floor(Math.random() * REVIEW_BODIES.length)] ?? "",
        status: "published",
        isVerifiedPurchase: Math.random() > 0.25,
        helpfulCount: Math.floor(Math.random() * 20),
      });
      reviewCount += 1;
    }
  }

  log("products", `${PRODUCTS.length} products, ${variantCount} variants`);
  log("reviews", `${reviewCount} reviews`);
}

async function main(): Promise<void> {
  process.stdout.write("\nSeeding Nyansa\n\n");
  await seedReference();
  const ids = await seedTaxonomy();
  await seedProducts(ids);
  process.stdout.write("\nDone.\n\n");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(`\nSeed failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });

export { slugify };
