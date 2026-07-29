import Image from "next/image";
import Link from "next/link";
import { Check, Plane, Ship } from "lucide-react";

import { Badge, Price, Rating } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/server/services/types";

export function FulfillmentBadge({ item }: { item: ProductListItem }) {
  if (item.fulfillmentType === "order_to_ship") {
    const bySea = item.etaDays[1] > 30;
    return (
      <Badge variant="accent" className="gap-1">
        {bySea ? <Ship className="size-3" aria-hidden /> : <Plane className="size-3" aria-hidden />}
        Order to ship · {item.etaDays[0]}–{item.etaDays[1]} days
      </Badge>
    );
  }
  if (item.availability === "out_of_stock") {
    return <Badge variant="outline">Out of stock</Badge>;
  }
  return (
    <Badge variant="positive" className="gap-1">
      <Check className="size-3" aria-hidden />
      Ready in Accra
    </Badge>
  );
}

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductListItem;
  priority?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised transition-[border-color,transform,box-shadow] duration-300 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-lifted)]",
        className,
      )}
    >
      <div
        className="relative aspect-square overflow-hidden bg-surface-sunken"
        style={
          product.placeholderColor ? { backgroundColor: product.placeholderColor } : undefined
        }
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-content-tertiary">
            No image
          </div>
        )}

        {product.isAuthorisedBrand ? (
          <span className="absolute left-3 top-3 rounded-full bg-surface-overlay px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-content-accent backdrop-blur">
            Authorised
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        {product.brandName ? (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
            {product.brandName}
          </p>
        ) : null}

        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0">
            {product.title}
          </Link>
        </h3>

        {product.ratingCount > 0 ? (
          <Rating value={product.ratingAverage} count={product.ratingCount} />
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Price amount={product.price} compareAt={product.compareAt} size="md" />
          <FulfillmentBadge item={product} />
        </div>
      </div>
    </article>
  );
}
