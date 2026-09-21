# Getting Started with Korgen Kassa POS

> **Korgen Kassa POS** is a POS system for retail, built on the open-source [Olgax POS](https://github.com/olgax/olgax-pos) project. This guide covers every installation method from quick Docker deployments to full local development setups.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Option 1: Docker (Recommended for production)](#option-1-docker-recommended-for-production)
- [Option 2: Local Development Setup](#option-2-local-development-setup)
- [First-Run Setup Wizard](#first-run-setup-wizard)
- [Seeding Sample Data](#seeding-sample-data)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### For Docker
- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) v2+

### For Local Development
- **Node.js** ≥ 20 ([download](https://nodejs.org))
- **pnpm** ≥ 9 — `npm install -g pnpm`
- **PostgreSQL** ≥ 14 running locally or via Docker

---

## Option 1: Docker (Recommended for production)

This is the fastest way to get a production-ready instance running.

```bash
# Clone the repository
git clone https://github.com/olgax/olgax-pos.git
cd olgax-pos

# Copy and configure environment file
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
BETTER_AUTH_SECRET=your_long_random_secret_here   # min 32 characters
BETTER_AUTH_URL=http://your-domain.com:3000
```

Then start:

```bash
docker compose up -d
```

The Docker Compose stack includes:
- **PostgreSQL 16** — persistent data volume
- **Korgen Kassa POS web** — Next.js app, listens on port 3000

Open `http://localhost:3000` (or your server IP) and follow the [Setup Wizard](#first-run-setup-wizard).

---

## Option 2: Local Development Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/olgax/olgax-pos.git
cd olgax-pos
pnpm install
```

### 2. Start a PostgreSQL instance

If you don't have PostgreSQL locally, use Docker just for the database:

```bash
docker compose up postgres -d
```

This starts Postgres on `localhost:5432` with:
- User: `postgres`
- Password: `password`  
- Database: `olgax_pos`

### 3. Configure environment variables

```bash
cp .env.example .env
```

Minimum required `.env` contents:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/olgax_pos"
BETTER_AUTH_SECRET="a_random_secret_at_least_32_chars_long"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

See [Configuration](configuration.md) for all available variables.

### 4. Run database migrations

```bash
pnpm db:migrate
```

This applies all Prisma migrations and creates the database schema.

### 5. (Optional) Seed sample products

```bash
pnpm db:seed
```

This creates 7 sample products and a default business settings record. Useful for exploring the UI without setting up products manually.

### 6. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## First-Run Setup Wizard

The first time you open the app you will see the **Setup Wizard**. It guides you through:

1. **Welcome** — overview of what you're setting up
2. **System Check** — verifies environment variables and database connectivity
3. **Database** — runs migrations if needed
4. **Admin Account** — creates your first admin user (password field has a show/hide toggle)
5. **Business Info** — name, currency, tax rate, receipt footer
6. **Done** — redirects to login

> The wizard can only be run once. Attempting to navigate to `/setup` after completion redirects you to `/login`.

---

## Seeding Sample Data

The seed script (`prisma/seed.ts`) populates:
- 7 sample products across categories (Beverages, Snacks, Electronics)
- A `BusinessSettings` singleton record with defaults

```bash
pnpm db:seed
```

> **Note:** The seed is idempotent — it upserts records so running it multiple times is safe.

---

## Troubleshooting

### `ERR_FAILED` or page not loading on localhost

This is usually caused by a stale **Service Worker** from a previous session intercepting requests. To fix:
1. Open Chrome DevTools → **Application** → **Service Workers**
2. Click **Unregister** for any `localhost` workers
3. Hard refresh (`Ctrl+Shift+R`)

Alternatively open the app in an Incognito window to bypass cached Service Workers.

### `Unable to acquire lock` when starting dev server

Another `next dev` process is still running. Kill it:

```powershell
# Windows PowerShell
Get-Process -Name node | Stop-Process -Force
Remove-Item .next -Recurse -Force
pnpm dev
```

```bash
# macOS / Linux
pkill -f "next dev"
rm -rf .next
pnpm dev
```

### `PrismaClientInitializationError` — no adapter

Make sure you have run `pnpm install` and `pnpm db:migrate`. The Prisma client is generated as part of `postinstall`.

### Port 3000 already in use

```bash
pnpm dev --port 3005
```

Update `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` in your `.env` to match the new port.

### Login loop / redirected back to `/login` immediately after signing in

This can happen if:
- The `olgax-setup-complete` cookie is missing — revisit `/setup` to re-run the wizard, or set the cookie manually.
- `BETTER_AUTH_URL` does not match the origin you are accessing the app from. Update `.env` to match your actual URL (including port).
