# Freightly

**Rates, ranked. The cheapest box that actually ships.**

Freightly is a shipping-rate **decision** tool for small e-commerce sellers. Rate
aggregators (Shippo, EasyPost) return a *list of prices and stop*. Freightly takes
real multi-carrier rates and adds the judgment a price list can't — **reliability,
pickup-vs-drop-off, and drop-off hours** — then an agent **picks one carrier and
explains why**.

> Shippo is the pipe; Freightly is the brain on the pipe.

We consume Shippo for live prices/ETAs. Reliability, pickup availability, and
drop-off hours are not in any rate API — those are Freightly's **seeded value-add
layer**, merged onto Shippo's results by carrier name. That merge is the whole
differentiation.

---

## How it works

```
Frontend (form) ──POST shipment──▶ /api/rates (agent)
                                       │ getRates tool
                                       ├─▶ Shippo        (live prices + ETA per carrier/service)
                                       └─▶ CARRIER_META  (seeded: reliability, pickup, drop-off hours)
                                       │ agent ranks + recommends one carrier
                                       ▼
                                  Supabase  (insert quote row)
Frontend (history) ◀──read quotes── Supabase
```

1. You enter a shipment (addresses, box dimensions, weight, category).
2. `/api/rates` runs a single orchestrator **agent** (AI SDK + Vercel AI Gateway)
   whose only tool is `getRates`.
3. `getRates` fetches **live** rates from Shippo and merges them with the seeded
   `CARRIER_META` (reliability, on-time %, scheduled-pickup cost, drop-off hours +
   coordinates, and a computed open/closing-soon/closed status and distance).
4. The agent recommends **one** carrier + service and explains the trade-off.
   If the agent is unavailable, a deterministic fallback applies the same rules.
5. Every quote (ranked options + recommendation) is saved to **Supabase** and shown
   in a history view you can click to re-open.

---

## Tech stack

- **Next.js** (App Router, TypeScript) — single page + two API routes
- **Plain CSS** (no Tailwind) — `app/globals.css`
- **AI SDK** + **Vercel AI Gateway** — the orchestrator agent (`generateText` + a tool)
- **Shippo** (test mode) — live multi-carrier rates
- **Supabase** — quote store + history (not the rate source)
- **Leaflet** (via CDN) — pickup / drop-off map
- Fonts: Archivo + IBM Plex Sans/Mono via `next/font`

---

## Project structure

```
lib/
  shippo.ts        # Shippo client + raw rate fetch (with flakiness handling)
  carrierMeta.ts   # seeded value-add layer, keyed by Shippo provider name
  getRates.ts      # merges Shippo rates + meta → typed RateOption[]
  supabase.ts      # server Supabase client (service-role key)
  types.ts         # shared types (Shipment, RateOption, RatesResult, Quote, …)
app/
  api/rates/route.ts   # the agent: getRates tool, rank, recommend, save quote
  api/quotes/route.ts  # GET saved quotes for history
  page.tsx             # single page: form + recommended + map + options + history
  layout.tsx           # fonts + Leaflet CSS
  globals.css
db/
  schema.sql       # the `quotes` table DDL
scripts/
  test-supabase.mjs    # Part A connection check
  test-rates.ts        # getRates acceptance check (NY → MA)
  test-rates-random.ts # two random routes
  shot.mjs             # headless screenshot helper
```

---

## Setup

### 1. Install

```bash
npm install
```

> **Local TLS note:** if your machine runs a TLS-inspecting agent (corporate proxy,
> some AV), Node won't trust its certificate and every HTTPS call fails with
> `fetch failed`. The npm scripts set `NODE_OPTIONS=--use-system-ca` (via `cross-env`)
> so Node trusts the OS certificate store. This requires **Node 22+** (pinned in
> `engines`). On Vercel/Linux it's harmless.

### 2. Environment (`.env.local` — gitignored)

Copy `.env.local.example` → `.env.local` and fill in:

```
AI_GATEWAY_API_KEY=          # Vercel AI Gateway key (or rely on OIDC in prod)
SHIPPO_API_KEY=shippo_test_… # Shippo TEST token (Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=   # server-only — never expose to the client
```

### 3. Supabase

Create a project, then run [`db/schema.sql`](db/schema.sql) in the SQL editor.
Verify the connection:

```bash
node --use-system-ca --env-file=.env.local scripts/test-supabase.mjs
```

### 4. Shippo

Use a **test** token (`shippo_test_…`). In **Settings → Carriers**, enable the test
carrier accounts (USPS, UPS, FedEx) so rate calls return multiple carriers.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## The agent (and its fallback)

`/api/rates` runs one orchestrator agent with a single `getRates` tool. Its rules:

- never recommend an option whose drop-off is **closed**;
- default to **cheapest**, but pay a small premium (~15%) for clearly higher
  reliability, or a door pickup over a far/closing drop-off;
- state the reasoning in a sentence or two.

If the agent call fails (e.g. the AI Gateway isn't provisioned), a **deterministic
fallback** applies the same rules so the app keeps working — the agent is primary,
the fallback is a safety net.

### ⚠️ Vercel AI Gateway requires a card on file

The AI Gateway returns a `403 customer_verification_required` until a **credit card
is added to the Vercel team** (this unlocks the free credits — it isn't a charge).
Until then you'll get the deterministic fallback recommendation instead of real AI
reasoning. Add a card here:
`https://vercel.com/d?to=/[team]/~/ai?modal=add-credit-card`

Alternative: bypass the gateway and call a provider directly (e.g. `@ai-sdk/anthropic`
with an `ANTHROPIC_API_KEY`).

---

## Shippo test-mode flakiness

In test mode, each Shippo call returns a **random subset** of rates (often just the
fast USPS master account), and it collapses *concurrent* identical requests. So
`fetchShippoRates` makes **sequential** calls and keeps the richest response,
stopping early once it sees a full multi-carrier set. This is a test-mode quirk;
production tokens are consistent.

Other gotchas: `estimated_days` can be `null` (UI shows "ETA n/a"); `amount` is a
string (we `Number()` it); units are `cm`/`kg`.

---

## Deploy on Vercel

1. Import the repo in Vercel (auto-detects Next.js; default build command).
2. Add the four env vars above under **Settings → Environment Variables**
   (Production + Preview). `SUPABASE_SERVICE_ROLE_KEY` must **not** be `NEXT_PUBLIC`.
3. Ensure **Node.js Version = 22.x** (also pinned via `engines`).
4. Add a credit card to the AI Gateway (see above) for real AI recommendations.

Supabase is already cloud — no Vercel-side setup beyond the env vars.

---

## Demo script

1. **Light-but-bulky box** (3 kg, 90×60×50) **NY → MA**: volumetric weight reshuffles
   the cheapest carrier — the recommendation explains it (billable ~54 kg).
2. Run near a drop-off's closing time so a cheap drop-off carrier shows
   "closes in Nh" and a door-pickup carrier wins instead.
3. Open the history view to show saved quotes pulling from Supabase.

> Use a **NY origin** for the demo: it reliably returns multiple carriers, and the
> seeded drop-off coordinates are in NYC (so the map + distance are meaningful).

---

## Roadmap (Phase 2)

- **Eligibility agent** — category (hazmat/perishable/fragile/high-value/oversized)
  → required service features / excluded carriers, before rates.
- **Timeline agent** — manufacturing time → ship-ready date → achievable delivery,
  flag deadline risk.
- **Geocoding** — derive origin lat/lng from the address (removes the manual fields).
- **Resend** — email the chosen quote.
- Move `CARRIER_META` into a Supabase table so it's editable without a deploy.
