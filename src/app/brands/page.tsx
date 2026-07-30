import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { Badge, Breadcrumbs, EmptyState } from "@/components/ui/primitives";
import { pluralise } from "@/lib/utils";
import { listBrands } from "@/server/services/catalog";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Brands",
  description:
    "Every brand on Nyansa — authorised electronics, appliances, fashion and beauty, delivered across Ghana.",
};

export default async function BrandsPage() {
  const brands = await listBrands(120);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Brands" }]} className="mb-5" />

      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Brands</h1>
        <p className="mt-1 text-sm text-content-secondary">
          {brands.length.toLocaleString("en-GH")} {pluralise(brands.length, "brand")}
        </p>
      </header>

      {brands.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="No brands yet"
          description="Run npm run db:seed to populate the catalogue."
        />
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/b/${brand.slug}`}
                className="flex h-full flex-col items-start gap-3 rounded-2xl border border-line bg-surface-raised p-4 transition-colors hover:border-line-accent"
              >
                {brand.logoUrl ? (
                  <Image
                    src={brand.logoUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="size-12 rounded-xl border border-line object-contain p-1.5"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-12 place-items-center rounded-xl border border-line font-display text-lg font-bold text-content-tertiary"
                  >
                    {brand.name.slice(0, 1)}
                  </span>
                )}
                <span className="font-medium leading-tight">{brand.name}</span>
                {brand.isAuthorised ? (
                  <Badge variant="positive" size="sm" className="mt-auto gap-1">
                    <BadgeCheck className="size-3" />
                    Authorised
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
