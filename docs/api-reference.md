# API Reference

Internal REST API endpoints used by the Korgen Kassa POS application. These are not a public external API — they are called by the app's own frontend.

> All endpoints return `application/json`. Unless noted, the request body must be `Content-Type: application/json`.
> All endpoints except `/api/auth/*`, `/api/settings` (GET), and `/api/setup/*` require an authenticated session (cookie set by Better Auth).

---

## Table of Contents

- [Authentication (Better Auth)](#authentication-better-auth)
- [Products](#products)
- [Sales](#sales)
- [Customers](#customers)
- [Suppliers](#suppliers)
- [Held Orders](#held-orders)
- [Loyalty](#loyalty)
- [Stock Adjustments](#stock-adjustments)
- [Settings](#settings)
- [Upload](#upload)
- [Reports](#reports)
- [Health Check](#health-check)
- [Setup Wizard API](#setup-wizard-api)
- [Users](#users)

---

## Authentication (Better Auth)

Authentication is handled by [Better Auth](https://www.better-auth.com/). The catch-all handler lives at `src/app/api/auth/[...all]/route.ts`.

### Sign In

```
POST /api/auth/sign-in/email
```

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "yourpassword"
}
```

**Success Response:**
```json
{
  "token": "...",
  "user": {
    "id": "...",
    "name": "Admin",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

On success, a `better-auth.session_token` cookie is set automatically. The app uses `window.location.href = "/pos"` to force a hard redirect so the cookie is captured on the very next request.

**Error Response (400 / 401):**
```json
{
  "error": { "message": "Invalid email or password", "status": 401 }
}
```

---

### Sign Out

```
POST /api/auth/sign-out
```

Clears the session cookie. No body required.

---

### Get Session

```
GET /api/auth/get-session
```

Returns the current user session or `null`.

**Success Response:**
```json
{
  "user": {
    "id": "...",
    "name": "Admin",
    "email": "admin@example.com",
    "role": "ADMIN",
    "emailVerified": true
  },
  "session": {
    "id": "...",
    "expiresAt": "2026-12-01T00:00:00.000Z"
  }
}
```

---

---

## Products

### GET /api/products/search

Search products by name, SKU, or barcode. Used by the POS product picker and barcode scanner. No authentication required if the session cookie is valid.

**Query Parameters:**

| Parameter | Required | Description |
|---|---|---|
| `q` | Yes | Search string — matched against name (case-insensitive contains), SKU (contains), and barcode (exact). |

**Response:**
```json
[
  {
    "id": "clxyz...",
    "name": "Americano",
    "sku": "BEV-001",
    "barcode": "12345678",
    "price": 4.50,
    "stock": 100
  }
]
```

Returns up to 20 results ordered by name. Returns `[]` for empty queries.

---

## Sales

### GET /api/sales

List completed sales. Supports date range filtering and pagination.

**Query Parameters:**

| Parameter | Description |
|---|---|
| `from` | ISO date string — start of date range (inclusive) |
| `to` | ISO date string — end of date range (inclusive) |
| `limit` | Max results (default 100) |
| `offset` | Pagination offset |

**Response:** Array of sale objects including items, customer, and payment details.

---

### POST /api/sales

Creates a new completed sale. Called at checkout when the cashier confirms payment.

**Body:**
```json
{
  "items": [
    { "productId": "...", "name": "Americano", "price": 4.50, "quantity": 2 },
    { "productId": "...", "name": "Croissant",  "price": 3.00, "quantity": 1, "notes": "no butter" }
  ],
  "paymentMethod": "CASH",
  "amountTendered": 20.00,
  "paymentLines": [
    { "method": "CASH", "amount": 10.00 },
    { "method": "CARD", "amount": 2.00 }
  ],
  "tipAmount": 0,
  "taxRate": 0.16,
  "discountAmount": 5.00,
  "discountType": "fixed",
  "note": "Table 4",
  "customerId": "clxyz...",
  "loyaltyPointsUsed": 50
}
```

- `paymentMethod` — primary method if not split (`CASH | CARD | OTHER`)
- `paymentLines` — optional split-tender breakdown (overrides `paymentMethod` with the largest line's method)
- `discountType` — `"fixed"` (dollar amount) or `"percent"` (percentage of subtotal)
- `loyaltyPointsUsed` — integer; converted to discount at the configured redemption rate

**Success Response:**
```json
{ "ok": true, "saleId": "clxyz..." }
```

**Error Response (400):**
```json
{ "error": { "fieldErrors": { "items": ["Required"] } } }
```

---

### GET /api/sales/export

Downloads the sales list as a UTF-8 CSV file. Supports the same `from`/`to` query parameters as `GET /api/sales`.

**Response:** `Content-Type: text/csv; charset=utf-8` with a `Content-Disposition: attachment` header.

---

### POST /api/sales/[id]/refund

Issues a full or partial refund on a completed sale. Updates the sale status to `REFUNDED`.

**Body:**
```json
{
  "amount": 4.50,
  "reason": "Customer changed mind"
}
```

**Success Response:**
```json
{ "ok": true }
```

**Error Responses:**
```json
{ "error": "Sale not found" }                         // 404
{ "error": "Sale is not in a refundable state" }      // 400
{ "error": "Refund amount exceeds remaining balance" } // 400
```

---

## Customers

### GET /api/customers

List all customers, ordered by name. Optionally filter with `?q=` search query.

**Response:** Array of customer objects with `id`, `name`, `email`, `phone`, `loyaltyPoints`, `createdAt`.

---

### POST /api/customers

Create a new customer.

**Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1 555 0100",
  "notes": "VIP customer"
}
```

**Success Response:**
```json
{ "ok": true, "id": "clxyz..." }
```

---

### GET /api/customers/[id]

Get a single customer with their full purchase history (last 50 sales).

---

### PUT /api/customers/[id]

Update customer fields (name, email, phone, notes).

---

### DELETE /api/customers/[id]

Delete a customer record. Sales are preserved with `customerId = null`.

---

### GET /api/customers/duplicates

Returns groups of potential duplicate customer records, matched by name similarity or shared phone/email.

---

### POST /api/customers/merge

Merges two customer records into one, consolidating loyalty points and purchase history.

**Body:**
```json
{
  "keepId": "clxyz...",
  "mergeId": "clxyz..."
}
```

---

## Suppliers

### GET /api/suppliers

List all suppliers.

### POST /api/suppliers

Create a new supplier. Body: `{ name, email?, phone?, address?, notes? }`.

### GET /api/suppliers/[id]

Get a single supplier with their associated products.

### PUT /api/suppliers/[id]

Update supplier fields.

### DELETE /api/suppliers/[id]

Delete a supplier. Products retain the record but `supplierId` is set to `null`.

---

## Held Orders

The hold-order queue allows pausing a cart to serve another customer.

### GET /api/held-orders

Returns all currently held orders.

**Response:**
```json
[
  {
    "id": "clxyz...",
    "label": "Table 3",
    "items": [...],
    "createdAt": "2026-03-08T10:00:00.000Z"
  }
]
```

### POST /api/held-orders

Save the current cart as a held order.

**Body:**
```json
{
  "label": "Table 3",
  "items": [{ "productId": "...", "name": "...", "price": 4.5, "quantity": 1 }]
}
```

### DELETE /api/held-orders

Delete a held order by ID. Pass `?id=` as a query parameter.

---

## Loyalty

### POST /api/loyalty

Manually adjust loyalty points for a customer (admin operation).

**Body:**
```json
{
  "customerId": "clxyz...",
  "delta": 100,
  "reason": "Correction"
}
```

---

## Stock Adjustments

### GET /api/stock-adjustments

List stock adjustment records. Supports `?productId=` to filter by product.

### POST /api/stock-adjustments

Record a manual stock adjustment (e.g. receiving stock, damage write-off).

**Body:**
```json
{
  "productId": "clxyz...",
  "delta": 50,
  "reason": "RECEIVED",
  "note": "PO-2026-042"
}
```

Valid reasons: `RECEIVED`, `DAMAGED`, `THEFT`, `CORRECTION`, `OPENING_COUNT`.

---

## Settings

### GET /api/settings

Returns public business settings (name, logo URL, currency, tax name, receipt footer). **No authentication required** — used to populate the login/setup screens.

**Response:**
```json
{
  "name": "My Coffee Shop",
  "logoUrl": "/uploads/logo.png",
  "currency": "USD",
  "currencyDecimals": 2,
  "taxName": "Sales Tax",
  "receiptFooter": "Thank you!"
}
```

### PUT /api/settings

Update business settings. **Requires Admin role.**

**Body:** Any subset of the `BusinessSettings` fields (partial update supported).

---

## Upload

### POST /api/upload

Upload an image file (logo or product photo). Accepts `multipart/form-data`.

**Form fields:**

| Field | Description |
|---|---|
| `file` | Image file (JPEG, PNG, WebP, GIF — max 5 MB) |
| `type` | `"logo"` or `"product"` |

**Success Response:**
```json
{ "url": "/uploads/logo-1741430400000.png" }
```

---

## Reports

### GET /api/reports

Returns aggregated sales statistics. All calculations are server-side.

**Query Parameters:**

| Parameter | Description |
|---|---|
| `from` | ISO date — start of period |
| `to` | ISO date — end of period |

**Response:**
```json
{
  "totalRevenue": 1234.56,
  "totalSales": 42,
  "averageOrderValue": 29.39,
  "paymentBreakdown": { "CASH": 800.00, "CARD": 400.00, "OTHER": 34.56 },
  "topProducts": [
    { "name": "Americano", "quantity": 120, "revenue": 540.00 }
  ]
}
```

---

## Health Check

### GET /api/ping

Returns database connectivity status. Used by the setup wizard and monitoring tools.

**Response:**
```json
{ "ok": true, "db": true }
```

---

## Setup Wizard API

These endpoints are only accessible during the initial setup flow (before `setupComplete = true` in the database). They are blocked or redirected after setup is complete.

---

### GET /api/setup/status

Probes the database connection and returns the current setup state. Called by the setup wizard on load to determine which steps to show.

**Response:**
```json
{
  "envOk": true,
  "dbConnected": true,
  "dbInitialized": true,
  "hasAdmin": false,
  "setupComplete": false,
  "missingEnv": [],
  "dbError": null
}
```

| Field | Type | Description |
|---|---|---|
| `envOk` | boolean | `true` if `DATABASE_URL` and `BETTER_AUTH_SECRET` are set |
| `dbConnected` | boolean | `true` if a TCP connection to Postgres was established |
| `dbInitialized` | boolean | `true` if Prisma migrations have been applied |
| `hasAdmin` | boolean | `true` if at least one user with `role = ADMIN` exists |
| `setupComplete` | boolean | `true` if `BusinessSettings.setupComplete = true` in the DB |
| `missingEnv` | string[] | List of missing required environment variable names |
| `dbError` | string \| null | Human-readable database error message if connection failed |

If `setupComplete` is `true`, this endpoint also sets the `olgax-setup-complete` cookie to heal any client state where the cookie was missing.

---

### POST /api/setup/migrate

Runs `prisma migrate deploy` programmatically to initialize / apply database migrations.

**Body:** empty `{}`

**Success Response:**
```json
{ "ok": true }
```

**Error Response (403):**
```json
{ "error": "Setup already complete" }
```

---

### POST /api/setup/admin

Creates the first admin user account.

**Body:**
```json
{
  "name": "Store Owner",
  "email": "admin@myshop.com",
  "password": "securepassword"
}
```

**Success Response:**
```json
{ "ok": true }
```

**Error Responses:**
```json
{ "error": "Setup already complete" }       // 403 — setup is done
{ "error": "Admin already exists" }          // 409 — another admin exists
{ "error": "Password too short (min 6)" }    // 400 — validation
```

---

### POST /api/setup/complete

Saves business settings and marks setup as complete. Also sets the `olgax-setup-complete` cookie so the middleware knows setup is done without a DB round-trip on every request.

**Body:**
```json
{
  "businessName": "My Coffee Shop",
  "currency": "USD",
  "currencyDecimals": 2,
  "taxRate": 8.5,
  "taxName": "Sales Tax",
  "receiptFooter": "Thank you for your business!"
}
```

**Success Response (sets `olgax-setup-complete` cookie):**
```json
{ "ok": true }
```

**Error Response (403):**
```json
{ "error": "Setup already complete" }
```

---

## Users

### GET /api/users

Retrieve a list of all users. **Requires Admin role.**

**Success Response:**
```json
{
  "users": [
    {
      "id": "JcI3lCK...",
      "email": "cashier@example.com",
      "name": "Cashier User",
      "role": "CASHIER",
      "createdAt": "2026-05-28T10:00:00.000Z",
      "emailVerified": true
    }
  ]
}
```

---

### POST /api/users

Create a new user account. **Requires Admin role.**

**Body:**
```json
{
  "name": "Cashier User",
  "email": "cashier@example.com",
  "password": "securepassword123",
  "role": "CASHIER"
}
```

**Success Response (201 Created):**
```json
{
  "user": {
    "id": "JcI3lCK...",
    "email": "cashier@example.com",
    "name": "Cashier User",
    "role": "CASHIER",
    "createdAt": "2026-05-28T10:00:00.000Z"
  }
}
```

---

### PUT /api/users/[id]/update

Update another user's details. **Requires Admin role.**

**Body:**
```json
{
  "name": "Updated Name",
  "email": "new.email@example.com",
  "role": "ADMIN"
}
```

**Success Response:**
```json
{
  "id": "clxyz...",
  "email": "new.email@example.com",
  "name": "Updated Name",
  "role": "ADMIN",
  "updatedAt": "2026-05-28T10:05:00.000Z"
}
```

---

### DELETE /api/users/[id]

Delete a user account. **Requires Admin role.**

> Note: You cannot delete your own account, nor can you delete the last Admin account.

**Success Response:**
```json
{
  "ok": true
}
```

---

### PUT /api/users/me/profile

Update the currently logged-in user's profile details. **Requires an authenticated session.**

**Body:**
```json
{
  "name": "New Name",
  "email": "new.email@example.com"
}
```

**Success Response:**
```json
{
  "user": {
    "id": "clxyz...",
    "email": "new.email@example.com",
    "name": "New Name",
    "role": "ADMIN",
    "emailVerified": true
  }
}
```

---

### POST /api/users/me/change-password

Change the currently logged-in user's password. **Requires an authenticated session.**

**Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword123"
}
```

**Success Response:**
```json
{
  "message": "Password changed successfully"
}
```

---

## Error Format

All API errors follow this structure:

```json
{
  "error": "Human-readable error message"
}
```

HTTP status codes used:
- `200` — success
- `400` — bad request / validation error
- `401` — authentication required
- `403` — forbidden (e.g. setup already complete, insufficient role)
- `404` — not found
- `409` — conflict (e.g. resource already exists)
- `500` — internal server error
