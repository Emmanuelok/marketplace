import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { computeLandedCost } from "@/lib/landed-cost";
import { fromMajor, formatMoney } from "@/lib/money";

/**
 * A worked example computed by the *real* engine rather than hard-coded copy,
 * so the number on the homepage can never drift from the number at checkout.
 * Rates here are the engine's development fallbacks; a deployment with seeded
 * FX and freight tables will show its own live figures.
 */
function workedExample() {
  return computeLandedCost({
    supplierUnitPrice: fromMajor(1999, "USD"),
    quantity: 1,
    dimensions: { lengthCm: 36, widthCm: 25, heightCm: 6, weightKg: 2.2 },
    origin: "US",
    freightMode: "air-economy",
    dutyBand: "COMPUTING",
    fxRate: 12.4,
    fxSpreadBps: 250,
    tariff: { perKgMinor: 1_350, handlingMinor: 3_500, minimumMinor: 8_500 },
    marginBps: 1_200,
    insuranceBps: 60,
  });
}

export function ImportExplainer() {
  const example = workedExample();

  return (
    <section className="border-y border-line bg-surface-sunken">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-content-accent">
            Order to ship
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            We show you the whole bill, before you pay any of it.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-content-secondary">
            Importing into Ghana isn&rsquo;t one charge, it&rsquo;s eight. Import duty, VAT at 15%,
            NHIL, GETFund, the COVID-19 recovery levy, ECOWAS and AU levies, inspection and
            processing fees — each on a slightly different base. Most sellers quote you a price and
            leave you to discover the rest at Tema.
          </p>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-content-secondary">
            We compute all of it up front, show you every line, and charge one number.
          </p>
          <Button asChild className="mt-7" variant="outline">
            <Link href="/how-it-works">
              How it works
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <figure className="surface-card overflow-hidden p-0">
          <figcaption className="border-b border-line px-5 py-4">
            <p className="font-display text-sm font-semibold tracking-tight">
              Worked example — a US$1,999 laptop, air economy from the US
            </p>
            <p className="mt-0.5 text-xs text-content-tertiary">
              Computed live by the same engine that prices checkout.
            </p>
          </figcaption>

          <dl className="divide-y divide-[--border-subtle]">
            {example.lines.map((line) => (
              <div key={line.key} className="flex items-baseline justify-between gap-6 px-5 py-3">
                <dt className="min-w-0">
                  <span className="text-sm">{line.label}</span>
                  {line.note ? (
                    <span className="mt-0.5 block text-xs text-content-tertiary">{line.note}</span>
                  ) : null}
                </dt>
                <dd className="tnum shrink-0 text-sm font-medium">
                  {formatMoney(line.amount, { compactDecimals: true })}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex items-baseline justify-between gap-6 border-t border-line-strong bg-surface-sunken px-5 py-4">
            <span className="font-display text-sm font-semibold tracking-tight">
              You pay
            </span>
            <span className="tnum font-display text-xl font-bold tracking-tight">
              {formatMoney(example.total, { compactDecimals: true })}
            </span>
          </div>

          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-content-tertiary">
            Delivered in {example.etaDays[0]}–{example.etaDays[1]} days.{" "}
            {example.estimated
              ? "Duty is estimated from the product band; the final rate is set by HS classification at clearance and any difference is ours, not yours."
              : "Duty confirmed against the classified HS code."}
          </p>
        </figure>
      </div>
    </section>
  );
}
