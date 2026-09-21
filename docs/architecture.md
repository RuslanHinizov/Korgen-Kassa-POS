# Architecture

Technical overview of the current Korgen Kassa POS codebase.

Last validated against code: 2026-03-14.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Application Routes](#application-routes)
- [API Routes](#api-routes)
- [Authentication and Authorization](#authentication-and-authorization)
- [Data Model](#data-model)
- [Offline Architecture](#offline-architecture)
- [Internationalization](#internationalization)
- [Plugin System](#plugin-system)
- [Caching and Rendering](#caching-and-rendering)
- [Testing](#testing)

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.1.6 (App Router) | React 19.2.3, TypeScript strict |
| UI | Tailwind CSS 4 + shadcn/ui primitives | Custom components are also used heavily |
| ORM | Prisma 7.4.x | Client generated to `src/generated/prisma` |
| Database | PostgreSQL | Primary server database |
| Offline DB | PGLite (`@electric-sql/pglite`) | Browser IndexedDB-backed local Postgres |
| Auth | Better Auth 1.5.x | Email/password, cookie sessions, user role field |
| Forms/Validation | Zod + react-hook-form | Mixed with controlled React state on several pages |
| State | Zustand | POS cart state in `src/store/cart.ts` |
| i18n | next-intl | Locale from cookie or business settings |
| Testing | Vitest + Playwright | Unit and E2E coverage |
| Package Manager | pnpm | Scripts in `package.json` |

---

## Project Structure

```text
olgax-pos/
├── docs/                          # Public project docs
├── messages/                      # next-intl locale files (14 locales)
├── plugins/
│   └── example/                   # Example plugin manifest + code
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   ├── seed.ts
│   └── reset-db.ts
├── public/
│   ├── manifest.json
│   ├── site.webmanifest
│   ├── sw.js
│   └── *.png / favicon assets
├── src/
│   ├── app/
│   │   ├── (app)/                 # Authenticated app pages
│   │   ├── (auth)/login/          # Login page
│   │   ├── actions/               # Server Actions (settings, products, locale)
│   │   ├── api/                   # Route Handlers
│   │   ├── setup/                 # First-run setup wizard
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx               # Redirects to /pos
│   ├── components/                # UI and feature components
│   ├── generated/prisma/          # Generated Prisma client
│   ├── hooks/
│   ├── i18n/
│   ├── lib/                       # auth/db/sync/storage/plugins/utils
│   ├── store/
│   ├── tests/                     # Vitest + Playwright tests
│   ├── types/
│   └── proxy.ts                   # Edge auth/setup guard
├── next.config.ts
├── playwright.config.ts
└── vitest.config.ts
```

Notes:
- `public/uploads/` is not committed, but is created at runtime when local storage uploads are used.
- Data mutations are split between Server Actions and API routes (both patterns are used today).

---

## Application Routes

| Route | Access in code | Description |
|---|---|---|
| `/` | Public | Redirects to `/pos` |
| `/login` | Public (redirected to `/pos` if session cookie exists) | Login screen |
| `/setup` | Public when setup is incomplete | Setup wizard |
| `/pos` | Any authenticated session | POS checkout |
| `/products` | Any authenticated session | Product list |
| `/products/new` | Any authenticated session | New product form |
| `/products/[id]` | Any authenticated session | Product detail + stock adjustment history |
| `/products/[id]/edit` | Any authenticated session | Edit product |
| `/customers` | Any authenticated session | Customer management |
| `/customers/[id]` | Any authenticated session | Customer profile |
| `/suppliers` | Any authenticated session | Suppliers page |
| `/sales` | Any authenticated session | Sales history |
| `/reports` | Enforced ADMIN in page code | Reports dashboard |
| `/settings` | Enforced ADMIN in page code | Business/device settings + plugins panel |
| `/settings/profile` | Any authenticated session | Personal profile settings (edit name/email, change password) |
| `/settings/users` | Enforced ADMIN in page code | User accounts management (view, create, edit, delete users) |

Important:
- Sidebar navigation hides admin pages for cashier users.
- Route-level ADMIN checks are explicitly enforced in `reports`, `settings`, and `settings/users` pages.

---

## API Routes

### Auth and setup

| Route | Methods | Auth requirement |
|---|---|---|
| `/api/auth/[...all]` | GET, POST | Better Auth handler |
| `/api/ping` | GET | None |
| `/api/setup/status` | GET | None |
| `/api/setup/migrate` | POST | None (setup flow endpoint) |
| `/api/setup/admin` | POST | None (setup flow endpoint) |
| `/api/setup/complete` | POST | None (blocked if already setup complete) |

### POS/business APIs

| Route | Methods | Auth requirement |
|---|---|---|
| `/api/products/search` | GET | None |
| `/api/sales` | POST | Authenticated |
| `/api/sales/export` | GET | Authenticated |
| `/api/sales/[id]/refund` | POST | ADMIN |
| `/api/reports` | GET | ADMIN |
| `/api/customers` | GET, POST | Authenticated |
| `/api/customers/[id]` | PUT, DELETE | Authenticated |
| `/api/customers/duplicates` | GET | Authenticated |
| `/api/customers/merge` | POST | Authenticated |
| `/api/suppliers` | GET, POST | GET: Authenticated, POST: ADMIN |
| `/api/suppliers/[id]` | PUT, DELETE | ADMIN |
| `/api/held-orders` | GET, POST, DELETE | Authenticated |
| `/api/loyalty` | GET | Authenticated |
| `/api/stock-adjustments` | GET, POST | GET: Authenticated, POST: ADMIN |
| `/api/settings` | GET | None |
| `/api/upload` | POST | ADMIN |

### Users APIs

| Route | Methods | Auth requirement |
|---|---|---|
| `/api/users` | GET, POST | ADMIN |
| `/api/users/[id]` | DELETE | ADMIN |
| `/api/users/[id]/update` | PUT | ADMIN |
| `/api/users/me/profile` | PUT | Authenticated |
| `/api/users/me/change-password` | POST | Authenticated |

Notes:
- `settings` writes are done through a Server Action (`src/app/actions/settings-actions.ts`), not a PUT API route.
- `products` create/update/delete are done through Server Actions (`src/app/actions/product-actions.ts`).

---

## Authentication and Authorization

Auth flow:
1. User logs in from `/login` using Better Auth client (`signIn.email`).
2. Better Auth sets session cookies.
3. `src/proxy.ts` checks setup cookie and session cookie on requests.
4. Protected routes redirect unauthenticated users to `/login`.
5. Server components and APIs fetch full session via `auth.api.getSession({ headers })` when needed.

Role model:
- Roles are stored on `User.role` enum (`ADMIN`, `CASHIER`).
- ADMIN-only checks are enforced on:
  - `/reports` page
  - `/settings` page
  - admin API endpoints (refunds, reports, upload, supplier writes, stock-adjust POST)
- Several authenticated pages and APIs are role-open (session required but not ADMIN-only).

Setup gating:
- Setup completion cookie: `olgax-setup-complete`.
- If setup is incomplete (or required env vars missing), middleware redirects to `/setup`.

---

## Data Model

Models are defined in `prisma/schema.prisma`.

Core enums:
- `Role`: `ADMIN | CASHIER`
- `SaleStatus`: `COMPLETED | VOIDED | REFUNDED`
- `PaymentMethod`: `CASH | CARD | OTHER`
- `StockAdjReason`: `RECEIVED | DAMAGED | THEFT | CORRECTION | OPENING_COUNT`
- `LoyaltyLogType`: `EARN | REDEEM | ADJUST`

Core models (summary):

### Product
- `id, name, sku, barcode, price, cost, stock, category, imageUrl, lowStockThreshold, active, supplierId, createdAt, updatedAt`

### Supplier
- `id, name, contactName, phone, email, notes, createdAt, updatedAt`

### Customer
- `id, name, phone, email, notes, loyaltyPoints, createdAt, updatedAt`

### Sale
- `id, userId, customerId, subtotal, taxRate, taxAmount, discountAmount, tipAmount, total, paymentMethod, paymentLines (Json), amountTendered, changeDue, status, voidReason, notes, createdAt`

### SaleItem
- `id, saleId, productId, name, price, quantity, total, notes`

### Refund
- `id, saleId, userId, amount, reason, items (Json), restoreStock, createdAt`

### HeldOrder
- `id, label, cartSnapshot (Json), createdAt`

### StockAdjustment
- `id, productId, userId, delta, reason, note, createdAt`

### LoyaltyLog
- `id, customerId, saleId, delta, type, note, createdAt`

### BusinessSettings (singleton row)
- `id="singleton"`
- Branding and locale: `name, logoUrl, primaryColor, accentColor, language`
- Financial: `currency, currencyDecimals, taxRate, taxName, receiptFooter`
- Loyalty: `loyaltyEnabled, loyaltyEarnRate, loyaltyRedeemValue`
- Inventory/storage/setup: `lowStockThreshold, storageProvider, storageRegion, storageBucket, storageEndpoint, storageAccessKey, storageSecretKey, storagePublicUrl, setupComplete`
- Timestamps: `createdAt, updatedAt`

Auth models (Better Auth):
- `User, Session, Account, Verification`

---

## Offline Architecture

Offline stack:
- Browser PGLite instance at `idb://olgax-pos`
- Local tables:
  - `sync_queue` for queued writes (`endpoint`, `method`, `payload`, status fields)
  - `products_cache` for offline product lookup
- Sync engine in `src/lib/sync.ts`
- Connectivity and replay orchestration in `src/hooks/use-online-status.ts`

Behavior:
1. When offline writes are queued, they are stored in `sync_queue`.
2. On connectivity regain, `replayOfflineQueue()` replays queued requests.
3. Status transitions are exposed as `offline | syncing | synced` for UI badges.
4. Product cache seeding is attempted from the API when online.

---

## Internationalization

- Implemented with `next-intl` using `src/i18n/request.ts`.
- Locale selection order:
  1. `olgax_locale` cookie
  2. `BusinessSettings.language`
  3. fallback `en`
- Supported locales in code:
  - `en, si, ta, fr, es, de, ar, zh, hi, pt, ja, ko, id, ru`
- Messages are loaded from `messages/<locale>.json`.
- Locale cookie writes are done via Server Action: `src/app/actions/locale-actions.ts`.

---

## Plugin System

- Lightweight in-process hook registry in `src/lib/plugins.ts`.
- Current hook names:
  - `onSaleComplete`
  - `onProductUpdate`
  - `onCheckoutRender`
- Plugin manifests are represented via `PluginManifest` type and surfaced in settings UI (`PluginsPanel`).
- Example plugin exists under `plugins/example`.

---

## Caching and Rendering

- Dynamic rendering is used for server data pages (`export const dynamic = "force-dynamic"`).
- `unstable_noStore()` is used in server pages that fetch frequently changing data.
- Router dynamic cache is disabled in `next.config.ts`:

```ts
experimental: {
  staleTimes: {
    dynamic: 0,
  },
}
```

- Sidebar links use `prefetch={false}` to avoid stale prefetch payloads.
- Service worker is registered in root layout and served from `public/sw.js`.

---

## Testing

Test stack:
- Unit/integration: Vitest (`src/tests/*.test.ts`)
- E2E: Playwright (`src/tests/e2e/*.spec.ts`)

Current test coverage includes:
- Cart behavior
- Loyalty and refund logic
- Offline sync behavior
- Auth flow
- Products, sales, receipts, split payments, offline E2E paths
