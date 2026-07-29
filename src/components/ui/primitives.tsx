/**
 * Presentational primitives. All server-safe — no state, no effects — so they
 * can be rendered inside server components without forcing a client boundary.
 */

import type { HTMLAttributes, ReactNode } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { discountPercent } from "@/lib/utils";
import { formatMoney, type Money } from "@/lib/money";

// --- Badge ------------------------------------------------------------------

export type BadgeVariant = "neutral" | "accent" | "positive" | "negative" | "outline";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-surface-sunken text-content-secondary",
  accent: "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-content-accent",
  positive: "bg-positive-surface text-positive",
  negative: "bg-negative-surface text-negative",
  outline: "border border-line-strong text-content-secondary",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

export function Badge({ className, variant = "neutral", size = "sm", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium tracking-tight",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        BADGE_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

// --- Card -------------------------------------------------------------------

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface-card overflow-hidden", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("font-display text-lg font-semibold tracking-tight", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-content-secondary", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 border-t border-line p-5", className)} {...props} />;
}

// --- Price ------------------------------------------------------------------

const PRICE_SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl sm:text-4xl",
} as const;

export interface PriceProps {
  amount: Money;
  compareAt?: Money | null;
  size?: keyof typeof PRICE_SIZES;
  className?: string;
  /** Hide the "−23%" chip even when there is a compare-at price. */
  hideDiscount?: boolean;
}

export function Price({ amount, compareAt, size = "md", className, hideDiscount }: PriceProps) {
  const saved = compareAt ? discountPercent(amount.minor, compareAt.minor) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("tnum font-display font-semibold tracking-tight", PRICE_SIZES[size])}>
        {formatMoney(amount, { compactDecimals: true })}
      </span>
      {compareAt && saved ? (
        <>
          <span className="tnum text-sm text-content-tertiary line-through">
            {formatMoney(compareAt, { compactDecimals: true })}
          </span>
          {!hideDiscount ? (
            <Badge variant="negative" className="font-semibold">
              −{saved}%
            </Badge>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

// --- Rating -----------------------------------------------------------------

export interface RatingProps {
  value: number;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}

export function Rating({ value, count, size = "sm", className }: RatingProps) {
  const starSize = size === "sm" ? "size-3.5" : "size-4";
  const rounded = Math.round(value * 2) / 2;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={`Rated ${value.toFixed(1)} out of 5${count ? ` from ${count} reviews` : ""}`}
    >
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((position) => {
          const filled = rounded >= position;
          const half = !filled && rounded >= position - 0.5;
          return (
            <Star
              key={position}
              className={cn(
                starSize,
                filled || half ? "text-brass-400" : "text-content-tertiary/40",
              )}
              fill={filled ? "currentColor" : half ? "url(#half)" : "none"}
              strokeWidth={1.5}
            />
          );
        })}
      </span>
      <span className={cn("tnum text-content-secondary", size === "sm" ? "text-xs" : "text-sm")}>
        {value.toFixed(1)}
        {count !== undefined ? (
          <span className="text-content-tertiary"> ({count.toLocaleString("en-GH")})</span>
        ) : null}
      </span>
    </span>
  );
}

// --- Layout atoms -----------------------------------------------------------

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("h-px w-full bg-line", className)} {...props} />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-lg", className)} {...props} />;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-content-tertiary">{icon}</div> : null}
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-content-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("scroll-x", className)}>
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-xs text-content-secondary">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <span className="text-content-tertiary">/</span> : null}
            {item.href ? (
              <a href={item.href} className="transition-colors hover:text-content">
                {item.label}
              </a>
            ) : (
              <span className="text-content">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
