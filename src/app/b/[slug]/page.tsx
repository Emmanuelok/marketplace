import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import {
  CatalogResults,
  SortForm,
  parsePage,
  parseSort,
  type CarriedParams,
} from "@/components/product/catalog-results";
import { Badge, Breadcrumbs } from "@/components/ui/primitives";
import { pluralise } from "@/lib/utils";
import { getBrandBySlug, listProducts } from "@/server/services/catalog";
import type { FulfillmentType, ProductFilters } from "@/server/services/types";

export const revalidate = 120;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFulfillment(value: string | undefined): FulfillmentType[] | undefined {
  return value === "in_house" || value === "order_to_ship" ? [value] : undefined;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: "Brand not found" };

  return {
    title: brand.name,
    description:
      brand.description ??
      `Shop authentic ${brand.name} in Ghana on Nyansa — duties included, delivered nationwide.`,
  };
}

export default async function BrandPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const sort = parseSort(first(query.sort));
  const page = parsePage(first(query.page));
  const fulfillment = first(query.fulfillment);

  const filters: ProductFilters = {
    brandSlugs: [slug],
    fulfillment: parseFulfillment(fulfillment),
    sort,
    page,
    perPage: 24,
  };

  const result = await listProducts(filters);

  const basePath = `/b/${slug}`;
  const carried: CarriedParams = { sort, fulfillment };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: brand.name }]}
        className="mb-5"
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-2xl border border-line bg-surface-raised object-contain p-2"
            />
          ) : null}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {brand.name}
              </h1>
              {brand.isAuthorised ? (
                <Badge variant="positive" className="gap-1">
                  <BadgeCheck className="size-3.5" />
                  Authorised
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-content-secondary">
              {result.total.toLocaleString("en-GH")} {pluralise(result.total, "product")}
            </p>
          </div>
        </div>

        <SortForm basePath={basePath} carried={carried} value={sort} />
      </header>

      {brand.description ? (
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-content-secondary">
          {brand.description}
        </p>
      ) : null}

      <CatalogResults
        result={result}
        basePath={basePath}
        carried={carried}
        showBrandFacets={false}
        emptyTitle={`No ${brand.name} products match those filters`}
        emptyDescription="Clear the filters, or browse the full catalogue."
      />
    </div>
  );
}
