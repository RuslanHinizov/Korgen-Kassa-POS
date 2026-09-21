# Contributing to Korgen Kassa POS

Thank you for your interest in contributing! This document covers the most common contribution workflows.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Adding a New Language (i18n)](#adding-a-new-language)
3. [Code Contribution Guidelines](#code-contribution-guidelines)
4. [Pull Request Process](#pull-request-process)

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/olgax/olgax-pos.git
cd olgax-pos

# Install dependencies
pnpm install

# Copy env file and configure your database
cp .env.example .env

# Set up the database
pnpm db:migrate
pnpm db:seed

# Start the development server
pnpm dev
```

---

## Adding a New Language

Korgen Kassa POS uses [next-intl](https://next-intl-docs.vercel.app/) for internationalization.

### Step 1 — Create the message file

Copy the English base file and translate every string:

```bash
cp messages/en.json messages/<locale>.json
```

Replace `<locale>` with the [BCP 47 language tag](https://www.iana.org/assignments/language-subtag-registry) (e.g. `fr` for French, `de` for German, `ar` for Arabic).

Open `messages/<locale>.json` and translate every value. **Do not change the keys.**

### Step 2 — Register the locale

Open `src/i18n/request.ts` and add your locale to the `SUPPORTED_LOCALES` array:

```ts
const SUPPORTED_LOCALES = ["en", "si", "ta", "<locale>"];
```

### Step 3 — Add the language to the Settings selector

Open `src/components/settings/settings-form.tsx` (or wherever the language `<select>` lives) and add an option:

```tsx
<option value="<locale>">Your Language Name</option>
```

### Step 4 — RTL languages (Arabic, Hebrew, etc.)

If your language is right-to-left, add the locale code to the `RTL_LOCALES` array in `src/app/layout.tsx`:

```ts
const RTL_LOCALES = ["ar", "he", "fa", "ur", "<your-rtl-locale>"];
```

The `<html dir>` attribute is set automatically based on this list.

### Step 5 — Test

1. Start the dev server (`pnpm dev`).
2. Go to **Settings → Language**, select your new locale, and save.
3. Verify every page/section you translated renders correctly.
4. Check that date and currency formats look sensible for the locale.

### Step 6 — Submit a PR

Open a pull request with:
- Your `messages/<locale>.json` file
- Any changes to `src/i18n/request.ts`, `settings-form.tsx`, and `layout.tsx`
- A brief description of the language and any translation notes

---

## Code Contribution Guidelines

### Tech Stack

| Layer           | Technology                        |
|-----------------|-----------------------------------|
| Framework       | Next.js 16 (App Router)           |
| Language        | TypeScript (strict)               |
| Styling         | Tailwind CSS 4 + shadcn/ui        |
| Database        | PostgreSQL + Prisma                |
| Offline DB      | PGLite (Postgres WASM)            |
| State           | Zustand (POS cart)                |
| Forms           | react-hook-form + Zod             |
| Testing         | Vitest (unit) + Playwright (e2e)  |

### Code Style

- Run `pnpm lint` before committing — all warnings must be resolved.
- Run `pnpm format:check` to verify formatting (Prettier).
- Use `pnpm format` to auto-format files.
- No `any` types except with an explicit `// eslint-disable` comment and justification.
- Prefer server components; only add `"use client"` where browser APIs or interactivity is needed.

### File Structure

```
src/
  app/           # Next.js App Router pages and API routes
  components/    # Shared UI components
    pos/         # POS-specific components
    reports/     # Reports components
    settings/    # Settings components
    ui/          # Generic UI primitives
  hooks/         # Custom React hooks
  lib/           # Utilities, Prisma client, PGLite helpers
  store/         # Zustand stores
  tests/         # Vitest unit tests + Playwright e2e tests
messages/        # i18n translation files (one per locale)
prisma/          # Database schema and migrations
```

### Database Changes

- Always create a Prisma migration: `pnpm db:migrate`
- Never edit the schema without a corresponding migration file.
- Document any breaking schema changes in your PR description.

### Adding a New Setting

1. Add the field to `BusinessSettings` in `prisma/schema.prisma`.
2. Add the field to `src/lib/settings.ts` (default value + Zod schema).
3. Add a UI control in the appropriate settings panel.
4. Use the field wherever needed (API routes, receipt, etc.).

---

## Pull Request Process

1. Fork the repository and create a branch: `git checkout -b feat/my-feature`
2. Make your changes following the guidelines above.
3. Add or update tests for any logic changes.
4. Run `pnpm test`, `pnpm lint`, and `pnpm format:check` — all must pass.
5. Open a PR against `main` with a clear description of what and why.

We aim to review PRs within 48 hours. Thank you for contributing!
