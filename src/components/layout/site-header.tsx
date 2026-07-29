import Link from "next/link";
import { Heart, Search, ShoppingBag, User } from "lucide-react";

import { listCategories } from "@/server/services/catalog";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const categories = await listCategories();
  const primary = categories.slice(0, 6);

  return (
    <>
      <div className="border-b border-line bg-surface-inverse text-content-inverse">
        <div className="mx-auto flex max-w-[1400px] items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-medium tracking-wide sm:text-xs">
          <span className="inline-block size-1.5 rounded-full bg-brass-400" aria-hidden />
          Order to ship from the US, UK, Canada &amp; China — duties included, nothing to pay at the door
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-line surface-glass">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
          <MobileNav categories={primary} />

          <Link href="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="Nyansa home">
            <span className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
              nyansa
            </span>
            <span className="size-1.5 translate-y-[-2px] rounded-full bg-brass-500" aria-hidden />
          </Link>

          <nav aria-label="Categories" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {primary.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/c/${category.slug}`}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form action="/search" className="ml-auto hidden max-w-md flex-1 lg:block">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-content-tertiary"
                aria-hidden
              />
              <input
                type="search"
                name="q"
                placeholder="Search 3,000+ products…"
                aria-label="Search products"
                className="h-11 w-full rounded-full border border-line bg-surface-sunken pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-content-tertiary focus:border-line-accent focus:bg-surface-raised"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
            <Link
              href="/search"
              aria-label="Search"
              className="rounded-lg p-2.5 text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content lg:hidden"
            >
              <Search className="size-5" />
            </Link>
            <ThemeToggle />
            <Link
              href="/wishlist"
              aria-label="Wishlist"
              className="hidden rounded-lg p-2.5 text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content sm:block"
            >
              <Heart className="size-5" />
            </Link>
            <Link
              href="/orders"
              aria-label="Account and orders"
              className="rounded-lg p-2.5 text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content"
            >
              <User className="size-5" />
            </Link>
            <Link
              href="/cart"
              aria-label="Cart"
              className="relative rounded-lg p-2.5 text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content"
            >
              <ShoppingBag className="size-5" />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
