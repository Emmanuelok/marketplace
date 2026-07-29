import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, PackageCheck, Plane, ShieldCheck, Smartphone } from "lucide-react";

import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { ImportExplainer } from "@/components/home/import-explainer";
import { listCategories, listProducts } from "@/server/services/catalog";

export const revalidate = 300;

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Suspense fallback={<RailSkeleton />}>
        <CategoryRail />
      </Suspense>
      <Suspense fallback={<RailSkeleton />}>
        <ProductRail
          title="Ready in Accra"
          description="In the warehouse now. Delivered in 1–3 days across Greater Accra."
          href="/search?fulfillment=in_house"
          filters={{ fulfillment: ["in_house"], perPage: 5, sort: "popular" }}
        />
      </Suspense>
      <ImportExplainer />
      <Suspense fallback={<RailSkeleton />}>
        <ProductRail
          title="Order to ship"
          description="Sourced from the US, UK, Canada and China. The price you see is the landed price."
          href="/search?fulfillment=order_to_ship"
          filters={{ fulfillment: ["order_to_ship"], perPage: 5, sort: "popular" }}
        />
      </Suspense>
    </>
  );
}

// --- Hero -------------------------------------------------------------------

function Hero() {
  return (
    <section className="border-b border-line bg-surface-inverse text-content-inverse">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-16 lg:py-28">
        <div className="animate-rise">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-medium tracking-wide">
            <span className="size-1.5 rounded-full bg-brass-400" aria-hidden />
            Now shipping to all 16 regions
          </p>

          <h1 className="font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-6xl lg:text-[5rem]">
            The brands you want.
            <br />
            <span className="text-brass-400">The price you were quoted.</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-obsidian-300 sm:text-lg">
            Buy Apple, Samsung, Sony, Whirlpool and more from stock in Accra — or order to ship from
            abroad with import duty, VAT and freight already in the price. Nothing to settle at
            clearing.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/search">
                Browse the catalogue
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/25 text-white hover:bg-white/10">
              <Link href="/search?fulfillment=order_to_ship">See what we can import</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <HeroPanel
            icon={<Plane className="size-5 text-brass-400" aria-hidden />}
            title="One price, duties included"
            body="Import duty, VAT, NHIL, GETFund and the COVID levy are calculated up front and shown line by line. No customs bill later."
          />
          <HeroPanel
            icon={<Smartphone className="size-5 text-brass-400" aria-hidden />}
            title="Pay how you already pay"
            body="MTN MoMo, Telecel Cash and AT Money — plus card, bank transfer and cash on delivery in most regions."
          />
        </div>
      </div>
    </section>
  );
}

function HeroPanel({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="edge-brass rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {icon}
      <h2 className="mt-3 font-display text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-obsidian-400">{body}</p>
    </div>
  );
}

// --- Trust ------------------------------------------------------------------

const TRUST_POINTS = [
  { icon: BadgeCheck, label: "Authorised reseller", detail: "Genuine stock, brand-backed" },
  { icon: ShieldCheck, label: "Warranty in Ghana", detail: "Serviced locally, not shipped back" },
  { icon: PackageCheck, label: "Duties settled", detail: "Nothing to pay at the door" },
  { icon: Smartphone, label: "MoMo accepted", detail: "MTN, Telecel and AT" },
];

function TrustStrip() {
  return (
    <section className="border-b border-line bg-surface-sunken">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-px overflow-hidden px-4 sm:px-6 lg:grid-cols-4">
        {TRUST_POINTS.map(({ icon: Icon, label, detail }) => (
          <div key={label} className="flex items-start gap-3 py-5 pr-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-brass-500" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">{label}</p>
              <p className="text-xs text-content-secondary">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Rails ------------------------------------------------------------------

async function CategoryRail() {
  const categories = await listCategories();
  if (categories.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Shop by category</h2>
      <div className="rail mt-6 flex gap-3 overflow-x-auto pb-2">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/c/${category.slug}`}
            className="group flex min-w-[9.5rem] flex-1 flex-col justify-between rounded-2xl border border-line bg-surface-raised p-4 transition-colors hover:border-line-accent"
          >
            <span className="font-display text-base font-semibold tracking-tight">
              {category.name}
            </span>
            <span className="mt-6 inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors group-hover:text-content-accent">
              {category.children.length > 0 ? `${category.children.length} sections` : "Browse"}
              <ArrowRight className="size-3" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function ProductRail({
  title,
  description,
  href,
  filters,
}: {
  title: string;
  description: string;
  href: string;
  filters: Parameters<typeof listProducts>[0];
}) {
  const { items } = await listProducts(filters);

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-1.5 max-w-xl text-sm text-content-secondary">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-content-accent transition-opacity hover:opacity-80"
        >
          See all
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Nothing here yet"
          description="Run the seed script to populate the catalogue: npm run db:seed"
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {items.map((item, index) => (
            <ProductCard key={item.id} product={item} priority={index < 2} />
          ))}
        </div>
      )}
    </section>
  );
}

function RailSkeleton() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
      <Skeleton className="h-8 w-56" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="aspect-[3/4] w-full rounded-2xl" />
        ))}
      </div>
    </section>
  );
}
