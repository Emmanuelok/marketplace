# Nyansa

A premium branded-goods marketplace for Ghana. Apple, Samsung, Sony, LG, Whirlpool, Dyson and
others — sold two ways:

- **Ready in Accra** — physically in the warehouse, delivered in 1–3 days, warranty honoured at a
  service centre inside Ghana.
- **Order to ship** — bought on the customer's behalf from the US, UK, Canada, China, UAE or
  Germany and imported. The quoted price is the **landed** price: international freight, import
  duty, VAT and every statutory levy are already in it. Nothing to settle at Tema or Kotoka.

The second model is the reason this codebase exists, and it is where most of the interesting
engineering is.

---

## Why the landed-cost engine is the core of this

Importing into Ghana is not one charge. It is import duty, VAT at 15%, NHIL at 2.5%, the GETFund
levy at 2.5%, the COVID-19 Health Recovery Levy at 1%, the ECOWAS levy, the AU import levy, the EXIM
levy, an inspection fee and an ICUMS processing fee — each computed on a **different base**.

The subtle part, and the one most import calculators get wrong:

> NHIL, GETFund and the COVID levy are charged on the value **after** duty and the CIF-based levies,
> **and they are themselves inside the VAT base**.

Charging them *alongside* VAT rather than *inside* it understates a landed cost by roughly **0.9% of
CIF**. On a GH₵30,000 laptop that is about GH₵270 per unit, quietly eaten out of margin on every
sale. `src/lib/landed-cost.ts` cascades them correctly, and
[`src/lib/landed-cost.test.ts`](src/lib/landed-cost.test.ts) pins the arithmetic with hand-computed
expectations, including an explicit test for the size of that error.

See [docs/landed-cost.md](docs/landed-cost.md) for a fully worked example.

---

## Quickstart

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL at minimum

npm run db:migrate             # apply the committed SQL migrations
npm run db:seed                # ~18 products, brands, FX rates, freight lanes, delivery zones

npm run dev                    # http://localhost:3000
```

The app runs **without** a database — every service degrades to an empty state rather than a 500, so
`npm run dev` on a fresh clone gives you a working shell to look at. It also runs without an
Anthropic key; the concierge returns a clear 503 instead of crashing.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run db:generate` | Generate a SQL migration from the schema (commit the result) |
| `npm run db:migrate` | Apply committed migrations. Non-interactive — this is what CI/deploy runs |
| `npm run db:push` | Diff the schema straight onto the database. **Local development only** — it prompts for confirmation on ambiguous changes and will hang a deploy |
| `npm run db:seed` | Seed reference data and the catalogue (idempotent) |
| `npm run db:studio` | Drizzle Studio |

### Environment

| Variable | Required for | Behaviour without it |
| --- | --- | --- |
| `DATABASE_URL` | Everything data-backed | Pages render empty states; no crash |
| `SESSION_SECRET` | Sessions, cart identity | Throws when a session is first written |
| `ANTHROPIC_API_KEY` | The AI agents | `/api/ai/*` returns 503 with a clear message |
| `ANTHROPIC_MODEL` | — | Defaults to `claude-opus-5` |
| `PAYSTACK_SECRET_KEY` | Live payments | Simulation mode with deterministic fake references |
| `FX_SPREAD_BPS` | FX margin | Defaults to 250 (2.5%) |

`src/lib/env.ts` is the only module permitted to touch `process.env`. Everything else goes through
`env()` or `requireEnv(key, feature)`, so a missing variable produces a message naming both the
variable and the feature that needed it.

---

## Architecture

```
src/
  app/                  Next.js App Router — pages and route handlers
  components/
    ui/                 Design-system primitives
    layout/             Header, footer, navigation
    product/            Product card, landed-cost panel
    home/               Homepage sections
    concierge/          The streaming AI chat surface
  lib/                  Pure domain logic — no I/O, fully unit-tested
    money.ts            Integer minor-unit Money with currency tagging
    ghana.ts            Regions, GhanaPost GPS, phone/MoMo, levy schedule
    landed-cost.ts      The import pricing engine
  server/
    db/                 Drizzle schema, client, seed
    services/           Catalog, pricing, FX — the only layer that queries
    ai/                 Agent registry, tools, and the agentic loop
    http/               Rate limiting, response envelopes
```

