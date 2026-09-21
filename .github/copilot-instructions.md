# Korgen Kassa POS — Contributor Guidelines

**Stack**: Next.js 16 App Router · TypeScript strict · shadcn/ui · Tailwind CSS 4 · Prisma + PostgreSQL · PGLite (offline) · Better Auth · Zustand · react-hook-form + Zod · Vitest + Playwright

---

## Tech Decisions

- **App Router only** — no Pages Router. Use Server Components by default; add `"use client"` only when necessary (interactivity, hooks, browser APIs).
- **Server Actions** for all data mutations (no separate API routes unless integrating a third-party webhook).
- **Zod** for all input validation — on both client (form) and server (action).
- **Zustand** for POS cart state only. Use React state for everything else.
- **PGLite** runs in the browser for offline support. Keep the client-side schema in sync with Prisma migrations.
- **Better Auth** handles sessions and roles (`admin`, `cashier`). Never bypass role checks.
- **next-intl** for i18n. All user-visible strings must use `useTranslations` / `getTranslations` — no hardcoded English strings in components.

## Code Style

- TypeScript strict mode — no `any`, no non-null assertion (`!`) unless truly unavoidable.
- Prefer named exports. Default exports only for Next.js page/layout files.
- Keep components small and single-purpose. Extract logic to hooks (`use*.ts`) and utilities (`lib/`).
- Use `shadcn/ui` primitives before writing custom UI. Match existing patterns in the codebase.
- Tailwind only — no inline `style` props or CSS modules.

## What's in Scope

- Bug fixes and improvements to existing features
- New locale files under `messages/` (copy `en.json` as template)
- Accessibility improvements
- Performance improvements (especially on the POS screen)
- Docker / deployment improvements

## What's Out of Scope (do not add without discussion)

- Multi-store / multi-location
- Plugin system
- Payment gateway integrations
- Any feature requiring a separate backend service

## Project Structure

```
src/
  app/              # Next.js App Router pages & layouts
  app/actions/      # Server Actions
  components/       # React components (co-located with feature)
  lib/              # Utilities, Prisma client, helpers
  i18n/             # next-intl config
messages/           # Locale JSON files (en.json is source of truth)
prisma/             # Schema + migrations
public/             # Static assets
```
