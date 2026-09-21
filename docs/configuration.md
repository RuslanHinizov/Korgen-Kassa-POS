# Configuration Reference

All configuration for Korgen Kassa POS is managed through environment variables (server-side) and the in-app Settings page (business settings stored in the database).

---

## Table of Contents

- [Environment Variables](#environment-variables)
- [Business Settings (In-App)](#business-settings-in-app)
- [Per-Device Settings (localStorage)](#per-device-settings-localstorage)
- [Network / Multi-Device Access](#network--multi-device-access)

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example`).

### Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/olgax_pos` |
| `BETTER_AUTH_SECRET` | Secret key for signing auth tokens. Must be at least 32 characters. **Change this in production.** | `a_very_long_random_secret_string` |

### Recommended

| Variable | Description | Default |
|---|---|---|
| `BETTER_AUTH_URL` | The canonical URL of your app (origin that Better Auth trusts). Must match the URL your browser uses to access the app. | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Public URL exposed to the browser. Used for redirects and links. | `http://localhost:3000` |

### Optional / Production

| Variable | Description | Example |
|---|---|---|
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated list of additional trusted origins (for multi-IP / reverse proxy setups). In development, `localhost` variants are trusted automatically. | `https://pos.myshop.com,https://192.168.1.10:3000` |
| `DIRECT_URL` | Direct connection URL to PostgreSQL (only needed when using database poolers like PgBouncer for migrations). | `postgresql://user:pass@localhost:5432/olgax_pos` |
| `NODE_ENV` | Set to `production` in production deployments. | `production` |
| `NEXT_STANDALONE` | Set to `1` to enable Next.js standalone output (required for Docker builds). | `1` |

### Example `.env` for local development

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/olgax_pos"
BETTER_AUTH_SECRET="dev_secret_change_in_production_min_32_chars_here"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

### Example `.env` for production

```env
DATABASE_URL="postgresql://postgres:STRONG_PASSWORD@db:5432/olgax_pos?pgbouncer=true"
DIRECT_URL="postgresql://postgres:STRONG_PASSWORD@db:5432/olgax_pos"
BETTER_AUTH_SECRET="replace_with_64_char_truly_random_secret"
BETTER_AUTH_URL="https://pos.yourshop.com"
NEXT_PUBLIC_APP_URL="https://pos.yourshop.com"
BETTER_AUTH_TRUSTED_ORIGINS="https://pos.yourshop.com"
NODE_ENV="production"
NEXT_STANDALONE="1"
```

---

## Business Settings (In-App)

Business settings are stored in the database (`BusinessSettings` table, singleton record `id = "singleton"`) and are editable by **Admins** at `/settings`.

| Setting | Description |
|---|---|
| **Business Name** | Shown on login screen, receipts, and browser tab title. |
| **Logo** | Uploaded image displayed on login screen and printed receipts. Stored in `public/uploads/`. |
| **Primary Color** | Hex color injected as `--brand-primary` CSS variable, tinting the UI. |
| **Accent Color** | Hex color injected as `--brand-accent` CSS variable. |
| **Currency Symbol** | e.g. `$`, `€`, `KES`, `₦`. Displayed in all price fields. |
| **Currency Decimal Places** | Number of decimal places to display (0, 2, or custom). |
| **Tax Rate** | Default tax percentage applied at checkout (e.g. `16` for 16%). Stored as a decimal (0.16). |
| **Tax Name** | Label shown on receipts, e.g. `VAT`, `GST`, `Sales Tax`. |
| **Receipt Footer Text** | Custom message printed at the bottom of every receipt. |
| **Language** | UI language selector. English is the default. (Additional languages can be added via `next-intl`.) |

---

## Per-Device Settings (localStorage)

These settings are stored in the browser's `localStorage` and are specific to each device/browser instance. They are accessible in the POS UI.

| Setting | Description | Default |
|---|---|---|
| **Default Payment Method** | Pre-selected payment method in checkout. | `CASH` |
| **Sound on Sale Complete** | Play a sound when a sale is completed successfully. | `false` |

---

## Network / Multi-Device Access

To access the POS from a tablet or other device on the same network:

1. Find your machine's local IP address (e.g. `192.168.1.100`).
2. Add it to your `.env`:
   ```env
   BETTER_AUTH_URL="http://192.168.1.100:3000"
   BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000,http://192.168.1.100:3000"
   ```
3. In `next.config.ts`, add your IP to `allowedDevOrigins`:
   ```typescript
   allowedDevOrigins: ["localhost:3000", "192.168.1.100:3000"],
   ```
4. Restart the dev server.
5. Open `http://192.168.1.100:3000` on any device on the same network.

> In production with HTTPS and a proper domain name, this is handled automatically — you only need `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` set to your domain.