Three rules hold the layering together:

1. **Money is never a float.** Every amount is an integer count of pesewas carried in a `Money`
   value that knows its own currency, so a GHS figure cannot be silently added to a USD one.
   Discounts are spread across order lines with `allocateByWeights`, which is exact — line totals
   always re-sum to the order total.
2. **Price is resolved in exactly one place.** `services/pricing.priceVariant()` decides whether a
   price comes from the variant row or from the landed-cost engine. The PDP, the cart and the order
   all call it, so they cannot disagree.
3. **Services never throw at the page.** A missing database or an empty table produces an empty
   state. A storefront that 500s because a table is empty is worse than one that says "nothing here
   yet".

---

## The AI layer

Seven agents are defined in `src/server/ai/registry.ts`. The concierge is the one wired end to end:
it streams into a chat panel, calls real catalog tools, and can walk a customer through an import
breakdown line by line.

The agent loop (`src/server/ai/run.ts`) is written by hand rather than using the SDK's tool runner,
because it needs to persist an audit trail per turn. Three details in it are load-bearing:

- The **full** `response.content` is appended to history, not just the text — dropping `tool_use`
  blocks makes the next request 400.
- **All** tool results go back in a **single** user message. Splitting them across messages trains
  the model to stop making parallel tool calls.
- `stop_reason` is checked **before** reading content, because a refusal is an HTTP 200 with an
  empty content array.

Every run is written to `agent_runs` with tokens, cost, latency and the tools it called. Agent
actions that change customer-visible state are written to `agent_decisions` with a rationale and a
confidence score, so an operator can review what an agent did and why. Logging failures are
swallowed — observability degrading must never break a customer's request.

Model configuration follows the current Claude API: adaptive thinking, effort inside
`output_config`, prompt caching on the system block, and no sampling parameters (they are rejected
on Opus 5).

---

## Ghana-specific behaviour

- **Addressing** is GhanaPost GPS first (`GA-543-0125`), with a landmark description as the
  practical fallback — that is how couriers actually find places.
- **Phone numbers** parse from `+233…`, `233…`, `0…`, bare 9-digit, and the very common
  `+233 (0) 24 123 4567` form, and the MoMo network is detected from the prefix.
- **Payments** target MTN MoMo, Telecel Cash and AT Money alongside card and cash on delivery.
- **Delivery zones** cover all 16 regions. Cash on delivery is withheld in the outer zone, where a
  failed delivery costs more than the order margin.
- **Mobile-first.** Most traffic is on a mid-range phone on metered data, which is why the checkout
  is one page rather than three route hops.

---

## What is and isn't built

**Working end to end**

- The landed-cost engine, with 20 tests covering the levy cascade, chargeable weight, freight modes,
  duty bands and itemisation
- Money primitives, 29 tests
- Ghana domain — regions, GPS addresses, phone/MoMo parsing, 19 tests
- Catalog, pricing and FX services against Drizzle, all degrading gracefully
- The AI agent runtime, the concierge agent with eight catalog tools, and the streaming chat panel
- Design system, app shell, homepage, search/browse, product detail with the landed-cost panel
- Seed data: 18 products, 20 brands, 16 categories, FX rates, 13 freight lanes, 4 delivery zones
- `npm run build`, `npm run typecheck` and `npm test` are all green

**Defined but not yet wired**

- Cart, checkout and orders — the schema, the service contracts and the pricing path exist; the
  pages and server actions do not
- Paystack integration — the schema and payment states exist; the client does not
- The admin console, the vendor portal, and the six non-concierge agents (registry entries and
  prompts exist; no UI or scheduled invocation)
- Auth — the `users` and `sessions` tables exist; there is no sign-in flow

Nothing above is stubbed with fake behaviour. What exists, works; what does not exist, is absent
rather than faked.

---

## Testing

```bash
npm test
```

68 tests over the pure domain logic. The suite deliberately covers the things that are expensive to
get wrong and cheap to verify: float-safety in money conversion, exactness of discount allocation,
the levy cascade, and phone-number formats real customers actually type.

Two real bugs were found and fixed by these tests during development: `parseGhanaPhone` rejected the
`+233 (0) …` form, and the `levyOverrides` type inherited `as const` literal types so it could never
accept a changed rate.
