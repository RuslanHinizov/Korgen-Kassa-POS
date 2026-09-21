# Korgen Kassa POS Plugin Authoring Guide

> Version: 0.2 (Plugin API is in early preview — breaking changes possible.)

---

## Overview

Korgen Kassa POS supports a lightweight hook-based plugin system. Plugins can listen to key application events — such as a sale completing, a product being updated, or the checkout being rendered — and execute custom logic without modifying core application code.

---

## Plugin Structure

```
plugins/
  my-plugin/
    plugin.json     ← Manifest (required)
    index.ts        ← Entry point (required)
    README.md       ← Optional documentation
```

---

## Plugin Manifest (`plugin.json`)

```json
{
  "id": "com.yourorg.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Short description of what this plugin does.",
  "author": "Your Name <you@example.com>",
  "hooks": ["onSaleComplete", "onProductUpdate"],
  "permissions": [],
  "enabled": true
}
```

### Manifest Fields

| Field         | Required | Description                                                      |
|---------------|----------|------------------------------------------------------------------|
| `id`          | ✅       | Unique reverse-domain identifier                                 |
| `name`        | ✅       | Human-readable plugin name                                       |
| `version`     | ✅       | SemVer string                                                    |
| `description` | No       | Short description shown in the plugins settings page             |
| `author`      | No       | Author name / email                                              |
| `hooks`       | ✅       | Array of hook names this plugin listens to                       |
| `permissions` | No       | Reserved for future permission gating                            |
| `enabled`     | ✅       | Set to `false` to disable the plugin at load time                |

---

## Plugin Entry Point (`index.ts`)

Your plugin must export a `register()` function that subscribes to hooks:

```typescript
import { pluginRegistry } from "@/lib/plugins";
import type { PluginManifest } from "@/lib/plugins";
import manifest from "./plugin.json";

const MANIFEST: PluginManifest = manifest as PluginManifest;

export function register(): void {
  if (!MANIFEST.enabled) return;

  pluginRegistry.registerPlugin(MANIFEST);

  pluginRegistry.on("onSaleComplete", async (payload) => {
    // Your logic here
    await sendToMyAnalytics(payload);
  });
}
```

---

## Available Hooks

### `onSaleComplete`

Fires after every successfully completed sale (server-side, in the API route).

**Payload:**
```typescript
{
  saleId: string;
  total: number;
  taxAmount: number;
  tipAmount: number;
  items: Array<{
    productId: string | null;
    name: string;
    quantity: number;
    price: number;
  }>;
  customerId: string | null;
  paymentMethod: string;
  loyaltyPointsUsed: number;
}
```

---

### `onProductUpdate`

Fires when a product is updated via the admin UI or API.

**Payload:**
```typescript
{
  productId: string;
  changes: Record<string, unknown>;
}
```

---

### `onCheckoutRender`

Client-side hook that fires when the checkout panel mounts/re-renders.

**Payload:**
```typescript
{
  cartTotal: number;
  customerId: string | null;
}
```

---

## Registering Your Plugin

Import and call `register()` once at application startup. The recommended location is `src/app/layout.tsx` for client-side plugins, or `src/lib/plugins-init.ts` imported in API routes for server-side plugins.

```typescript
// src/lib/plugins-init.ts
import { register as registerExamplePlugin } from "@/../plugins/example";

// Register all plugins
registerExamplePlugin();
```

Then import `plugins-init.ts` at the top of your API routes or layout:

```typescript
import "@/lib/plugins-init";
```

---

## Error Handling

Handler errors are caught and logged by the registry — they will not crash the application or block other handlers. However, you should still handle errors gracefully within your plugin:

```typescript
pluginRegistry.on("onSaleComplete", async (payload) => {
  try {
    await myExternalCall(payload);
  } catch (error) {
    console.error("[MyPlugin] Failed to sync sale:", error);
  }
});
```

---

## Best Practices

- Keep handlers **fast and non-blocking** for the `onSaleComplete` hook to avoid slowing checkout.
- Use `async/await` for I/O operations; the registry awaits all handlers.
- Do not import prisma directly in client-side plugins — use API calls instead.
- Check `manifest.enabled` at the start of `register()` to respect the user's toggle.
- Unsubscribe from hooks when no longer needed using the returned unsubscribe function.

---

## Plugin Settings UI

Installed plugins appear in **Settings → Plugins** (admin only). Users can enable/disable plugins without restarting the application.

> The plugins settings tab is planned for a future release. Currently, enable/disable is controlled via `plugin.json`.

---

## Example Plugin

See [`/plugins/example/`](/plugins/example/) for a working no-op example that demonstrates the full plugin structure.
