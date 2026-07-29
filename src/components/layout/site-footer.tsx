import Link from "next/link";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { label: "All products", href: "/search" },
      { label: "Ready in Accra", href: "/search?fulfillment=in_house" },
      { label: "Order to ship", href: "/search?fulfillment=order_to_ship" },
      { label: "Brands", href: "/brands" },
    ],
  },
  {
    heading: "Importing",
    links: [
      { label: "How order to ship works", href: "/how-it-works" },
      { label: "Duties &amp; VAT explained", href: "/duties" },
      { label: "Delivery times by region", href: "/delivery" },
      { label: "Request a quote", href: "/sourcing" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Track an order", href: "/orders" },
      { label: "Returns &amp; warranty", href: "/returns" },
      { label: "Contact us", href: "/contact" },
      { label: "Sell on Nyansa", href: "/vendors" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface-sunken">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-xl font-extrabold tracking-tight">nyansa</span>
              <span className="size-1.5 translate-y-[-2px] rounded-full bg-brass-500" aria-hidden />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-content-secondary">
              Premium brands, honestly priced, delivered across Ghana. Buy from stock in Accra or
              order to ship from abroad — duties included, no surprises at clearing.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-content-secondary transition-colors hover:text-content"
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs text-content-tertiary sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Nyansa Commerce Ltd. Accra, Ghana.</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>MTN MoMo</span>
            <span>Telecel Cash</span>
            <span>AT Money</span>
            <span>Visa</span>
            <span>Mastercard</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
