/**
 * Example Korgen Kassa POS Plugin
 *
 * This is a no-op demonstration plugin showing how to register hooks
 * with the PluginRegistry.
 *
 * To activate this plugin, import and call `register()` from your
 * application entry point (e.g. src/app/layout.tsx or a server init file).
 */

import { pluginRegistry } from "@/lib/plugins";
import type { PluginManifest } from "@/lib/plugins";
import manifest from "./plugin.json";

const MANIFEST: PluginManifest = manifest as PluginManifest;

/**
 * Register this plugin with the Korgen Kassa POS plugin registry.
 * Call once at application startup.
 */
export function register(): void {
  if (!MANIFEST.enabled) return;

  pluginRegistry.registerPlugin(MANIFEST);

  // Hook: fires after every completed sale
  pluginRegistry.on("onSaleComplete", (payload) => {
    console.log(
      `[ExamplePlugin] Sale completed: ${payload.saleId} — total: ${payload.total}`
    );
    // TODO: Replace with your real integration logic.
    // Examples:
    //   - Send sale data to external analytics
    //   - Trigger a loyalty webhook
    //   - Print to a secondary printer
  });

  // Hook: fires after a product is updated
  pluginRegistry.on("onProductUpdate", (payload) => {
    console.log(
      `[ExamplePlugin] Product updated: ${payload.productId}`,
      payload.changes
    );
  });

  console.log("[ExamplePlugin] Registered successfully.");
}
