# Testing Guide

Korgen Kassa POS has two independent test layers:

| Layer | Tool | Scope | Location |
|---|---|---|---|
| **Unit / Integration** | [Vitest](https://vitest.dev/) | Pure business logic (calculations, sync queue) | `src/tests/*.test.ts` |
| **End-to-End (E2E)** | [Playwright](https://playwright.dev/) | Full browser flows against a real running server | `src/tests/e2e/*.spec.ts` |

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Running Tests](#running-tests)
   - [Unit Tests](#unit-tests-vitest)
   - [E2E Tests](#e2e-tests-playwright)
3. [Configuration](#configuration)
4. [Unit Test Scenarios](#unit-test-scenarios)
   - [Cart Calculations](#cart-calculations-carttestts)
   - [Refund Calculations](#refund-calculations-refundtestts)
   - [Loyalty Points](#loyalty-points-loyaltytestts)
   - [Offline Sync Queue](#offline-sync-queue-synctestts)
5. [E2E Test Scenarios](#e2e-test-scenarios)
   - [Authentication](#authentication-authspects)
   - [Products](#products-productsspects)
   - [POS Sales](#pos-sales-salesspects)
   - [Receipt Printing](#receipt-printing-receiptspects)
   - [Split Payment](#split-payment-split-paymentspects)
   - [Offline Mode](#offline-mode-offlinespects)
   - [Customer & Loyalty](#customer--loyalty-customer-loyaltyspects)
6. [Test Helpers](#test-helpers)
7. [Environment Setup for E2E](#environment-setup-for-e2e)
8. [CI Behaviour](#ci-behaviour)
9. [Adding New Tests](#adding-new-tests)

---

## Quick Start

```bash
# Unit tests (no server needed)
pnpm test

# E2E tests (starts dev server automatically)
pnpm test:e2e
```

---

## Running Tests

### Unit Tests (Vitest)

Unit tests run in a `jsdom` environment and require no database or running server.

```bash
# Run once and exit
pnpm test --run

# Watch mode (re-runs on file change)
pnpm test

# Interactive UI browser
pnpm test:ui

# Run a single file
pnpm test --run src/tests/cart.test.ts

# Run tests matching a name pattern
pnpm test --run --grep "refund"
```

**Current output:**

```
Test Files  4 passed (4)
     Tests  47 passed (47)
```

### E2E Tests (Playwright)

E2E tests run against a real Next.js server. The Playwright config automatically starts `pnpm dev` on `http://localhost:3000` before tests begin. If the server is already running on that port, it is reused.

```bash
# Run all E2E tests (headless Chromium)
pnpm test:e2e

# Interactive UI mode (shows a browser + trace inspector)
pnpm test:e2e:ui

# Run a single spec file
pnpm test:e2e src/tests/e2e/auth.spec.ts

# Run tests matching a title pattern
pnpm test:e2e --grep "Receipt"

# Show the HTML report after a run
pnpm exec playwright show-report

# Record new tests visually (codegen)
pnpm exec playwright codegen http://localhost:3000
```

> **Note:** E2E tests require a seeded database with `admin@example.com` / `admin123456` and `cashier@example.com` / `cashier123456`. Run `pnpm db:seed` first.

---

## Configuration

### Vitest (`vitest.config.ts`)

| Setting | Value | Notes |
|---|---|---|
| `environment` | `jsdom` | Browser-like globals (window, document) |
| `setupFiles` | `src/tests/setup.ts` | Loads `@testing-library/jest-dom` matchers |
| `include` | `**/*.test.ts`, `**/*.test.tsx` | Only files ending in `.test.*` |
| `exclude` | `**/e2e/**`, `**/*.spec.ts` | Playwright specs are excluded from Vitest |
| `resolve.alias` `@` | `./src` | Matches Next.js path alias |

### Playwright (`playwright.config.ts`)

| Setting | Value | Notes |
|---|---|---|
| `testDir` | `./src/tests/e2e` | All `*.spec.ts` files |
| `fullyParallel` | `false` | Sequential — avoids DB conflicts between tests |
| `workers` | `1` | Single-worker to preserve test order |
| `retries` | `2` (CI) / `0` (local) | Flaky test protection in CI |
| `browser` | Chromium (Desktop) | Only Chromium for now |
| `trace` | `on-first-retry` | Trace file saved on first retry |
| `screenshot` | `only-on-failure` | Screenshot saved on assertion failure |
| `video` | `retain-on-failure` | Video saved on test failure |
| `webServer` | `pnpm dev` on port `3000` | Auto-starts — reuses existing server locally |

---

## Unit Test Scenarios

### Cart Calculations (`cart.test.ts`)

Tests the pure arithmetic functions used by the POS cart store.

| # | Test | Input | Expected |
|---|---|---|---|
| 1 | Calculates subtotal correctly | `[{price:10, qty:2}, {price:5.5, qty:1}]` | `25.5` |
| 2 | Applies fixed discount | Subtotal `25.5`, discount `$5` fixed | `5.00` deducted |
| 3 | Applies percent discount | Subtotal `25.5`, discount `10%` | `≈ 2.55` deducted |
| 4 | Caps fixed discount at subtotal | Discount `$100` on subtotal `$25.5` | Capped at `$25.5` |
| 5 | Calculates tax on discounted subtotal | Sub `25.5`, disc `$5`, rate `10%` | Tax `≈ $2.05` |
| 6 | Calculates total correctly | Sub `25.5`, disc `$5`, tax `$2.05` | Total `≈ $22.55` |

**File:** `src/tests/cart.test.ts`

---

### Refund Calculations (`refund.test.ts`)

Tests the guard-rail functions that prevent over-refunding.

#### `itemRefundMax` — maximum refundable per line item

| Test | Input | Expected |
|---|---|---|
| Standard item (price × qty) | price `$10`, qty `2` | `$20.00` |
| Single-unit item | price `$5.99`, qty `1` | `$5.99` |
| Decimal quantity (kg) | price `$4.00`, qty `0.5 kg` | `$2.00` |

#### `clampRefund` — bounds enforcement

| Test | Input | Expected |
|---|---|---|
| Within bounds | amount `$10`, saleTotal `$50` | `$10` |
| Exceeds sale total (full refund capped) | amount `$100`, saleTotal `$50` | `$50` |
| Negative amount | amount `−$5`, saleTotal `$50` | `$0` |

#### `partial refund flow` — multi-refund validation (saleTotal `$75.00`)

| Test | Existing refunds | Requested | Valid? |
|---|---|---|---|
| First partial refund | none | `$25` | ✅ |
| Full refund | none | `$75` | ✅ |
| Exceeds total | none | `$80` | ❌ |
| Second partial (within limit) | `[$25]` | `$40` | ✅ |
| Second partial (would exceed) | `[$50]` | `$30` | ❌ |
| Exact remaining balance | `[$25, $25]` | `$25` | ✅ |

#### `totalRefunded` — cumulative sum

| Test | Input | Expected |
|---|---|---|
| Sums existing + requested | existing `[$10, $15]`, requested `$5` | `$30` |
| No prior refunds | existing `[]`, requested `$20` | `$20` |

**File:** `src/tests/refund.test.ts`

---

### Loyalty Points (`loyalty.test.ts`)

Tests all loyalty maths: earning, redeeming, balance tracking, and full round-trip flows.

#### `earnPoints` — points awarded per purchase

| Test | Sale total | Earn rate | Expected points |
|---|---|---|---|
| 1 pt per dollar | `$50` | `1` | `50` |
| Fractional total (floor) | `$15.99` | `1` | `15` (floor) |
| Half-point rate | `$100` | `0.5` | `50` |
| Zero-total order | `$0` | `1` | `0` |
| Loyalty disabled (rate = 0) | `$100` | `0` | `0` |

#### `redeemPoints` — converting points to discount value

| Test | Points | Redeem rate | Max% | Order total | Expected value |
|---|---|---|---|---|---|
| Standard conversion | `100` pts | `$0.01/pt` | `100%` | `$50` | `$1.00` |
| Capped at 50% of order | `10 000` pts | `$0.01/pt` | `50%` | `$50` | `$25.00` |
| 100% redemption allowed | `1 000` pts | `$0.01/pt` | `100%` | `$5` | `$5.00` |
| Zero points | `0` pts | `$0.01/pt` | `50%` | `$100` | `$0.00` |

#### `updateBalance` — net balance after a transaction

| Test | Current | Earned | Redeemed | New balance |
|---|---|---|---|---|
| Earn only | `100` | `+15` | `0` | `115` |
| Redeem only | `200` | `0` | `−50` | `150` |
| Earn and redeem same transaction | `100` | `+20` | `−30` | `90` |
| Never below zero | `10` | `0` | `−50` | `0` |

#### `monetaryToPoints` — inverse conversion

| Test | Value | Redeem rate | Expected points consumed |
|---|---|---|---|
| Even conversion | `$1.00` | `$0.01/pt` | `100` pts |
| Fractional (ceiling) | `$0.015` | `$0.01/pt` | `2` pts (ceiling) |

#### Full loyalty round-trip flow

Simulates two consecutive purchases:

1. First purchase `$50` @ 1 pt/$: balance `0 → 50`
2. Second purchase `$30`: redeem `50 pts` = `$0.50` discount; earn `30 pts`; balance `50 − 50 + 30 = 30`

**File:** `src/tests/loyalty.test.ts`

---

### Offline Sync Queue (`sync.test.ts`)

Tests the `replayOfflineQueue` function from `src/lib/sync.ts`. PGLite is mocked via `vi.mock`; fetch is stubbed via `vi.stubGlobal`.

#### `getSyncStatus`

| Test | Expected |
|---|---|
| Returns a valid status string | One of `"idle" \| "syncing" \| "synced" \| "error"` |

#### `onSyncStatusChange` — subscription management

| Test | Scenario | Expected |
|---|---|---|
| Callback fires during replay | Empty queue replay | Callback receives `"synced"` |
| Unsubscribe stops notifications | Unsub before replay | Callback never called |

#### Empty queue

| Test | Expected |
|---|---|
| Emits `"synced"` immediately | No items pending | Status sequence `["synced"]` |
| Does not call `markSynced` | No items | `markSynced` never called |

#### Successful items (2 pending items, fetch returns `ok: true`)

| Test | Expected |
|---|---|
| Emits `"syncing"` then `"synced"` | Both items succeed | Status sequence `["syncing", "synced"]` |
| Calls `fetch` for each item | 2 items | `fetch` called twice with correct endpoint + method |
| Calls `markSynced` for each item | 2 items | `markSynced(1)` and `markSynced(2)` |

#### Fetch failure

| Test | Scenario | Expected |
|---|---|---|
| Emits `"error"` on partial failure | Item 1 ok, item 2 returns 500 | Status sequence `["syncing", "error"]` |
| Emits `"error"` on network error | Fetch throws | Status sequence `["syncing", "error"]` |
| Still marks succeeded items synced | Item 1 ok, item 2 fails | `markSynced(10)` called; item `11` not marked |

**File:** `src/tests/sync.test.ts`

---

## E2E Test Scenarios

All E2E tests run in Chromium against `http://localhost:3000`.  
Seed credentials required: `admin@example.com` / `admin123456`, `cashier@example.com` / `cashier123456`.

---

### Authentication (`auth.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Unauthenticated redirect | Navigate to `/pos` without login | Redirected to `/login` |
| Wrong password | Submit wrong password for admin | Stay on `/login`; error message visible |
| Admin login | Login as admin | Redirected to `/pos`; can navigate to `/settings` |
| Cashier role restriction | Login as cashier, navigate to `/settings` | Redirected back to `/pos` |

---

### Products (`products.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Create a product | Fill form (name, price, stock), submit | Redirected to `/products`; product visible in list |
| Product appears in POS search | Login, search for the new product in POS | Product name visible in dropdown |
| Low-stock indicator | Create product with stock `1` and threshold `5` | Low-stock badge visible on product row |

---

### POS Sales (`sales.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Add product to cart via search | Search product name, click first result | Cart count shows `Cart (1)` |
| Complete a CASH sale | Add product → select CASH → click Charge | Receipt modal appears; cart clears; a row appears in `/sales` |
| Hold and recall order | Add product → Hold Order → Recall → click Recall in modal | Cart refills with the held item |

---

### Receipt Printing (`receipt.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Print button visible after sale | Complete sale | Receipt modal shows, Print button visible, `#receipt-print` contains "TOTAL" |
| Close without printing | Complete sale; click close (X) | Modal dismissed; cart shows "Cart is empty" |

---

### Split Payment (`split-payment.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Split tender (cash + card) | Add product; enter cash portion; verify Charge visible; total shown | Charge button visible; totals rendered in payment panel |
| Change due on over-tendered cash | Add product; select CASH; enter `$100` | "Change" label visible in payment panel |

---

### Offline Mode (`offline.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Offline indicator appears | Go to `/pos`; call `context.setOffline(true)` | "Offline" indicator visible within 5 s |
| Cart usable while offline | Go offline; search and add a product from the quick-grid | Item added to cart |
| Synced status after reconnect | Go offline briefly; call `setOffline(false)` | "Synced" / "Online" indicator visible within 10 s |

---

### Customer & Loyalty (`customer-loyalty.spec.ts`)

| Test | Steps | Expected |
|---|---|---|
| Attach customer to sale | Type in CustomerCapture field; select from dropdown | Customer name remains in capture field |
| Loyalty points label on receipt | Add product, attach customer, complete CASH sale | Receipt modal renders (content includes total) |
| Loyalty balance on customer profile | Open `/customers`; click first customer row | Profile page shows "Points" / "Loyalty" / "Balance" label |

---

## Test Helpers

**`src/tests/e2e/helpers.ts`** exports two shared login utilities:

```typescript
loginAsAdmin(page)   // logs in as admin@example.com / admin123456
loginAsCashier(page) // logs in as cashier@example.com / cashier123456
```

Both functions navigate to `/login`, fill the form, submit, and wait for a redirect to `/pos` (10 s timeout). Use them in `test.beforeEach` to avoid repeating login steps.

---

## Environment Setup for E2E

### 1. Seed the database

E2E tests expect pre-seeded admin and cashier users, plus at least a few products (e.g. "Coffee"):

```bash
pnpm db:seed
```

### 2. Required seed data

| Entity | Value |
|---|---|
| Admin user | email: `admin@example.com`, password: `admin123456`, role: `ADMIN` |
| Cashier user | email: `cashier@example.com`, password: `cashier123456`, role: `CASHIER` |
| Sample products | At least one product named "Coffee" (used in most POS tests) |

### 3. Environment variables

Copy `.env.example` to `.env` and set `DATABASE_URL` before running E2E tests. The `BETTER_AUTH_SECRET` must also be set.

### 4. Install Playwright browsers (first time)

```bash
pnpm exec playwright install chromium
```

---

## CI Behaviour

| Setting | CI value | Reason |
|---|---|---|
| `retries` | `2` | Flaky-test protection |
| `workers` | `1` | Prevent parallel DB writes |
| `reporter` | `github` | Annotates PRs with failing test names |
| `forbidOnly` | `true` | Fails if `test.only` is left in code |
| `reuseExistingServer` | `false` | Always starts a fresh server in CI |

Artifacts saved on failure: trace file (`.zip`), screenshot (`.png`), video (`.webm`). Find them in the `playwright-report/` directory.

---

## Adding New Tests

### New unit test

1. Create `src/tests/my-feature.test.ts`.
2. Import `{ describe, it, expect }` from `"vitest"`.
3. Keep all helpers as pure functions — no imports from Next.js, Prisma, or browser APIs.
4. Run: `pnpm test --run src/tests/my-feature.test.ts`

### New E2E test

1. Create `src/tests/e2e/my-feature.spec.ts`.
2. Import `{ test, expect }` from `"@playwright/test"` and `{ loginAsAdmin }` from `"./helpers"`.
3. Use `test.beforeEach` to log in if every test needs authentication.
4. Run: `pnpm test:e2e src/tests/e2e/my-feature.spec.ts`

### Naming conventions

| Type | File pattern | Example |
|---|---|---|
| Unit | `*.test.ts` | `discount.test.ts` |
| E2E | `*.spec.ts` | `discount.spec.ts` |
| Shared helpers | `helpers.ts` | `src/tests/e2e/helpers.ts` |
