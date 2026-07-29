"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import type { CategoryNode } from "@/server/services/types";

export function MobileNav({ categories }: { categories: CategoryNode[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="-ml-1 rounded-lg p-2.5 text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} side="left" title="Browse">
        <nav className="flex-1 overflow-y-auto p-2">
          <ul>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/c/${category.slug}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 font-display text-base font-semibold tracking-tight transition-colors hover:bg-surface-sunken"
                >
                  {category.name}
                </Link>
                {category.children.length > 0 ? (
                  <ul className="mb-2 ml-3 border-l border-line pl-3">
                    {category.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/c/${child.slug}`}
                          onClick={() => setOpen(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-line p-4">
          <Link
            href="/orders"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content"
          >
            Track an order
          </Link>
        </div>
      </Sheet>
    </>
  );
}
