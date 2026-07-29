import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/primitives";
import { pluralise } from "@/lib/utils";
import { listProducts } from "@/server/services/catalog";
import type { ProductFilters, SortKey } from "@/server/services/types";

export const metadata: Metadata = {
  title: "Search",
  description: "Search premium brands across electronics, appliances, fashion and beauty.",
};

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Best rated" },
  { value: "newest", label: "Newest" },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query = first(params.q);
  const fulfillment = first(params.fulfillment);
  const sort = first(params.sort) as SortKey | undefined;
  const page = Number(first(params.page) ?? 1);

  const filters: ProductFilters = {
    q: query,
    fulfillment:
      fulfillment === "in_house" || fulfillment === "order_to_ship" ? [fulfillment] : undefined,
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : "relevance",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: 24,
  };

  const result = await listProducts(filters);
  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));

  const heading = query
    ? `Results for “${query}”`
    : fulfillment === "in_house"
      ? "Ready in Accra"
      : fulfillment === "order_to_ship"
        ? "Order to ship"
        : "All products";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-content-secondary">
            {result.total.toLocaleString("en-GH")} {pluralise(result.total, "product")}
          </p>
        </div>

        <form className="flex items-center gap-2">
          {query ? <input type="hidden" name="q" value={query} /> : null}
          {fulfillment ? <input type="hidden" name="fulfillment" value={fulfillment} /> : null}
          <label htmlFor="sort" className="text-xs text-content-tertiary">
            Sort
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={filters.sort}
            className="h-10 rounded-xl border border-line bg-surface-raised px-3 text-sm outline-none focus:border-line-accent"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl border border-line px-3 text-sm transition-colors hover:bg-surface-sunken"
          >
            Apply
          </button>
        </form>
      </header>

      {result.facets.brands.length > 0 ? (
        <div className="rail mt-6 flex gap-2 overflow-x-auto pb-1">
          {result.facets.brands.slice(0, 14).map((brand) => (
            <Link
              key={brand.value}
              href={`/b/${brand.value}`}
              className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-line-accent hover:text-content"
            >
              {brand.label}
              <span className="ml-1.5 text-content-tertiary">{brand.count}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {result.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<SearchX className="size-8" />}
          title={query ? "Nothing matched that search" : "No products yet"}
          description={
            query
              ? "Try fewer words, or a brand name on its own. Our concierge can also look for you."
              : "Run npm run db:seed to populate the catalogue."
          }
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {result.items.map((item, index) => (
              <ProductCard key={item.id} product={item} priority={index < 4} />
            ))}
          </div>

          {totalPages > 1 ? (
            <nav
              aria-label="Pagination"
              className="mt-10 flex items-center justify-center gap-2 text-sm"
            >
              {result.page > 1 ? (
                <Link
                  href={`/search?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(fulfillment ? { fulfillment } : {}), page: String(result.page - 1) })}`}
                  className="rounded-xl border border-line px-4 py-2 transition-colors hover:bg-surface-sunken"
                >
                  Previous
                </Link>
              ) : null}
              <span className="tnum px-3 text-content-secondary">
                Page {result.page} of {totalPages}
              </span>
              {result.page < totalPages ? (
                <Link
                  href={`/search?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(fulfillment ? { fulfillment } : {}), page: String(result.page + 1) })}`}
                  className="rounded-xl border border-line px-4 py-2 transition-colors hover:bg-surface-sunken"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
