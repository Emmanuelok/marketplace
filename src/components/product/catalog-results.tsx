import Link from "next/link";
import { PackageSearch } from "lucide-react";

import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/primitives";
import type { ProductListResult, SortKey } from "@/server/services/types";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Best rated" },
  { value: "newest", label: "Newest" },
];

/** Query params carried across sort and pagination links, minus `page`. */
export type CarriedParams = Record<string, string | undefined>;

export function parseSort(value: string | undefined): SortKey {
  return SORTS.some((s) => s.value === value) ? (value as SortKey) : "relevance";
}

export function parsePage(value: string | undefined): number {
  const page = Number(value ?? 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function href(basePath: string, carried: CarriedParams, page?: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(carried)) {
    if (value) search.set(key, value);
  }
  if (page && page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

interface CatalogResultsProps {
  result: ProductListResult;
  /** Path this listing lives at, e.g. "/c/electronics". */
  basePath: string;
  /** Params preserved across sort/pagination links (excluding `page`). */
  carried: CarriedParams;
  /** Hide the brand facet rail on pages already scoped to one brand. */
  showBrandFacets?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function CatalogResults({
  result,
  basePath,
  carried,
  showBrandFacets = true,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Try a different filter, or browse the full catalogue.",
}: CatalogResultsProps) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));

  if (result.items.length === 0) {
    return (
      <EmptyState
        className="mt-10"
        icon={<PackageSearch className="size-8" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      {showBrandFacets && result.facets.brands.length > 1 ? (
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
              href={href(basePath, carried, result.page - 1)}
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
              href={href(basePath, carried, result.page + 1)}
              className="rounded-xl border border-line px-4 py-2 transition-colors hover:bg-surface-sunken"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

/** GET form so sorting works without client JS. */
export function SortForm({
  basePath,
  carried,
  value,
}: {
  basePath: string;
  carried: CarriedParams;
  value: SortKey;
}) {
  return (
    <form action={basePath} className="flex items-center gap-2">
      {Object.entries(carried)
        .filter(([key, v]) => key !== "sort" && v)
        .map(([key, v]) => (
          <input key={key} type="hidden" name={key} value={v} />
        ))}
      <label htmlFor="sort" className="text-xs text-content-tertiary">
        Sort
      </label>
      <select
        id="sort"
        name="sort"
        defaultValue={value}
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
  );
}
