import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, Check, Plane, ShieldCheck, Truck } from "lucide-react";

import { LandedCostPanel } from "@/components/product/landed-cost-panel";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { Badge, Breadcrumbs, Price, Rating, Separator } from "@/components/ui/primitives";
import { SOURCE_COUNTRY_META, type SourceCountry } from "@/lib/ghana";
import { formatMoney } from "@/lib/money";
import { getProductBySlug, getRelatedProducts } from "@/server/services/catalog";

export const revalidate = 120;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const cheapest = product.variants[0];
  return {
    title: product.seoTitle ?? product.title,
    description:
      product.seoDescription ??
      product.subtitle ??
      `Buy the ${product.title} in Ghana. ${cheapest ? `From ${formatMoney(cheapest.price)}. ` : ""}Duties included.`,
    openGraph: {
      title: product.title,
      description: product.subtitle ?? undefined,
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related] = await Promise.all([getRelatedProducts(product.id, 5)]);

  const selected = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const isImport = product.fulfillmentType === "order_to_ship";
  const origin = product.sourceCountry
    ? SOURCE_COUNTRY_META[product.sourceCountry as SourceCountry]
    : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.subtitle ?? product.description ?? undefined,
    image: product.images.map((i) => i.url),
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    aggregateRating:
      product.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.ratingAverage,
            reviewCount: product.ratingCount,
          }
        : undefined,
    offers: selected
      ? {
          "@type": "Offer",
          price: (selected.price.minor / 100).toFixed(2),
          priceCurrency: "GHS",
          availability:
            selected.availability.state === "out_of_stock"
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
        }
      : undefined,
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumbs items={[...product.breadcrumb, { label: product.title }]} className="mb-6" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-sunken">
            {product.images[0] ? (
              <Image
                src={product.images[0].url}
                alt={product.images[0].altText ?? product.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-content-tertiary">
                No image available
              </div>
            )}
          </div>

          {product.images.length > 1 ? (
            <div className="rail mt-3 flex gap-2 overflow-x-auto pb-1">
              {product.images.map((image, index) => (
                <div
                  key={`${image.url}-${index}`}
                  className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-sunken"
                >
                  <Image
                    src={image.url}
                    alt={image.altText ?? `${product.title} view ${index + 1}`}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* Details below the gallery on desktop, after the buy box on mobile */}
          <div className="mt-10 hidden lg:block">
            <ProductNarrative product={product} />
          </div>
        </div>

        {/* Buy box */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          {product.brand ? (
            <Link
              href={`/b/${product.brand.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-content-tertiary transition-colors hover:text-content"
            >
              {product.brand.name}
              {product.brand.isAuthorised ? (
                <BadgeCheck className="size-3.5 text-brass-500" aria-hidden />
              ) : null}
            </Link>
          ) : null}

          <h1 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {product.title}
          </h1>
          {product.subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-content-secondary">{product.subtitle}</p>
          ) : null}

          {product.ratingCount > 0 ? (
            <Rating
              value={product.ratingAverage}
              count={product.ratingCount}
              size="md"
              className="mt-3"
            />
          ) : null}

          <Separator className="my-5" />

          {selected ? (
            <>
              <Price
                amount={selected.price}
                compareAt={selected.compareAt}
                size="xl"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {isImport ? (
                  <Badge variant="accent" className="gap-1">
                    <Plane className="size-3" aria-hidden />
                    Order to ship
                    {origin ? ` from ${origin.flag} ${origin.name}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="positive" className="gap-1">
                    <Check className="size-3" aria-hidden />
                    {selected.availability.state === "low_stock"
                      ? `Only ${selected.availability.quantity} left in Accra`
                      : "In stock in Accra"}
                  </Badge>
                )}
                {product.hasLocalWarranty ? (
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="size-3" aria-hidden />
                    {product.warrantyMonths}-month warranty in Ghana
                  </Badge>
                ) : null}
              </div>

              {product.variants.length > 1 ? (
                <fieldset className="mt-5">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
                    Options
                  </legend>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {product.variants.map((variant) => (
                      <span
                        key={variant.id}
                        className={
                          variant.id === selected.id
                            ? "rounded-xl border border-line-accent bg-surface-sunken px-3.5 py-2 text-sm font-medium"
                            : "rounded-xl border border-line px-3.5 py-2 text-sm text-content-secondary"
                        }
                      >
                        {variant.title}
                      </span>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3.5 py-3">
                <Truck className="size-4 shrink-0 text-content-tertiary" aria-hidden />
                <p className="text-sm text-content-secondary">
                  Delivered in{" "}
                  <strong className="font-semibold text-content">
                    {selected.availability.etaDays[0]}–{selected.availability.etaDays[1]} days
                  </strong>{" "}
                  to Greater Accra. Longer to other regions.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <Button size="lg" className="w-full">
                  Add to cart
                </Button>
                <Button size="lg" variant="outline" className="w-full">
                  Buy now
                </Button>
              </div>

              {selected.breakdown ? (
                <div className="mt-5">
                  <LandedCostPanel breakdown={selected.breakdown} />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-content-secondary">
              This product has no purchasable options right now.
            </p>
          )}
        </div>

        {/* Details, mobile position */}
        <div className="lg:hidden">
          <ProductNarrative product={product} />
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-16">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            You might also consider
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ProductNarrative({
  product,
}: {
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;
}) {
  const grouped = new Map<string, { label: string; value: string }[]>();
  for (const spec of product.specifications) {
    const bucket = grouped.get(spec.group);
    if (bucket) bucket.push({ label: spec.label, value: spec.value });
    else grouped.set(spec.group, [{ label: spec.label, value: spec.value }]);
  }

  return (
    <div className="max-w-2xl">
      {product.highlights.length > 0 ? (
        <section>
          <h2 className="font-display text-lg font-bold tracking-tight">Highlights</h2>
          <ul className="mt-3 space-y-2">
            {product.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2.5 text-sm leading-relaxed">
                <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                <span className="text-content-secondary">{highlight}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {product.description ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold tracking-tight">About this product</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-content-secondary">
            {product.description}
          </p>
        </section>
      ) : null}

      {grouped.size > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold tracking-tight">Specifications</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-line">
            {[...grouped.entries()].map(([group, rows], groupIndex) => (
              <div key={group} className={groupIndex > 0 ? "border-t border-line" : undefined}>
                <h3 className="bg-surface-sunken px-4 py-2 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
                  {group}
                </h3>
                <dl>
                  {rows.map((row) => (
                    <div
                      key={`${group}-${row.label}`}
                      className="flex gap-4 border-t border-line px-4 py-2.5 text-sm"
                    >
                      <dt className="w-2/5 shrink-0 text-content-tertiary">{row.label}</dt>
                      <dd className="flex-1">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
