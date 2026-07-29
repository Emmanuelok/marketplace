import { Info } from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { LandedCostBreakdown } from "@/lib/landed-cost";

/**
 * The itemised import breakdown. This is the single most trust-building surface
 * on the site, so it is deliberately not collapsed by default and does not
 * round anything away — a customer who can check the arithmetic believes the
 * total.
 */
export function LandedCostPanel({ breakdown }: { breakdown: LandedCostBreakdown }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface-sunken" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-sm font-semibold tracking-tight">
          What you&rsquo;re paying for
        </span>
        <span className="text-xs text-content-tertiary transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <dl className="divide-y divide-[--border-subtle] border-t border-line">
        {breakdown.lines.map((line) => (
          <div key={line.key} className="flex items-baseline justify-between gap-5 px-4 py-2.5">
            <dt className="min-w-0">
              <span className="text-sm text-content-secondary">{line.label}</span>
              {line.note ? (
                <span className="mt-0.5 block text-[11px] leading-snug text-content-tertiary">
                  {line.note}
                </span>
              ) : null}
            </dt>
            <dd className="tnum shrink-0 text-sm">
              {formatMoney(line.amount, { compactDecimals: true })}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline justify-between gap-5 border-t border-line-strong px-4 py-3">
        <span className="text-sm font-semibold">Total, delivered duty-paid</span>
        <span className="tnum font-display text-base font-bold">
          {formatMoney(breakdown.total, { compactDecimals: true })}
        </span>
      </div>

      <div className="flex gap-2.5 border-t border-line px-4 py-3">
        <Info className="mt-px size-3.5 shrink-0 text-content-tertiary" aria-hidden />
        <ul className="space-y-1 text-[11px] leading-relaxed text-content-tertiary">
          {breakdown.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
          <li>
            Duty and VAT are settled by Nyansa before the parcel leaves customs. There is nothing to
            pay on delivery.
          </li>
        </ul>
      </div>
    </details>
  );
}
