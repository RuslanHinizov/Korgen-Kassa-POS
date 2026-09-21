# Contributing to Korgen Kassa POS

Thank you for your interest in contributing to Korgen Kassa POS! This guide explains how to get your environment set up, the coding standards we follow, and how to submit changes.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting the Dev Environment Running](#getting-the-dev-environment-running)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Project Roadmap Context](#project-roadmap-context)

---

## Code of Conduct

Be respectful. We're building something useful together. Harassment of any kind will not be tolerated.

---

## Getting the Dev Environment Running

See [Getting Started → Option 2: Local Development Setup](getting-started.md#option-2-local-development-setup) for the full walkthrough.

**Short version:**

```bash
git clone https://github.com/olgax/olgax-pos.git
cd olgax-pos
pnpm install
cp .env.example .env     # fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm db:seed             # optional sample data
pnpm dev
```

---

## Making Changes

1. **Fork** the repository on GitHub.
2. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b feat/split-tender-payment
   git checkout -b fix/decimal-serialization
   git checkout -b docs/update-deployment-guide
   ```
3. **Make your changes** — see Coding Standards below.
4. **Write or update tests** for any non-trivial logic.
5. **Verify everything passes:**
   ```bash
   pnpm exec tsc --noEmit   # TypeScript — 0 errors
   pnpm lint                # ESLint
   pnpm test                # Vitest unit tests
   pnpm build               # Full production build — 0 errors
   ```
6. **Commit** using the [commit message format](#commit-message-format).
7. **Open a Pull Request** targeting `main`.

---

## Coding Standards

### TypeScript

- **Strict mode** is enabled — no `any`, no implicit `undefined`.
- All props, function signatures, and API response types must be explicitly typed.
- Use `type` for shapes, `interface` for extensible objects.

### React / Next.js

- Use **Server Components** by default. Only add `"use client"` when you need browser APIs, event handlers, or state.
- Never call `noStore()` or `force-dynamic` inside a `"use client"` component — those only work in Server Components.
- Keep Server Components **pure** — no side effects, no mutations.
- Use `unstable_noStore as noStore` from `next/cache` on every page/layout that fetches data to prevent stale RSC payloads.

### Prisma / Database

- All `Decimal` fields from Prisma must be `.toNumber()` before being passed as props to Client Components (they are not plain JSON-serializable).
- Migrations must be created via `pnpm db:migrate` — never edit migration files manually.
- New features requiring schema changes should include a migration file in the PR.

### Forms

- All forms use `react-hook-form` with a `zodResolver`. Define your Zod schema first.
- Server-side validation must always mirror client-side validation — never trust the client alone.

### Styling

- Use Tailwind CSS utility classes only — no custom CSS unless it's a CSS variable or animation keyframe.
- Use `cn()` from `@/lib/utils` for conditional class merging.
- All colours must use the existing CSS variable tokens (`bg-background`, `text-foreground`, `text-primary`, etc.) — never hardcode hex values in components.

### File naming

- React components: `PascalCase.tsx`
- Hooks: `use-kebab-case.ts`
- Utilities / lib: `kebab-case.ts`
- API routes: `route.ts` inside descriptive folders

---

## Testing

### Unit tests (Vitest)

```bash
pnpm test            # run once
pnpm test:ui         # open Vitest UI
```

Unit tests live in `src/tests/`. Test pure functions and utilities.

### End-to-end tests (Playwright)

```bash
pnpm test:e2e        # headless
pnpm test:e2e:ui     # with browser UI
```

E2E tests cover critical paths: login → checkout → receipt.

### Before submitting a PR

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build
```

All four must pass with zero errors.

---

## Commit Message Format

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting, whitespace (no logic change)
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `chore` — build process, deps, tooling

**Examples:**
```
feat(pos): add split tender payment support
fix(sales): serialize Decimal fields before passing to client
docs(deployment): add Caddy reverse proxy example
refactor(auth): remove DB call from proxy.ts
```

---

## Pull Request Process

1. Fill out the PR template (description, screenshots for UI changes).
2. Link any related GitHub issues with `Closes #123`.
3. Ensure CI passes (TypeScript + lint + tests + build).
4. A maintainer will review within a few business days.
5. Address review comments and push updates to the same branch.

---

## Reporting Bugs

Please open a [GitHub Issue](https://github.com/olgax/olgax-pos/issues/new?template=bug_report.md) with:

- Steps to reproduce
- Expected vs actual behaviour
- Browser/OS, Node.js version
- Relevant error messages or screenshots

---

## Suggesting Features

Open a [GitHub Discussion](https://github.com/olgax/olgax-pos/discussions) or a [Feature Request Issue](https://github.com/olgax/olgax-pos/issues/new?template=feature_request.md).

Check the [Project Roadmap Context](#project-roadmap-context) below before suggesting features that are explicitly saved for later.

---

## Project Roadmap Context

The following features are **deliberately excluded from v0.1 MVP** but are planned. Please don't open PRs for these without discussing first — they require architectural changes:

| Feature | Status |
|---|---|
| Multi-store / multi-location | Planned — requires `Store` model + tenant scoping |
| Product variants / matrix | Planned — requires `variants` jsonb → dedicated table |
| Loyalty points & tiers | Planned — requires `Customer` model + rule engine |
| Kitchen Display System | Planned — separate app + WebSocket |
| Multiple tax rules | Planned — replace single `taxRate` with `TaxRule[]` |
| Plugin marketplace | Planned — folder-based plugins → dynamic registry |
| AI forecasting | Planned — premium plugin |
| Hosted SaaS (olgax.app) | Planned — same codebase, env-based gating |

For the full roadmap, see [olgax.com/roadmap](https://olgax.com/roadmap).
