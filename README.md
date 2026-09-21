<div align="center">
  <h1>Korgen Kassa POS</h1>
  <p>Offline-capable Point of Sale system for retail.</p>
  <p>
    <a href="docs/getting-started.md">Getting Started</a> ·
    <a href="docs/architecture.md">Architecture</a> ·
    <a href="docs/deployment.md">Deployment</a> ·
    <a href="docs/contributing.md">Contributing</a>
  </p>
  <p>
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
    <img alt="Version 0.1" src="https://img.shields.io/badge/version-0.1--MVP-orange.svg" />
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black.svg" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
    <a href="https://discord.com/invite/EAXcCXgUz2"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?logo=discord&logoColor=white" /></a>
  </p>
</div>

---

## What is Korgen Kassa POS?

**Korgen Kassa POS** is a fast, touch-friendly, fully offline-capable Point of Sale system for small businesses. It is built on the open-source [Olgax POS](https://github.com/olgax/olgax-pos) project (MIT).

- **Self-hosted** — run it on your own server with Docker in minutes.
- **Offline-first** — uses PGLite (Postgres WASM) to record sales even with no internet, then syncs automatically when connectivity returns.
- **Globally configurable** — change your business name, logo, colors, currency, and tax settings from the UI.
- **Open source** — MIT licensed. Fork it, extend it, run it.

---

## Features (v0.1 MVP)

| Feature | Status |
|---|---|
| Product catalog (create / edit / delete) | ✅ |
| Barcode / keyboard product search | ✅ |
| Stock adjustment history with audit trail | ✅ |
| Supplier management | ✅ |
| POS checkout — cart, qty, discount, tax | ✅ |
| Split-tender payments (Cash + Card + Other) | ✅ |
| Hold & recall orders | ✅ |
| Void sale with reason | ✅ |
| Refund / partial refund support | ✅ |
| Tip support at checkout | ✅ |
| Receipt printing (ESC/POS thermal + browser fallback) | ✅ |
| Customer directory with purchase history | ✅ |
| Loyalty points (earn & redeem) | ✅ |
| Offline mode with auto-sync | ✅ |
| Admin + Cashier roles | ✅ |
| Business settings (logo, colors, currency, tax) | ✅ |
| Sales reports & CSV export | ✅ |
| Breadcrumb navigation on detail pages | ✅ |
| Docker Compose ready | ✅ |
| PWA / installable on tablet | ✅ |

---

## Quick Start (Docker — recommended)

```bash
# 1. Clone
git clone https://github.com/olgax/olgax-pos.git
cd olgax-pos

# 2. Configure secrets
cp .env.example .env
# Edit .env: set BETTER_AUTH_SECRET to a long random string

# 3. Start
docker compose up -d

# 4. Open in browser
open http://localhost:3000
```

The first time you open the app you will be guided through a setup wizard that migrates the database and creates your admin account.

---

## Quick Start (Serverless — Vercel / Netlify)

You can run Korgen Kassa POS serverless without Docker or a VPS:

1. **Fork or Use Template**: Click **Fork** or **Use this template** at the top of this repository to create a copy in your own account.
2. **Deploy**: Import your copy into **Vercel** or **Netlify**.
3. **Database**: Use a managed database provider like Neon or Supabase (using a pooled `DATABASE_URL` and a direct `DIRECT_URL`).

See the [Deployment Guide](docs/deployment.md#serverless-deployments-vercel--netlify) for detailed instructions.

---

## Quick Start (Local Development)

**Prerequisites**: Node.js ≥ 20, pnpm ≥ 9, PostgreSQL ≥ 14

```bash
# 1. Clone & install
git clone https://github.com/olgax/olgax-pos.git
cd olgax-pos
pnpm install

# 2. Configure environment
cp .env.example .env
# Set DATABASE_URL and BETTER_AUTH_SECRET in .env

# 3. Migrate database
pnpm db:migrate

# 4. (Optional) Seed sample products
pnpm db:seed

# 5. Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). A setup wizard will guide you through creating your admin account on first run.

---

## Documentation

| Document | Description |
|---|---|
| [Getting Started](docs/getting-started.md) | Full installation guide for all environments |
| [Configuration](docs/configuration.md) | Environment variables, business settings, per-device settings |
| [Architecture](docs/architecture.md) | Tech stack, project structure, data model |
| [Deployment](docs/deployment.md) | Docker, reverse proxy, HTTPS, production checklist |
| [API Reference](docs/api-reference.md) | Internal REST API endpoints |
| [Contributing](docs/contributing.md) | Development workflow, coding standards, PR guide |

---

## Tech Stack

- **Framework**: Next.js 16 App Router + TypeScript strict mode
- **UI**: shadcn/ui + Tailwind CSS 4
- **Database**: PostgreSQL + Prisma 7 ORM
- **Offline DB**: PGLite (Postgres WASM in the browser)
- **Auth**: Better Auth (email/password, role-based)
- **State**: Zustand (POS cart)
- **Forms**: react-hook-form + Zod validation
- **Testing**: Vitest + Playwright

---

## Roadmap

- [ ] Multi-store / multi-location
- [ ] Advanced reports + charts
- [ ] Kitchen Display System (KDS)

---

## License

MIT — see [LICENSE](LICENSE) for details. Based on the open-source [Olgax POS](https://github.com/olgax/olgax-pos) project.
