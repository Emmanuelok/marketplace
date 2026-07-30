import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CatalogResults,
  SortForm,
  parsePage,
  parseSort,
  type CarriedParams,
} from "@/components/product/catalog-results";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/primitives";
import { pluralise } from "@/lib/utils";
import { getCategoryBySlug, listCategories, listProducts } from "@/server/services/catalog";
import type { CategoryNode, FulfillmentType, ProductFilters } from "@/server/services/types";

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

/** Flatten the category tree so a materialised path resolves to its node. */
function flatten(nodes: CategoryNode[], into = new Map<string, CategoryNode>()) {
  for (const node of nodes) {
    into.set(node.path, node);
    flatten(node.children, into);
  }
  return into;
}

/** Home / Electronics / Computing — derived from the materialised path. */
async function buildTrail(category: CategoryNode): Promise<BreadcrumbItem[]> {
  const trail: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  const segments = category.path.split("/").filter(Boolean);
  if (segments.length > 1) {
    const byPath = flatten(await listCategories());
    for (let i = 1; i < segments.length; i += 1) {
      const ancestor = byPath.get(segments.slice(0, i).join("/"));
      if (ancestor) trail.push({ label: ancestor.name, href: `/c/${ancestor.slug}` });
    }
  }
  trail.push({ label: category.name });
  return trail;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: category.name,
    description: `Shop ${category.name.toLowerCase()} in Ghana on Nyansa — authorised brands, duties included, delivered nationwide.`,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const sort = parseSort(first(query.sort));
  const page = parsePage(first(query.page));
  const fulfillment = first(query.fulfillment);
  const brand = first(query.brand);

  const filters: ProductFilters = {
    categorySlug: slug,
    brandSlugs: brand ? [brand] : undefined,
    fulfillment: parseFulfillment(fulfillment),
    sort,
    page,
    perPage: 24,
  };

  const [result, trail] = await Promise.all([listProducts(filters), buildTrail(category)]);

  const basePath = `/c/${slug}`;
  const carried: CarriedParams = { sort, fulfillment, brand };
  const isFiltered = Boolean(brand || fulfillment);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <Breadcrumbs items={trail} className="mb-5" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {category.name}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {result.total.toLocaleString("en-GH")} {pluralise(result.total, "product")}
          </p>
        </div>

        <SortForm basePath={basePath} carried={carried} value={sort} />
      </header>

      {category.children.length > 0 ? (
        <nav aria-label="Subcategories" className="rail mt-6 flex gap-2 overflow-x-auto pb-1">
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/c/${child.slug}`}
              className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-line-accent hover:text-content"
            >
              {child.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <CatalogResults
        result={result}
        basePath={basePath}
        carried={carried}
        emptyTitle={
          isFiltered ? "Nothing matches those filters" : `Nothing in ${category.name} yet`
        }
        emptyDescription={
          isFiltered
            ? "Clear the filters, or browse a neighbouring category."
            : "We're still stocking this category. Try a neighbouring one in the meantime."
        }
      />
    </div>
  );
}
